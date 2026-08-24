/*
 * Exact modular nullspace extractor for the streamed H^1 core.
 *
 * This is a small, reproducible wrapper around LinBox's deterministic sparse
 * Gaussian elimination.  The input is LinBox's sparse-row format.  The output
 * stores one sparse nullspace vector per line, with symmetric integer residues.
 *
 * LinBox and Givaro are distributed under the GNU LGPL; this wrapper is
 * project code and contains no copied implementation from either library.
 */

#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>

#include <givaro/modular.h>
#include <linbox/algorithms/gauss.h>
#include <linbox/matrix/dense-matrix.h>
#include <linbox/matrix/sparse-matrix.h>
#include <linbox/util/matrix-stream.h>

using namespace LinBox;

namespace {

using Field = Givaro::Modular<double>;

std::int64_t residue(const Field& field, const Field::Element& value) {
  std::int64_t converted = 0;
  field.convert(converted, value);
  return converted;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 4) {
    std::cerr << "Usage: streamed_h1_core_nullspace MATRIX PRIME OUTPUT\n";
    return 2;
  }

  const std::string input_path = argv[1];
  const std::int64_t prime = std::stoll(argv[2]);
  const std::string output_path = argv[3];
  if (prime < 3 || prime >= (std::int64_t{1} << 26)) {
    std::cerr << "PRIME must lie in [3,2^26) for exact double residues.\n";
    return 2;
  }

  std::ifstream input(input_path);
  if (!input) {
    std::cerr << "Could not open input matrix: " << input_path << "\n";
    return 2;
  }
  Field field(static_cast<double>(prime));
  MatrixStream<Field> matrix_stream(field, input);
  SparseMatrix<Field, SparseMatrixFormat::SparseSeq> matrix(matrix_stream);
  const std::size_t row_count = matrix.rowdim();
  const std::size_t column_count = matrix.coldim();
  std::cerr << "Loaded " << row_count << " x " << column_count << " core.\n";

  const auto started = std::chrono::steady_clock::now();
  GaussDomain<Field> gaussian(field);
  Field::Element determinant;
  std::size_t rank = 0;
  std::size_t active_rows = row_count;
  std::size_t active_columns = column_count;
  Permutation<Field> permutation(field, static_cast<int>(column_count));
  gaussian.InPlaceLinearPivoting(
      rank, determinant, matrix, permutation, active_rows, active_columns);

  // LinBox's triangular solver expects the nonzero echelon rows first.
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

  const std::size_t nullity = column_count - rank;
  DenseMatrix<Field> nullspace(field, column_count, nullity);
  gaussian.nullspacebasis(nullspace, rank, matrix, permutation);
  const auto solved = std::chrono::steady_clock::now();

  std::ofstream output(output_path, std::ios::out | std::ios::trunc);
  if (!output) {
    std::cerr << "Could not open output file: " << output_path << "\n";
    return 2;
  }
  output << column_count << ' ' << nullity << ' ' << prime << ' ' << rank
         << "\n";
  for (std::size_t basis = 0; basis < nullity; ++basis) {
    std::size_t nonzero_count = 0;
    for (std::size_t column = 0; column < column_count; ++column) {
      if (!field.isZero(nullspace.getEntry(column, basis))) {
        ++nonzero_count;
      }
    }
    output << basis << ' ' << nonzero_count;
    for (std::size_t column = 0; column < column_count; ++column) {
      const auto& value = nullspace.getEntry(column, basis);
      if (field.isZero(value)) continue;
      std::int64_t integer = residue(field, value);
      if (integer > prime / 2) integer -= prime;
      output << ' ' << column << ' ' << integer;
    }
    output << "\n";
  }
  output.close();
  if (!output) {
    std::cerr << "Failed while writing output file: " << output_path << "\n";
    return 2;
  }

  const double seconds =
      std::chrono::duration<double>(solved - started).count();
  std::cout << "rank=" << rank << " nullity=" << nullity
            << " prime=" << prime << " seconds=" << seconds << "\n";
  return 0;
}
