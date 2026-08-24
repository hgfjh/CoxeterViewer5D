/*
 * Proof-carrying modular rank worker for a streamed integral H^1 boundary.
 *
 * The historical nullspace worker records a LinBox rank, but that number is
 * not independently checkable.  This companion emits two artifacts:
 *
 *   1. the usual sparse modular kernel used by lift_modular_kernel.py;
 *   2. a rank-evidence stream containing an identity-chart kernel and an
 *      original-row/original-column minor with nonzero determinant.
 *
 * A small verifier can therefore replay both rank inequalities without
 * trusting LinBox's reported rank.  We use a second sparse elimination on
 * B[:, C]^T to find original row indices R after LinBox has selected the
 * pivot-column basis C.  The resulting B[R, C] minor is checked once here and
 * is checked again by the certificate verifier.
 */

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <givaro/givinteger.h>
#include <givaro/modular.h>
#include <linbox/algorithms/gauss.h>
#include <linbox/matrix/dense-matrix.h>
#include <linbox/matrix/sparse-matrix.h>
#include <linbox/util/matrix-stream.h>

using namespace LinBox;

namespace {

using Field = Givaro::Modular<double>;
using Sparse = SparseMatrix<Field, SparseMatrixFormat::SparseSeq>;
namespace fs = std::filesystem;

bool is_prime(std::int64_t value) {
  if (value < 2) return false;
  if (value % 2 == 0) return value == 2;
  for (std::int64_t divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor == 0) return false;
  }
  return true;
}

fs::path resolved_output_target(const std::string& raw_path) {
  if (raw_path.empty()) throw std::runtime_error("An output path is empty.");
  std::error_code error;
  const fs::path absolute = fs::absolute(fs::path(raw_path), error);
  if (error) {
    throw std::runtime_error("Could not resolve an output path: " +
                             error.message());
  }
  const fs::path parent = fs::weakly_canonical(absolute.parent_path(), error);
  if (error) {
    throw std::runtime_error("Could not resolve an output directory: " +
                             error.message());
  }
  return (parent / absolute.filename()).lexically_normal();
}

bool path_entry_exists(const fs::path& path) {
  std::error_code error;
  const fs::file_status status = fs::symlink_status(path, error);
  if (error && error != std::errc::no_such_file_or_directory) {
    throw std::runtime_error("Could not inspect output path " + path.string() +
                             ": " + error.message());
  }
  return status.type() != fs::file_type::not_found;
}

/*
 * Worker artifacts can be large, so buffering a complete file in memory is
 * inappropriate.  Write each one to an exclusively-created sibling and then
 * publish it with link(2), whose destination creation is atomic and refuses
 * every pre-existing directory entry, including a dangling symlink.
 */
class AtomicTextOutput {
 public:
  explicit AtomicTextOutput(fs::path target) : target_(std::move(target)) {
    const fs::path parent = target_.parent_path();
    const std::string stem = "." + target_.filename().string() + ".tmp." +
                             std::to_string(static_cast<long long>(getpid())) +
                             "." +
                             std::to_string(
                                 std::chrono::steady_clock::now()
                                     .time_since_epoch()
                                     .count());
    for (std::size_t attempt = 0; attempt < 1024; ++attempt) {
      temporary_ = parent / (stem + "." + std::to_string(attempt));
      const int descriptor =
          open(temporary_.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC,
               0666);
      if (descriptor >= 0) {
        stream_ = fdopen(descriptor, "w");
        if (stream_ == nullptr) {
          const int saved_errno = errno;
          close(descriptor);
          unlink(temporary_.c_str());
          throw std::runtime_error("Could not open a temporary output stream: " +
                                   std::string(std::strerror(saved_errno)));
        }
        return;
      }
      if (errno != EEXIST) {
        throw std::runtime_error("Could not create temporary output " +
                                 temporary_.string() + ": " +
                                 std::string(std::strerror(errno)));
      }
    }
    throw std::runtime_error("Could not allocate a unique temporary output.");
  }

  AtomicTextOutput(const AtomicTextOutput&) = delete;
  AtomicTextOutput& operator=(const AtomicTextOutput&) = delete;

  ~AtomicTextOutput() {
    if (stream_ != nullptr) fclose(stream_);
    if (!temporary_.empty()) unlink(temporary_.c_str());
  }

  void write(const std::string& text) {
    if (stream_ == nullptr) {
      throw std::runtime_error("Attempted to write a closed worker output.");
    }
    if (fwrite(text.data(), 1, text.size(), stream_) != text.size()) {
      throw std::runtime_error("Failed while writing temporary worker output.");
    }
  }

  void close_for_publication() {
    if (stream_ == nullptr) return;
    if (fflush(stream_) != 0 || fsync(fileno(stream_)) != 0) {
      throw std::runtime_error("Failed while flushing temporary worker output.");
    }
    FILE* closing = stream_;
    stream_ = nullptr;
    if (fclose(closing) != 0) {
      throw std::runtime_error("Failed while closing temporary worker output.");
    }
  }

  void publish_no_replace() {
    if (stream_ != nullptr) {
      throw std::runtime_error("Attempted to publish an open worker output.");
    }
    if (link(temporary_.c_str(), target_.c_str()) != 0) {
      throw std::runtime_error("Could not publish " + target_.string() +
                               " without replacement: " +
                               std::string(std::strerror(errno)));
    }
    published_ = true;
  }

  void rollback_publication() noexcept {
    if (!published_) return;
    struct stat temporary_status {};
    struct stat target_status {};
    if (stat(temporary_.c_str(), &temporary_status) == 0 &&
        lstat(target_.c_str(), &target_status) == 0 &&
        temporary_status.st_dev == target_status.st_dev &&
        temporary_status.st_ino == target_status.st_ino) {
      unlink(target_.c_str());
    }
    published_ = false;
  }

  void discard_temporary() noexcept {
    if (temporary_.empty()) return;
    if (unlink(temporary_.c_str()) == 0 || errno == ENOENT) temporary_.clear();
  }

 private:
  fs::path target_;
  fs::path temporary_;
  FILE* stream_ = nullptr;
  bool published_ = false;
};

std::int64_t residue(const Field& field, const Field::Element& value) {
  std::int64_t converted = 0;
  field.convert(converted, value);
  return converted;
}

std::int64_t centered(std::int64_t value, std::int64_t prime) {
  return value > prime / 2 ? value - prime : value;
}

struct CanonicalHeader {
  std::size_t rows;
  std::size_t columns;
};

CanonicalHeader read_header(std::istream& input) {
  CanonicalHeader header{};
  std::string suffix;
  if (!(input >> header.rows >> header.columns >> suffix) || suffix != "S") {
    throw std::runtime_error("Expected a LinBox sparse-row 'ROWS COLS S' header.");
  }
  return header;
}

/*
 * Build the transpose of the original matrix restricted to selected columns.
 * Parsing the source again avoids keeping a second full copy of B in memory.
 */
Sparse restricted_transpose(const std::string& input_path,
                            const Field& field,
                            const CanonicalHeader& expected,
                            const std::vector<std::size_t>& selected_columns) {
  std::ifstream input(input_path);
  if (!input) throw std::runtime_error("Could not reopen the input matrix.");
  const CanonicalHeader header = read_header(input);
  if (header.rows != expected.rows || header.columns != expected.columns) {
    throw std::runtime_error("The matrix dimensions changed between passes.");
  }
  std::vector<std::int64_t> selected_position(header.columns, -1);
  for (std::size_t position = 0; position < selected_columns.size(); ++position) {
    selected_position[selected_columns[position]] =
        static_cast<std::int64_t>(position);
  }

  Sparse transpose(field, selected_columns.size(), header.rows);
  for (std::size_t row = 0; row < header.rows; ++row) {
    std::size_t count = 0;
    if (!(input >> count)) throw std::runtime_error("The matrix ended inside a row.");
    std::size_t previous = 0;
    bool have_previous = false;
    for (std::size_t entry = 0; entry < count; ++entry) {
      std::size_t column = 0;
      Givaro::Integer coefficient;
      if (!(input >> column >> coefficient) || column >= header.columns ||
          (have_previous && column <= previous) || coefficient == 0) {
        throw std::runtime_error("A sparse matrix row is not canonical.");
      }
      have_previous = true;
      previous = column;
      const std::int64_t position = selected_position[column];
      if (position >= 0) {
        Field::Element value;
        field.init(value, coefficient);
        if (!field.isZero(value)) {
          transpose.setEntry(static_cast<std::size_t>(position), row, value);
        }
      }
    }
  }
  std::string trailing;
  if (input >> trailing) throw std::runtime_error("The matrix has trailing tokens.");
  return transpose;
}

Sparse selected_minor(const std::string& input_path,
                      const Field& field,
                      const CanonicalHeader& expected,
                      const std::vector<std::size_t>& selected_rows,
                      const std::vector<std::size_t>& selected_columns) {
  if (selected_rows.size() != selected_columns.size()) {
    throw std::runtime_error("The selected rank minor is not square.");
  }
  std::ifstream input(input_path);
  if (!input) throw std::runtime_error("Could not reopen the input matrix.");
  const CanonicalHeader header = read_header(input);
  if (header.rows != expected.rows || header.columns != expected.columns) {
    throw std::runtime_error("The matrix dimensions changed between passes.");
  }
  std::vector<std::int64_t> row_position(header.rows, -1);
  std::vector<std::int64_t> column_position(header.columns, -1);
  for (std::size_t position = 0; position < selected_rows.size(); ++position) {
    row_position[selected_rows[position]] = static_cast<std::int64_t>(position);
    column_position[selected_columns[position]] =
        static_cast<std::int64_t>(position);
  }

  Sparse minor(field, selected_rows.size(), selected_columns.size());
  for (std::size_t row = 0; row < header.rows; ++row) {
    std::size_t count = 0;
    if (!(input >> count)) throw std::runtime_error("The matrix ended inside a row.");
    std::size_t previous = 0;
    bool have_previous = false;
    for (std::size_t entry = 0; entry < count; ++entry) {
      std::size_t column = 0;
      Givaro::Integer coefficient;
      if (!(input >> column >> coefficient) || column >= header.columns ||
          (have_previous && column <= previous) || coefficient == 0) {
        throw std::runtime_error("A sparse matrix row is not canonical.");
      }
      have_previous = true;
      previous = column;
      const std::int64_t selected_row = row_position[row];
      const std::int64_t selected_column = column_position[column];
      if (selected_row >= 0 && selected_column >= 0) {
        Field::Element value;
        field.init(value, coefficient);
        if (!field.isZero(value)) {
          minor.setEntry(static_cast<std::size_t>(selected_row),
                         static_cast<std::size_t>(selected_column), value);
        }
      }
    }
  }
  std::string trailing;
  if (input >> trailing) throw std::runtime_error("The matrix has trailing tokens.");
  return minor;
}

void write_index_line(std::ostream& output,
                      const char* label,
                      const std::vector<std::size_t>& values) {
  output << label << ' ' << values.size();
  for (const std::size_t value : values) output << ' ' << value;
  output << '\n';
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 5) {
    std::cerr << "Usage: generic_sparse_h1_rank_worker MATRIX PRIME "
                 "KERNEL_OUTPUT RANK_EVIDENCE_OUTPUT\n";
    return 2;
  }

  try {
    const std::string input_path = argv[1];
    const std::string prime_text = argv[2];
    if (prime_text.empty() ||
        (prime_text.size() > 1 && prime_text.front() == '0') ||
        std::any_of(prime_text.begin(), prime_text.end(),
                    [](const char value) { return value < '0' || value > '9'; })) {
      throw std::runtime_error("PRIME must be a canonical decimal integer.");
    }
    const std::int64_t prime = std::stoll(prime_text);
    const fs::path kernel_path = resolved_output_target(argv[3]);
    const fs::path evidence_path = resolved_output_target(argv[4]);
    if (kernel_path == evidence_path) {
      throw std::runtime_error("The two worker output paths must be distinct.");
    }
    if (prime < 3 || prime >= (std::int64_t{1} << 26) || !is_prime(prime)) {
      throw std::runtime_error(
          "PRIME must be prime and lie in [3,2^26) for exact double residues.");
    }
    if (path_entry_exists(kernel_path) || path_entry_exists(evidence_path)) {
      throw std::runtime_error("Refusing to overwrite a worker output.");
    }

    std::ifstream input(input_path);
    if (!input) throw std::runtime_error("Could not open the input matrix.");
    Field field(static_cast<double>(prime));
    MatrixStream<Field> matrix_stream(field, input);
    Sparse matrix(matrix_stream);
    const CanonicalHeader header{matrix.rowdim(), matrix.coldim()};
    if (header.rows > static_cast<std::size_t>(std::numeric_limits<int>::max()) ||
        header.columns >
            static_cast<std::size_t>(std::numeric_limits<int>::max())) {
      throw std::runtime_error(
          "Matrix dimensions exceed LinBox permutation index capacity.");
    }

    const auto started = std::chrono::steady_clock::now();
    GaussDomain<Field> gaussian(field);
    Field::Element ignored_determinant;
    std::size_t rank = 0;
    std::size_t active_rows = header.rows;
    std::size_t active_columns = header.columns;
    Permutation<Field> column_permutation(field,
                                          static_cast<int>(header.columns));
    if (header.rows > 0) {
      gaussian.InPlaceLinearPivoting(rank, ignored_determinant, matrix,
                                     column_permutation, active_rows,
                                     active_columns);
    }

    // LinBox's triangular nullspace solver requires all nonzero echelon rows
    // to precede the zero rows. Elimination preserves zero-row holes, so this
    // compaction is mathematically necessary, not just a storage optimization.
    for (std::size_t row = 0; row < active_rows; ++row) {
      if (matrix[row].empty()) {
        std::size_t replacement = row;
        if (nextnonzero(replacement, active_rows, matrix)) {
          matrix[row] = matrix[replacement];
          matrix[replacement].resize(0);
        } else {
          break;
        }
      }
    }

    const std::size_t nullity = header.columns - rank;
    DenseMatrix<Field> nullspace(field, header.columns, nullity);
    gaussian.nullspacebasis(nullspace, rank, matrix, column_permutation);

    std::vector<std::size_t> pivot_columns;
    std::vector<std::pair<std::size_t, std::size_t>> free_column_basis;
    pivot_columns.reserve(rank);
    free_column_basis.reserve(nullity);
    for (std::size_t position = 0; position < rank; ++position) {
      pivot_columns.push_back(
          static_cast<std::size_t>(column_permutation[position]));
    }
    for (std::size_t basis = 0; basis < nullity; ++basis) {
      free_column_basis.emplace_back(
          static_cast<std::size_t>(column_permutation[rank + basis]), basis);
    }

    // LinBox's nullspacebasis uses the nonpivot permutation tail as an
    // identity chart.  Check that invariant before relying on it, then sort
    // the chart columns into the canonical order required by the verifier.
    for (std::size_t left = 0; left < nullity; ++left) {
      for (std::size_t right = 0; right < nullity; ++right) {
        const auto& value =
            nullspace.getEntry(free_column_basis[left].first, right);
        const bool expected_one = left == right;
        if ((expected_one && !field.isOne(value)) ||
            (!expected_one && !field.isZero(value))) {
          throw std::runtime_error(
              "LinBox nullspacebasis did not expose its expected identity chart.");
        }
      }
    }
    std::sort(pivot_columns.begin(), pivot_columns.end());
    std::sort(free_column_basis.begin(), free_column_basis.end());
    std::vector<std::size_t> free_columns;
    free_columns.reserve(nullity);
    for (const auto& [column, basis] : free_column_basis) {
      (void)basis;
      free_columns.push_back(column);
    }

    Sparse transpose = restricted_transpose(input_path, field, header,
                                            pivot_columns);
    std::size_t transpose_rank = 0;
    std::size_t transpose_rows = transpose.rowdim();
    std::size_t transpose_columns = transpose.coldim();
    Field::Element transpose_determinant;
    Permutation<Field> row_permutation(field,
                                       static_cast<int>(header.rows));
    if (rank > 0) {
      gaussian.InPlaceLinearPivoting(
          transpose_rank, transpose_determinant, transpose, row_permutation,
          transpose_rows, transpose_columns);
    }
    if (transpose_rank != rank) {
      throw std::runtime_error(
          "The selected pivot columns lost rank in the transpose pass.");
    }
    std::vector<std::size_t> pivot_rows;
    pivot_rows.reserve(rank);
    for (std::size_t position = 0; position < rank; ++position) {
      pivot_rows.push_back(
          static_cast<std::size_t>(row_permutation[position]));
    }
    std::sort(pivot_rows.begin(), pivot_rows.end());

    Sparse minor =
        selected_minor(input_path, field, header, pivot_rows, pivot_columns);
    Field::Element minor_determinant;
    field.assign(minor_determinant, field.one);
    if (rank > 0) {
      gaussian.detInPlace(minor_determinant, minor, rank, rank);
    }
    if (field.isZero(minor_determinant)) {
      throw std::runtime_error("The selected original rank minor is singular.");
    }
    const std::int64_t determinant_residue =
        residue(field, minor_determinant);

    AtomicTextOutput kernel_output(kernel_path);
    AtomicTextOutput evidence_output(evidence_path);
    {
      std::ostringstream line;
      line << header.columns << ' ' << nullity << ' ' << prime << ' ' << rank
           << '\n';
      kernel_output.write(line.str());
    }
    {
      std::ostringstream line;
      line << "GENERIC_SPARSE_H1_RANK_EVIDENCE_V1 " << header.rows << ' '
           << header.columns << ' ' << prime << ' ' << rank << ' ' << nullity
           << ' ' << determinant_residue << '\n';
      write_index_line(line, "PIVOT_ROWS", pivot_rows);
      write_index_line(line, "PIVOT_COLUMNS", pivot_columns);
      write_index_line(line, "FREE_COLUMNS", free_columns);
      evidence_output.write(line.str());
    }

    for (std::size_t output_basis = 0; output_basis < nullity;
         ++output_basis) {
      const std::size_t chart_column = free_column_basis[output_basis].first;
      const std::size_t linbox_basis = free_column_basis[output_basis].second;
      std::size_t nonzero_count = 0;
      for (std::size_t column = 0; column < header.columns; ++column) {
        if (!field.isZero(nullspace.getEntry(column, linbox_basis))) {
          ++nonzero_count;
        }
      }
      kernel_output.write(std::to_string(output_basis) + " " +
                          std::to_string(nonzero_count));
      evidence_output.write("VECTOR " + std::to_string(chart_column) + " " +
                            std::to_string(nonzero_count));
      for (std::size_t column = 0; column < header.columns; ++column) {
        const auto& value = nullspace.getEntry(column, linbox_basis);
        if (field.isZero(value)) continue;
        const std::int64_t positive = residue(field, value);
        kernel_output.write(" " + std::to_string(column) + " " +
                            std::to_string(centered(positive, prime)));
        evidence_output.write(" " + std::to_string(column) + " " +
                              std::to_string(positive));
      }
      kernel_output.write("\n");
      evidence_output.write("\n");
    }

    kernel_output.close_for_publication();
    evidence_output.close_for_publication();
    kernel_output.publish_no_replace();
    try {
      evidence_output.publish_no_replace();
    } catch (...) {
      kernel_output.rollback_publication();
      throw;
    }
    kernel_output.discard_temporary();
    evidence_output.discard_temporary();

    const double seconds = std::chrono::duration<double>(
                               std::chrono::steady_clock::now() - started)
                               .count();
    std::cout << "rank=" << rank << " nullity=" << nullity
              << " prime=" << prime << " determinant="
              << determinant_residue << " seconds=" << seconds << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 2;
  }
}
