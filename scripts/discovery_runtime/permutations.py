"""Compact, resumable storage for exact permutation action rows.

An action of degree 23,040 should not become a nested Python-list JSON value
until a candidate has passed.  This spool stores each generator row in the
smallest unsigned integer width that fits the degree.  Only committed complete
rows survive a restart.
"""

from __future__ import annotations

import os
import struct
import sys
from array import array
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Literal, Sequence

from .hashing import atomic_write_json, sha256_file


SpoolMode = Literal["w", "a", "r"]
_MAGIC = b"CVPERM1\0"
_SCHEMA_VERSION = 1
_HEADER = struct.Struct("<8sBBHQQ")
_VALIDATE_PERMUTATIONS = 1


class PermutationSpoolError(RuntimeError):
    """Raised when a packed action file is incomplete or inconsistent."""


@dataclass(frozen=True)
class PermutationSpoolSummary:
    path: str
    degree: int
    element_width_bytes: int
    row_count: int
    file_bytes: int
    sha256: str
    rows_validated_as_permutations: bool


def _width_for_degree(degree: int) -> int:
    if not 1 <= degree <= 0x1_0000_0000:
        raise ValueError("degree must lie between 1 and 2^32")
    if degree <= 0x100:
        return 1
    if degree <= 0x1_0000:
        return 2
    return 4


def _array_code(width: int) -> str:
    return {1: "B", 2: "H", 4: "I"}[width]


class PackedPermutationSpool:
    """Append exact permutation rows and commit them in durable batches."""

    def __init__(
        self,
        path: Path | str,
        *,
        degree: int | None = None,
        mode: SpoolMode = "a",
        validate_permutations: bool = True,
    ) -> None:
        if mode not in ("w", "a", "r"):
            raise ValueError(f"Unknown spool mode: {mode}")
        self.path = Path(path)
        self.mode = mode
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._stream = None
        self._closed = False
        self._validate = validate_permutations
        self._committed_rows = 0
        self._written_rows = 0

        if mode == "w":
            if degree is None:
                raise ValueError("degree is required when creating a spool")
            self.degree = degree
            self.width = _width_for_degree(degree)
            self._stream = self.path.open("w+b")
            self._write_header(0)
        else:
            if not self.path.exists():
                if mode == "a" and degree is not None:
                    self.degree = degree
                    self.width = _width_for_degree(degree)
                    self._stream = self.path.open("w+b")
                    self._write_header(0)
                    return
                raise FileNotFoundError(self.path)
            self._stream = self.path.open("rb" if mode == "r" else "r+b")
            stored_degree, stored_width, flags, rows = self._read_header()
            if degree is not None and degree != stored_degree:
                raise PermutationSpoolError(
                    f"Expected degree {degree}, found {stored_degree}"
                )
            self.degree = stored_degree
            self.width = stored_width
            self._validate = bool(flags & _VALIDATE_PERMUTATIONS)
            self._committed_rows = rows
            self._written_rows = rows
            expected_bytes = _HEADER.size + rows * self.row_bytes
            actual_bytes = self.path.stat().st_size
            if actual_bytes < expected_bytes:
                raise PermutationSpoolError(
                    "Packed permutation file is shorter than its committed row count"
                )
            if actual_bytes > expected_bytes:
                if mode == "r":
                    raise PermutationSpoolError(
                        "Packed permutation file has an uncommitted tail"
                    )
                # A crash after row data but before the header commit loses only that batch.
                self._stream.truncate(expected_bytes)
                self._stream.flush()
                os.fsync(self._stream.fileno())

    @property
    def row_bytes(self) -> int:
        return self.degree * self.width

    @property
    def row_count(self) -> int:
        return self._written_rows

    @property
    def committed_row_count(self) -> int:
        return self._committed_rows

    def append_row(self, values: Sequence[int]) -> int:
        self._ensure_writable()
        if len(values) != self.degree:
            raise ValueError(
                f"Permutation row has length {len(values)}, expected {self.degree}"
            )
        if self._validate:
            seen = bytearray(self.degree)
            for value in values:
                if isinstance(value, bool) or not isinstance(value, int):
                    raise TypeError("Permutation entries must be integers")
                if not 0 <= value < self.degree:
                    raise ValueError(f"Permutation entry {value} is outside the degree")
                if seen[value]:
                    raise ValueError(f"Permutation row repeats image {value}")
                seen[value] = 1
        else:
            for value in values:
                if isinstance(value, bool) or not isinstance(value, int):
                    raise TypeError("Permutation entries must be integers")
                if not 0 <= value < self.degree:
                    raise ValueError(f"Permutation entry {value} is outside the degree")

        packed = array(_array_code(self.width), values)
        if sys.byteorder != "little" and self.width > 1:
            packed.byteswap()
        self._stream.seek(_HEADER.size + self._written_rows * self.row_bytes)
        self._stream.write(packed.tobytes())
        row_index = self._written_rows
        self._written_rows += 1
        return row_index

    def append_rows(self, rows: Iterable[Sequence[int]], *, commit: bool = True) -> int:
        count = 0
        for row in rows:
            self.append_row(row)
            count += 1
        if commit:
            self.commit()
        return count

    def commit(self) -> None:
        """Make all complete rows resumable before updating the row-count header."""

        self._ensure_writable()
        self._stream.flush()
        os.fsync(self._stream.fileno())
        self._write_header(self._written_rows)
        self._committed_rows = self._written_rows
        self._stream.seek(0, os.SEEK_END)

    def read_row(self, index: int) -> tuple[int, ...]:
        self._ensure_open()
        if not 0 <= index < self._committed_rows:
            raise IndexError(index)
        self._stream.flush()
        self._stream.seek(_HEADER.size + index * self.row_bytes)
        raw = self._stream.read(self.row_bytes)
        if len(raw) != self.row_bytes:
            raise PermutationSpoolError(f"Packed row {index} is truncated")
        values = array(_array_code(self.width))
        values.frombytes(raw)
        if sys.byteorder != "little" and self.width > 1:
            values.byteswap()
        return tuple(values)

    def iter_rows(self) -> Iterator[tuple[int, ...]]:
        for index in range(self._committed_rows):
            yield self.read_row(index)

    def finalize_manifest(
        self, destination: Path | str | None = None
    ) -> PermutationSpoolSummary:
        if self.mode != "r" and self._written_rows != self._committed_rows:
            self.commit()
        self._stream.flush()
        summary = PermutationSpoolSummary(
            path=str(self.path.resolve()),
            degree=self.degree,
            element_width_bytes=self.width,
            row_count=self._committed_rows,
            file_bytes=self.path.stat().st_size,
            sha256=sha256_file(self.path),
            rows_validated_as_permutations=self._validate,
        )
        manifest_path = (
            Path(destination)
            if destination is not None
            else self.path.with_suffix(self.path.suffix + ".manifest.json")
        )
        atomic_write_json(
            manifest_path,
            {
                "schemaVersion": 1,
                "kind": "packed-permutation-rows",
                "path": summary.path,
                "degree": summary.degree,
                "elementWidthBytes": summary.element_width_bytes,
                "rowCount": summary.row_count,
                "fileBytes": summary.file_bytes,
                "sha256": summary.sha256,
                "rowsValidatedAsPermutations": summary.rows_validated_as_permutations,
            },
        )
        return summary

    def _read_header(self) -> tuple[int, int, int, int]:
        self._stream.seek(0)
        raw = self._stream.read(_HEADER.size)
        if len(raw) != _HEADER.size:
            raise PermutationSpoolError("Packed permutation header is truncated")
        magic, version, width, flags, degree, rows = _HEADER.unpack(raw)
        if magic != _MAGIC or version != _SCHEMA_VERSION:
            raise PermutationSpoolError("Packed permutation header is not recognized")
        if width not in (1, 2, 4) or width != _width_for_degree(degree):
            raise PermutationSpoolError("Packed permutation element width is invalid")
        return degree, width, flags, rows

    def _write_header(self, rows: int) -> None:
        flags = _VALIDATE_PERMUTATIONS if self._validate else 0
        self._stream.seek(0)
        self._stream.write(
            _HEADER.pack(
                _MAGIC,
                _SCHEMA_VERSION,
                self.width,
                flags,
                self.degree,
                rows,
            )
        )
        self._stream.flush()
        os.fsync(self._stream.fileno())

    def _ensure_open(self) -> None:
        if self._closed or self._stream is None:
            raise RuntimeError("PackedPermutationSpool is closed")

    def _ensure_writable(self) -> None:
        self._ensure_open()
        if self.mode == "r":
            raise OSError("PackedPermutationSpool is read-only")

    def close(self) -> None:
        if self._closed:
            return
        if self.mode != "r" and self._written_rows != self._committed_rows:
            self.commit()
        self._stream.close()
        self._closed = True

    def __enter__(self) -> "PackedPermutationSpool":
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.close()
