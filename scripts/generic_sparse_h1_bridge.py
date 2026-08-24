#!/usr/bin/env python3
"""Source-bound bridge from a generic streamed H1 matrix to external exact tools.

The bridge has two successful outcomes:

* ``verified-saturated-frame-only``: modular kernels and the reconstructed
  saturated integral frame replay, but no exact rank is claimed;
* ``verified-full-integral-kernel``: the same frame is accompanied by a
  replayed proof-carrying modular-rank certificate.  Its nonzero minor and
  identity-chart kernel prove both rank inequalities.

LinBox's reported rank is always recorded as backend output, never promoted to
an exact-rank claim by itself.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence

import lift_modular_kernel as lift


REQUEST_KIND = "generic-sparse-h1-external-request"
RESPONSE_KIND = "generic-sparse-h1-external-response"
REQUEST_SCHEMA_VERSION = 1
RESPONSE_SCHEMA_VERSION = 1
RANK_KIND = "generic-sparse-modular-rank-certificate"
RANK_ALGORITHM = "sparse-rref-pivot-minor-right-kernel-chart-v1"
MATRIX_CHUNK_ROWS = 4_096
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
INTEGER_RE = re.compile(r"^(0|-?[1-9][0-9]*)$")
IDENTIFIER_RE = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
MAX_PRIME = 67_108_859
MAX_JSON_INTEGER_DIGITS = 4_096


class BridgeError(ValueError):
    """A request, backend artifact, or exact replay failed validation."""


@dataclass(frozen=True)
class Bounds:
    max_matrix_bytes: int
    max_preparation_certificate_bytes: int
    max_tool_bytes: int
    max_rows: int
    max_columns: int
    max_nonzeros: int
    max_coefficient_digits: int
    max_prime_count: int
    max_transcript_bytes: int
    max_nullity: int
    max_dense_lift_entries: int
    max_integral_basis_bytes: int
    max_lift_certificate_bytes: int
    max_rank_certificate_bytes: int
    max_kernel_nonzeros: int
    max_minor_working_nonzeros: int
    max_field_operations: int
    worker_timeout_seconds: int


@dataclass(frozen=True)
class MatrixSummary:
    rows: int
    columns: int
    nonzero_count: int
    maximum_absolute_coefficient: int
    byte_sha256: str
    byte_count: int
    generic_sparse_matrix_digest: str


@dataclass(frozen=True)
class TranscriptSummary:
    path: Path
    sha256: str
    byte_count: int
    columns: int
    nullity: int
    prime: int
    reported_rank: int
    nonzero_count: int


@dataclass(frozen=True)
class ModularRunSpec:
    prime: int
    transcript_path: Path
    expected_sha256: str | None


@dataclass(frozen=True)
class RankEvidence:
    rows: int
    columns: int
    prime: int
    rank: int
    nullity: int
    determinant_residue: int
    pivot_rows: list[int]
    pivot_columns: list[int]
    free_columns: list[int]
    kernel_basis: list[dict[str, object]]
    kernel_nonzeros: int
    sha256: str
    byte_count: int


def canonical_json(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def canonical_sha256(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def file_sha256(path: Path, maximum_bytes: int | None = None) -> tuple[str, int]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            byte_count += len(block)
            if maximum_bytes is not None and byte_count > maximum_bytes:
                raise BridgeError(f"{path}: exceeds the {maximum_bytes}-byte bound")
            digest.update(block)
    return digest.hexdigest(), byte_count


def require_sha256(value: object, path: str) -> str:
    if not isinstance(value, str) or SHA256_RE.fullmatch(value) is None:
        raise BridgeError(f"{path} must be a lowercase SHA-256 digest")
    return value


def require_int(value: object, path: str, minimum: int = 0) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise BridgeError(f"{path} must be an integer at least {minimum}")
    return value


def require_str(value: object, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise BridgeError(f"{path} must be a nonempty string")
    return value


def require_mapping(value: object, path: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise BridgeError(f"{path} must be an object")
    return value


def require_keys(
    value: Mapping[str, object],
    required: Iterable[str],
    optional: Iterable[str],
    path: str,
) -> None:
    required_set = set(required)
    allowed = required_set | set(optional)
    missing = sorted(required_set - set(value))
    unknown = sorted(set(value) - allowed)
    if missing:
        raise BridgeError(f"{path} is missing keys: {', '.join(missing)}")
    if unknown:
        raise BridgeError(f"{path} has unknown keys: {', '.join(unknown)}")


def resolve_path(recorded: object, request_path: Path, path: str) -> Path:
    text = require_str(recorded, path)
    candidate = Path(text)
    return candidate if candidate.is_absolute() else request_path.parent / candidate


def display_path(path: Path, request_path: Path) -> str:
    try:
        return path.resolve().relative_to(request_path.parent.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def is_prime(value: int) -> bool:
    if value < 2 or value > MAX_PRIME:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def parse_bounds(raw: object) -> Bounds:
    value = require_mapping(raw, "bounds")
    fields = [
        "maxMatrixBytes",
        "maxPreparationCertificateBytes",
        "maxToolBytes",
        "maxRows",
        "maxColumns",
        "maxNonzeros",
        "maxCoefficientDigits",
        "maxPrimeCount",
        "maxTranscriptBytes",
        "maxNullity",
        "maxDenseLiftEntries",
        "maxIntegralBasisBytes",
        "maxLiftCertificateBytes",
        "maxRankCertificateBytes",
        "maxKernelNonzeros",
        "maxMinorWorkingNonzeros",
        "maxFieldOperations",
        "workerTimeoutSeconds",
    ]
    require_keys(value, fields, [], "bounds")
    numbers = {
        field: require_int(value[field], f"bounds.{field}", 1) for field in fields
    }
    return Bounds(
        max_matrix_bytes=numbers["maxMatrixBytes"],
        max_preparation_certificate_bytes=numbers["maxPreparationCertificateBytes"],
        max_tool_bytes=numbers["maxToolBytes"],
        max_rows=numbers["maxRows"],
        max_columns=numbers["maxColumns"],
        max_nonzeros=numbers["maxNonzeros"],
        max_coefficient_digits=numbers["maxCoefficientDigits"],
        max_prime_count=numbers["maxPrimeCount"],
        max_transcript_bytes=numbers["maxTranscriptBytes"],
        max_nullity=numbers["maxNullity"],
        max_dense_lift_entries=numbers["maxDenseLiftEntries"],
        max_integral_basis_bytes=numbers["maxIntegralBasisBytes"],
        max_lift_certificate_bytes=numbers["maxLiftCertificateBytes"],
        max_rank_certificate_bytes=numbers["maxRankCertificateBytes"],
        max_kernel_nonzeros=numbers["maxKernelNonzeros"],
        max_minor_working_nonzeros=numbers["maxMinorWorkingNonzeros"],
        max_field_operations=numbers["maxFieldOperations"],
        worker_timeout_seconds=numbers["workerTimeoutSeconds"],
    )


def parse_canonical_integer(token: str, path: str, digit_bound: int) -> int:
    if INTEGER_RE.fullmatch(token) is None:
        raise BridgeError(f"{path} is not a canonical decimal integer")
    digits = len(token) - int(token.startswith("-"))
    if digits > digit_bound:
        raise BridgeError(f"{path} exceeds the {digit_bound}-digit bound")
    return int(token)


def iter_linbox_rows(
    path: Path,
    bounds: Bounds,
    expected_rows: int | None = None,
    expected_columns: int | None = None,
) -> Iterator[tuple[int, list[tuple[int, int]]]]:
    with path.open("r", encoding="ascii", newline="") as stream:
        header = stream.readline()
        words = header.rstrip("\r\n").split(" ")
        if len(words) != 3 or words[2] != "S" or any(word == "" for word in words):
            raise BridgeError(f"{path}: expected canonical 'ROWS COLS S' header")
        rows = parse_canonical_integer(words[0], "matrix.rows", 16)
        columns = parse_canonical_integer(words[1], "matrix.columns", 16)
        if rows < 0 or columns < 0:
            raise BridgeError(f"{path}: negative matrix dimension")
        if rows > bounds.max_rows or columns > bounds.max_columns:
            raise BridgeError(f"{path}: matrix dimensions exceed request bounds")
        if expected_rows is not None and rows != expected_rows:
            raise BridgeError(f"{path}: row count differs from the request")
        if expected_columns is not None and columns != expected_columns:
            raise BridgeError(f"{path}: column count differs from the request")
        emitted = 0
        for row_index, line in enumerate(stream):
            if row_index >= rows:
                raise BridgeError(f"{path}: contains more than {rows} rows")
            stripped = line.rstrip("\r\n")
            words = stripped.split(" ")
            if not words or any(word == "" for word in words):
                raise BridgeError(f"{path}: sparse row {row_index} is not canonical")
            count = parse_canonical_integer(
                words[0], f"matrix.row[{row_index}].count", 16
            )
            if count < 0 or len(words) != 1 + 2 * count:
                raise BridgeError(f"{path}: malformed sparse row {row_index}")
            row: list[tuple[int, int]] = []
            previous_column = -1
            for entry in range(count):
                column = parse_canonical_integer(
                    words[1 + 2 * entry],
                    f"matrix.row[{row_index}].entry[{entry}].column",
                    16,
                )
                coefficient = parse_canonical_integer(
                    words[2 + 2 * entry],
                    f"matrix.row[{row_index}].entry[{entry}].coefficient",
                    bounds.max_coefficient_digits,
                )
                if column <= previous_column or column >= columns or coefficient == 0:
                    raise BridgeError(
                        f"{path}: row {row_index} entries are not sorted, in range, and nonzero"
                    )
                previous_column = column
                row.append((column, coefficient))
            emitted += 1
            yield row_index, row
        if emitted != rows:
            raise BridgeError(f"{path}: header promises {rows} rows, found {emitted}")


def summarize_matrix(path: Path, bounds: Bounds) -> MatrixSummary:
    byte_sha256, byte_count = file_sha256(path, bounds.max_matrix_bytes)
    with path.open("r", encoding="ascii") as stream:
        header = stream.readline().split()
    if len(header) != 3 or header[2] != "S":
        raise BridgeError(f"{path}: invalid LinBox sparse-row header")
    rows, columns = map(int, header[:2])
    nonzero_count = 0
    maximum = 0
    chunk_rows: list[dict[str, object]] = []
    chunk_digests: list[str] = []
    chunk_first_row = 0

    def flush() -> None:
        nonlocal chunk_rows
        if not chunk_rows:
            return
        chunk_digests.append(
            canonical_sha256(
                {
                    "schemaVersion": 1,
                    "method": "canonical-explicit-sparse-integer-matrix-row-chunk",
                    "chunkIndex": len(chunk_digests),
                    "firstRow": chunk_first_row,
                    "rows": chunk_rows,
                }
            )
        )
        chunk_rows = []

    for row_index, entries in iter_linbox_rows(path, bounds, rows, columns):
        if not chunk_rows:
            chunk_first_row = row_index
        nonzero_count += len(entries)
        if nonzero_count > bounds.max_nonzeros:
            raise BridgeError(
                f"{path}: exceeds the {bounds.max_nonzeros}-nonzero bound"
            )
        for _column, value in entries:
            maximum = max(maximum, abs(value))
        chunk_rows.append(
            {
                "row": row_index,
                "entries": [[column, str(value)] for column, value in entries],
            }
        )
        if len(chunk_rows) == MATRIX_CHUNK_ROWS:
            flush()
    flush()
    digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "chunked-canonical-explicit-sparse-integer-matrix-v1",
            "rowCount": rows,
            "columnCount": columns,
            "nonzeroCount": nonzero_count,
            "maximumAbsoluteCoefficient": str(maximum),
            "chunkRowCount": MATRIX_CHUNK_ROWS,
            "chunkDigests": chunk_digests,
        }
    )
    return MatrixSummary(
        rows=rows,
        columns=columns,
        nonzero_count=nonzero_count,
        maximum_absolute_coefficient=maximum,
        byte_sha256=byte_sha256,
        byte_count=byte_count,
        generic_sparse_matrix_digest=digest,
    )


def load_bounded_json(
    path: Path,
    maximum_bytes: int,
    label: str,
    max_integer_digits: int = MAX_JSON_INTEGER_DIGITS,
) -> dict[str, Any]:
    _digest, _size = file_sha256(path, maximum_bytes)

    def parse_bounded_integer(token: str) -> int:
        digits = len(token) - int(token.startswith("-"))
        if digits > max_integer_digits:
            raise BridgeError(
                f"{label} JSON integer exceeds the {max_integer_digits}-digit bound"
            )
        return int(token)

    try:
        value = json.loads(
            path.read_text(encoding="utf-8"), parse_int=parse_bounded_integer
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BridgeError(f"{label} is not valid UTF-8 JSON: {error}") from error
    return require_mapping(value, label)


def validate_preparation(
    record: Mapping[str, object], request_path: Path, bounds: Bounds
) -> tuple[dict[str, Any], Path, str]:
    require_keys(record, ["path", "sha256"], [], "preparation")
    path = resolve_path(record["path"], request_path, "preparation.path")
    expected_file_hash = require_sha256(record["sha256"], "preparation.sha256")
    actual_file_hash, _size = file_sha256(
        path, bounds.max_preparation_certificate_bytes
    )
    if actual_file_hash != expected_file_hash:
        raise BridgeError("preparation certificate file SHA-256 mismatch")
    certificate = load_bounded_json(
        path,
        bounds.max_preparation_certificate_bytes,
        "preparation certificate",
    )
    if (
        certificate.get("schemaVersion") != 1
        or certificate.get("kind") != "generic-streamed-integral-h1-preparation"
        or certificate.get("status") != "prepared"
    ):
        raise BridgeError("preparation certificate envelope is not recognized")
    preparation_digest = require_sha256(
        certificate.get("preparationDigest"), "preparation.preparationDigest"
    )
    payload = dict(certificate)
    payload.pop("preparationDigest")
    if canonical_sha256(payload) != preparation_digest:
        raise BridgeError("preparation certificate digest is stale")
    checks = require_mapping(certificate.get("checks"), "preparation.checks")
    if not checks or not all(value is True for value in checks.values()):
        raise BridgeError("preparation certificate has a failed check")
    return certificate, path, actual_file_hash


def preparation_bindings(certificate: Mapping[str, object]) -> dict[str, str]:
    source = require_mapping(certificate.get("source"), "preparation.source")
    graph = require_mapping(certificate.get("graph"), "preparation.graph")
    boundary = require_mapping(certificate.get("boundary"), "preparation.boundary")
    export = require_mapping(certificate.get("export"), "preparation.export")
    linbox = require_mapping(
        export.get("linboxSparseRow"), "preparation.export.linboxSparseRow"
    )
    return {
        "preparation": require_sha256(
            certificate.get("preparationDigest"), "preparation.preparationDigest"
        ),
        "system": require_sha256(
            source.get("systemCanonicalSha256"),
            "preparation.source.systemCanonicalSha256",
        ),
        "action": require_sha256(
            source.get("actionRowsCanonicalSha256"),
            "preparation.source.actionRowsCanonicalSha256",
        ),
        "oracle": require_sha256(
            source.get("oracleStructureHash"), "preparation.source.oracleStructureHash"
        ),
        "boundary": require_sha256(
            boundary.get("sparseBoundaryDigest"),
            "preparation.boundary.sparseBoundaryDigest",
        ),
        "cotree": require_sha256(
            graph.get("cotreeDigest"), "preparation.graph.cotreeDigest"
        ),
        "linbox-export": require_sha256(
            linbox.get("logicalExportDigest"),
            "preparation.export.linboxSparseRow.logicalExportDigest",
        ),
        "generic-sparse-matrix": require_sha256(
            linbox.get("genericSparseMatrixDigest"),
            "preparation.export.linboxSparseRow.genericSparseMatrixDigest",
        ),
    }


def validate_matrix_record(
    record: Mapping[str, object],
    request_path: Path,
    bounds: Bounds,
    preparation: Mapping[str, object],
) -> tuple[Path, MatrixSummary]:
    require_keys(
        record,
        [
            "path",
            "sha256",
            "genericSparseMatrixDigest",
            "rows",
            "columns",
            "nonzeroCount",
            "maximumAbsoluteCoefficient",
        ],
        [],
        "matrix",
    )
    path = resolve_path(record["path"], request_path, "matrix.path")
    summary = summarize_matrix(path, bounds)
    expected = {
        "sha256": summary.byte_sha256,
        "genericSparseMatrixDigest": summary.generic_sparse_matrix_digest,
        "rows": summary.rows,
        "columns": summary.columns,
        "nonzeroCount": summary.nonzero_count,
        "maximumAbsoluteCoefficient": str(summary.maximum_absolute_coefficient),
    }
    for field, actual in expected.items():
        if record.get(field) != actual:
            raise BridgeError(f"matrix.{field} does not match the sparse matrix")
    boundary = require_mapping(preparation.get("boundary"), "preparation.boundary")
    export = require_mapping(preparation.get("export"), "preparation.export")
    linbox = require_mapping(
        export.get("linboxSparseRow"), "preparation.export.linboxSparseRow"
    )
    prepared_matrix_digest = require_sha256(
        linbox.get("genericSparseMatrixDigest"),
        "preparation.export.linboxSparseRow.genericSparseMatrixDigest",
    )
    if prepared_matrix_digest != summary.generic_sparse_matrix_digest:
        raise BridgeError(
            "matrix genericSparseMatrixDigest differs from the source-bound preparation"
        )
    if (
        boundary.get("rowCount") != summary.rows
        or boundary.get("columnCount") != summary.columns
        or boundary.get("nonzeroCount") != summary.nonzero_count
        or boundary.get("maximumAbsoluteCoefficient")
        != str(summary.maximum_absolute_coefficient)
    ):
        raise BridgeError("matrix dimensions/statistics differ from the preparation")
    return path, summary


def validate_tool_record(
    record: Mapping[str, object], request_path: Path, bounds: Bounds
) -> dict[str, object]:
    require_keys(
        record,
        [
            "executablePath",
            "executableSha256",
            "driverSourcePath",
            "driverSourceSha256",
            "backend",
            "backendVersion",
            "algorithm",
        ],
        [],
        "linboxWorker",
    )
    executable = resolve_path(
        record["executablePath"], request_path, "linboxWorker.executablePath"
    )
    driver = resolve_path(
        record["driverSourcePath"], request_path, "linboxWorker.driverSourcePath"
    )
    executable_hash, _ = file_sha256(executable, bounds.max_tool_bytes)
    driver_hash, _ = file_sha256(driver, bounds.max_tool_bytes)
    if executable_hash != require_sha256(
        record["executableSha256"], "linboxWorker.executableSha256"
    ):
        raise BridgeError("LinBox worker executable SHA-256 mismatch")
    if driver_hash != require_sha256(
        record["driverSourceSha256"], "linboxWorker.driverSourceSha256"
    ):
        raise BridgeError("LinBox driver source SHA-256 mismatch")
    return {
        "executable": executable,
        "driver": driver,
        "executableSha256": executable_hash,
        "driverSourceSha256": driver_hash,
        "backend": require_str(record["backend"], "linboxWorker.backend"),
        "backendVersion": require_str(
            record["backendVersion"], "linboxWorker.backendVersion"
        ),
        "algorithm": require_str(record["algorithm"], "linboxWorker.algorithm"),
    }


def parse_transcript(
    path: Path, expected_prime: int, bounds: Bounds
) -> TranscriptSummary:
    digest, byte_count = file_sha256(path, bounds.max_transcript_bytes)
    with path.open("r", encoding="ascii", newline="") as stream:
        header_line = stream.readline().rstrip("\r\n")
        words = header_line.split(" ")
        if len(words) != 4 or any(word == "" for word in words):
            raise BridgeError(f"{path}: malformed modular transcript header")
        columns, nullity, prime, rank = [
            parse_canonical_integer(word, f"{path}.header", 16) for word in words
        ]
        if (
            columns < 0
            or nullity < 0
            or rank < 0
            or prime != expected_prime
            or not is_prime(prime)
            or columns - rank != nullity
            or nullity > bounds.max_nullity
            or columns * nullity > bounds.max_dense_lift_entries
        ):
            raise BridgeError(
                f"{path}: modular transcript dimensions/prime exceed bounds"
            )
        seen: set[int] = set()
        nonzero_count = 0
        for line_number, line in enumerate(stream, start=2):
            tokens = line.rstrip("\r\n").split(" ")
            if len(tokens) < 2 or any(token == "" for token in tokens):
                raise BridgeError(f"{path}:{line_number}: malformed basis row")
            basis = parse_canonical_integer(
                tokens[0], f"{path}:{line_number}.basis", 16
            )
            count = parse_canonical_integer(
                tokens[1], f"{path}:{line_number}.count", 16
            )
            if (
                basis in seen
                or not 0 <= basis < nullity
                or count < 0
                or len(tokens) != 2 + 2 * count
            ):
                raise BridgeError(f"{path}:{line_number}: invalid basis row")
            seen.add(basis)
            previous = -1
            for entry in range(count):
                column = parse_canonical_integer(
                    tokens[2 + 2 * entry], f"{path}:{line_number}.column", 16
                )
                value = parse_canonical_integer(
                    tokens[3 + 2 * entry],
                    f"{path}:{line_number}.value",
                    bounds.max_coefficient_digits,
                )
                if (
                    column <= previous
                    or column >= columns
                    or value == 0
                    or abs(value) > prime // 2
                ):
                    raise BridgeError(
                        f"{path}:{line_number}: noncanonical modular entry"
                    )
                previous = column
            nonzero_count += count
            if nonzero_count > bounds.max_kernel_nonzeros:
                raise BridgeError(f"{path}: modular kernel exceeds its nonzero bound")
        if len(seen) != nullity:
            raise BridgeError(f"{path}: missing modular basis rows")
    return TranscriptSummary(
        path, digest, byte_count, columns, nullity, prime, rank, nonzero_count
    )


def read_integral_basis_bounded(
    path: Path, expected_columns: int, bounds: Bounds
) -> list[list[int]]:
    with path.open("r", encoding="ascii", newline="") as stream:
        words = stream.readline().rstrip("\r\n").split(" ")
        if len(words) != 3 or words[2] != "Z" or any(word == "" for word in words):
            raise BridgeError(f"{path}: expected canonical 'COLS NULLITY Z' header")
        columns = parse_canonical_integer(words[0], f"{path}.columns", 16)
        nullity = parse_canonical_integer(words[1], f"{path}.nullity", 16)
        if (
            columns != expected_columns
            or nullity < 0
            or nullity > bounds.max_nullity
            or columns * nullity > bounds.max_dense_lift_entries
        ):
            raise BridgeError(f"{path}: integral-basis dimensions exceed bounds")
        vectors = [[0] * columns for _ in range(nullity)]
        seen: set[int] = set()
        nonzero_count = 0
        for line_number, line in enumerate(stream, start=2):
            tokens = line.rstrip("\r\n").split(" ")
            if len(tokens) < 2 or any(token == "" for token in tokens):
                raise BridgeError(f"{path}:{line_number}: malformed integral vector")
            vector = parse_canonical_integer(
                tokens[0], f"{path}:{line_number}.vector", 16
            )
            count = parse_canonical_integer(
                tokens[1], f"{path}:{line_number}.count", 16
            )
            if (
                vector in seen
                or not 0 <= vector < nullity
                or count < 0
                or len(tokens) != 2 + 2 * count
            ):
                raise BridgeError(f"{path}:{line_number}: invalid integral vector")
            seen.add(vector)
            previous = -1
            for entry in range(count):
                column = parse_canonical_integer(
                    tokens[2 + 2 * entry], f"{path}:{line_number}.column", 16
                )
                value = parse_canonical_integer(
                    tokens[3 + 2 * entry],
                    f"{path}:{line_number}.coefficient",
                    bounds.max_coefficient_digits,
                )
                if column <= previous or column >= columns or value == 0:
                    raise BridgeError(
                        f"{path}:{line_number}: integral entries are not canonical"
                    )
                previous = column
                vectors[vector][column] = value
            nonzero_count += count
            if nonzero_count > bounds.max_kernel_nonzeros:
                raise BridgeError(f"{path}: integral frame exceeds its nonzero bound")
        if len(seen) != nullity:
            raise BridgeError(f"{path}: missing integral basis vectors")
    return vectors


def bounded_square_integer_matrix(
    value: object, dimension: int, bounds: Bounds, path: str
) -> list[list[int]]:
    if (
        not isinstance(value, list)
        or len(value) != dimension
        or dimension * dimension > bounds.max_dense_lift_entries
    ):
        raise BridgeError(f"{path} is not a bounded {dimension}-by-{dimension} matrix")
    result: list[list[int]] = []
    for row_index, row in enumerate(value):
        if not isinstance(row, list) or len(row) != dimension:
            raise BridgeError(f"{path}[{row_index}] has the wrong dimension")
        parsed: list[int] = []
        for column, entry in enumerate(row):
            if not isinstance(entry, int) or isinstance(entry, bool):
                raise BridgeError(f"{path}[{row_index}][{column}] is not an integer")
            if len(str(abs(entry))) > bounds.max_coefficient_digits:
                raise BridgeError(
                    f"{path}[{row_index}][{column}] exceeds the coefficient-digit bound"
                )
            parsed.append(entry)
        result.append(parsed)
    return result


def prevalidate_modular_run_records(
    raw: object,
    request_path: Path,
    bounds: Bounds,
    mode: str,
) -> list[ModularRunSpec]:
    if not isinstance(raw, list) or not raw or len(raw) > bounds.max_prime_count:
        raise BridgeError("modularRuns must contain 1..maxPrimeCount records")
    result: list[ModularRunSpec] = []
    seen_primes: set[int] = set()
    seen_paths: set[Path] = set()
    for index, item in enumerate(raw):
        record = require_mapping(item, f"modularRuns[{index}]")
        required = ["prime", "transcriptPath"]
        if mode == "consume-existing":
            required.append("expectedSha256")
        require_keys(record, required, [], f"modularRuns[{index}]")
        prime = require_int(record["prime"], f"modularRuns[{index}].prime", 3)
        if not is_prime(prime) or prime in seen_primes:
            raise BridgeError(
                f"modularRuns[{index}].prime is not a distinct supported prime"
            )
        seen_primes.add(prime)
        path = resolve_path(
            record["transcriptPath"],
            request_path,
            f"modularRuns[{index}].transcriptPath",
        )
        resolved_path = path.resolve()
        if resolved_path in seen_paths:
            raise BridgeError("modularRuns transcript paths must be distinct")
        seen_paths.add(resolved_path)
        expected = (
            require_sha256(
                record["expectedSha256"],
                f"modularRuns[{index}].expectedSha256",
            )
            if mode == "consume-existing"
            else None
        )
        result.append(ModularRunSpec(prime, path, expected))
    return result


def validate_modular_runs(
    raw: object,
    request_path: Path,
    bounds: Bounds,
    matrix: MatrixSummary,
    mode: str,
) -> list[tuple[dict[str, Any], TranscriptSummary]]:
    specs = prevalidate_modular_run_records(raw, request_path, bounds, mode)
    assert isinstance(raw, list)
    result: list[tuple[dict[str, Any], TranscriptSummary]] = []
    for index, (item, spec) in enumerate(zip(raw, specs)):
        record = require_mapping(item, f"modularRuns[{index}]")
        summary = parse_transcript(spec.transcript_path, spec.prime, bounds)
        if summary.columns != matrix.columns:
            raise BridgeError("modular transcript column count differs from the matrix")
        if spec.expected_sha256 is not None and summary.sha256 != spec.expected_sha256:
            raise BridgeError("modular transcript SHA-256 differs from the request")
        result.append((record, summary))
    ranks = {(summary.reported_rank, summary.nullity) for _record, summary in result}
    if len(ranks) != 1:
        raise BridgeError("modular transcripts report inconsistent ranks/nullities")
    return result


def validate_lift_record(
    raw: Mapping[str, object], request_path: Path, bounds: Bounds, mode: str
) -> dict[str, object]:
    optional = (
        ["expectedIntegralBasisSha256", "expectedCertificateSha256"]
        if mode == "consume-existing"
        else ["numeratorBound", "denominatorBound"]
    )
    required = [
        "scriptPath",
        "scriptSha256",
        "integralBasisPath",
        "certificatePath",
    ]
    if mode == "consume-existing":
        required += ["expectedIntegralBasisSha256", "expectedCertificateSha256"]
        optional = []
    require_keys(raw, required, optional, "lift")
    script = resolve_path(raw["scriptPath"], request_path, "lift.scriptPath")
    basis = resolve_path(
        raw["integralBasisPath"], request_path, "lift.integralBasisPath"
    )
    certificate = resolve_path(
        raw["certificatePath"], request_path, "lift.certificatePath"
    )
    script_hash, _ = file_sha256(script)
    if script_hash != require_sha256(raw["scriptSha256"], "lift.scriptSha256"):
        raise BridgeError("lift script SHA-256 mismatch")
    result: dict[str, object] = {
        "script": script,
        "basis": basis,
        "certificate": certificate,
        "scriptSha256": script_hash,
    }
    for key in ("numeratorBound", "denominatorBound"):
        if key in raw:
            result[key] = require_int(raw[key], f"lift.{key}", 1)
    if mode == "consume-existing":
        basis_hash, _ = file_sha256(basis, bounds.max_integral_basis_bytes)
        certificate_hash, _ = file_sha256(
            certificate, bounds.max_lift_certificate_bytes
        )
        if basis_hash != require_sha256(
            raw["expectedIntegralBasisSha256"], "lift.expectedIntegralBasisSha256"
        ):
            raise BridgeError("integral basis SHA-256 differs from the request")
        if certificate_hash != require_sha256(
            raw["expectedCertificateSha256"], "lift.expectedCertificateSha256"
        ):
            raise BridgeError("lift certificate SHA-256 differs from the request")
    return result


def execute_workers(
    runs: Sequence[ModularRunSpec],
    bounds: Bounds,
    matrix_path: Path,
    tool: Mapping[str, object],
) -> None:
    for index, run in enumerate(runs):
        output = run.transcript_path
        if output.exists():
            raise BridgeError(f"refusing to overwrite modular transcript {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            str(tool["executable"]),
            str(matrix_path),
            str(run.prime),
            str(output),
        ]
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=bounds.worker_timeout_seconds,
            check=False,
        )
        if completed.returncode != 0:
            raise BridgeError(
                f"LinBox worker {index} exited {completed.returncode}: {completed.stderr[-2000:]}"
            )


def preflight_worker_outputs(
    runs: Sequence[ModularRunSpec], lift_record: Mapping[str, object]
) -> None:
    basis_path = lift_record["basis"]
    certificate_path = lift_record["certificate"]
    assert isinstance(basis_path, Path) and isinstance(certificate_path, Path)
    outputs = [run.transcript_path for run in runs] + [
        basis_path,
        certificate_path,
    ]
    resolved = [path.resolve() for path in outputs]
    if len(set(resolved)) != len(resolved):
        raise BridgeError("worker output paths must be pairwise distinct")
    existing = [path for path in outputs if path.exists()]
    if existing:
        raise BridgeError(f"refusing to overwrite worker output {existing[0]}")


def execute_lift(
    lift_record: Mapping[str, object],
    matrix_path: Path,
    matrix_digest: str,
    transcripts: Sequence[TranscriptSummary],
    bindings: Mapping[str, str],
    timeout_seconds: int,
) -> None:
    basis_path = lift_record["basis"]
    certificate_path = lift_record["certificate"]
    assert isinstance(basis_path, Path) and isinstance(certificate_path, Path)
    if basis_path.exists() or certificate_path.exists():
        raise BridgeError("refusing to overwrite an integral basis or lift certificate")
    basis_path.parent.mkdir(parents=True, exist_ok=True)
    certificate_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(lift_record["script"]),
        "lift",
        "--matrix",
        str(matrix_path),
    ]
    for transcript in transcripts:
        command += ["--basis", str(transcript.path)]
    command += [
        "--output",
        str(basis_path),
        "--certificate",
        str(certificate_path),
        "--preparation-digest",
        bindings["preparation"],
        "--core-matrix-digest",
        matrix_digest,
        "--ledger-digest",
        bindings["linbox-export"],
    ]
    if "numeratorBound" in lift_record:
        command += ["--numerator-bound", str(lift_record["numeratorBound"])]
    if "denominatorBound" in lift_record:
        command += ["--denominator-bound", str(lift_record["denominatorBound"])]
    completed = subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    if completed.returncode != 0:
        raise BridgeError(
            f"modular-kernel lift exited {completed.returncode}: {completed.stderr[-2000:]}"
        )


def replay_lift(
    record: Mapping[str, object],
    matrix_path: Path,
    matrix: MatrixSummary,
    transcripts: Sequence[TranscriptSummary],
    bindings: Mapping[str, str],
    bounds: Bounds,
    request_path: Path,
) -> tuple[dict[str, object], list[list[int]]]:
    basis_path = record["basis"]
    certificate_path = record["certificate"]
    assert isinstance(basis_path, Path) and isinstance(certificate_path, Path)
    basis_hash, basis_bytes = file_sha256(basis_path, bounds.max_integral_basis_bytes)
    certificate_hash, certificate_bytes = file_sha256(
        certificate_path, bounds.max_lift_certificate_bytes
    )
    certificate = load_bounded_json(
        certificate_path,
        bounds.max_lift_certificate_bytes,
        "lift certificate",
        bounds.max_coefficient_digits,
    )
    if (
        certificate.get("schema") != lift.SCHEMA
        or certificate.get("status")
        != "verified-saturated-frame-in-reconstructed-rational-subspace"
    ):
        raise BridgeError("lift certificate did not produce a verified saturated frame")
    matrix_record = require_mapping(
        certificate.get("matrix"), "lift certificate.matrix"
    )
    if (
        matrix_record.get("sha256") != matrix.byte_sha256
        or matrix_record.get("rows") != matrix.rows
        or matrix_record.get("columns") != matrix.columns
    ):
        raise BridgeError("lift certificate matrix binding differs from the request")
    source = require_mapping(
        certificate.get("sourceBinding"), "lift certificate.sourceBinding"
    )
    if source != {
        "preparationDigest": bindings["preparation"],
        "coreMatrixDigest": matrix.generic_sparse_matrix_digest,
        "ledgerDigest": bindings["linbox-export"],
    }:
        raise BridgeError(
            "lift certificate source binding differs from the preparation"
        )
    modular_inputs = certificate.get("modularInputs")
    if not isinstance(modular_inputs, list) or len(modular_inputs) != len(transcripts):
        raise BridgeError("lift certificate modular-input count differs")
    for index, (item, transcript) in enumerate(zip(modular_inputs, transcripts)):
        entry = require_mapping(item, f"lift certificate.modularInputs[{index}]")
        if (
            entry.get("sha256") != transcript.sha256
            or entry.get("prime") != transcript.prime
            or entry.get("rank") != transcript.reported_rank
            or entry.get("nullity") != transcript.nullity
            or require_mapping(
                entry.get("modularKernelReplay"),
                f"lift certificate.modularInputs[{index}].modularKernelReplay",
            ).get("passed")
            is not True
        ):
            raise BridgeError("lift certificate modular input does not replay")
    frame = require_mapping(
        certificate.get("integralKernelFrame"), "lift certificate.integralKernelFrame"
    )
    if frame.get("sha256") != basis_hash:
        raise BridgeError("lift certificate integral-basis SHA-256 mismatch")
    vectors = read_integral_basis_bounded(basis_path, matrix.columns, bounds)
    if any(len(vector) != matrix.columns for vector in vectors):
        raise BridgeError("integral frame ambient dimension differs from the matrix")
    header = lift.SparseMatrixHeader(matrix.rows, matrix.columns)
    exact_replay = lift.verify_integer_kernel(matrix_path, header, vectors)
    if exact_replay.get("passed") is not True:
        raise BridgeError("integral frame fails exact matrix replay")
    normalization = require_mapping(
        certificate.get("normalization"), "lift certificate.normalization"
    )
    pivot_rows = require_index_list(
        normalization.get("pivotRows"), matrix.columns, "lift normalization.pivotRows"
    )
    if len(pivot_rows) != len(vectors):
        raise BridgeError("lift graph chart has the wrong dimension")
    parameter_basis = bounded_square_integer_matrix(
        frame.get("rationalGraphChartParameterBasis"),
        len(vectors),
        bounds,
        "lift certificate.rationalGraphChartParameterBasis",
    )
    rational = lift.recover_rational_graph_basis(vectors, parameter_basis)
    rational_replay = lift.verify_rational_kernel(matrix_path, header, rational)
    if rational_replay.get("passed") is not True:
        raise BridgeError("recovered rational graph frame fails exact replay")
    saturated, replay_parameter, saturation = lift.saturate_rational_graph_basis(
        rational, pivot_rows
    )
    if saturated != vectors or replay_parameter != parameter_basis:
        raise BridgeError("integral-frame saturation does not replay")
    return (
        {
            "scriptSha256": record["scriptSha256"],
            "certificatePath": display_path(certificate_path, request_path),
            "certificateSha256": certificate_hash,
            "certificateBytes": certificate_bytes,
            "integralBasisPath": display_path(basis_path, request_path),
            "integralBasisSha256": basis_hash,
            "integralBasisBytes": basis_bytes,
            "frameDimension": len(vectors),
            "exactIntegerKernelReplay": exact_replay,
            "exactRationalGraphReplay": rational_replay,
            "saturationReplay": saturation,
        },
        vectors,
    )


class FieldCounter:
    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.operations = 0

    def touch(self, count: int = 1) -> None:
        self.operations += count
        if self.operations > self.maximum:
            raise BridgeError(
                f"rank-certificate replay exceeded {self.maximum} field operations"
            )


def modular_inverse(value: int, prime: int) -> int:
    try:
        return pow(value % prime, -1, prime)
    except ValueError as error:
        raise BridgeError("rank certificate contains a noninvertible pivot") from error


def determinant_mod(
    rows: list[dict[int, int]], prime: int, bounds: Bounds, counter: FieldCounter
) -> int:
    # The selected minor is not reused after this call, so eliminate it in
    # place instead of retaining a second potentially fill-heavy copy.
    work = rows
    working = sum(len(row) for row in work)
    if working > bounds.max_minor_working_nonzeros:
        raise BridgeError("rank-certificate minor exceeds its working-nonzero bound")
    determinant = 1
    sign = 1
    for column in range(len(work)):
        pivot = next(
            (
                row
                for row in range(column, len(work))
                if work[row].get(column, 0) % prime
            ),
            None,
        )
        if pivot is None:
            return 0
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            sign = -sign
        pivot_value = work[column][column] % prime
        determinant = determinant * pivot_value % prime
        inverse = modular_inverse(pivot_value, prime)
        for row in range(column + 1, len(work)):
            factor = work[row].get(column, 0) % prime
            if factor == 0:
                continue
            multiplier = factor * inverse % prime
            for target_column, pivot_entry in list(work[column].items()):
                if target_column < column:
                    continue
                counter.touch()
                old = work[row].get(target_column, 0)
                updated = (old - multiplier * pivot_entry) % prime
                existed = target_column in work[row]
                if updated:
                    work[row][target_column] = updated
                    if not existed:
                        working += 1
                        if working > bounds.max_minor_working_nonzeros:
                            raise BridgeError(
                                "rank-certificate minor fill exceeded its bound"
                            )
                elif existed:
                    del work[row][target_column]
                    working -= 1
    return sign * determinant % prime


def require_index_list(value: object, upper: int, path: str) -> list[int]:
    if not isinstance(value, list):
        raise BridgeError(f"{path} must be an array")
    result: list[int] = []
    previous = -1
    for index, item in enumerate(value):
        parsed = require_int(item, f"{path}[{index}]")
        if parsed <= previous or parsed >= upper:
            raise BridgeError(f"{path} must be strictly increasing and in range")
        previous = parsed
        result.append(parsed)
    return result


def increasing_lists_partition_range(
    left: Sequence[int], right: Sequence[int], upper: int
) -> bool:
    """Check a sorted partition without allocating a second O(upper) array."""

    left_index = 0
    right_index = 0
    for expected in range(upper):
        left_value = left[left_index] if left_index < len(left) else None
        right_value = right[right_index] if right_index < len(right) else None
        if left_value == expected and right_value != expected:
            left_index += 1
        elif right_value == expected and left_value != expected:
            right_index += 1
        else:
            return False
    return left_index == len(left) and right_index == len(right)


def rank_source_bindings(bindings: Mapping[str, str]) -> list[dict[str, str]]:
    return [
        {"id": "action-rows", "sha256": bindings["action"]},
        {
            "id": "generic-sparse-matrix",
            "sha256": bindings["generic-sparse-matrix"],
        },
        {"id": "oracle-structure", "sha256": bindings["oracle"]},
        {"id": "preparation", "sha256": bindings["preparation"]},
        {"id": "prepared-boundary", "sha256": bindings["boundary"]},
        {
            "id": "torsion-free-certificate",
            "sha256": bindings["torsion-free-certificate"],
        },
    ]


def parse_rank_evidence(
    path: Path,
    bounds: Bounds,
    matrix: MatrixSummary,
) -> RankEvidence:
    """Parse the canonical, bounded stream emitted by the rank worker."""

    byte_count = 0
    digest_builder = hashlib.sha256()

    def read_line(stream: Any, label: str) -> str:
        nonlocal byte_count
        remaining = bounds.max_rank_certificate_bytes - byte_count
        if remaining <= 0:
            raise BridgeError(
                f"{path}: exceeds the {bounds.max_rank_certificate_bytes}-byte bound"
            )
        raw = stream.readline(remaining + 1)
        if len(raw) > remaining:
            raise BridgeError(
                f"{path}: exceeds the {bounds.max_rank_certificate_bytes}-byte bound"
            )
        if not raw:
            raise BridgeError(f"{path}: rank evidence ended before {label}")
        byte_count += len(raw)
        digest_builder.update(raw)
        if not raw.endswith(b"\n") or b"\r" in raw:
            raise BridgeError(
                f"{path}: rank evidence must use canonical LF line endings"
            )
        try:
            return raw[:-1].decode("ascii")
        except UnicodeDecodeError as error:
            raise BridgeError(f"{path}: rank evidence is not ASCII") from error

    def words(line: str, label: str) -> list[str]:
        tokens = line.split(" ")
        if not tokens or any(token == "" for token in tokens):
            raise BridgeError(f"{path}: {label} is not canonically spaced")
        return tokens

    def index_line(line: str, label: str, expected_count: int, upper: int) -> list[int]:
        tokens = words(line, label)
        if len(tokens) < 2 or tokens[0] != label:
            raise BridgeError(f"{path}: expected a {label} line")
        count = parse_canonical_integer(tokens[1], f"rankEvidence.{label}.count", 16)
        if count != expected_count or len(tokens) != 2 + count:
            raise BridgeError(f"{path}: {label} has the wrong number of indices")
        values = [
            parse_canonical_integer(token, f"rankEvidence.{label}[{index}]", 16)
            for index, token in enumerate(tokens[2:])
        ]
        if any(value < 0 or value >= upper for value in values) or any(
            left >= right for left, right in zip(values, values[1:])
        ):
            raise BridgeError(
                f"{path}: {label} indices must be strictly increasing and in range"
            )
        return values

    with path.open("rb") as stream:
        header = words(read_line(stream, "the header"), "rank-evidence header")
        if len(header) != 7 or header[0] != "GENERIC_SPARSE_H1_RANK_EVIDENCE_V1":
            raise BridgeError(f"{path}: rank-evidence header is not recognized")
        rows = parse_canonical_integer(header[1], "rankEvidence.rows", 16)
        columns = parse_canonical_integer(header[2], "rankEvidence.columns", 16)
        prime = parse_canonical_integer(header[3], "rankEvidence.prime", 16)
        rank = parse_canonical_integer(header[4], "rankEvidence.rank", 16)
        nullity = parse_canonical_integer(header[5], "rankEvidence.nullity", 16)
        determinant = parse_canonical_integer(
            header[6], "rankEvidence.determinantResidue", 16
        )
        if rows < 0 or columns < 0 or rank < 0 or nullity < 0:
            raise BridgeError(f"{path}: rank evidence contains a negative dimension")
        if rows > bounds.max_rows or columns > bounds.max_columns:
            raise BridgeError(f"{path}: rank-evidence dimensions exceed request bounds")
        if (rows, columns) != (matrix.rows, matrix.columns):
            raise BridgeError(
                f"{path}: rank-evidence dimensions differ from the matrix"
            )
        if not is_prime(prime):
            raise BridgeError(f"{path}: rank-evidence modulus is not a supported prime")
        if rank > min(rows, columns) or rank + nullity != columns:
            raise BridgeError(f"{path}: rank-evidence rank/nullity is impossible")
        if nullity > bounds.max_nullity:
            raise BridgeError(
                f"{path}: rank-evidence nullity exceeds its request bound"
            )
        if determinant <= 0 or determinant >= prime or (rank == 0 and determinant != 1):
            raise BridgeError(f"{path}: rank-evidence determinant is not canonical")

        pivot_rows = index_line(
            read_line(stream, "PIVOT_ROWS"), "PIVOT_ROWS", rank, rows
        )
        pivot_columns = index_line(
            read_line(stream, "PIVOT_COLUMNS"),
            "PIVOT_COLUMNS",
            rank,
            columns,
        )
        free_columns = index_line(
            read_line(stream, "FREE_COLUMNS"),
            "FREE_COLUMNS",
            nullity,
            columns,
        )
        if not increasing_lists_partition_range(pivot_columns, free_columns, columns):
            raise BridgeError(
                f"{path}: pivot and free columns do not partition the matrix columns"
            )

        free_set = set(free_columns)
        kernel_basis: list[dict[str, object]] = []
        kernel_nonzeros = 0
        for vector_index in range(nullity):
            tokens = words(
                read_line(stream, f"VECTOR {vector_index}"),
                f"VECTOR[{vector_index}]",
            )
            if len(tokens) < 3 or tokens[0] != "VECTOR":
                raise BridgeError(f"{path}: expected VECTOR line {vector_index}")
            chart_column = parse_canonical_integer(
                tokens[1], f"rankEvidence.vector[{vector_index}].chartColumn", 16
            )
            nonzeros = parse_canonical_integer(
                tokens[2], f"rankEvidence.vector[{vector_index}].nonzeros", 16
            )
            if nonzeros < 0 or len(tokens) != 3 + 2 * nonzeros:
                raise BridgeError(f"{path}: VECTOR {vector_index} is malformed")
            if chart_column != free_columns[vector_index]:
                raise BridgeError(f"{path}: VECTOR chart columns are not canonical")
            entries: list[list[int]] = []
            previous_column = -1
            chart_seen = False
            for entry_index in range(nonzeros):
                column = parse_canonical_integer(
                    tokens[3 + 2 * entry_index],
                    f"rankEvidence.vector[{vector_index}].entry[{entry_index}].column",
                    16,
                )
                residue = parse_canonical_integer(
                    tokens[4 + 2 * entry_index],
                    f"rankEvidence.vector[{vector_index}].entry[{entry_index}].residue",
                    16,
                )
                if (
                    column <= previous_column
                    or column >= columns
                    or residue <= 0
                    or residue >= prime
                ):
                    raise BridgeError(
                        f"{path}: VECTOR entries must be sorted, in range, and nonzero"
                    )
                if column in free_set:
                    if column != chart_column or residue != 1:
                        raise BridgeError(
                            f"{path}: VECTOR free-coordinate chart is not the identity"
                        )
                    chart_seen = True
                previous_column = column
                entries.append([column, residue])
            if not chart_seen:
                raise BridgeError(
                    f"{path}: VECTOR free-coordinate chart is not the identity"
                )
            kernel_nonzeros += nonzeros
            if kernel_nonzeros > bounds.max_kernel_nonzeros:
                raise BridgeError(
                    f"{path}: rank-evidence kernel exceeds its nonzero bound"
                )
            kernel_basis.append({"chartColumn": chart_column, "entries": entries})

        if stream.read(1):
            raise BridgeError(f"{path}: rank evidence has trailing data")

    digest = digest_builder.hexdigest()

    return RankEvidence(
        rows=rows,
        columns=columns,
        prime=prime,
        rank=rank,
        nullity=nullity,
        determinant_residue=determinant,
        pivot_rows=pivot_rows,
        pivot_columns=pivot_columns,
        free_columns=free_columns,
        kernel_basis=kernel_basis,
        kernel_nonzeros=kernel_nonzeros,
        sha256=digest,
        byte_count=byte_count,
    )


def rank_certificate_from_evidence(
    evidence: RankEvidence,
    matrix: MatrixSummary,
    bindings: Mapping[str, str],
) -> dict[str, object]:
    """Wrap worker evidence in the certificate schema shared with TypeScript."""

    source_bindings = rank_source_bindings(bindings)
    binding_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "caller-sources-plus-canonical-sparse-matrix",
            "sourceBindings": source_bindings,
            "matrixDigest": matrix.generic_sparse_matrix_digest,
        }
    )
    worker_request_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "kind": "generic-sparse-modular-rank-worker-request",
            "algorithmVersion": RANK_ALGORITHM,
            "modulusPrime": evidence.prime,
            "sourceBindings": source_bindings,
            "matrix": {
                "schemaVersion": 1,
                "rowCount": matrix.rows,
                "columnCount": matrix.columns,
            },
            "matrixDigest": matrix.generic_sparse_matrix_digest,
            "bindingDigest": binding_digest,
        }
    )
    lower_bound = {
        "pivotRows": evidence.pivot_rows,
        "pivotColumns": evidence.pivot_columns,
        "minorDeterminantResidue": evidence.determinant_residue,
        "minorDigest": canonical_sha256(
            {
                "schemaVersion": 1,
                "method": "selected-original-row-column-minor",
                "matrixDigest": matrix.generic_sparse_matrix_digest,
                "prime": evidence.prime,
                "pivotRows": evidence.pivot_rows,
                "pivotColumns": evidence.pivot_columns,
                "determinantResidue": evidence.determinant_residue,
            }
        ),
    }
    upper_bound = {
        "freeColumns": evidence.free_columns,
        "kernelBasis": evidence.kernel_basis,
        "kernelBasisDigest": canonical_sha256(
            {
                "schemaVersion": 1,
                "method": "right-kernel-free-column-identity-chart",
                "matrixDigest": matrix.generic_sparse_matrix_digest,
                "prime": evidence.prime,
                "freeColumns": evidence.free_columns,
                "kernelBasis": evidence.kernel_basis,
            }
        ),
    }
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "kind": RANK_KIND,
        "status": "passed",
        "method": "nonzero-pivot-minor-plus-right-kernel-identity-chart",
        "algorithmVersion": RANK_ALGORITHM,
        "source": {
            "sourceBindings": source_bindings,
            "matrixDigest": matrix.generic_sparse_matrix_digest,
            "bindingDigest": binding_digest,
            "workerRequestDigest": worker_request_digest,
        },
        "matrix": {
            "rowCount": matrix.rows,
            "columnCount": matrix.columns,
            "nonzeroCount": matrix.nonzero_count,
            "maximumAbsoluteCoefficient": str(matrix.maximum_absolute_coefficient),
        },
        "modulusPrime": evidence.prime,
        "rank": evidence.rank,
        "nullity": evidence.nullity,
        "lowerBound": lower_bound,
        "upperBound": upper_bound,
        "backend": {
            "name": "generic sparse H1 bridge evidence replay",
            "version": "rank-evidence-v1",
            "algorithm": (
                "exact selected-minor and identity-chart-kernel verification"
            ),
            "exactFieldArithmetic": True,
        },
        # The external worker does not expose operation counters. These fields
        # are diagnostics only; replay recomputes and bounds all proof checks.
        "execution": {
            "fieldOperations": 0,
            "pivotRowScans": 0,
            "maximumWorkingNonzeros": 0,
            "kernelNonzeroCount": evidence.kernel_nonzeros,
        },
    }
    return {**payload, "certificateDigest": canonical_sha256(payload)}


def integral_kernel_witness(
    preparation_digest: str,
    matrix_digest: str,
    rank_certificate_digest: str,
    vectors: Sequence[Sequence[int]],
) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "kind": "scalable-generic-action-integral-kernel-witness",
        "method": "primitive-integral-kernel-basis-with-optional-left-inverse",
        "source": {
            "preparationDigest": preparation_digest,
            "boundaryMatrixDigest": matrix_digest,
            "modularRankCertificateDigest": rank_certificate_digest,
        },
        "basis": [
            {
                "id": f"integral-kernel-{index}",
                "entries": [
                    [column, str(coefficient)]
                    for column, coefficient in enumerate(vector)
                    if coefficient
                ],
            }
            for index, vector in enumerate(vectors)
        ],
    }
    return {**payload, "witnessDigest": canonical_sha256(payload)}


def replay_rank_certificate(
    path: Path,
    expected_sha256: str,
    matrix_path: Path,
    matrix: MatrixSummary,
    bindings: Mapping[str, str],
    bounds: Bounds,
    request_path: Path,
) -> dict[str, object]:
    actual_hash, byte_count = file_sha256(path, bounds.max_rank_certificate_bytes)
    if actual_hash != expected_sha256:
        raise BridgeError("rank-certificate file SHA-256 mismatch")
    certificate = load_bounded_json(
        path, bounds.max_rank_certificate_bytes, "rank certificate"
    )
    if (
        certificate.get("schemaVersion") != 1
        or certificate.get("kind") != RANK_KIND
        or certificate.get("status") != "passed"
        or certificate.get("method")
        != "nonzero-pivot-minor-plus-right-kernel-identity-chart"
        or certificate.get("algorithmVersion") != RANK_ALGORITHM
    ):
        raise BridgeError("rank-certificate envelope is not recognized")
    stored_digest = require_sha256(
        certificate.get("certificateDigest"), "rankCertificate.certificateDigest"
    )
    payload = dict(certificate)
    payload.pop("certificateDigest")
    if canonical_sha256(payload) != stored_digest:
        raise BridgeError("rank-certificate digest is stale")
    prime = require_int(
        certificate.get("modulusPrime"), "rankCertificate.modulusPrime", 2
    )
    if not is_prime(prime):
        raise BridgeError("rank-certificate modulus is not prime")
    rank = require_int(certificate.get("rank"), "rankCertificate.rank")
    nullity = require_int(certificate.get("nullity"), "rankCertificate.nullity")
    if rank + nullity != matrix.columns or rank > min(matrix.rows, matrix.columns):
        raise BridgeError("rank-certificate dimensions are impossible")
    matrix_record = require_mapping(certificate.get("matrix"), "rankCertificate.matrix")
    if matrix_record != {
        "rowCount": matrix.rows,
        "columnCount": matrix.columns,
        "nonzeroCount": matrix.nonzero_count,
        "maximumAbsoluteCoefficient": str(matrix.maximum_absolute_coefficient),
    }:
        raise BridgeError("rank-certificate matrix statistics differ")
    source = require_mapping(certificate.get("source"), "rankCertificate.source")
    expected_bindings = rank_source_bindings(bindings)
    if source.get("sourceBindings") != expected_bindings:
        raise BridgeError("rank-certificate caller source bindings differ")
    if source.get("matrixDigest") != matrix.generic_sparse_matrix_digest:
        raise BridgeError("rank-certificate sparse-matrix digest differs")
    binding_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "caller-sources-plus-canonical-sparse-matrix",
            "sourceBindings": expected_bindings,
            "matrixDigest": matrix.generic_sparse_matrix_digest,
        }
    )
    if source.get("bindingDigest") != binding_digest:
        raise BridgeError("rank-certificate binding digest differs")
    request_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "kind": "generic-sparse-modular-rank-worker-request",
            "algorithmVersion": RANK_ALGORITHM,
            "modulusPrime": prime,
            "sourceBindings": expected_bindings,
            "matrix": {
                "schemaVersion": 1,
                "rowCount": matrix.rows,
                "columnCount": matrix.columns,
            },
            "matrixDigest": matrix.generic_sparse_matrix_digest,
            "bindingDigest": binding_digest,
        }
    )
    if source.get("workerRequestDigest") != request_digest:
        raise BridgeError("rank-certificate worker-request digest differs")

    lower = require_mapping(certificate.get("lowerBound"), "rankCertificate.lowerBound")
    upper = require_mapping(certificate.get("upperBound"), "rankCertificate.upperBound")
    pivot_rows = require_index_list(
        lower.get("pivotRows"), matrix.rows, "rankCertificate.pivotRows"
    )
    pivot_columns = require_index_list(
        lower.get("pivotColumns"), matrix.columns, "rankCertificate.pivotColumns"
    )
    free_columns = require_index_list(
        upper.get("freeColumns"), matrix.columns, "rankCertificate.freeColumns"
    )
    if (
        len(pivot_rows) != rank
        or len(pivot_columns) != rank
        or len(free_columns) != nullity
    ):
        raise BridgeError("rank-certificate minor/chart sizes differ from rank/nullity")
    if not increasing_lists_partition_range(
        pivot_columns, free_columns, matrix.columns
    ):
        raise BridgeError(
            "rank-certificate pivot/free columns do not partition the matrix"
        )
    raw_basis = upper.get("kernelBasis")
    if not isinstance(raw_basis, list) or len(raw_basis) != nullity:
        raise BridgeError("rank-certificate kernel chart has the wrong dimension")
    basis: list[dict[int, int]] = []
    kernel_by_column: dict[int, list[tuple[int, int]]] = {}
    kernel_nonzeros = 0
    free_set = set(free_columns)
    for vector_index, raw_vector in enumerate(raw_basis):
        vector = require_mapping(
            raw_vector, f"rankCertificate.kernelBasis[{vector_index}]"
        )
        if set(vector) != {"chartColumn", "entries"}:
            raise BridgeError("rank-certificate kernel vector has unknown/missing keys")
        chart_column = require_int(
            vector["chartColumn"],
            f"rankCertificate.kernelBasis[{vector_index}].chartColumn",
        )
        if chart_column != free_columns[vector_index] or not isinstance(
            vector["entries"], list
        ):
            raise BridgeError("rank-certificate kernel chart order differs")
        values: dict[int, int] = {}
        previous = -1
        chart_seen = False
        for entry_index, entry in enumerate(vector["entries"]):
            if not isinstance(entry, list) or len(entry) != 2:
                raise BridgeError("rank-certificate kernel entry is not a pair")
            column = require_int(
                entry[0], f"rankCertificate.kernel[{vector_index}].column"
            )
            value = require_int(
                entry[1], f"rankCertificate.kernel[{vector_index}].residue", 1
            )
            if column <= previous or column >= matrix.columns or value >= prime:
                raise BridgeError("rank-certificate kernel entry is not canonical")
            previous = column
            values[column] = value
            if column in free_set:
                if column != chart_column or value != 1:
                    raise BridgeError(
                        "rank-certificate free-coordinate chart is not the identity"
                    )
                chart_seen = True
            kernel_by_column.setdefault(column, []).append((vector_index, value))
            kernel_nonzeros += 1
            if kernel_nonzeros > bounds.max_kernel_nonzeros:
                raise BridgeError("rank-certificate kernel exceeds its nonzero bound")
        if not chart_seen:
            raise BridgeError(
                "rank-certificate free-coordinate chart is not the identity"
            )
        basis.append(values)

    pivot_row_position = {row: position for position, row in enumerate(pivot_rows)}
    pivot_column_position = {
        column: position for position, column in enumerate(pivot_columns)
    }
    minor_rows = [dict() for _ in pivot_rows]
    counter = FieldCounter(bounds.max_field_operations)
    replay_nonzeros = 0
    replay_maximum = 0
    replay_chunk_rows: list[dict[str, object]] = []
    replay_chunk_digests: list[str] = []
    replay_chunk_first_row = 0

    def flush_replay_chunk() -> None:
        nonlocal replay_chunk_rows
        if not replay_chunk_rows:
            return
        replay_chunk_digests.append(
            canonical_sha256(
                {
                    "schemaVersion": 1,
                    "method": "canonical-explicit-sparse-integer-matrix-row-chunk",
                    "chunkIndex": len(replay_chunk_digests),
                    "firstRow": replay_chunk_first_row,
                    "rows": replay_chunk_rows,
                }
            )
        )
        replay_chunk_rows = []

    for row_index, entries in iter_linbox_rows(
        matrix_path, bounds, matrix.rows, matrix.columns
    ):
        if not replay_chunk_rows:
            replay_chunk_first_row = row_index
        replay_nonzeros += len(entries)
        if replay_nonzeros > bounds.max_nonzeros:
            raise BridgeError(
                "rank-certificate replay exceeds the matrix nonzero bound"
            )
        for _column, coefficient in entries:
            replay_maximum = max(replay_maximum, abs(coefficient))
        replay_chunk_rows.append(
            {
                "row": row_index,
                "entries": [
                    [column, str(coefficient)] for column, coefficient in entries
                ],
            }
        )
        if len(replay_chunk_rows) == MATRIX_CHUNK_ROWS:
            flush_replay_chunk()
        residuals: dict[int, int] = {}
        minor_position = pivot_row_position.get(row_index)
        for column, coefficient in entries:
            for vector_index, value in kernel_by_column.get(column, []):
                counter.touch()
                residuals[vector_index] = (
                    residuals.get(vector_index, 0) + coefficient * value
                ) % prime
            if minor_position is not None and column in pivot_column_position:
                value = coefficient % prime
                if value:
                    minor_rows[minor_position][pivot_column_position[column]] = value
        if any(residuals.values()):
            raise BridgeError(
                f"rank-certificate kernel fails on matrix row {row_index}"
            )
    flush_replay_chunk()
    replay_matrix_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "chunked-canonical-explicit-sparse-integer-matrix-v1",
            "rowCount": matrix.rows,
            "columnCount": matrix.columns,
            "nonzeroCount": replay_nonzeros,
            "maximumAbsoluteCoefficient": str(replay_maximum),
            "chunkRowCount": MATRIX_CHUNK_ROWS,
            "chunkDigests": replay_chunk_digests,
        }
    )
    if (
        replay_nonzeros != matrix.nonzero_count
        or replay_maximum != matrix.maximum_absolute_coefficient
        or replay_matrix_digest != matrix.generic_sparse_matrix_digest
    ):
        raise BridgeError("rank-certificate replay matrix changed after validation")
    determinant = determinant_mod(minor_rows, prime, bounds, counter)
    claimed_determinant = require_int(
        lower.get("minorDeterminantResidue"),
        "rankCertificate.lowerBound.minorDeterminantResidue",
    )
    if determinant == 0 or determinant != claimed_determinant or determinant >= prime:
        raise BridgeError("rank-certificate selected minor is singular or misreported")
    expected_minor_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "selected-original-row-column-minor",
            "matrixDigest": matrix.generic_sparse_matrix_digest,
            "prime": prime,
            "pivotRows": pivot_rows,
            "pivotColumns": pivot_columns,
            "determinantResidue": claimed_determinant,
        }
    )
    if lower.get("minorDigest") != expected_minor_digest:
        raise BridgeError("rank-certificate minor digest differs")
    expected_kernel_digest = canonical_sha256(
        {
            "schemaVersion": 1,
            "method": "right-kernel-free-column-identity-chart",
            "matrixDigest": matrix.generic_sparse_matrix_digest,
            "prime": prime,
            "freeColumns": free_columns,
            "kernelBasis": raw_basis,
        }
    )
    if upper.get("kernelBasisDigest") != expected_kernel_digest:
        raise BridgeError("rank-certificate kernel-basis digest differs")
    return {
        "certificatePath": display_path(path, request_path),
        "certificateSha256": actual_hash,
        "certificateBytes": byte_count,
        "certificateDigest": stored_digest,
        "prime": prime,
        "certifiedRank": rank,
        "certifiedNullity": nullity,
        "pivotMinorDeterminantResidue": claimed_determinant,
        "kernelNonzeroCount": kernel_nonzeros,
        "fieldOperations": counter.operations,
        "lowerBoundReplayed": True,
        "upperBoundReplayed": True,
    }


def validate_request_envelope(request: dict[str, Any]) -> None:
    require_keys(
        request,
        [
            "schemaVersion",
            "kind",
            "executionMode",
            "torsionFreeCertificateCanonicalSha256",
            "preparation",
            "matrix",
            "linboxWorker",
            "modularRuns",
            "lift",
            "bounds",
            "requestDigest",
        ],
        ["rankProof"],
        "request",
    )
    if (
        request["schemaVersion"] != REQUEST_SCHEMA_VERSION
        or request["kind"] != REQUEST_KIND
    ):
        raise BridgeError("request envelope is not recognized")
    if request["executionMode"] not in {"consume-existing", "execute-workers"}:
        raise BridgeError("executionMode must be consume-existing or execute-workers")
    supplied = require_sha256(request["requestDigest"], "request.requestDigest")
    payload = dict(request)
    payload.pop("requestDigest")
    if canonical_sha256(payload) != supplied:
        raise BridgeError("requestDigest is stale")


def build_response(
    request_path: Path,
    *,
    execute: bool,
    replay_response: Mapping[str, object] | None = None,
    replay_existing: bool = False,
    integral_witness_path: Path | None = None,
) -> dict[str, object]:
    if integral_witness_path is not None and integral_witness_path.exists():
        raise BridgeError(f"refusing to overwrite {integral_witness_path}")
    request = load_bounded_json(request_path, 16 * 1024 * 1024, "request")
    validate_request_envelope(request)
    mode = request["executionMode"]
    if (
        execute != (mode == "execute-workers")
        and replay_response is None
        and not replay_existing
    ):
        raise BridgeError(
            f"request executionMode is {mode}, incompatible with this command"
        )
    bounds = parse_bounds(request["bounds"])
    preparation_record = require_mapping(request["preparation"], "preparation")
    preparation, preparation_path, preparation_file_hash = validate_preparation(
        preparation_record, request_path, bounds
    )
    bindings = preparation_bindings(preparation)
    bindings["torsion-free-certificate"] = require_sha256(
        request["torsionFreeCertificateCanonicalSha256"],
        "request.torsionFreeCertificateCanonicalSha256",
    )
    matrix_record = require_mapping(request["matrix"], "matrix")
    matrix_path, matrix = validate_matrix_record(
        matrix_record, request_path, bounds, preparation
    )
    tool = validate_tool_record(
        require_mapping(request["linboxWorker"], "linboxWorker"), request_path, bounds
    )
    lift_raw = require_mapping(request["lift"], "lift")
    lift_record = validate_lift_record(lift_raw, request_path, bounds, mode)
    run_specs = prevalidate_modular_run_records(
        request["modularRuns"], request_path, bounds, mode
    )

    if execute:
        preflight_worker_outputs(run_specs, lift_record)
        execute_workers(run_specs, bounds, matrix_path, tool)
    runs = validate_modular_runs(
        request["modularRuns"],
        request_path,
        bounds,
        matrix,
        mode if not execute else "execute-workers",
    )
    transcripts = [summary for _raw, summary in runs]
    if execute:
        execute_lift(
            lift_record,
            matrix_path,
            matrix.generic_sparse_matrix_digest,
            transcripts,
            bindings,
            bounds.worker_timeout_seconds,
        )
    lift_replay, integral_vectors = replay_lift(
        lift_record,
        matrix_path,
        matrix,
        transcripts,
        bindings,
        bounds,
        request_path,
    )

    rank_record: dict[str, object]
    rank_proof_raw = request.get("rankProof")
    if rank_proof_raw is None:
        rank_record = {
            "provided": False,
            "replayed": False,
            "reason": (
                "LinBox reported ranks are not proof-carrying. Supply the generic "
                "pivot-minor plus identity-chart kernel certificate to certify rank."
            ),
        }
    else:
        rank_proof = require_mapping(rank_proof_raw, "rankProof")
        require_keys(
            rank_proof, ["certificatePath", "certificateSha256"], [], "rankProof"
        )
        rank_path = resolve_path(
            rank_proof["certificatePath"], request_path, "rankProof.certificatePath"
        )
        rank_record = {
            "provided": True,
            "replayed": True,
            **replay_rank_certificate(
                rank_path,
                require_sha256(
                    rank_proof["certificateSha256"], "rankProof.certificateSha256"
                ),
                matrix_path,
                matrix,
                bindings,
                bounds,
                request_path,
            ),
        }
        if rank_record["prime"] not in {summary.prime for summary in transcripts}:
            raise BridgeError("rank-certificate prime is absent from modularRuns")
        if rank_record["certifiedNullity"] != len(integral_vectors):
            raise BridgeError(
                "rank-certificate nullity differs from the integral frame"
            )

    full = rank_record.get("replayed") is True
    status = (
        "verified-full-integral-kernel" if full else "verified-saturated-frame-only"
    )
    modular_records = [
        {
            "prime": summary.prime,
            "transcriptPath": display_path(summary.path, request_path),
            "transcriptSha256": summary.sha256,
            "transcriptBytes": summary.byte_count,
            "columns": summary.columns,
            "reportedRank": summary.reported_rank,
            "reportedNullity": summary.nullity,
            "kernelNonzeroCount": summary.nonzero_count,
            "rankClaimedFromBackendReport": False,
        }
        for summary in transcripts
    ]
    response_without_digest: dict[str, object] = {
        "schemaVersion": RESPONSE_SCHEMA_VERSION,
        "kind": RESPONSE_KIND,
        "status": status,
        "requestDigest": request["requestDigest"],
        "source": {
            "preparationCertificatePath": display_path(preparation_path, request_path),
            "preparationCertificateSha256": preparation_file_hash,
            "bindings": bindings,
        },
        "matrix": {
            "path": display_path(matrix_path, request_path),
            "sha256": matrix.byte_sha256,
            "bytes": matrix.byte_count,
            "rows": matrix.rows,
            "columns": matrix.columns,
            "nonzeroCount": matrix.nonzero_count,
            "maximumAbsoluteCoefficient": str(matrix.maximum_absolute_coefficient),
            "genericSparseMatrixDigest": matrix.generic_sparse_matrix_digest,
        },
        "backend": {
            "executableSha256": tool["executableSha256"],
            "driverSourceSha256": tool["driverSourceSha256"],
            "name": tool["backend"],
            "version": tool["backendVersion"],
            "algorithm": tool["algorithm"],
        },
        "modularRuns": modular_records,
        "lift": lift_replay,
        "rankProof": rank_record,
        "claim": {
            "saturatedIntegralFrameInReconstructedRationalSubspace": True,
            "exactFiniteFieldRankCertified": full,
            "exactRationalRankCertified": full,
            "fullIntegralKernelCertified": full,
            **({"integralKernelRank": len(integral_vectors)} if full else {}),
        },
        "nonClaims": (
            []
            if full
            else [
                "The reported LinBox rank is not an exact-rank certificate.",
                "Without the proof-carrying rank certificate, equality with the full rational or integral kernel is not claimed.",
            ]
        ),
    }
    response = {
        **response_without_digest,
        "responseDigest": canonical_sha256(response_without_digest),
    }
    if replay_response is not None and response != replay_response:
        raise BridgeError(
            "response does not reproduce from the source-bound request and files"
        )
    if integral_witness_path is not None:
        if not full:
            raise BridgeError(
                "an adapter witness requires a replayed full-rank certificate"
            )
        write_new_json(
            integral_witness_path,
            integral_kernel_witness(
                bindings["preparation"],
                matrix.generic_sparse_matrix_digest,
                str(rank_record["certificateDigest"]),
                integral_vectors,
            ),
        )
    return response


def write_new_json(path: Path, value: object) -> None:
    if path.exists():
        raise BridgeError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def command_inspect(args: argparse.Namespace) -> int:
    bounds = Bounds(
        max_matrix_bytes=args.max_bytes,
        max_preparation_certificate_bytes=1,
        max_tool_bytes=1,
        max_rows=args.max_rows,
        max_columns=args.max_columns,
        max_nonzeros=args.max_nonzeros,
        max_coefficient_digits=args.max_coefficient_digits,
        max_prime_count=1,
        max_transcript_bytes=1,
        max_nullity=1,
        max_dense_lift_entries=1,
        max_integral_basis_bytes=1,
        max_lift_certificate_bytes=1,
        max_rank_certificate_bytes=1,
        max_kernel_nonzeros=1,
        max_minor_working_nonzeros=1,
        max_field_operations=1,
        worker_timeout_seconds=1,
    )
    summary = summarize_matrix(Path(args.matrix), bounds)
    print(json.dumps(summary.__dict__, sort_keys=True))
    return 0


def command_assemble(args: argparse.Namespace) -> int:
    request = Path(args.request)
    response = build_response(request, execute=False)
    write_new_json(Path(args.response), response)
    print(
        json.dumps(
            {"status": response["status"], "responseDigest": response["responseDigest"]}
        )
    )
    return 0


def command_execute(args: argparse.Namespace) -> int:
    request = Path(args.request)
    response = build_response(request, execute=True)
    write_new_json(Path(args.response), response)
    print(
        json.dumps(
            {"status": response["status"], "responseDigest": response["responseDigest"]}
        )
    )
    return 0


def command_replay(args: argparse.Namespace) -> int:
    request_path = Path(args.request)
    response_path = Path(args.response)
    stored = load_bounded_json(response_path, 32 * 1024 * 1024, "response")
    supplied_digest = require_sha256(
        stored.get("responseDigest"), "response.responseDigest"
    )
    payload = dict(stored)
    payload.pop("responseDigest")
    if canonical_sha256(payload) != supplied_digest:
        raise BridgeError("responseDigest is stale")
    build_response(request_path, execute=False, replay_response=stored)
    print(json.dumps({"status": "passed", "responseDigest": supplied_digest}))
    return 0


def command_emit_witness(args: argparse.Namespace) -> int:
    request_path = Path(args.request)
    output_path = Path(args.output)
    response = build_response(
        request_path,
        execute=False,
        replay_existing=True,
        integral_witness_path=output_path,
    )
    print(
        json.dumps(
            {
                "status": response["status"],
                "integralKernelWitness": str(output_path),
            }
        )
    )
    return 0


def command_emit_rank_certificate(args: argparse.Namespace) -> int:
    request_path = Path(args.request)
    evidence_path = Path(args.evidence)
    output_path = Path(args.output)
    if os.path.lexists(output_path):
        raise BridgeError(f"refusing to overwrite {output_path}")

    request = load_bounded_json(request_path, 16 * 1024 * 1024, "request")
    validate_request_envelope(request)
    bounds = parse_bounds(request["bounds"])
    preparation, _preparation_path, _preparation_hash = validate_preparation(
        require_mapping(request["preparation"], "preparation"), request_path, bounds
    )
    bindings = preparation_bindings(preparation)
    bindings["torsion-free-certificate"] = require_sha256(
        request["torsionFreeCertificateCanonicalSha256"],
        "request.torsionFreeCertificateCanonicalSha256",
    )
    matrix_path, matrix = validate_matrix_record(
        require_mapping(request["matrix"], "matrix"),
        request_path,
        bounds,
        preparation,
    )
    run_specs = prevalidate_modular_run_records(
        request["modularRuns"], request_path, bounds, str(request["executionMode"])
    )
    evidence = parse_rank_evidence(evidence_path, bounds, matrix)
    matching_run = next((run for run in run_specs if run.prime == evidence.prime), None)
    if matching_run is None:
        raise BridgeError("rank-evidence prime is absent from modularRuns")
    transcript = parse_transcript(
        matching_run.transcript_path, matching_run.prime, bounds
    )
    if (
        transcript.columns != matrix.columns
        or transcript.reported_rank != evidence.rank
        or transcript.nullity != evidence.nullity
    ):
        raise BridgeError("rank evidence disagrees with its modular transcript")
    if (
        matching_run.expected_sha256 is not None
        and transcript.sha256 != matching_run.expected_sha256
    ):
        raise BridgeError("rank-evidence modular transcript SHA-256 differs")
    certificate = rank_certificate_from_evidence(evidence, matrix, bindings)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(certificate, indent=2, sort_keys=True) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        certificate_sha256, _byte_count = file_sha256(
            temporary_path, bounds.max_rank_certificate_bytes
        )
        replay_rank_certificate(
            temporary_path,
            certificate_sha256,
            matrix_path,
            matrix,
            bindings,
            bounds,
            request_path,
        )
        try:
            # A hard link publishes the already-verified bytes atomically and
            # fails if another process created the destination meanwhile.
            os.link(temporary_path, output_path)
        except FileExistsError as error:
            raise BridgeError(f"refusing to overwrite {output_path}") from error
    finally:
        temporary_path.unlink(missing_ok=True)

    print(
        json.dumps(
            {
                "status": "passed",
                "rank": evidence.rank,
                "nullity": evidence.nullity,
                "prime": evidence.prime,
                "evidenceSha256": evidence.sha256,
                "certificateSha256": certificate_sha256,
                "certificateDigest": certificate["certificateDigest"],
                "certificatePath": str(output_path),
            },
            sort_keys=True,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect-matrix")
    inspect.add_argument("matrix")
    inspect.add_argument("--max-bytes", type=int, default=4 * 1024 * 1024 * 1024)
    inspect.add_argument("--max-rows", type=int, default=10_000_000)
    inspect.add_argument("--max-columns", type=int, default=10_000_000)
    inspect.add_argument("--max-nonzeros", type=int, default=100_000_000)
    inspect.add_argument("--max-coefficient-digits", type=int, default=1_024)
    inspect.set_defaults(run=command_inspect)
    for name, function in (
        ("assemble", command_assemble),
        ("execute", command_execute),
    ):
        command = commands.add_parser(name)
        command.add_argument("request")
        command.add_argument("response")
        command.set_defaults(run=function)
    replay = commands.add_parser("replay")
    replay.add_argument("request")
    replay.add_argument("response")
    replay.set_defaults(run=command_replay)
    witness = commands.add_parser("emit-witness")
    witness.add_argument("request")
    witness.add_argument("output")
    witness.set_defaults(run=command_emit_witness)
    rank_certificate = commands.add_parser("emit-rank-certificate")
    rank_certificate.add_argument("request")
    rank_certificate.add_argument("evidence")
    rank_certificate.add_argument("output")
    rank_certificate.set_defaults(run=command_emit_rank_certificate)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.run(args)
    except (BridgeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "failed", "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
