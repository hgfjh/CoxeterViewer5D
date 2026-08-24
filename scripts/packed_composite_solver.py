#!/usr/bin/env python3
"""Packed search for torsion-free composite permutation actions.

This module is intentionally independent of ``torsion_free_discovery.py``.
It consumes already constructed transitive permutation modules and a complete
catalogue of prime-order torsion witnesses.  A factor covers a witness when
the witness has no fixed point in that factor.  If the selected factors cover
every witness, every orbit of their diagonal product is torsion-free.

The search keeps witness sets as Python integer bitsets and permutation rows
as ``array`` objects.  Full action rows are built only for the best passing
diagonal orbit.  Resource limits fail closed: a capped run is ``incomplete``,
never evidence that no action exists.

Within the configured factor, Cartesian-product, degree, combination, and byte
bounds, the solver examines every module multiset and every transitive diagonal
orbit.  Witness coverage of the factors is only a search-order heuristic.  A
diagonal orbit is accepted only after an exact point-level fixed-point test,
because an off-diagonal orbit may be free even when every factor has fixed
points.  Repeated factors are intentional: intersections of conjugate point
stabilizers occur in self-products of one transitive action.
"""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
import mmap
import os
import sys
import tempfile
import unittest
from array import array
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence, TextIO


SOLVER_ID = "packed-composite-permutation-module-solver"
SOLVER_VERSION = "2.0.0"
CHECKPOINT_SCHEMA_VERSION = 2
OUTPUT_SCHEMA_VERSION = 2
SOLVER_SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
PACKED_ACTION_ENCODINGS = {
    "uint8": ("B", 1),
    "uint8-le": ("B", 1),
    "uint16-le": ("H", 2),
    "uint32-le": ("I", 4),
}


class PackedCompositeError(RuntimeError):
    """Base error for malformed inputs and failed exact invariants."""


class InputValidationError(PackedCompositeError):
    """The supplied modules or witness catalogue do not meet the contract."""


class ResourceLimitReached(PackedCompositeError):
    """A hard search bound prevented a mathematically complete operation."""

    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind


class CheckpointError(PackedCompositeError):
    """A checkpoint is malformed or belongs to a different search problem."""


def _iter_bits(mask: int) -> Iterator[int]:
    while mask:
        least = mask & -mask
        yield least.bit_length() - 1
        mask ^= least


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _sha256_json(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _array_type_for_bound(bound: int) -> str:
    if bound <= 0xFFFF:
        return "H"
    if bound <= 0xFFFFFFFF:
        return "I"
    return "Q"


def _array_little_endian_bytes(values: array) -> bytes:
    if sys.byteorder == "little" or values.itemsize == 1:
        return values.tobytes()
    copy = array(values.typecode, values)
    copy.byteswap()
    return copy.tobytes()


def _state_size(state: "SearchState") -> int:
    # Frontier size is bounded independently of CPython's allocator strategy.
    # The estimate includes the tuple and every variable-width integer.
    return (
        192
        + 16 * len(state.selected)
        + (state.available_mask.bit_length() + 7) // 8
        + (state.joint_fixed_mask.bit_length() + 7) // 8
        + (state.product_degree.bit_length() + 7) // 8
    )


@dataclass(frozen=True, slots=True)
class Witness:
    id: str
    word: tuple[int, ...]
    prime_order: int


@dataclass(frozen=True, slots=True)
class PackedModule:
    id: str
    degree: int
    actions: tuple[Sequence[int], ...]
    action_sha256: str
    fixed_point_counts: tuple[int, ...]
    free_mask: int
    has_fixed_mask: int
    packed_bytes: int
    action_source: str
    spool_path: str | None = None
    spool_encoding: str | None = None
    spool_sha256: str | None = None
    mapped_bytes: int = 0

    @property
    def rank(self) -> int:
        return len(self.actions)


@dataclass(frozen=True, slots=True)
class PackedProblem:
    witnesses: tuple[Witness, ...]
    modules: tuple[PackedModule, ...]
    rank: int
    target_mask: int
    provider_masks: tuple[int, ...]
    lower_bound: int
    problem_sha256: str
    coxeter_relations_checked: bool
    dominance_pruned_module_ids: tuple[str, ...] = ()
    noncontributing_module_ids: tuple[str, ...] = ()

    def close(self) -> None:
        """Release any read-only action-spool mappings owned by this problem."""

        closed: set[int] = set()
        for module in self.modules:
            for row in module.actions:
                if isinstance(row, MappedActionRow) and id(row.spool) not in closed:
                    closed.add(id(row.spool))
                    row.spool.close()

    def __enter__(self) -> "PackedProblem":
        return self

    def __exit__(self, *_error: object) -> None:
        self.close()


@dataclass(frozen=True, slots=True)
class SolverLimits:
    max_bytes: int = 512 * 1024 * 1024
    max_mapped_bytes: int = 64 * 1024 * 1024 * 1024
    max_combinations: int = 100_000
    max_factors: int = 8
    max_degree: int = 1_000_000
    max_cartesian_points: int = 8_000_000
    checkpoint_interval: int = 250

    def validate(self) -> None:
        values = asdict(self)
        for name, value in values.items():
            if value <= 0:
                raise InputValidationError(f"{name} must be positive")


@dataclass(frozen=True, slots=True)
class SearchState:
    selected: tuple[int, ...]
    available_mask: int
    joint_fixed_mask: int
    product_degree: int


@dataclass(frozen=True, slots=True)
class OrbitCandidate:
    module_indices: tuple[int, ...]
    module_ids: tuple[str, ...]
    representative_code: int
    representative_tuple: tuple[int, ...]
    orbit_index: int
    degree: int
    cartesian_degree: int
    decomposition_kind: str

    @property
    def id(self) -> str:
        factors = "+".join(self.module_ids)
        return f"packed-composite:{factors}:orbit-{self.representative_code}"


@dataclass(frozen=True, slots=True)
class OrbitPartitionSummary:
    cartesian_degree: int
    orbit_count: int
    orbit_degree_sum: int
    minimum_orbit_degree: int
    maximum_orbit_degree: int
    candidate_orbits: int
    degree_eligible_orbits: int
    witness_tested_orbits: int
    witness_rejected_orbits: int
    exceptional_witness_free_orbits: int
    degree_pruned_orbits: int
    decomposition_kind: str


@dataclass(slots=True)
class SearchDiagnostics:
    states_considered: int = 0
    covering_combinations_evaluated: int = 0
    factor_multisets_evaluated: int = 0
    branches_generated: int = 0
    impossible_witness_prunes: int = 0
    lower_bound_prunes: int = 0
    factor_limit_prunes: int = 0
    degree_pruned_orbits: int = 0
    diagonal_orbits_enumerated: int = 0
    cartesian_points_partitioned: int = 0
    double_coset_decompositions: int = 0
    iterated_orbit_decompositions: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    byte_cap_hits: int = 0
    cartesian_cap_hits: int = 0
    cartesian_scope_prunes: int = 0
    witness_tested_orbits: int = 0
    witness_rejected_orbits: int = 0
    exceptional_witness_free_orbits: int = 0
    combination_cap_hit: bool = False
    peak_accounted_bytes: int = 0
    checkpoint_write_failures: int = 0
    checkpoint_last_error: str | None = None
    rarest_witness_trace: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class SolverResult:
    status: str
    candidate: OrbitCandidate | None
    search_complete: bool
    minimum_proved: bool
    problem_sha256: str
    diagnostics: Mapping[str, Any]
    limitations: tuple[str, ...]

    def to_json(self) -> dict[str, Any]:
        return {
            "schemaVersion": OUTPUT_SCHEMA_VERSION,
            "solver": {"id": SOLVER_ID, "version": SOLVER_VERSION},
            "status": self.status,
            "candidate": _candidate_to_json(self.candidate),
            "searchComplete": self.search_complete,
            "minimumWithinBoundedOrbitScope": self.minimum_proved,
            # Kept for schema compatibility with v1 checkpoints and fixtures.
            "minimumProved": self.minimum_proved,
            "problemSha256": self.problem_sha256,
            "diagnostics": dict(self.diagnostics),
            "limitations": list(self.limitations),
        }


@dataclass(frozen=True, slots=True)
class MaterializedAction:
    candidate: OrbitCandidate
    generator_actions: tuple[array, ...]
    orbit_point_codes: array
    witness_fixed_point_counts: tuple[int, ...]
    action_sha256: str
    packed_bytes: int


class ByteLedger:
    """Accounts for persistent and temporary packed search storage.

    Python interpreter overhead and the caller's decoded input JSON are outside
    this ledger. File-backed action maps have their own ``max_mapped_bytes``
    cap because their pages are reclaimable by the operating system. Every
    heap structure whose size grows with a permutation degree, Cartesian
    product, or search frontier is charged before use.
    """

    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.used = 0
        self.peak = 0

    @property
    def available(self) -> int:
        return self.maximum - self.used

    def reserve(self, amount: int, label: str) -> None:
        if amount < 0:
            raise ValueError("Cannot reserve a negative byte count")
        if self.used + amount > self.maximum:
            raise ResourceLimitReached(
                "bytes",
                f"{label} requires {amount} bytes with only "
                f"{self.available} bytes left in the hard budget",
            )
        self.used += amount
        self.peak = max(self.peak, self.used)

    def release(self, amount: int) -> None:
        self.used -= amount
        if self.used < 0:
            raise AssertionError("Byte ledger underflow")


class IntersectionCache:
    """Small exact cache for stabilizer-witness intersections.

    A witness fixes a point in the full Cartesian product exactly when it has
    a fixed point in every selected factor.  Extending a product therefore
    updates this bitset by one integer AND operation.
    """

    def __init__(self, byte_limit: int, ledger: ByteLedger) -> None:
        self.byte_limit = max(0, byte_limit)
        self.ledger = ledger
        self.entries: dict[tuple[int, ...], tuple[int, int, int]] = {}
        self.order: list[tuple[int, ...]] = []
        self.bytes = 0

    @staticmethod
    def _entry_size(key: tuple[int, ...], joint: int, product: int) -> int:
        return (
            128
            + 16 * len(key)
            + (joint.bit_length() + 7) // 8
            + (product.bit_length() + 7) // 8
        )

    def get(self, key: tuple[int, ...]) -> tuple[int, int] | None:
        value = self.entries.get(key)
        if value is None:
            return None
        joint, product, _ = value
        return joint, product

    def put(self, key: tuple[int, ...], joint: int, product: int) -> None:
        if key in self.entries:
            return
        size = self._entry_size(key, joint, product)
        if size > self.byte_limit:
            return
        while self.order and self.bytes + size > self.byte_limit:
            oldest = self.order.pop(0)
            _, _, old_size = self.entries.pop(oldest)
            self.bytes -= old_size
            self.ledger.release(old_size)
        if self.bytes + size <= self.byte_limit:
            try:
                self.ledger.reserve(size, "intersection cache")
            except ResourceLimitReached:
                return
            self.entries[key] = (joint, product, size)
            self.order.append(key)
            self.bytes += size


class PackedBits:
    """Mutable bitset used for Cartesian-orbit visitation."""

    __slots__ = ("data", "size")

    def __init__(self, size: int) -> None:
        self.size = size
        self.data = bytearray((size + 7) // 8)

    def contains(self, index: int) -> bool:
        return bool(self.data[index >> 3] & (1 << (index & 7)))

    def add(self, index: int) -> None:
        self.data[index >> 3] |= 1 << (index & 7)


class MappedActionSpool:
    """Verified read-only row-major permutation storage.

    Hashing and length checks use the same open file handle that is mapped.
    The spool must remain immutable for the lifetime of the solver.
    """

    __slots__ = (
        "degree",
        "encoding",
        "generator_count",
        "item_width",
        "path",
        "sha256",
        "_file",
        "_mapping",
        "_values",
    )

    def __init__(
        self,
        *,
        path: Path,
        encoding: str,
        degree: int,
        generator_count: int,
        expected_sha256: str,
    ) -> None:
        try:
            typecode, item_width = PACKED_ACTION_ENCODINGS[encoding]
        except KeyError as exc:
            allowed = ", ".join(sorted(PACKED_ACTION_ENCODINGS))
            raise InputValidationError(
                f"Unsupported packed action encoding {encoding!r}; expected {allowed}"
            ) from exc
        if degree <= 0 or generator_count <= 0:
            raise InputValidationError(
                "Packed action degree and generatorCount must be positive"
            )
        maximum = (1 << (8 * item_width)) - 1
        if degree - 1 > maximum:
            raise InputValidationError(
                f"Encoding {encoding} cannot represent degree {degree} point ids"
            )
        normalized_hash = expected_sha256.strip().lower()
        if len(normalized_hash) != 64 or any(
            character not in "0123456789abcdef" for character in normalized_hash
        ):
            raise InputValidationError(
                "Packed action sha256 must be 64 hexadecimal digits"
            )
        expected_length = degree * generator_count * item_width
        resolved = path.resolve()
        try:
            source = resolved.open("rb")
        except OSError as exc:
            raise InputValidationError(
                f"Cannot open packed action spool {resolved}: {exc}"
            ) from exc
        try:
            before = os.fstat(source.fileno())
            if before.st_size != expected_length:
                raise InputValidationError(
                    f"Packed action spool {resolved} has {before.st_size} bytes; "
                    f"expected exactly {expected_length}"
                )
            digest = hashlib.sha256()
            while True:
                block = source.read(1024 * 1024)
                if not block:
                    break
                digest.update(block)
            after = os.fstat(source.fileno())
            if (
                after.st_size != before.st_size
                or after.st_mtime_ns != before.st_mtime_ns
            ):
                raise InputValidationError(
                    f"Packed action spool {resolved} changed while it was verified"
                )
            actual_hash = digest.hexdigest()
            if actual_hash != normalized_hash:
                raise InputValidationError(
                    f"Packed action spool {resolved} sha256 mismatch: "
                    f"expected {normalized_hash}, got {actual_hash}"
                )
            source.seek(0)
            # Mapping happens only after the length and digest checks above.
            mapping = mmap.mmap(source.fileno(), length=0, access=mmap.ACCESS_READ)
        except Exception:
            source.close()
            raise
        self.path = resolved
        self.encoding = encoding
        self.degree = degree
        self.generator_count = generator_count
        self.item_width = item_width
        self.sha256 = normalized_hash
        self._file = source
        self._mapping = mapping
        if item_width == 1 or sys.byteorder == "little":
            self._values = memoryview(mapping).cast(typecode)
        else:
            # Big-endian hosts decode explicitly in MappedActionRow.
            self._values = memoryview(mapping).cast("B")

    def row(self, generator: int) -> "MappedActionRow":
        if generator < 0 or generator >= self.generator_count:
            raise IndexError(generator)
        return MappedActionRow(self, generator)

    def value(self, flat_index: int) -> int:
        if self.item_width == 1 or sys.byteorder == "little":
            return int(self._values[flat_index])
        start = flat_index * self.item_width
        return int.from_bytes(
            self._values[start : start + self.item_width], "little", signed=False
        )

    def raw_row_bytes(self, generator: int) -> memoryview:
        start = generator * self.degree * self.item_width
        end = start + self.degree * self.item_width
        return memoryview(self._mapping)[start:end]

    def close(self) -> None:
        values = getattr(self, "_values", None)
        if values is not None:
            values.release()
            self._values = None
        mapping = getattr(self, "_mapping", None)
        if mapping is not None:
            mapping.close()
            self._mapping = None
        source = getattr(self, "_file", None)
        if source is not None:
            source.close()
            self._file = None

    def __del__(self) -> None:
        try:
            self.close()
        except (BufferError, OSError):
            pass


class MappedActionRow(Sequence[int]):
    """Sequence view of one generator row in a verified action spool."""

    __slots__ = ("generator", "spool")

    def __init__(self, spool: MappedActionSpool, generator: int) -> None:
        self.spool = spool
        self.generator = generator

    def __len__(self) -> int:
        return self.spool.degree

    def __getitem__(self, index: int | slice) -> int | list[int]:
        if isinstance(index, slice):
            start, stop, step = index.indices(len(self))
            return [self[position] for position in range(start, stop, step)]
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        flat_index = self.generator * self.spool.degree + index
        return self.spool.value(flat_index)

    def __iter__(self) -> Iterator[int]:
        start = self.generator * self.spool.degree
        for offset in range(self.spool.degree):
            yield self.spool.value(start + offset)


def _module_action_hash(degree: int, actions: Sequence[Sequence[int]]) -> str:
    digest = hashlib.sha256()
    digest.update(b"coxeter-packed-module-v1\0")
    digest.update(degree.to_bytes(8, "little"))
    digest.update(len(actions).to_bytes(4, "little"))
    canonical_type = _array_type_for_bound(degree - 1)
    canonical_width = array(canonical_type).itemsize
    for row in actions:
        digest.update(len(row).to_bytes(8, "little"))
        for start in range(0, len(row), 16_384):
            stop = min(len(row), start + 16_384)
            if (
                isinstance(row, MappedActionRow)
                and row.spool.item_width == canonical_width
            ):
                raw = row.spool.raw_row_bytes(row.generator)
                chunk = raw[start * canonical_width : stop * canonical_width]
                digest.update(chunk)
                chunk.release()
                raw.release()
            else:
                packed = array(canonical_type, row[start:stop])
                digest.update(_array_little_endian_bytes(packed))
    return digest.hexdigest()


def _apply_word(
    actions: Sequence[Sequence[int]], word: Sequence[int], point: int
) -> int:
    for generator in word:
        point = actions[generator][point]
    return point


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value == 2:
        return True
    if value % 2 == 0:
        return False
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _normalize_actions(
    raw: Mapping[str, Any], module_id: str
) -> tuple[int, list[list[int]]]:
    degree_value = raw.get("degree", raw.get("index"))
    if not isinstance(degree_value, int) or degree_value <= 0:
        raise InputValidationError(f"Module {module_id} has no positive degree")
    degree = degree_value
    if "generatorImages" in raw:
        rows = raw["generatorImages"]
    else:
        actions = raw.get("actions")
        if not isinstance(actions, Mapping):
            raise InputValidationError(f"Module {module_id} has no action rows")
        try:
            keys = sorted(int(key) for key in actions)
            if keys != list(range(len(keys))):
                raise ValueError
            rows = [
                actions[str(key)] if str(key) in actions else actions[key]
                for key in keys
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise InputValidationError(
                f"Module {module_id} generator keys must be 0, ..., rank-1"
            ) from exc
    if not isinstance(rows, Sequence) or not rows:
        raise InputValidationError(f"Module {module_id} has no generators")
    normalized: list[list[int]] = []
    for generator, row in enumerate(rows):
        if not isinstance(row, Sequence) or isinstance(row, (str, bytes)):
            raise InputValidationError(
                f"Module {module_id} generator {generator} is not an array"
            )
        values = [int(value) for value in row]
        if len(values) != degree:
            raise InputValidationError(
                f"Module {module_id} generator {generator} has length "
                f"{len(values)}, expected {degree}"
            )
        normalized.append(values)
    return degree, normalized


def _packed_action_descriptor(raw: Mapping[str, Any]) -> Mapping[str, Any] | None:
    for key in ("packedActions", "actionSpool"):
        value = raw.get(key)
        if isinstance(value, Mapping):
            return value
    actions = raw.get("actions")
    if isinstance(actions, Mapping) and {
        "path",
        "encoding",
        "degree",
        "generatorCount",
        "sha256",
    }.issubset(actions):
        return actions
    return None


def _resolve_spool_path(path_value: Any, base_dir: Path | None) -> Path:
    if not isinstance(path_value, str) or not path_value.strip():
        raise InputValidationError("Packed action spool path must be a nonempty string")
    path = Path(path_value)
    if not path.is_absolute():
        path = (base_dir or Path.cwd()) / path
    return path


def _open_packed_actions(
    raw: Mapping[str, Any],
    module_id: str,
    base_dir: Path | None,
) -> tuple[int, tuple[MappedActionRow, ...], MappedActionSpool] | None:
    descriptor = _packed_action_descriptor(raw)
    if descriptor is None:
        return None
    try:
        degree = int(descriptor["degree"])
        generator_count = int(descriptor["generatorCount"])
        encoding = str(descriptor["encoding"])
        expected_hash = str(descriptor["sha256"])
        path = _resolve_spool_path(descriptor["path"], base_dir)
    except (KeyError, TypeError, ValueError) as exc:
        raise InputValidationError(
            f"Module {module_id} has an incomplete packed action descriptor"
        ) from exc
    outer_degree = raw.get("degree", raw.get("index"))
    if outer_degree is not None and int(outer_degree) != degree:
        raise InputValidationError(
            f"Module {module_id} descriptor degree {degree} disagrees with "
            f"module degree {outer_degree}"
        )
    spool = MappedActionSpool(
        path=path,
        encoding=encoding,
        degree=degree,
        generator_count=generator_count,
        expected_sha256=expected_hash,
    )
    return degree, tuple(spool.row(index) for index in range(generator_count)), spool


def _validate_permutation_rows(
    module_id: str, degree: int, actions: Sequence[Sequence[int]]
) -> None:
    for generator, row in enumerate(actions):
        seen = PackedBits(degree)
        for image in row:
            if image < 0 or image >= degree:
                raise InputValidationError(
                    f"Module {module_id} generator {generator} maps outside its degree"
                )
            if seen.contains(image):
                raise InputValidationError(
                    f"Module {module_id} generator {generator} is not bijective"
                )
            seen.add(image)
        if any(row[row[point]] != point for point in range(degree)):
            raise InputValidationError(
                f"Module {module_id} generator {generator} is not an involution"
            )


def _validate_transitive(
    module_id: str, degree: int, actions: Sequence[Sequence[int]]
) -> None:
    seen = PackedBits(degree)
    queue = array(_array_type_for_bound(degree - 1), [0]) * degree
    seen.add(0)
    head = 0
    tail = 1
    while head < tail:
        point = queue[head]
        head += 1
        for row in actions:
            image = row[point]
            if not seen.contains(image):
                seen.add(image)
                queue[tail] = image
                tail += 1
    if tail != degree:
        raise InputValidationError(
            f"Module {module_id} is not transitive: reached {tail} of {degree} points"
        )


def _finite_m(value: Any) -> int | None:
    if value in (None, 0, "inf", "infinity", "Infinity"):
        return None
    integer = int(value)
    return integer if integer >= 2 else None


def _validate_coxeter_relations(
    module_id: str,
    actions: Sequence[Sequence[int]],
    matrix: Sequence[Sequence[Any]],
) -> None:
    rank = len(actions)
    if len(matrix) != rank or any(len(row) != rank for row in matrix):
        raise InputValidationError("Coxeter matrix rank does not match the modules")
    degree = len(actions[0])
    for left in range(rank):
        for right in range(left + 1, rank):
            m = _finite_m(matrix[left][right])
            if m is None:
                continue
            for point in range(degree):
                image = point
                for _ in range(m):
                    image = actions[left][image]
                    image = actions[right][image]
                if image != point:
                    raise InputValidationError(
                        f"Module {module_id} fails relation (s{left}s{right})^{m}=1"
                    )


def _pack_module(
    raw: Mapping[str, Any],
    witnesses: Sequence[Witness],
    rank: int | None,
    coxeter_matrix: Sequence[Sequence[Any]] | None,
    spool_base_dir: Path | None,
) -> PackedModule:
    module_id = str(raw.get("id", "")).strip()
    if not module_id:
        raise InputValidationError("Every module needs a stable nonempty id")
    packed_source = _open_packed_actions(raw, module_id, spool_base_dir)
    spool: MappedActionSpool | None = None
    if packed_source is None:
        degree, normalized = _normalize_actions(raw, module_id)
        typecode = _array_type_for_bound(degree - 1)
        actions: tuple[Sequence[int], ...] = tuple(
            array(typecode, row) for row in normalized
        )
        action_source = "inline-json"
    else:
        degree, mapped_rows, spool = packed_source
        actions = mapped_rows
        action_source = "packed-row-major-spool"
    try:
        if rank is not None and len(actions) != rank:
            raise InputValidationError(
                f"Module {module_id} has rank {len(actions)}, expected {rank}"
            )
        _validate_permutation_rows(module_id, degree, actions)
        _validate_transitive(module_id, degree, actions)
        if coxeter_matrix is not None:
            _validate_coxeter_relations(module_id, actions, coxeter_matrix)

        free_mask = 0
        counts: list[int] = []
        for witness_index, witness in enumerate(witnesses):
            if any(
                generator < 0 or generator >= len(actions) for generator in witness.word
            ):
                raise InputValidationError(
                    f"Witness {witness.id} uses a generator outside module {module_id}"
                )
            fixed = 0
            for point in range(degree):
                image = _apply_word(actions, witness.word, point)
                fixed += image == point
                powered = image
                for _ in range(witness.prime_order - 1):
                    powered = _apply_word(actions, witness.word, powered)
                if powered != point:
                    raise InputValidationError(
                        f"Witness {witness.id} does not have image order dividing "
                        f"{witness.prime_order} in module {module_id}"
                    )
            counts.append(fixed)
            if fixed == 0:
                free_mask |= 1 << witness_index
        target_mask = (1 << len(witnesses)) - 1
        packed_bytes = sum(sys.getsizeof(row) for row in actions)
        packed_bytes += sys.getsizeof(actions) + sys.getsizeof(tuple(counts))
        packed_bytes += sum(sys.getsizeof(value) for value in counts)
        return PackedModule(
            id=module_id,
            degree=degree,
            actions=actions,
            action_sha256=_module_action_hash(degree, actions),
            fixed_point_counts=tuple(counts),
            free_mask=free_mask,
            has_fixed_mask=target_mask & ~free_mask,
            packed_bytes=packed_bytes,
            action_source=action_source,
            spool_path=str(spool.path) if spool is not None else None,
            spool_encoding=spool.encoding if spool is not None else None,
            spool_sha256=spool.sha256 if spool is not None else None,
            mapped_bytes=(
                spool.degree * spool.generator_count * spool.item_width
                if spool is not None
                else 0
            ),
        )
    except Exception:
        if spool is not None:
            spool.close()
        raise


def _action_rows_equal(
    left: Sequence[Sequence[int]], right: Sequence[Sequence[int]]
) -> bool:
    return len(left) == len(right) and all(
        len(left_row) == len(right_row)
        and all(a == b for a, b in zip(left_row, right_row))
        for left_row, right_row in zip(left, right)
    )


def _close_module_source(module: PackedModule) -> None:
    for row in module.actions:
        if isinstance(row, MappedActionRow):
            row.spool.close()
            return


def prepare_problem(
    raw_modules: Sequence[Mapping[str, Any]],
    raw_witnesses: Sequence[Mapping[str, Any]],
    *,
    witness_catalogue_complete: bool,
    lower_bound: int,
    coxeter_matrix: Sequence[Sequence[Any]] | None = None,
    spool_base_dir: Path | None = None,
) -> PackedProblem:
    """Validate and pack a composite-action search problem.

    Only exact duplicate actions are dominance-pruned.  Coverage-only
    dominance is unsafe here: two modules with the same covered witnesses can
    have different stabilizer intersections and therefore different diagonal
    orbit degrees.
    """

    if not witness_catalogue_complete:
        raise InputValidationError(
            "The prime-order witness catalogue must explicitly be complete"
        )
    if lower_bound <= 0:
        raise InputValidationError("The action-degree lower bound must be positive")
    if not raw_witnesses:
        raise InputValidationError("The witness catalogue is empty")
    witnesses: list[Witness] = []
    seen_ids: set[str] = set()
    for raw in raw_witnesses:
        witness_id = str(raw.get("id", "")).strip()
        if not witness_id or witness_id in seen_ids:
            raise InputValidationError("Witness ids must be nonempty and unique")
        seen_ids.add(witness_id)
        word = tuple(int(generator) for generator in raw.get("word", []))
        prime_order = int(raw.get("primeOrder", raw.get("prime_order", 0)))
        if not word or not _is_prime(prime_order):
            raise InputValidationError(
                f"Witness {witness_id} needs a nonempty word and prime order"
            )
        witnesses.append(Witness(witness_id, word, prime_order))
    witnesses.sort(key=lambda witness: witness.id)

    packed: list[PackedModule] = []
    rank: int | None = None
    for raw_module in raw_modules:
        try:
            module = _pack_module(
                raw_module, witnesses, rank, coxeter_matrix, spool_base_dir
            )
        except Exception:
            for prior in packed:
                _close_module_source(prior)
            raise
        rank = module.rank if rank is None else rank
        if any(
            generator < 0 or generator >= rank
            for witness in witnesses
            for generator in witness.word
        ):
            _close_module_source(module)
            for prior in packed:
                _close_module_source(prior)
            raise InputValidationError("A witness word uses an unknown generator")
        packed.append(module)
    if not packed or rank is None:
        raise InputValidationError("At least one permutation module is required")

    packed.sort(key=lambda module: (module.degree, module.id, module.action_sha256))
    unique: list[PackedModule] = []
    duplicate_ids: list[str] = []
    fingerprints: dict[tuple[int, str], PackedModule] = {}
    for module in packed:
        fingerprint = (module.degree, module.action_sha256)
        previous = fingerprints.get(fingerprint)
        if previous is not None and _action_rows_equal(
            previous.actions, module.actions
        ):
            duplicate_ids.append(module.id)
            _close_module_source(module)
            continue
        fingerprints[fingerprint] = module
        unique.append(module)
    if not unique:
        raise InputValidationError("No distinct transitive module remains")

    target_mask = (1 << len(witnesses)) - 1
    provider_masks: list[int] = []
    for witness_index in range(len(witnesses)):
        providers = 0
        for module_index, module in enumerate(unique):
            if module.free_mask & (1 << witness_index):
                providers |= 1 << module_index
        provider_masks.append(providers)

    digest_payload = {
        "solverVersion": SOLVER_VERSION,
        "witnesses": [
            {"id": item.id, "word": item.word, "primeOrder": item.prime_order}
            for item in witnesses
        ],
        "modules": [
            {
                "id": module.id,
                "degree": module.degree,
                "actionSha256": module.action_sha256,
                "freeMask": hex(module.free_mask),
                "actionSource": module.action_source,
                "spoolEncoding": module.spool_encoding,
                "spoolSha256": module.spool_sha256,
            }
            for module in unique
        ],
        "lowerBound": lower_bound,
        "coxeterMatrix": coxeter_matrix,
        "searchScope": "all-bounded-transitive-diagonal-orbits",
        "factorPolicy": "nondecreasing-module-multisets-with-repetition",
    }
    return PackedProblem(
        witnesses=tuple(witnesses),
        modules=tuple(unique),
        rank=rank,
        target_mask=target_mask,
        provider_masks=tuple(provider_masks),
        lower_bound=lower_bound,
        problem_sha256=_sha256_json(digest_payload),
        coxeter_relations_checked=coxeter_matrix is not None,
        dominance_pruned_module_ids=tuple(sorted(duplicate_ids)),
        noncontributing_module_ids=(),
    )


def _decode_tuple(code: int, degrees: Sequence[int]) -> tuple[int, ...]:
    coordinates: list[int] = []
    for degree in degrees:
        coordinates.append(code % degree)
        code //= degree
    return tuple(coordinates)


def _diagonal_image(code: int, modules: Sequence[PackedModule], generator: int) -> int:
    image_code = 0
    multiplier = 1
    for module in modules:
        coordinate = code % module.degree
        code //= module.degree
        image_code += module.actions[generator][coordinate] * multiplier
        multiplier *= module.degree
    return image_code


def _diagonal_word_image(
    code: int, modules: Sequence[PackedModule], word: Sequence[int]
) -> int:
    image = code
    for generator in word:
        image = _diagonal_image(image, modules, generator)
    return image


def _orbit_is_witness_free(
    orbit_points: Sequence[int],
    orbit_length: int,
    modules: Sequence[PackedModule],
    witnesses: Sequence[Witness],
) -> tuple[bool, bool]:
    """Check one diagonal orbit, including exceptional off-diagonal freedom.

    If some factor is fixed-point-free for a witness, no Cartesian tuple can
    be fixed and the bitset shortcut is exact.  Otherwise we inspect points in
    this orbit until a fixed tuple is found.  The second return value records
    the genuinely exceptional case in which factorwise coverage was
    insufficient but the orbit itself passed.
    """

    exceptional = False
    for witness_index, witness in enumerate(witnesses):
        factorwise_free = any(
            module.fixed_point_counts[witness_index] == 0 for module in modules
        )
        if factorwise_free:
            continue
        if any(
            _diagonal_word_image(int(orbit_points[position]), modules, witness.word)
            == orbit_points[position]
            for position in range(orbit_length)
        ):
            return False, False
        exceptional = True
    return True, exceptional


def _orbit_allocation_estimate(cartesian_degree: int) -> int:
    code_width = array(_array_type_for_bound(cartesian_degree - 1)).itemsize
    return (cartesian_degree + 7) // 8 + cartesian_degree * code_width + 512


def enumerate_diagonal_orbits(
    modules: Sequence[PackedModule],
    witnesses: Sequence[Witness],
    *,
    lower_bound: int,
    max_degree: int,
    max_cartesian_points: int,
    ledger: ByteLedger,
    module_indices: tuple[int, ...] | None = None,
) -> tuple[OrbitPartitionSummary, OrbitCandidate | None]:
    """Partition the full Cartesian product into every diagonal orbit.

    For two transitive factors these components are the familiar double-coset
    orbits.  Higher products are iterated stabilizer-intersection orbits.  No
    distinguished all-zero base tuple is privileged.
    """

    if not modules:
        raise InputValidationError("A diagonal product needs at least one module")
    rank = modules[0].rank
    if any(module.rank != rank for module in modules):
        raise InputValidationError("Diagonal factors have different ranks")
    cartesian_degree = math.prod(module.degree for module in modules)
    if cartesian_degree > max_cartesian_points:
        raise ResourceLimitReached(
            "cartesian-points",
            f"Cartesian product has {cartesian_degree} points, cap is "
            f"{max_cartesian_points}",
        )
    estimate = _orbit_allocation_estimate(cartesian_degree)
    ledger.reserve(estimate, "diagonal-orbit partition")
    try:
        visited = PackedBits(cartesian_degree)
        typecode = _array_type_for_bound(cartesian_degree - 1)
        queue = array(typecode, [0]) * cartesian_degree
        orbit_count = 0
        degree_sum = 0
        minimum = cartesian_degree
        maximum = 0
        candidate_orbits = 0
        degree_eligible_orbits = 0
        witness_tested_orbits = 0
        witness_rejected_orbits = 0
        exceptional_witness_free_orbits = 0
        degree_pruned = 0
        best: OrbitCandidate | None = None
        degrees = tuple(module.degree for module in modules)
        indices = module_indices or tuple(range(len(modules)))
        ids = tuple(module.id for module in modules)
        if len(modules) == 1:
            decomposition = "single-transitive-factor"
        elif len(modules) == 2:
            decomposition = "double-coset-diagonal-orbits"
        else:
            decomposition = "iterated-stabilizer-intersection-orbits"

        for seed in range(cartesian_degree):
            if visited.contains(seed):
                continue
            visited.add(seed)
            queue[0] = seed
            head = 0
            tail = 1
            while head < tail:
                point = queue[head]
                head += 1
                for generator in range(rank):
                    image = _diagonal_image(point, modules, generator)
                    if not visited.contains(image):
                        visited.add(image)
                        queue[tail] = image
                        tail += 1
            degree = tail
            orbit_count += 1
            degree_sum += degree
            minimum = min(minimum, degree)
            maximum = max(maximum, degree)
            if (
                degree >= lower_bound
                and degree <= max_degree
                and degree % lower_bound == 0
            ):
                degree_eligible_orbits += 1
                witness_tested_orbits += 1
                witness_free, exceptional = _orbit_is_witness_free(
                    queue, tail, modules, witnesses
                )
                if witness_free:
                    candidate_orbits += 1
                    exceptional_witness_free_orbits += int(exceptional)
                    candidate = OrbitCandidate(
                        module_indices=indices,
                        module_ids=ids,
                        representative_code=seed,
                        representative_tuple=_decode_tuple(seed, degrees),
                        orbit_index=orbit_count - 1,
                        degree=degree,
                        cartesian_degree=cartesian_degree,
                        decomposition_kind=decomposition,
                    )
                    if best is None or _candidate_order(candidate) < _candidate_order(
                        best
                    ):
                        best = candidate
                else:
                    witness_rejected_orbits += 1
            else:
                degree_pruned += 1
        if degree_sum != cartesian_degree:
            raise AssertionError(
                "Diagonal orbits did not partition the Cartesian product"
            )
        return (
            OrbitPartitionSummary(
                cartesian_degree=cartesian_degree,
                orbit_count=orbit_count,
                orbit_degree_sum=degree_sum,
                minimum_orbit_degree=minimum,
                maximum_orbit_degree=maximum,
                candidate_orbits=candidate_orbits,
                degree_eligible_orbits=degree_eligible_orbits,
                witness_tested_orbits=witness_tested_orbits,
                witness_rejected_orbits=witness_rejected_orbits,
                exceptional_witness_free_orbits=exceptional_witness_free_orbits,
                degree_pruned_orbits=degree_pruned,
                decomposition_kind=decomposition,
            ),
            best,
        )
    finally:
        ledger.release(estimate)


def _candidate_order(candidate: OrbitCandidate) -> tuple[Any, ...]:
    return (
        candidate.degree,
        len(candidate.module_ids),
        candidate.cartesian_degree,
        candidate.module_ids,
        candidate.representative_tuple,
    )


def _state_order(state: SearchState) -> tuple[Any, ...]:
    return (
        len(state.selected),
        state.product_degree,
        state.selected,
        state.available_mask,
    )


def _state_to_json(state: SearchState) -> dict[str, Any]:
    return {
        "selected": list(state.selected),
        "availableMask": hex(state.available_mask),
        "jointFixedMask": hex(state.joint_fixed_mask),
        "productDegree": str(state.product_degree),
    }


def _state_from_json(raw: Mapping[str, Any]) -> SearchState:
    return SearchState(
        selected=tuple(int(value) for value in raw["selected"]),
        available_mask=int(str(raw["availableMask"]), 16),
        joint_fixed_mask=int(str(raw["jointFixedMask"]), 16),
        product_degree=int(str(raw["productDegree"])),
    )


def _candidate_to_json(candidate: OrbitCandidate | None) -> dict[str, Any] | None:
    if candidate is None:
        return None
    return {
        "id": candidate.id,
        "moduleIndices": list(candidate.module_indices),
        "moduleIds": list(candidate.module_ids),
        "representativeCode": str(candidate.representative_code),
        "representativeTuple": list(candidate.representative_tuple),
        "orbitIndex": candidate.orbit_index,
        "degree": candidate.degree,
        "cartesianDegree": str(candidate.cartesian_degree),
        "decompositionKind": candidate.decomposition_kind,
        "actionMaterialized": False,
    }


def _candidate_from_json(raw: Mapping[str, Any] | None) -> OrbitCandidate | None:
    if raw is None:
        return None
    return OrbitCandidate(
        module_indices=tuple(int(value) for value in raw["moduleIndices"]),
        module_ids=tuple(str(value) for value in raw["moduleIds"]),
        representative_code=int(str(raw["representativeCode"])),
        representative_tuple=tuple(int(value) for value in raw["representativeTuple"]),
        orbit_index=int(raw["orbitIndex"]),
        degree=int(raw["degree"]),
        cartesian_degree=int(str(raw["cartesianDegree"])),
        decomposition_kind=str(raw["decompositionKind"]),
    )


def _checkpoint_payload(
    problem: PackedProblem,
    limits: SolverLimits,
    frontier: Sequence[SearchState],
    deferred: Sequence[SearchState],
    best: OrbitCandidate | None,
    diagnostics: SearchDiagnostics,
    complete: bool,
) -> dict[str, Any]:
    return {
        "schemaVersion": CHECKPOINT_SCHEMA_VERSION,
        "solverVersion": SOLVER_VERSION,
        "solverSourceSha256": SOLVER_SOURCE_SHA256,
        "problemSha256": problem.problem_sha256,
        "searchDomain": {
            "maxBytes": limits.max_bytes,
            "maxMappedBytes": limits.max_mapped_bytes,
            "maxCombinations": limits.max_combinations,
            "maxFactors": limits.max_factors,
            "maxDegree": limits.max_degree,
            "maxCartesianPoints": limits.max_cartesian_points,
            "factorPolicy": "nondecreasing-module-multisets-with-repetition",
        },
        "complete": complete,
        "frontier": [
            _state_to_json(state) for state in sorted(frontier, key=_state_order)
        ],
        "deferred": [
            _state_to_json(state) for state in sorted(deferred, key=_state_order)
        ],
        "best": _candidate_to_json(best),
        "diagnostics": asdict(diagnostics),
    }


def _write_checkpoint(path: Path, payload: Mapping[str, Any]) -> None:
    encoded = _canonical_json(payload) + b"\n"
    last_error: OSError | None = None
    for _ in range(3):
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.{os.getpid()}.", suffix=".tmp", dir=path.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            return
        except OSError as exc:
            last_error = exc
        finally:
            temporary.unlink(missing_ok=True)
    assert last_error is not None
    raise last_error


def _load_checkpoint(
    path: Path,
    problem: PackedProblem,
    limits: SolverLimits,
) -> tuple[
    list[SearchState], list[SearchState], OrbitCandidate | None, SearchDiagnostics, bool
]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CheckpointError(f"Cannot read checkpoint {path}: {exc}") from exc
    if raw.get("schemaVersion") != CHECKPOINT_SCHEMA_VERSION:
        raise CheckpointError("Checkpoint schema version does not match")
    if raw.get("solverVersion") != SOLVER_VERSION:
        raise CheckpointError("Checkpoint solver version does not match")
    if raw.get("solverSourceSha256") != SOLVER_SOURCE_SHA256:
        raise CheckpointError("Checkpoint solver source hash does not match")
    if raw.get("problemSha256") != problem.problem_sha256:
        raise CheckpointError(
            "Checkpoint belongs to a different module/witness problem"
        )
    domain = raw.get("searchDomain", {})
    fixed_domain = {
        "maxFactors": limits.max_factors,
        "maxDegree": limits.max_degree,
        "maxCartesianPoints": limits.max_cartesian_points,
        "factorPolicy": "nondecreasing-module-multisets-with-repetition",
    }
    if any(domain.get(key) != value for key, value in fixed_domain.items()):
        raise CheckpointError("Cannot change the bounded search domain while resuming")
    for key, value in {
        "maxBytes": limits.max_bytes,
        "maxMappedBytes": limits.max_mapped_bytes,
        "maxCombinations": limits.max_combinations,
    }.items():
        if int(domain.get(key, -1)) > value:
            raise CheckpointError(
                "Cannot reduce a checkpoint resource budget while resuming"
            )
    diagnostics_raw = raw.get("diagnostics", {})
    defaults = asdict(SearchDiagnostics())
    defaults.update(diagnostics_raw)
    diagnostics = SearchDiagnostics(**defaults)
    frontier = [_state_from_json(item) for item in raw.get("frontier", [])]
    deferred = [_state_from_json(item) for item in raw.get("deferred", [])]
    return (
        frontier,
        deferred,
        _candidate_from_json(raw.get("best")),
        diagnostics,
        bool(raw.get("complete", False)),
    )


class PackedCompositeSolver:
    """Deterministic bounded solver for Everitt-style diagonal products."""

    def __init__(self, problem: PackedProblem, limits: SolverLimits) -> None:
        limits.validate()
        self.problem = problem
        self.limits = limits
        mapped_bytes = sum(module.mapped_bytes for module in problem.modules)
        if mapped_bytes > limits.max_mapped_bytes:
            raise ResourceLimitReached(
                "mapped-bytes",
                f"Verified action spools map {mapped_bytes} bytes, cap is "
                f"{limits.max_mapped_bytes}",
            )
        self.ledger = ByteLedger(limits.max_bytes)
        module_bytes = sum(module.packed_bytes for module in problem.modules)
        problem_bytes = (
            sys.getsizeof(problem.witnesses)
            + sys.getsizeof(problem.provider_masks)
            + sum(
                sys.getsizeof(witness)
                + sys.getsizeof(witness.word)
                + 8 * len(witness.word)
                for witness in problem.witnesses
            )
        )
        self.ledger.reserve(
            module_bytes + problem_bytes, "packed permutation modules and witnesses"
        )
        cache_limit = min(8 * 1024 * 1024, max(0, self.ledger.available // 16))
        self.cache = IntersectionCache(cache_limit, self.ledger)

    def _push(self, heap: list[tuple[Any, ...]], state: SearchState) -> None:
        size = _state_size(state)
        self.ledger.reserve(size, "search frontier")
        heapq.heappush(heap, (*_state_order(state), state, size))

    def _pop(self, heap: list[tuple[Any, ...]]) -> SearchState:
        entry = heapq.heappop(heap)
        state = entry[-2]
        size = entry[-1]
        self.ledger.release(size)
        return state

    def _release_heap(self, heap: list[tuple[Any, ...]]) -> None:
        while heap:
            entry = heapq.heappop(heap)
            self.ledger.release(entry[-1])

    def _extend_intersection(
        self,
        state: SearchState,
        module_index: int,
        diagnostics: SearchDiagnostics,
    ) -> tuple[int, int, tuple[int, ...]]:
        selected = tuple(sorted((*state.selected, module_index)))
        cached = self.cache.get(selected)
        if cached is not None:
            diagnostics.cache_hits += 1
            joint, product = cached
            return joint, product, selected
        diagnostics.cache_misses += 1
        module = self.problem.modules[module_index]
        joint = state.joint_fixed_mask & module.has_fixed_mask
        product = state.product_degree * module.degree
        self.cache.put(selected, joint, product)
        return joint, product, selected

    def _optimistic_product_reaches_lower_bound(self, state: SearchState) -> bool:
        if state.product_degree >= self.problem.lower_bound:
            return True
        slots = self.limits.max_factors - len(state.selected)
        degrees = [
            self.problem.modules[index].degree
            for index in _iter_bits(state.available_mask)
        ]
        if not degrees:
            return False
        optimistic = state.product_degree
        # Factors may repeat.  Reusing the largest available action is the
        # exact upper bound on every descendant Cartesian degree.
        for _ in range(slots):
            optimistic *= max(degrees)
            if optimistic >= self.problem.lower_bound:
                return True
        return False

    def solve(
        self,
        *,
        checkpoint_path: Path | None = None,
        resume: bool = False,
    ) -> SolverResult:
        problem = self.problem
        limits = self.limits
        diagnostics = SearchDiagnostics()
        best: OrbitCandidate | None = None
        complete = False
        deferred: list[tuple[SearchState, int]] = []
        heap: list[tuple[Any, ...]] = []

        def persist_checkpoint(payload: Mapping[str, Any]) -> None:
            if checkpoint_path is None:
                return
            try:
                _write_checkpoint(checkpoint_path, payload)
            except OSError as exc:
                # A checkpoint is an acceleration artifact, not part of the
                # certificate. A transient sync-folder race must not discard a
                # mathematically valid candidate; the result records that the
                # requested resume point was not durably written.
                diagnostics.checkpoint_write_failures += 1
                diagnostics.checkpoint_last_error = str(exc)

        if resume:
            if checkpoint_path is None or not checkpoint_path.exists():
                raise CheckpointError("Resume requested without an existing checkpoint")
            states, deferred_states, best, diagnostics, complete = _load_checkpoint(
                checkpoint_path, problem, limits
            )
            for state in [*states, *deferred_states]:
                self._push(heap, state)
        else:
            root = SearchState(
                selected=(),
                available_mask=(1 << len(problem.modules)) - 1,
                joint_fixed_mask=problem.target_mask,
                product_degree=1,
            )
            self._push(heap, root)

        if complete:
            self._release_heap(heap)
            return self._result(best, diagnostics, True, best is not None)

        stop_for_budget = False
        processed_since_checkpoint = 0
        while heap:
            if best is not None and best.degree == problem.lower_bound:
                complete = True
                break
            state = self._pop(heap)
            if (
                state.selected
                and diagnostics.states_considered >= limits.max_combinations
            ):
                diagnostics.combination_cap_hit = True
                self._push(heap, state)
                stop_for_budget = True
                break

            if state.selected:
                diagnostics.states_considered += 1
            processed_since_checkpoint += 1
            uncovered = state.joint_fixed_mask & problem.target_mask
            if state.selected and state.product_degree >= problem.lower_bound:
                selected_modules = tuple(
                    problem.modules[index] for index in state.selected
                )
                try:
                    partition, candidate = enumerate_diagonal_orbits(
                        selected_modules,
                        problem.witnesses,
                        lower_bound=problem.lower_bound,
                        max_degree=limits.max_degree,
                        max_cartesian_points=limits.max_cartesian_points,
                        ledger=self.ledger,
                        module_indices=state.selected,
                    )
                except ResourceLimitReached as exc:
                    if exc.kind != "bytes":
                        raise
                    diagnostics.byte_cap_hits += 1
                    state_bytes = _state_size(state)
                    self.ledger.reserve(state_bytes, "deferred search frontier")
                    deferred.append((state, state_bytes))
                    continue
                diagnostics.factor_multisets_evaluated += 1
                diagnostics.covering_combinations_evaluated += int(uncovered == 0)
                diagnostics.diagonal_orbits_enumerated += partition.orbit_count
                diagnostics.cartesian_points_partitioned += partition.orbit_degree_sum
                diagnostics.degree_pruned_orbits += partition.degree_pruned_orbits
                diagnostics.witness_tested_orbits += partition.witness_tested_orbits
                diagnostics.witness_rejected_orbits += partition.witness_rejected_orbits
                diagnostics.exceptional_witness_free_orbits += (
                    partition.exceptional_witness_free_orbits
                )
                if len(state.selected) == 2:
                    diagnostics.double_coset_decompositions += 1
                elif len(state.selected) > 2:
                    diagnostics.iterated_orbit_decompositions += 1
                if candidate is not None and (
                    best is None or _candidate_order(candidate) < _candidate_order(best)
                ):
                    best = candidate
            if len(state.selected) >= limits.max_factors:
                diagnostics.factor_limit_prunes += 1
                continue
            if not self._optimistic_product_reaches_lower_bound(state):
                diagnostics.lower_bound_prunes += 1
                continue

            # Rarest-witness data orders promising branches but never removes
            # one.  Exceptional orbits are precisely why provider masks are
            # not a sound completeness prune.
            if uncovered and len(diagnostics.rarest_witness_trace) < 64:
                pivot = min(
                    _iter_bits(uncovered),
                    key=lambda witness: (
                        (
                            problem.provider_masks[witness] & state.available_mask
                        ).bit_count(),
                        witness,
                    ),
                )
                diagnostics.rarest_witness_trace.append(problem.witnesses[pivot].id)

            children: list[SearchState] = []
            for module_index in _iter_bits(state.available_mask):
                joint, product, selected = self._extend_intersection(
                    state, module_index, diagnostics
                )
                if product > limits.max_cartesian_points:
                    # maxCartesianPoints is part of the declared search domain.
                    # Every descendant is larger, so this multiset branch is
                    # outside scope rather than an unexamined in-scope result.
                    diagnostics.cartesian_scope_prunes += 1
                    continue
                # Keep this index available: self-products encode intersections
                # of conjugate point stabilizers.  Clearing lower indexes gives
                # one canonical nondecreasing representation of each multiset.
                suffix_mask = state.available_mask & ~((1 << module_index) - 1)
                children.append(
                    SearchState(
                        selected=selected,
                        available_mask=suffix_mask,
                        joint_fixed_mask=joint,
                        product_degree=product,
                    )
                )
            child_bytes = sum(_state_size(child) for child in children)
            if child_bytes > self.ledger.available:
                diagnostics.byte_cap_hits += 1
                state_bytes = _state_size(state)
                self.ledger.reserve(state_bytes, "deferred search frontier")
                deferred.append((state, state_bytes))
                continue
            for child in children:
                self._push(heap, child)
                diagnostics.branches_generated += 1

            diagnostics.peak_accounted_bytes = max(
                diagnostics.peak_accounted_bytes, self.ledger.peak
            )
            if (
                checkpoint_path is not None
                and processed_since_checkpoint >= limits.checkpoint_interval
            ):
                live_states = [entry[-2] for entry in heap]
                persist_checkpoint(
                    _checkpoint_payload(
                        problem,
                        limits,
                        live_states,
                        [state for state, _ in deferred],
                        best,
                        diagnostics,
                        False,
                    ),
                )
                processed_since_checkpoint = 0

        if best is not None and best.degree == problem.lower_bound:
            complete = True
        elif not heap and not deferred and not stop_for_budget:
            complete = True

        diagnostics.peak_accounted_bytes = max(
            diagnostics.peak_accounted_bytes, self.ledger.peak
        )
        live_states = [entry[-2] for entry in heap]
        if checkpoint_path is not None:
            persist_checkpoint(
                _checkpoint_payload(
                    problem,
                    limits,
                    [] if complete else live_states,
                    [] if complete else [state for state, _ in deferred],
                    best,
                    diagnostics,
                    complete,
                ),
            )
        self._release_heap(heap)
        for _, size in deferred:
            self.ledger.release(size)
        return self._result(
            best,
            diagnostics,
            complete,
            complete and best is not None,
        )

    def _result(
        self,
        best: OrbitCandidate | None,
        diagnostics: SearchDiagnostics,
        complete: bool,
        minimum_proved: bool,
    ) -> SolverResult:
        if best is not None:
            status = "candidate-found" if complete else "candidate-found-incomplete"
        else:
            status = "exhausted-within-bounds" if complete else "incomplete"
        limitations = (
            "Completeness is bounded by maxFactors, maxDegree, maxCartesianPoints, "
            "maxCombinations, and the byte budget recorded in diagnostics.",
            "Every in-scope module multiset and transitive diagonal orbit is tested; "
            "larger products remain outside the declared scope.",
            "A candidate is materialized and directly rechecked only on explicit request.",
        )
        diagnostic_json = asdict(diagnostics)
        diagnostic_json.update(
            {
                "modulesConsidered": len(self.problem.modules),
                "witnesses": len(self.problem.witnesses),
                "lowerBound": self.problem.lower_bound,
                "dominancePrunedModuleIds": list(
                    self.problem.dominance_pruned_module_ids
                ),
                "noncontributingModuleIds": list(
                    self.problem.noncontributing_module_ids
                ),
                "coxeterRelationsChecked": self.problem.coxeter_relations_checked,
                "mappedActionModules": sum(
                    module.action_source == "packed-row-major-spool"
                    for module in self.problem.modules
                ),
                "mappedActionBytes": sum(
                    module.mapped_bytes for module in self.problem.modules
                ),
                "mappedActionSources": [
                    {
                        "moduleId": module.id,
                        "path": module.spool_path,
                        "encoding": module.spool_encoding,
                        "degree": module.degree,
                        "generatorCount": module.rank,
                        "sha256": module.spool_sha256,
                        "bytes": module.mapped_bytes,
                    }
                    for module in self.problem.modules
                    if module.action_source == "packed-row-major-spool"
                ],
                "searchScope": "all-bounded-transitive-diagonal-orbits",
                "factorPolicy": "nondecreasing-module-multisets-with-repetition",
                "searchBounds": {
                    "maxFactors": self.limits.max_factors,
                    "maxDegree": self.limits.max_degree,
                    "maxCartesianPoints": self.limits.max_cartesian_points,
                    "maxCombinations": self.limits.max_combinations,
                    "maxBytes": self.limits.max_bytes,
                    "maxMappedBytes": self.limits.max_mapped_bytes,
                },
            }
        )
        return SolverResult(
            status=status,
            candidate=best,
            search_complete=complete,
            minimum_proved=minimum_proved,
            problem_sha256=self.problem.problem_sha256,
            diagnostics=diagnostic_json,
            limitations=limitations,
        )

    def materialize_candidate(self, candidate: OrbitCandidate) -> MaterializedAction:
        """Build and independently check rows for one previously selected orbit."""

        if candidate.module_indices != tuple(sorted(candidate.module_indices)):
            raise InputValidationError("Candidate module indices are not canonical")
        modules = tuple(
            self.problem.modules[index] for index in candidate.module_indices
        )
        cartesian_degree = math.prod(module.degree for module in modules)
        if cartesian_degree != candidate.cartesian_degree:
            raise InputValidationError("Candidate Cartesian degree is stale")
        code_type = _array_type_for_bound(cartesian_degree - 1)
        point_type = _array_type_for_bound(candidate.degree - 1)
        estimate = (
            cartesian_degree * array("i").itemsize
            + candidate.degree * array(code_type).itemsize
            + self.problem.rank * candidate.degree * array(point_type).itemsize
            + 2048
        )
        self.ledger.reserve(estimate, "candidate action materialization")
        try:
            index_by_code = array("i", [-1]) * cartesian_degree
            points = array(code_type, [0]) * candidate.degree
            points[0] = candidate.representative_code
            index_by_code[candidate.representative_code] = 0
            head = 0
            tail = 1
            while head < tail:
                code = points[head]
                head += 1
                for generator in range(self.problem.rank):
                    image = _diagonal_image(code, modules, generator)
                    if index_by_code[image] == -1:
                        if tail >= candidate.degree:
                            raise AssertionError(
                                "Materialized orbit exceeds recorded degree"
                            )
                        index_by_code[image] = tail
                        points[tail] = image
                        tail += 1
            if tail != candidate.degree:
                raise AssertionError(
                    f"Materialized {tail} points, expected {candidate.degree}"
                )

            rows: list[array] = []
            for generator in range(self.problem.rank):
                row = array(point_type, [0]) * candidate.degree
                for point_index, code in enumerate(points):
                    image_code = _diagonal_image(code, modules, generator)
                    target = index_by_code[image_code]
                    if target < 0:
                        raise AssertionError("Generator image left the selected orbit")
                    row[point_index] = target
                if any(row[row[point]] != point for point in range(candidate.degree)):
                    raise AssertionError("Materialized generator is not an involution")
                rows.append(row)

            fixed_counts: list[int] = []
            for witness in self.problem.witnesses:
                fixed = sum(
                    _apply_word(rows, witness.word, point) == point
                    for point in range(candidate.degree)
                )
                fixed_counts.append(fixed)
            if any(fixed_counts):
                failures = [
                    self.problem.witnesses[index].id
                    for index, count in enumerate(fixed_counts)
                    if count
                ]
                raise AssertionError(
                    "Stored orbit candidacy and direct fixed-point replay disagree for "
                    + ", ".join(failures)
                )
            digest = hashlib.sha256()
            digest.update(b"coxeter-materialized-composite-v1\0")
            digest.update(candidate.degree.to_bytes(8, "little"))
            digest.update(self.problem.rank.to_bytes(4, "little"))
            for row in rows:
                digest.update(_array_little_endian_bytes(row))
            actual_bytes = sys.getsizeof(points) + sum(
                sys.getsizeof(row) for row in rows
            )
            return MaterializedAction(
                candidate=candidate,
                generator_actions=tuple(rows),
                orbit_point_codes=points,
                witness_fixed_point_counts=tuple(fixed_counts),
                action_sha256=digest.hexdigest(),
                packed_bytes=actual_bytes,
            )
        finally:
            self.ledger.release(estimate)


def _write_integer_array(
    stream: TextIO, values: Sequence[int], chunk_size: int = 4096
) -> None:
    stream.write("[")
    first = True
    for start in range(0, len(values), chunk_size):
        chunk = values[start : start + chunk_size]
        text = ",".join(str(int(value)) for value in chunk)
        if text:
            if not first:
                stream.write(",")
            stream.write(text)
            first = False
    stream.write("]")


def write_materialized_action_json(
    path: Path,
    problem: PackedProblem,
    action: MaterializedAction,
) -> None:
    """Stream one passing action without constructing nested Python lists."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        prefix = {
            "schemaVersion": OUTPUT_SCHEMA_VERSION,
            "solver": {"id": SOLVER_ID, "version": SOLVER_VERSION},
            "problemSha256": problem.problem_sha256,
            "candidate": {
                **(_candidate_to_json(action.candidate) or {}),
                "actionMaterialized": True,
                "actionSha256": action.action_sha256,
                "witnessChecks": [
                    {
                        "witnessId": witness.id,
                        "fixedPointCount": action.witness_fixed_point_counts[index],
                        "passed": action.witness_fixed_point_counts[index] == 0,
                    }
                    for index, witness in enumerate(problem.witnesses)
                ],
            },
        }
        encoded = json.dumps(prefix, sort_keys=True, separators=(",", ":"))
        if not encoded.endswith("}"):
            raise AssertionError("JSON prefix serialization failed")
        stream.write(encoded[:-1])
        stream.write(',"generatorActions":[')
        for generator, row in enumerate(action.generator_actions):
            if generator:
                stream.write(",")
            _write_integer_array(stream, row)
        stream.write('],"orbitPointCodes":')
        _write_integer_array(stream, action.orbit_point_codes)
        stream.write("}\n")
    os.replace(temporary, path)


def _legacy_relation_checks(
    matrix: Sequence[Sequence[Any]], actions: Sequence[Sequence[int]]
) -> list[dict[str, Any]]:
    degree = len(actions[0])
    checks: list[dict[str, Any]] = []
    for generator, row in enumerate(actions):
        checks.append(
            {
                "kind": "involution",
                "generators": [generator, generator],
                "exponent": 2,
                "passed": all(row[row[point]] == point for point in range(degree)),
            }
        )
    for left in range(len(actions)):
        for right in range(left + 1, len(actions)):
            m = _finite_m(matrix[left][right])
            if m is None:
                continue
            passed = True
            for point in range(degree):
                image = point
                for _ in range(m):
                    image = actions[left][image]
                    image = actions[right][image]
                if image != point:
                    passed = False
                    break
            checks.append(
                {
                    "kind": "coxeter",
                    "generators": [left, right],
                    "exponent": m,
                    "passed": passed,
                }
            )
    return checks


def find_composite_action_compatible(
    modules: Sequence[Mapping[str, Any]],
    witnesses: Sequence[Mapping[str, Any]],
    matrix: Sequence[Sequence[Any]],
    bounds: Mapping[str, int],
    *,
    checkpoint_path: Path | None = None,
    resume: bool = False,
    spool_base_dir: Path | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Compatibility adapter for the existing discovery orchestrator.

    The four positional arguments match the old ``find_composite_action``
    boundary.  The adapter returns the old candidate keys so artifact assembly
    can switch implementations without a schema migration.  Rich packed-search
    diagnostics are added under ``packedSolver``.

    The existing boundary supplies witnesses produced by the exact GAP
    catalogue, so completeness is an input contract here just as it was in the
    prior implementation.  New callers should prefer ``prepare_problem`` and
    state catalogue completeness explicitly.
    """

    lower_bound = int(
        bounds.get(
            "torsionFreeDegreeDivisor",
            bounds.get("lowerBound", bounds.get("minimumDegreeDivisor", 1)),
        )
    )
    # maxIndex bounds the GAP module catalogue, not the degree of a composite.
    # The legacy solver used maxCongruenceImageOrder for its diagonal orbit.
    max_degree = int(
        bounds.get("maxCompositeDegree", bounds.get("maxCongruenceImageOrder", 100_000))
    )
    max_cartesian = int(bounds.get("maxCongruenceImageOrder", max_degree))
    limits = SolverLimits(
        max_bytes=int(bounds.get("maxPackedCompositeBytes", 512 * 1024 * 1024)),
        max_mapped_bytes=int(
            bounds.get("maxPackedActionBytes", 64 * 1024 * 1024 * 1024)
        ),
        max_combinations=int(bounds.get("maxCompositeCombinations", 20_000)),
        max_factors=int(bounds.get("maxCompositeModules", 4)),
        max_degree=max_degree,
        max_cartesian_points=max_cartesian,
        checkpoint_interval=int(bounds.get("compositeCheckpointInterval", 250)),
    )
    problem: PackedProblem | None = None
    try:
        problem = prepare_problem(
            modules,
            witnesses,
            witness_catalogue_complete=True,
            lower_bound=lower_bound,
            coxeter_matrix=matrix,
            spool_base_dir=spool_base_dir,
        )
        solver = PackedCompositeSolver(problem, limits)
        effective_resume = (
            resume and checkpoint_path is not None and checkpoint_path.exists()
        )
        result = solver.solve(checkpoint_path=checkpoint_path, resume=effective_resume)
    except PackedCompositeError as exc:
        if problem is not None:
            problem.close()
        return None, {
            "modulesConsidered": 0,
            "combinationsChecked": 0,
            "combinationCapReached": False,
            "rejectedModules": [str(exc)],
            "packedSolver": {
                "id": SOLVER_ID,
                "version": SOLVER_VERSION,
                "status": "invalid-input",
                "error": str(exc),
            },
        }

    diagnostics = {
        "modulesConsidered": len(problem.modules),
        "combinationsChecked": result.diagnostics["states_considered"],
        "combinationCapReached": result.diagnostics["combination_cap_hit"],
        "rejectedModules": [],
        "packedSolver": result.to_json(),
    }
    if result.candidate is None:
        problem.close()
        return None, diagnostics

    try:
        action = solver.materialize_candidate(result.candidate)
        materialized_rows = tuple(list(row) for row in action.generator_actions)
        relation_checks = _legacy_relation_checks(matrix, materialized_rows)
        if not all(check["passed"] for check in relation_checks):
            raise AssertionError("Materialized composite failed a Coxeter relation")
        witness_checks = [
            {
                "witnessId": witness.id,
                "word": list(witness.word),
                "primeOrder": witness.prime_order,
                "fixedPoints": [],
                "passed": fixed_count == 0,
            }
            for witness, fixed_count in zip(
                problem.witnesses, action.witness_fixed_point_counts
            )
        ]
        original_by_id = {str(module.get("id")): module for module in modules}
        selected_modules: list[dict[str, Any]] = []
        for module_index in result.candidate.module_indices:
            packed = problem.modules[module_index]
            raw = dict(original_by_id[packed.id])
            if packed.action_source == "packed-row-major-spool":
                packed_descriptor = {
                    "kind": "packed-row-major",
                    "path": packed.spool_path,
                    "encoding": packed.spool_encoding,
                    "degree": packed.degree,
                    "generatorCount": packed.rank,
                    "sha256": packed.spool_sha256,
                    "mappedBytes": packed.mapped_bytes,
                }
                raw["packedActionSource"] = packed_descriptor
                # Keep partial factors packed in the compatibility artifact.
                # Only the selected diagonal orbit above is materialized.
                raw["actions"] = packed_descriptor
            else:
                raw["actions"] = {
                    generator: list(row) for generator, row in enumerate(packed.actions)
                }
            raw["coverage"] = [
                witness.id
                for witness_index, witness in enumerate(problem.witnesses)
                if packed.free_mask & (1 << witness_index)
            ]
            raw["witnessChecks"] = {
                witness.id: {
                    "fixedPointFree": packed.fixed_point_counts[witness_index] == 0,
                    "fixedPointCount": packed.fixed_point_counts[witness_index],
                }
                for witness_index, witness in enumerate(problem.witnesses)
            }
            raw["relationChecks"] = _legacy_relation_checks(matrix, packed.actions)
            selected_modules.append(raw)

        degrees = tuple(
            module.degree
            for module in (
                problem.modules[index] for index in result.candidate.module_indices
            )
        )
        tuples = [
            _decode_tuple(int(code), degrees) for code in action.orbit_point_codes
        ]
        candidate = {
            "id": "composite:" + "+".join(result.candidate.module_ids),
            "degree": result.candidate.degree,
            "actions": {
                generator: row for generator, row in enumerate(materialized_rows)
            },
            "tuples": tuples,
            "modules": selected_modules,
            "coverage": [witness.id for witness in problem.witnesses],
            "relationChecks": relation_checks,
            "witnessChecks": witness_checks,
            "cartesianDegreeBound": result.candidate.cartesian_degree,
            "packedSolver": {
                "actionSha256": action.action_sha256,
                "representativeTuple": list(result.candidate.representative_tuple),
                "orbitIndex": result.candidate.orbit_index,
                "decompositionKind": result.candidate.decomposition_kind,
                "searchComplete": result.search_complete,
                "minimumWithinBoundedOrbitScope": result.minimum_proved,
                "minimumProved": result.minimum_proved,
            },
        }
        return candidate, diagnostics
    finally:
        problem.close()


# A descriptive alias makes the intended replacement explicit at integration
# sites while ``find_composite_action_compatible`` documents schema stability.
find_composite_action_packed = find_composite_action_compatible


def _problem_from_json(
    raw: Mapping[str, Any], *, spool_base_dir: Path | None = None
) -> PackedProblem:
    catalogue = raw.get("witnessCatalogue", {})
    witnesses = catalogue.get("witnesses", raw.get("witnesses", []))
    complete = bool(
        catalogue.get("complete", raw.get("witnessCatalogueComplete", False))
    )
    lower_bound = int(raw.get("lowerBound", 0))
    return prepare_problem(
        raw.get("modules", []),
        witnesses,
        witness_catalogue_complete=complete,
        lower_bound=lower_bound,
        coxeter_matrix=raw.get("coxeterMatrix"),
        spool_base_dir=spool_base_dir,
    )


def _validated_execution_binding(
    raw: Mapping[str, Any], args: argparse.Namespace
) -> dict[str, Any]:
    binding = raw.get("executionBinding")
    if not isinstance(binding, Mapping):
        raise InputValidationError("The solver problem has no execution binding")
    run_key = binding.get("runKey")
    solver = binding.get("solver")
    bounds = binding.get("bounds")
    if (
        not isinstance(run_key, str)
        or len(run_key) != 64
        or any(character not in "0123456789abcdef" for character in run_key)
    ):
        raise InputValidationError("The solver runKey is not a SHA-256 digest")
    expected_solver = {
        "id": SOLVER_ID,
        "version": SOLVER_VERSION,
        "sourceSha256": SOLVER_SOURCE_SHA256,
    }
    if solver != expected_solver:
        raise InputValidationError("The solver implementation binding is stale")
    expected_bounds = {
        "maxBytes": args.max_bytes,
        "maxMappedBytes": args.max_mapped_bytes,
        "maxCombinations": args.max_combinations,
        "maxFactors": args.max_factors,
        "maxDegree": args.max_degree,
        "maxCartesianPoints": args.max_cartesian_points,
        "checkpointInterval": args.checkpoint_interval,
    }
    if bounds != expected_bounds:
        raise InputValidationError("The solver CLI bounds differ from the problem")

    def resolved_path(path: Path | None) -> str | None:
        return str(path.resolve()) if path is not None else None

    return {
        "runKey": run_key,
        "phase": "materialize" if args.materialize_action is not None else "search",
        "problemArtifactSha256": _sha256_json(raw),
        "problemPath": resolved_path(args.input),
        "resultPath": resolved_path(args.output),
        "materializedActionPath": resolved_path(args.materialize_action),
        "solver": expected_solver,
        "bounds": expected_bounds,
    }


class PackedCompositeSelfTest(unittest.TestCase):
    def setUp(self) -> None:
        self.matrix = [[1, 2], [2, 1]]
        self.witnesses = [
            {"id": "a", "word": [0], "primeOrder": 2},
            {"id": "ab", "word": [0, 1], "primeOrder": 2},
            {"id": "b", "word": [1], "primeOrder": 2},
        ]
        self.first = {
            "id": "first-factor",
            "degree": 2,
            "actions": {"0": [1, 0], "1": [0, 1]},
        }
        self.second = {
            "id": "second-factor",
            "degree": 2,
            "actions": {"0": [0, 1], "1": [1, 0]},
        }

    def make_problem(
        self, modules: Sequence[Mapping[str, Any]] | None = None
    ) -> PackedProblem:
        return prepare_problem(
            modules or [self.second, self.first],
            self.witnesses,
            witness_catalogue_complete=True,
            lower_bound=4,
            coxeter_matrix=self.matrix,
        )

    @staticmethod
    def write_spool(
        directory: Path,
        name: str,
        rows: Sequence[Sequence[int]],
        encoding: str,
    ) -> tuple[Path, str]:
        _, width = PACKED_ACTION_ENCODINGS[encoding]
        payload = b"".join(
            int(value).to_bytes(width, "little", signed=False)
            for row in rows
            for value in row
        )
        path = directory / name
        path.write_bytes(payload)
        return path, hashlib.sha256(payload).hexdigest()

    def test_packed_cover_search_and_delayed_materialization(self) -> None:
        problem = self.make_problem()
        solver = PackedCompositeSolver(
            problem,
            SolverLimits(max_bytes=8_000_000, max_combinations=64),
        )
        result = solver.solve()
        self.assertEqual(result.status, "candidate-found")
        self.assertTrue(result.minimum_proved)
        self.assertEqual(result.candidate.degree, 4)  # type: ignore[union-attr]
        self.assertNotIn("generatorActions", result.to_json()["candidate"])
        action = solver.materialize_candidate(result.candidate)  # type: ignore[arg-type]
        self.assertEqual(action.witness_fixed_point_counts, (0, 0, 0))
        self.assertEqual(
            [list(row) for row in action.generator_actions],
            [[1, 0, 3, 2], [2, 3, 0, 1]],
        )

    def test_all_double_coset_orbits_are_enumerated(self) -> None:
        one_generator_problem = prepare_problem(
            [
                {
                    "id": "flip",
                    "degree": 2,
                    "generatorImages": [[1, 0]],
                }
            ],
            [{"id": "flip-witness", "word": [0], "primeOrder": 2}],
            witness_catalogue_complete=True,
            lower_bound=2,
            coxeter_matrix=[[1]],
        )
        module = one_generator_problem.modules[0]
        summary, _ = enumerate_diagonal_orbits(
            [module, module],
            one_generator_problem.witnesses,
            lower_bound=2,
            max_degree=4,
            max_cartesian_points=16,
            ledger=ByteLedger(1_000_000),
            module_indices=(0, 0),
        )
        self.assertEqual(summary.decomposition_kind, "double-coset-diagonal-orbits")
        self.assertEqual(summary.orbit_count, 2)
        self.assertEqual(summary.orbit_degree_sum, 4)
        self.assertEqual(summary.minimum_orbit_degree, 2)

    def test_nonzero_double_coset_orbit_can_be_selected(self) -> None:
        a2 = prepare_problem(
            [
                {
                    "id": "a2-natural",
                    "degree": 3,
                    "generatorImages": [[1, 0, 2], [0, 2, 1]],
                }
            ],
            [
                {"id": "left-reflection", "word": [0], "primeOrder": 2},
                {"id": "right-reflection", "word": [1], "primeOrder": 2},
            ],
            witness_catalogue_complete=True,
            lower_bound=3,
            coxeter_matrix=[[1, 3], [3, 1]],
        )
        module = a2.modules[0]
        summary, candidate = enumerate_diagonal_orbits(
            [module, module],
            a2.witnesses,
            lower_bound=6,
            max_degree=9,
            max_cartesian_points=16,
            ledger=ByteLedger(1_000_000),
            module_indices=(0, 0),
        )
        self.assertEqual(summary.orbit_count, 2)
        self.assertEqual(summary.exceptional_witness_free_orbits, 1)
        self.assertEqual(candidate.degree, 6)  # type: ignore[union-attr]
        self.assertNotEqual(candidate.representative_tuple, (0, 0))  # type: ignore[union-attr]

        # Neither natural factor is free on either reflection.  The solver
        # must nevertheless find the off-diagonal six-point orbit.
        self.assertEqual(module.free_mask, 0)
        result = PackedCompositeSolver(
            a2,
            SolverLimits(
                max_bytes=1_000_000,
                max_combinations=16,
                max_factors=2,
                max_degree=9,
                max_cartesian_points=16,
            ),
        ).solve()
        self.assertEqual(result.status, "candidate-found")
        self.assertEqual(result.candidate.degree, 6)  # type: ignore[union-attr]
        self.assertEqual(result.diagnostics["exceptional_witness_free_orbits"], 1)

    def test_exact_duplicate_dominance_is_sound(self) -> None:
        duplicate = {**self.first, "id": "z-duplicate"}
        problem = self.make_problem([duplicate, self.second, self.first])
        self.assertEqual(problem.dominance_pruned_module_ids, ("z-duplicate",))
        self.assertEqual(
            [module.id for module in problem.modules], ["first-factor", "second-factor"]
        )

    def test_checkpoint_frontier_resumes_deterministically(self) -> None:
        problem = self.make_problem()
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "search.checkpoint.json"
            first_solver = PackedCompositeSolver(
                problem,
                SolverLimits(max_bytes=8_000_000, max_combinations=1),
            )
            partial = first_solver.solve(checkpoint_path=checkpoint)
            self.assertEqual(partial.status, "incomplete")
            resumed_solver = PackedCompositeSolver(
                problem,
                SolverLimits(max_bytes=8_000_000, max_combinations=64),
            )
            resumed = resumed_solver.solve(checkpoint_path=checkpoint, resume=True)
            fresh = PackedCompositeSolver(
                problem,
                SolverLimits(max_bytes=8_000_000, max_combinations=64),
            ).solve()
            self.assertEqual(resumed.candidate, fresh.candidate)
            self.assertTrue(resumed.minimum_proved)

    def test_byte_budget_fails_closed(self) -> None:
        problem = self.make_problem()
        solver = PackedCompositeSolver(
            problem,
            SolverLimits(max_bytes=1_500, max_combinations=64),
        )
        result = solver.solve()
        self.assertEqual(result.status, "incomplete")
        self.assertGreater(result.diagnostics["byte_cap_hits"], 0)
        self.assertIsNone(result.candidate)

    def test_streamed_materialized_output_round_trips(self) -> None:
        problem = self.make_problem()
        solver = PackedCompositeSolver(
            problem,
            SolverLimits(max_bytes=8_000_000, max_combinations=64),
        )
        result = solver.solve()
        action = solver.materialize_candidate(result.candidate)  # type: ignore[arg-type]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "action.json"
            write_materialized_action_json(output, problem, action)
            parsed = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(parsed["candidate"]["degree"], 4)
        self.assertEqual(parsed["generatorActions"][0], [1, 0, 3, 2])
        self.assertTrue(
            all(check["passed"] for check in parsed["candidate"]["witnessChecks"])
        )

    def test_verified_binary_spools_solve_without_json_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            first_path, first_hash = self.write_spool(
                directory, "first.u16", [[1, 0], [0, 1]], "uint16-le"
            )
            second_path, second_hash = self.write_spool(
                directory, "second.u32", [[0, 1], [1, 0]], "uint32-le"
            )
            modules = [
                {
                    "id": "first-factor",
                    "actions": {
                        "kind": "packed-row-major",
                        "path": first_path.name,
                        "encoding": "uint16-le",
                        "degree": 2,
                        "generatorCount": 2,
                        "sha256": first_hash,
                    },
                },
                {
                    "id": "second-factor",
                    "packedActions": {
                        "path": second_path.name,
                        "encoding": "uint32-le",
                        "degree": 2,
                        "generatorCount": 2,
                        "sha256": second_hash,
                    },
                },
            ]
            problem = prepare_problem(
                modules,
                self.witnesses,
                witness_catalogue_complete=True,
                lower_bound=4,
                coxeter_matrix=self.matrix,
                spool_base_dir=directory,
            )
            self.assertEqual(
                {module.action_source for module in problem.modules},
                {"packed-row-major-spool"},
            )
            self.assertEqual(sum(module.mapped_bytes for module in problem.modules), 24)
            inline_hashes = {
                module.id: module.action_sha256
                for module in self.make_problem().modules
            }
            self.assertEqual(
                {module.id: module.action_sha256 for module in problem.modules},
                inline_hashes,
            )
            result = PackedCompositeSolver(
                problem,
                SolverLimits(max_bytes=8_000_000, max_combinations=64),
            ).solve()
            self.assertEqual(result.candidate.degree, 4)  # type: ignore[union-attr]
            self.assertEqual(result.diagnostics["mappedActionModules"], 2)
            problem.close()

            candidate, diagnostics = find_composite_action_compatible(
                modules,
                self.witnesses,
                self.matrix,
                {
                    "maxCompositeModules": 4,
                    "maxCompositeCombinations": 64,
                    "maxCongruenceImageOrder": 16,
                    "torsionFreeDegreeDivisor": 4,
                    "maxPackedCompositeBytes": 8_000_000,
                },
                spool_base_dir=directory,
            )
            self.assertEqual(candidate["degree"], 4)  # type: ignore[index]
            self.assertEqual(
                {module["actions"]["kind"] for module in candidate["modules"]},  # type: ignore[index]
                {"packed-row-major"},
            )
            self.assertEqual(
                diagnostics["packedSolver"]["diagnostics"]["mappedActionModules"],
                2,
            )

    def test_spool_hash_and_length_are_checked_before_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            path, digest = self.write_spool(directory, "flip.u8", [[1, 0]], "uint8")
            descriptor = {
                "id": "flip",
                "actionSpool": {
                    "path": path.name,
                    "encoding": "uint8",
                    "degree": 2,
                    "generatorCount": 1,
                    "sha256": "0" * 64,
                },
            }
            with self.assertRaisesRegex(InputValidationError, "sha256 mismatch"):
                prepare_problem(
                    [descriptor],
                    [{"id": "flip-witness", "word": [0], "primeOrder": 2}],
                    witness_catalogue_complete=True,
                    lower_bound=2,
                    coxeter_matrix=[[1]],
                    spool_base_dir=directory,
                )
            descriptor["actionSpool"]["sha256"] = digest  # type: ignore[index]
            descriptor["actionSpool"]["degree"] = 3  # type: ignore[index]
            with self.assertRaisesRegex(InputValidationError, "expected exactly 3"):
                prepare_problem(
                    [descriptor],
                    [{"id": "flip-witness", "word": [0], "primeOrder": 2}],
                    witness_catalogue_complete=True,
                    lower_bound=2,
                    coxeter_matrix=[[1]],
                    spool_base_dir=directory,
                )

            invalid_path, invalid_hash = self.write_spool(
                directory, "not-a-permutation.u8", [[0, 0]], "uint8"
            )
            with self.assertRaisesRegex(InputValidationError, "not bijective"):
                prepare_problem(
                    [
                        {
                            "id": "invalid",
                            "actions": {
                                "path": invalid_path.name,
                                "encoding": "uint8",
                                "degree": 2,
                                "generatorCount": 1,
                                "sha256": invalid_hash,
                            },
                        }
                    ],
                    [{"id": "flip-witness", "word": [0], "primeOrder": 2}],
                    witness_catalogue_complete=True,
                    lower_bound=2,
                    coxeter_matrix=[[1]],
                    spool_base_dir=directory,
                )
            invalid_path.unlink()
            self.assertFalse(invalid_path.exists())

    def test_legacy_adapter_preserves_candidate_shape(self) -> None:
        candidate, diagnostics = find_composite_action_compatible(
            [self.second, self.first],
            self.witnesses,
            self.matrix,
            {
                "maxCompositeModules": 4,
                "maxCompositeCombinations": 64,
                "maxCongruenceImageOrder": 16,
                "maxIndex": 1,
                "torsionFreeDegreeDivisor": 4,
                "maxPackedCompositeBytes": 8_000_000,
            },
        )
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["degree"], 4)  # type: ignore[index]
        self.assertEqual(candidate["cartesianDegreeBound"], 4)  # type: ignore[index]
        self.assertEqual(sorted(candidate["actions"]), [0, 1])  # type: ignore[index]
        self.assertEqual(candidate["coverage"], ["a", "ab", "b"])  # type: ignore[index]
        self.assertIn("packedSolver", diagnostics)
        self.assertTrue(diagnostics["packedSolver"]["minimumProved"])

    def test_search_summary_is_deterministic(self) -> None:
        problem = self.make_problem()
        limits = SolverLimits(max_bytes=8_000_000, max_combinations=64)
        first = PackedCompositeSolver(problem, limits).solve().to_json()
        second = PackedCompositeSolver(problem, limits).solve().to_json()
        self.assertEqual(_canonical_json(first), _canonical_json(second))
        self.assertEqual(first["diagnostics"]["rarest_witness_trace"][0], "a")

    def test_nonprime_witness_order_is_rejected(self) -> None:
        with self.assertRaisesRegex(InputValidationError, "prime order"):
            prepare_problem(
                [self.first],
                [{"id": "bad", "word": [0], "primeOrder": 4}],
                witness_catalogue_complete=True,
                lower_bound=2,
                coxeter_matrix=self.matrix,
            )


def _run_self_test() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PackedCompositeSelfTest)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Composite module problem JSON")
    parser.add_argument(
        "--output", type=Path, help="Write deterministic search summary JSON"
    )
    parser.add_argument(
        "--checkpoint", type=Path, help="Atomic resumable frontier checkpoint"
    )
    parser.add_argument(
        "--resume", action="store_true", help="Resume the checkpoint frontier"
    )
    parser.add_argument(
        "--materialize-action",
        type=Path,
        help="After finding a candidate, stream its full action to this JSON file",
    )
    parser.add_argument("--max-bytes", type=int, default=512 * 1024 * 1024)
    parser.add_argument("--max-mapped-bytes", type=int, default=64 * 1024 * 1024 * 1024)
    parser.add_argument("--max-combinations", type=int, default=100_000)
    parser.add_argument("--max-factors", type=int, default=8)
    parser.add_argument("--max-degree", type=int, default=1_000_000)
    parser.add_argument("--max-cartesian-points", type=int, default=8_000_000)
    parser.add_argument("--checkpoint-interval", type=int, default=250)
    parser.add_argument("--self-test", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.self_test:
        return _run_self_test()
    if args.input is None:
        raise SystemExit("--input is required unless --self-test is used")
    raw = json.loads(args.input.read_text(encoding="utf-8"))
    execution_binding = _validated_execution_binding(raw, args)
    problem = _problem_from_json(raw, spool_base_dir=args.input.parent.resolve())
    try:
        limits = SolverLimits(
            max_bytes=args.max_bytes,
            max_mapped_bytes=args.max_mapped_bytes,
            max_combinations=args.max_combinations,
            max_factors=args.max_factors,
            max_degree=args.max_degree,
            max_cartesian_points=args.max_cartesian_points,
            checkpoint_interval=args.checkpoint_interval,
        )
        solver = PackedCompositeSolver(problem, limits)
        result = solver.solve(checkpoint_path=args.checkpoint, resume=args.resume)
        summary = result.to_json()
        execution_binding.update(
            {
                "terminalStatus": result.status,
                "searchComplete": result.search_complete,
                "hasCandidate": result.candidate is not None,
                "expectedReturnCode": 0 if result.candidate is not None else 2,
            }
        )
        summary["executionBinding"] = execution_binding
        summary["resultSha256"] = _sha256_json(summary)
        encoded = json.dumps(summary, indent=2, sort_keys=True) + "\n"
        if args.output is not None:
            _write_checkpoint(args.output, summary)
        else:
            sys.stdout.write(encoded)
        if args.materialize_action is not None:
            if result.candidate is None:
                raise SystemExit("No passing candidate is available to materialize")
            action = solver.materialize_candidate(result.candidate)
            write_materialized_action_json(args.materialize_action, problem, action)
        return 0 if result.candidate is not None else 2
    finally:
        problem.close()


if __name__ == "__main__":
    raise SystemExit(main())
