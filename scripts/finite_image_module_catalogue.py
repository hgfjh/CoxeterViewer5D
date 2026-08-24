#!/usr/bin/env python3
"""Deterministic catalogues of exact finite-image permutation modules.

A catalogue entry is a transitive action of an exact finite Coxeter image.  It
records which prime-order torsion witnesses act without fixed points, but a
partial entry is not itself a torsion-free cover.  Composite-action searches
may reuse these entries only when the source system, Coxeter matrix, and
witness catalogue hashes agree.

Packed permutation rows live outside the JSON catalogue.  Their descriptors
use content-addressed storage keys, so scratch-directory names do not enter a
certificate hash.  Consumers should call :func:`verify_packed_rows_file`
before reading a blob from disk.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "finite-image-partial-module-catalogue"
BUILDER_VERSION = "1.0.0"
MODULE_STATUSES = frozenset({"partial", "torsion-free"})
EXACT_CHECK_FIELDS = ("transitive", "coxeterRelations", "fixedPointCoverage")


class CatalogueError(ValueError):
    """Base class for catalogue contract failures."""


class StaleCatalogueError(CatalogueError):
    """Raised when a catalogue belongs to different mathematical input."""


class IncompleteCatalogueError(CatalogueError):
    """Raised when a proof-producing consumer receives partial enumeration."""


class IncompatibleCatalogueError(CatalogueError):
    """Raised when exact module catalogues cannot be merged safely."""


class CatalogueBudgetExceeded(CatalogueError):
    """Raised instead of silently dropping modules to meet a byte budget."""


def canonical_json(value: Any) -> str:
    """Serialize certificate data with a stable, finite-number-only encoding."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CatalogueError(f"Catalogue data is not canonical JSON: {exc}") from exc


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf8"))


def _canonical_copy(value: Any) -> Any:
    return json.loads(canonical_json(value))


def _require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise CatalogueError(f"{field} must be a 64-character SHA-256 hash.")
    if any(character not in "0123456789abcdef" for character in value):
        raise CatalogueError(f"{field} must contain lowercase hexadecimal digits.")
    return value


def _require_positive_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise CatalogueError(f"{field} must be a positive integer.")
    return value


def _require_nonnegative_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CatalogueError(f"{field} must be a nonnegative integer.")
    return value


def _require_nonempty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CatalogueError(f"{field} must be a nonempty string.")
    return value


def _require_object(value: Any, field: str) -> dict[str, Any]:
    copied = _canonical_copy(value)
    if not isinstance(copied, dict) or not copied:
        raise CatalogueError(f"{field} must be a nonempty object.")
    return copied


def _hashes(
    source_sha256: str, matrix_sha256: str, witness_sha256: str
) -> dict[str, str]:
    return {
        "sourceSha256": _require_sha256(source_sha256, "sourceSha256"),
        "matrixSha256": _require_sha256(matrix_sha256, "matrixSha256"),
        "witnessSha256": _require_sha256(witness_sha256, "witnessSha256"),
    }


def build_fixed_point_coverage(
    covered_witness_indexes: Iterable[int],
    witness_count: int,
    witness_sha256: str,
) -> dict[str, Any]:
    """Pack fixed-point-free witness indexes into a canonical little-bitset.

    Bit ``i`` is one precisely when witness ``i`` has no fixed point in the
    transitive action.  The digest also binds the witness catalogue and its
    length; the same bytes cannot be reused with a reordered witness list.
    """

    count = _require_positive_integer(witness_count, "witnessCount")
    witness_hash = _require_sha256(witness_sha256, "witnessSha256")
    indexes: set[int] = set()
    for value in covered_witness_indexes:
        index = _require_nonnegative_integer(value, "covered witness index")
        if index >= count:
            raise CatalogueError(
                f"Covered witness index {index} is outside witnessCount={count}."
            )
        indexes.add(index)
    bits = bytearray((count + 7) // 8)
    for index in indexes:
        bits[index // 8] |= 1 << (index % 8)
    bitset_hex = bytes(bits).hex()
    digest = sha256_json(
        {
            "encoding": "lsb0-hex",
            "witnessSha256": witness_hash,
            "witnessCount": count,
            "bitsetHex": bitset_hex,
        }
    )
    return {
        "encoding": "lsb0-hex",
        "witnessCount": count,
        "bitsetHex": bitset_hex,
        "coveredCount": len(indexes),
        "sha256": digest,
    }


def coverage_indexes(
    coverage: Mapping[str, Any], witness_sha256: str
) -> tuple[int, ...]:
    """Validate and decode a fixed-point coverage record."""

    if not isinstance(coverage, Mapping):
        raise CatalogueError("fixedPointCoverage must be an object.")
    if coverage.get("encoding") != "lsb0-hex":
        raise CatalogueError("fixedPointCoverage has an unsupported encoding.")
    count = _require_positive_integer(
        coverage.get("witnessCount"), "fixedPointCoverage.witnessCount"
    )
    bitset_hex = coverage.get("bitsetHex")
    if not isinstance(bitset_hex, str):
        raise CatalogueError("fixedPointCoverage.bitsetHex must be a string.")
    expected_hex_length = 2 * ((count + 7) // 8)
    if len(bitset_hex) != expected_hex_length:
        raise CatalogueError("fixedPointCoverage.bitsetHex has a noncanonical length.")
    try:
        bits = bytes.fromhex(bitset_hex)
    except ValueError as exc:
        raise CatalogueError(
            "fixedPointCoverage.bitsetHex is not hexadecimal."
        ) from exc
    if bitset_hex != bitset_hex.lower():
        raise CatalogueError("fixedPointCoverage.bitsetHex must be lowercase.")
    unused = len(bits) * 8 - count
    if unused and bits[-1] >> (8 - unused):
        raise CatalogueError("Unused fixed-point coverage bits must be zero.")
    indexes = tuple(
        index for index in range(count) if bits[index // 8] & (1 << (index % 8))
    )
    if coverage.get("coveredCount") != len(indexes):
        raise CatalogueError("fixedPointCoverage.coveredCount is inconsistent.")
    expected = build_fixed_point_coverage(indexes, count, witness_sha256)
    if coverage.get("sha256") != expected["sha256"]:
        raise CatalogueError("fixedPointCoverage digest is stale or corrupt.")
    return indexes


def packed_row_width(degree: int) -> tuple[str, int]:
    """Return the canonical encoding for zero-based points of this degree."""

    value = _require_positive_integer(degree, "degree")
    if value <= 0xFFFF:
        return "uint16-le", 2
    if value <= 0xFFFFFFFF:
        return "uint32-le", 4
    raise CatalogueError("Packed permutation degree exceeds uint32 storage.")


def build_packed_row_descriptor(
    *,
    degree: int,
    generator_count: int,
    packed_sha256: str,
    byte_length: int | None = None,
    source_generator_order: Sequence[int] | None = None,
) -> dict[str, Any]:
    """Describe row-major generator permutations without embedding the bytes."""

    degree_value = _require_positive_integer(degree, "degree")
    generators = _require_positive_integer(generator_count, "generatorCount")
    digest = _require_sha256(packed_sha256, "packed rows sha256")
    encoding, width = packed_row_width(degree_value)
    expected_bytes = degree_value * generators * width
    if (
        byte_length is not None
        and _require_nonnegative_integer(byte_length, "byteLength") != expected_bytes
    ):
        raise CatalogueError(
            f"Packed row byteLength must be {expected_bytes} for this action."
        )
    order = (
        list(range(generators))
        if source_generator_order is None
        else [int(value) for value in source_generator_order]
    )
    if order != list(range(generators)):
        raise CatalogueError(
            "sourceGeneratorOrder must preserve the ordered Coxeter generators."
        )
    return {
        "kind": "packed-permutation-rows",
        "encoding": encoding,
        "rowMajor": True,
        "zeroBasedPoints": True,
        "generatorCount": generators,
        "sourceGeneratorOrder": order,
        "degree": degree_value,
        "sha256": digest,
        "byteLength": expected_bytes,
        "storageKey": f"packed/{digest}.permutations.bin",
    }


def _validate_packed_descriptor(
    descriptor: Mapping[str, Any], expected_degree: int, generator_count: int
) -> dict[str, Any]:
    if not isinstance(descriptor, Mapping):
        raise CatalogueError("packedPermutationRows must be an object.")
    rebuilt = build_packed_row_descriptor(
        degree=expected_degree,
        generator_count=generator_count,
        packed_sha256=descriptor.get("sha256"),
        byte_length=descriptor.get("byteLength"),
        source_generator_order=descriptor.get("sourceGeneratorOrder"),
    )
    if _canonical_copy(descriptor) != rebuilt:
        raise CatalogueError("packedPermutationRows is not a canonical descriptor.")
    return rebuilt


def verify_packed_rows_file(
    descriptor: Mapping[str, Any], storage_root: str | Path
) -> Path:
    """Verify a content-addressed packed action before an exact computation."""

    degree = _require_positive_integer(descriptor.get("degree"), "degree")
    generators = _require_positive_integer(
        descriptor.get("generatorCount"), "generatorCount"
    )
    checked = _validate_packed_descriptor(descriptor, degree, generators)
    key = PurePosixPath(checked["storageKey"])
    if key.is_absolute() or ".." in key.parts:
        raise CatalogueError("Packed row storageKey must remain inside storage_root.")
    root = Path(storage_root).resolve()
    path = root.joinpath(*key.parts).resolve()
    if root != path and root not in path.parents:
        raise CatalogueError("Packed row path escaped storage_root.")
    if not path.is_file():
        raise CatalogueError(f"Packed row blob is missing: {checked['storageKey']}")
    if path.stat().st_size != checked["byteLength"]:
        raise CatalogueError(
            "Packed row blob byte length does not match its descriptor."
        )
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != checked["sha256"]:
        raise CatalogueError("Packed row blob digest does not match its descriptor.")
    return path


def build_finite_image_record(
    *,
    image_id: str,
    characteristic: int,
    finite_image_sha256: str,
    order: int,
    origin: Mapping[str, Any],
) -> dict[str, Any]:
    """Record an exact finite image; recognition names remain diagnostic."""

    return {
        "id": _require_nonempty_string(image_id, "finite image id"),
        "characteristic": _require_positive_integer(
            characteristic, "finite image characteristic"
        ),
        "sha256": _require_sha256(finite_image_sha256, "finiteImageSha256"),
        "order": _require_positive_integer(order, "finite image order"),
        "origin": _require_object(origin, "finite image origin"),
        "status": "exact",
    }


def _validate_finite_image(record: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(record, Mapping):
        raise CatalogueError("Each finiteImages entry must be an object.")
    rebuilt = build_finite_image_record(
        image_id=record.get("id"),
        characteristic=record.get("characteristic"),
        finite_image_sha256=record.get("sha256"),
        order=record.get("order"),
        origin=record.get("origin"),
    )
    if _canonical_copy(record) != rebuilt:
        raise CatalogueError("A finite image record is not canonical and exact.")
    return rebuilt


def _provenance_key(record: Mapping[str, Any]) -> str:
    return canonical_json(record)


def _module_core(module: Mapping[str, Any]) -> dict[str, Any]:
    descriptor = dict(module["packedPermutationRows"])
    descriptor.pop("storageKey", None)
    hashes = module["inputHashes"]
    return {
        "sourceSha256": hashes["sourceSha256"],
        "matrixSha256": hashes["matrixSha256"],
        "witnessSha256": hashes["witnessSha256"],
        "degree": module["degree"],
        "packedPermutationRows": descriptor,
        "fixedPointCoverage": module["fixedPointCoverage"],
        "status": module["status"],
        "exactChecks": module["exactChecks"],
    }


def build_module_record(
    *,
    source_sha256: str,
    matrix_sha256: str,
    witness_sha256: str,
    finite_image_sha256: str,
    finite_image_id: str,
    characteristic: int,
    degree: int,
    origin: Mapping[str, Any],
    subgroup_fingerprint: str,
    packed_rows: Mapping[str, Any],
    fixed_point_coverage: Mapping[str, Any],
    status: str = "partial",
    exact_checks: Mapping[str, bool] | None = None,
) -> dict[str, Any]:
    """Create one exact transitive action record.

    ``status='partial'`` makes no torsion-free claim.  ``torsion-free`` is
    accepted only when every witness is covered; downstream code may still
    require its independent spherical-orbit certificate.
    """

    hashes = _hashes(source_sha256, matrix_sha256, witness_sha256)
    image_hash = _require_sha256(finite_image_sha256, "finiteImageSha256")
    degree_value = _require_positive_integer(degree, "module degree")
    generator_count = _require_positive_integer(
        packed_rows.get("generatorCount"), "generatorCount"
    )
    descriptor = _validate_packed_descriptor(packed_rows, degree_value, generator_count)
    coverage = _canonical_copy(fixed_point_coverage)
    covered = coverage_indexes(coverage, hashes["witnessSha256"])
    if status not in MODULE_STATUSES:
        raise CatalogueError(f"Unsupported module status: {status!r}.")
    if status == "torsion-free" and len(covered) != coverage["witnessCount"]:
        raise CatalogueError("A torsion-free module must cover every witness.")
    checks = (
        {field: True for field in EXACT_CHECK_FIELDS}
        if exact_checks is None
        else {str(key): value for key, value in exact_checks.items()}
    )
    if set(checks) != set(EXACT_CHECK_FIELDS) or any(
        checks[field] is not True for field in EXACT_CHECK_FIELDS
    ):
        raise CatalogueError(
            "Exact module checks must pass transitivity, Coxeter relations, "
            "and fixed-point coverage."
        )
    provenance = {
        "finiteImageId": _require_nonempty_string(finite_image_id, "finite image id"),
        "finiteImageSha256": image_hash,
        "characteristic": _require_positive_integer(
            characteristic, "finite image characteristic"
        ),
        "subgroupFingerprint": _require_sha256(
            subgroup_fingerprint, "subgroupFingerprint"
        ),
        "origin": _require_object(origin, "module origin"),
    }
    module: dict[str, Any] = {
        "inputHashes": {**hashes, "finiteImageSha256": image_hash},
        "degree": degree_value,
        "origin": provenance["origin"],
        "subgroupFingerprint": provenance["subgroupFingerprint"],
        "packedPermutationRows": descriptor,
        "fixedPointCoverage": coverage,
        "status": status,
        "exactChecks": checks,
        "provenance": [provenance],
    }
    module_hash = sha256_json(_module_core(module))
    module["moduleSha256"] = module_hash
    module["id"] = f"fimod-{module_hash[:20]}"
    return module


def _validate_module(
    module: Mapping[str, Any],
    *,
    catalogue_hashes: Mapping[str, str],
    witness_count: int,
    source_generator_count: int,
    finite_images: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    if not isinstance(module, Mapping):
        raise CatalogueError("Each modules entry must be an object.")
    input_hashes = module.get("inputHashes")
    if not isinstance(input_hashes, Mapping):
        raise CatalogueError("A module is missing inputHashes.")
    for field, expected in catalogue_hashes.items():
        actual = _require_sha256(input_hashes.get(field), f"module {field}")
        if actual != expected:
            raise StaleCatalogueError(f"A module has a stale {field}.")
    finite_hash = _require_sha256(
        input_hashes.get("finiteImageSha256"), "module finiteImageSha256"
    )
    if finite_hash not in finite_images:
        raise CatalogueError("A module references an unknown finite image hash.")
    degree = _require_positive_integer(module.get("degree"), "module degree")
    descriptor = _validate_packed_descriptor(
        module.get("packedPermutationRows"), degree, source_generator_count
    )
    coverage = _canonical_copy(module.get("fixedPointCoverage"))
    covered = coverage_indexes(coverage, catalogue_hashes["witnessSha256"])
    if coverage["witnessCount"] != witness_count:
        raise StaleCatalogueError("A module has a stale witness count.")
    status = module.get("status")
    if status not in MODULE_STATUSES:
        raise CatalogueError("A module has an unsupported status.")
    if status == "torsion-free" and len(covered) != witness_count:
        raise CatalogueError("A torsion-free module does not cover every witness.")
    checks = module.get("exactChecks")
    if not isinstance(checks, Mapping) or set(checks) != set(EXACT_CHECK_FIELDS):
        raise CatalogueError("A module has incomplete exactChecks.")
    if any(checks[field] is not True for field in EXACT_CHECK_FIELDS):
        raise CatalogueError("A reusable module must pass every exact check.")
    provenance = module.get("provenance")
    if not isinstance(provenance, list) or not provenance:
        raise CatalogueError("A module must retain at least one provenance record.")
    normalized_provenance: list[dict[str, Any]] = []
    for item in provenance:
        if not isinstance(item, Mapping):
            raise CatalogueError("Module provenance entries must be objects.")
        item_hash = _require_sha256(
            item.get("finiteImageSha256"), "provenance finiteImageSha256"
        )
        image = finite_images.get(item_hash)
        if image is None:
            raise CatalogueError(
                "Module provenance references an unknown finite image."
            )
        normalized = {
            "finiteImageId": _require_nonempty_string(
                item.get("finiteImageId"), "provenance finite image id"
            ),
            "finiteImageSha256": item_hash,
            "characteristic": _require_positive_integer(
                item.get("characteristic"), "provenance characteristic"
            ),
            "subgroupFingerprint": _require_sha256(
                item.get("subgroupFingerprint"), "provenance subgroupFingerprint"
            ),
            "origin": _canonical_copy(item.get("origin")),
        }
        if (
            normalized["finiteImageId"] != image["id"]
            or normalized["characteristic"] != image["characteristic"]
        ):
            raise CatalogueError("Module provenance disagrees with finiteImages.")
        normalized_provenance.append(normalized)
    normalized_provenance.sort(key=_provenance_key)
    if len({_provenance_key(item) for item in normalized_provenance}) != len(
        normalized_provenance
    ):
        raise CatalogueError("Module provenance contains duplicates.")
    primary = normalized_provenance[0]
    if finite_hash != primary["finiteImageSha256"]:
        raise CatalogueError("A module primary finite image is not canonical.")
    if module.get("subgroupFingerprint") != primary["subgroupFingerprint"]:
        raise CatalogueError("A module primary subgroup fingerprint is not canonical.")
    if _canonical_copy(module.get("origin")) != primary["origin"]:
        raise CatalogueError("A module primary origin is not canonical.")
    normalized: dict[str, Any] = {
        "inputHashes": {
            **dict(catalogue_hashes),
            "finiteImageSha256": primary["finiteImageSha256"],
        },
        "degree": degree,
        "origin": primary["origin"],
        "subgroupFingerprint": primary["subgroupFingerprint"],
        "packedPermutationRows": descriptor,
        "fixedPointCoverage": coverage,
        "status": status,
        "exactChecks": dict(checks),
        "provenance": normalized_provenance,
    }
    expected_hash = sha256_json(_module_core(normalized))
    if module.get("moduleSha256") != expected_hash:
        raise CatalogueError("A module digest is stale or corrupt.")
    expected_id = f"fimod-{expected_hash[:20]}"
    if module.get("id") != expected_id:
        raise CatalogueError("A module id is stale or corrupt.")
    normalized.update({"moduleSha256": expected_hash, "id": expected_id})
    if _canonical_copy(module) != normalized:
        raise CatalogueError("A module record is not canonical.")
    return normalized


def _deduplicate_modules(
    modules: Sequence[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_blob: dict[str, dict[str, Any]] = {}
    logical_bytes = 0
    incoming_count = 0
    for source in modules:
        incoming_count += 1
        module = deepcopy(source)
        descriptor = module["packedPermutationRows"]
        logical_bytes += int(descriptor["byteLength"])
        packed_hash = str(descriptor["sha256"])
        existing = by_blob.get(packed_hash)
        if existing is None:
            by_blob[packed_hash] = module
            continue
        if existing["moduleSha256"] != module["moduleSha256"]:
            raise IncompatibleCatalogueError(
                "The same packed action has conflicting mathematical metadata."
            )
        provenance = {
            _provenance_key(item): item
            for item in existing["provenance"] + module["provenance"]
        }
        merged_provenance = [provenance[key] for key in sorted(provenance)]
        primary = merged_provenance[0]
        existing["provenance"] = merged_provenance
        existing["inputHashes"]["finiteImageSha256"] = primary["finiteImageSha256"]
        existing["subgroupFingerprint"] = primary["subgroupFingerprint"]
        existing["origin"] = primary["origin"]
    unique = sorted(
        by_blob.values(),
        key=lambda module: (
            module["degree"],
            module["packedPermutationRows"]["sha256"],
            module["moduleSha256"],
        ),
    )
    unique_bytes = sum(
        int(module["packedPermutationRows"]["byteLength"]) for module in unique
    )
    return unique, {
        "incomingModuleCount": incoming_count,
        "uniqueModuleCount": len(unique),
        "logicalPackedBytes": logical_bytes,
        "uniquePackedBytes": unique_bytes,
        "deduplicatedPackedBytes": logical_bytes - unique_bytes,
    }


def _catalogue_body(catalogue: Mapping[str, Any]) -> dict[str, Any]:
    body = _canonical_copy(catalogue)
    body.pop("catalogueSha256", None)
    return body


def build_catalogue(
    *,
    source_sha256: str,
    matrix_sha256: str,
    witness_sha256: str,
    witness_count: int,
    source_generator_count: int,
    finite_images: Sequence[Mapping[str, Any]],
    modules: Sequence[Mapping[str, Any]],
    scope: Mapping[str, Any],
    complete: bool,
    max_unique_packed_bytes: int | None = None,
) -> dict[str, Any]:
    """Build and seal a deterministic catalogue for a declared search scope."""

    hashes = _hashes(source_sha256, matrix_sha256, witness_sha256)
    count = _require_positive_integer(witness_count, "witnessCount")
    generators = _require_positive_integer(
        source_generator_count, "sourceGeneratorCount"
    )
    if not isinstance(complete, bool):
        raise CatalogueError("complete must be a boolean.")
    scope_copy = _require_object(scope, "scope")
    image_records = [_validate_finite_image(record) for record in finite_images]
    image_records.sort(key=lambda record: (record["characteristic"], record["sha256"]))
    image_by_hash: dict[str, dict[str, Any]] = {}
    for record in image_records:
        existing = image_by_hash.get(record["sha256"])
        if existing is not None and existing != record:
            raise IncompatibleCatalogueError(
                "A finite image hash has conflicting metadata."
            )
        image_by_hash[record["sha256"]] = record
    image_id_to_hash: dict[str, str] = {}
    for record in image_by_hash.values():
        previous_hash = image_id_to_hash.get(record["id"])
        if previous_hash is not None and previous_hash != record["sha256"]:
            raise IncompatibleCatalogueError(
                "A finite image id refers to conflicting exact images."
            )
        image_id_to_hash[record["id"]] = record["sha256"]
    normalized_modules = [
        _validate_module(
            module,
            catalogue_hashes=hashes,
            witness_count=count,
            source_generator_count=generators,
            finite_images=image_by_hash,
        )
        for module in modules
    ]
    unique_modules, storage = _deduplicate_modules(normalized_modules)
    if max_unique_packed_bytes is not None:
        maximum = _require_nonnegative_integer(
            max_unique_packed_bytes, "maxUniquePackedBytes"
        )
        if storage["uniquePackedBytes"] > maximum:
            raise CatalogueBudgetExceeded(
                "Unique packed actions require "
                f"{storage['uniquePackedBytes']} bytes, exceeding {maximum}."
            )
    value: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "builderVersion": BUILDER_VERSION,
        "complete": complete,
        "scope": scope_copy,
        "hashes": hashes,
        "witnessCount": count,
        "sourceGeneratorCount": generators,
        "finiteImages": sorted(
            image_by_hash.values(),
            key=lambda record: (record["characteristic"], record["sha256"]),
        ),
        "modules": unique_modules,
        "storage": storage,
        "claims": ["exact transitive finite-image actions"],
        "nonClaims": [
            "globally complete subgroup enumeration outside the declared scope",
            "minimal torsion-free index",
            "existence of a composite action",
            "virtual fibering",
        ],
    }
    value["catalogueSha256"] = sha256_json(value)
    validate_catalogue(value, require_complete=False)
    return value


def validate_catalogue(
    catalogue: Mapping[str, Any],
    *,
    expected_hashes: Mapping[str, str] | None = None,
    expected_finite_image_hashes: Iterable[str] | None = None,
    require_complete: bool = True,
    max_unique_packed_bytes: int | None = None,
) -> dict[str, Any]:
    """Validate a catalogue and fail closed on stale or incomplete input."""

    if not isinstance(catalogue, Mapping):
        raise CatalogueError("The module catalogue must be an object.")
    if catalogue.get("schemaVersion") != SCHEMA_VERSION:
        raise CatalogueError("Unsupported module catalogue schemaVersion.")
    if catalogue.get("artifactType") != ARTIFACT_TYPE:
        raise CatalogueError("Unexpected module catalogue artifactType.")
    if catalogue.get("builderVersion") != BUILDER_VERSION:
        raise StaleCatalogueError("The module catalogue builder version is stale.")
    supplied_digest = _require_sha256(
        catalogue.get("catalogueSha256"), "catalogueSha256"
    )
    if sha256_json(_catalogue_body(catalogue)) != supplied_digest:
        raise CatalogueError("The module catalogue digest is stale or corrupt.")
    complete = catalogue.get("complete")
    if not isinstance(complete, bool):
        raise CatalogueError("Catalogue complete must be a boolean.")
    if require_complete and not complete:
        raise IncompleteCatalogueError(
            "An incomplete module catalogue cannot drive a proof search."
        )
    scope = _require_object(catalogue.get("scope"), "scope")
    hashes_value = catalogue.get("hashes")
    if not isinstance(hashes_value, Mapping):
        raise CatalogueError("Catalogue hashes must be an object.")
    hashes = _hashes(
        hashes_value.get("sourceSha256"),
        hashes_value.get("matrixSha256"),
        hashes_value.get("witnessSha256"),
    )
    if expected_hashes is not None:
        for field, expected in expected_hashes.items():
            if field not in hashes:
                raise CatalogueError(f"Unknown expected hash field: {field}.")
            expected_hash = _require_sha256(expected, f"expected {field}")
            if hashes[field] != expected_hash:
                raise StaleCatalogueError(f"The catalogue has a stale {field}.")
    count = _require_positive_integer(catalogue.get("witnessCount"), "witnessCount")
    generators = _require_positive_integer(
        catalogue.get("sourceGeneratorCount"), "sourceGeneratorCount"
    )
    raw_images = catalogue.get("finiteImages")
    if not isinstance(raw_images, list):
        raise CatalogueError("finiteImages must be an array.")
    images = [_validate_finite_image(record) for record in raw_images]
    expected_order = sorted(
        images, key=lambda record: (record["characteristic"], record["sha256"])
    )
    if images != expected_order:
        raise CatalogueError("finiteImages must use deterministic order.")
    image_by_hash = {record["sha256"]: record for record in images}
    if len(image_by_hash) != len(images):
        raise CatalogueError("finiteImages contains a duplicate hash.")
    if len({record["id"] for record in images}) != len(images):
        raise CatalogueError("finiteImages contains a duplicate id.")
    if expected_finite_image_hashes is not None:
        expected_set = {
            _require_sha256(value, "expected finite image hash")
            for value in expected_finite_image_hashes
        }
        if set(image_by_hash) != expected_set:
            raise StaleCatalogueError("The finite image hash set is stale.")
    raw_modules = catalogue.get("modules")
    if not isinstance(raw_modules, list):
        raise CatalogueError("modules must be an array.")
    modules = [
        _validate_module(
            module,
            catalogue_hashes=hashes,
            witness_count=count,
            source_generator_count=generators,
            finite_images=image_by_hash,
        )
        for module in raw_modules
    ]
    expected_modules = sorted(
        modules,
        key=lambda module: (
            module["degree"],
            module["packedPermutationRows"]["sha256"],
            module["moduleSha256"],
        ),
    )
    if modules != expected_modules:
        raise CatalogueError("modules must use deterministic order.")
    packed_hashes = [module["packedPermutationRows"]["sha256"] for module in modules]
    if len(set(packed_hashes)) != len(packed_hashes):
        raise CatalogueError("Duplicate packed actions must be byte-deduplicated.")
    unique_bytes = sum(
        int(module["packedPermutationRows"]["byteLength"]) for module in modules
    )
    storage = catalogue.get("storage")
    if not isinstance(storage, Mapping):
        raise CatalogueError("storage must be an object.")
    for field in (
        "incomingModuleCount",
        "uniqueModuleCount",
        "logicalPackedBytes",
        "uniquePackedBytes",
        "deduplicatedPackedBytes",
    ):
        _require_nonnegative_integer(storage.get(field), f"storage.{field}")
    if storage["uniqueModuleCount"] != len(modules):
        raise CatalogueError("storage.uniqueModuleCount is inconsistent.")
    if storage["uniquePackedBytes"] != unique_bytes:
        raise CatalogueError("storage.uniquePackedBytes is inconsistent.")
    if (
        storage["logicalPackedBytes"] - storage["uniquePackedBytes"]
        != storage["deduplicatedPackedBytes"]
    ):
        raise CatalogueError("storage deduplication accounting is inconsistent.")
    if storage["incomingModuleCount"] < storage["uniqueModuleCount"]:
        raise CatalogueError("storage incoming module count is inconsistent.")
    if (
        max_unique_packed_bytes is not None
        and unique_bytes
        > _require_nonnegative_integer(max_unique_packed_bytes, "maxUniquePackedBytes")
    ):
        raise CatalogueBudgetExceeded(
            f"Catalogue requires {unique_bytes} unique packed bytes."
        )
    expected_claims = ["exact transitive finite-image actions"]
    expected_nonclaims = [
        "globally complete subgroup enumeration outside the declared scope",
        "minimal torsion-free index",
        "existence of a composite action",
        "virtual fibering",
    ]
    normalized: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "builderVersion": BUILDER_VERSION,
        "complete": complete,
        "scope": scope,
        "hashes": hashes,
        "witnessCount": count,
        "sourceGeneratorCount": generators,
        "finiteImages": images,
        "modules": modules,
        "storage": dict(storage),
        "claims": expected_claims,
        "nonClaims": expected_nonclaims,
        "catalogueSha256": supplied_digest,
    }
    if _canonical_copy(catalogue) != normalized:
        raise CatalogueError("The module catalogue is not canonical.")
    return normalized


def catalogue_compatibility(
    left: Mapping[str, Any], right: Mapping[str, Any]
) -> dict[str, Any]:
    """Return exact compatibility diagnostics without weakening validation."""

    reasons: list[str] = []
    normalized: list[dict[str, Any]] = []
    for side, value in (("left", left), ("right", right)):
        try:
            normalized.append(validate_catalogue(value, require_complete=True))
        except CatalogueError as exc:
            reasons.append(f"{side}: {exc}")
    if reasons:
        return {"compatible": False, "reasons": reasons}
    first, second = normalized
    for field in ("sourceSha256", "matrixSha256", "witnessSha256"):
        if first["hashes"][field] != second["hashes"][field]:
            reasons.append(f"mismatched {field}")
    for field in ("witnessCount", "sourceGeneratorCount"):
        if first[field] != second[field]:
            reasons.append(f"mismatched {field}")
    return {"compatible": not reasons, "reasons": reasons}


def merge_catalogues(
    catalogues: Sequence[Mapping[str, Any]],
    *,
    expected_hashes: Mapping[str, str] | None = None,
    max_unique_packed_bytes: int | None = None,
) -> dict[str, Any]:
    """Merge exact catalogues across primes/images in deterministic order."""

    if not catalogues:
        raise CatalogueError("At least one catalogue is required for a merge.")
    validated = [
        validate_catalogue(
            value,
            expected_hashes=expected_hashes,
            require_complete=True,
        )
        for value in catalogues
    ]
    # A deterministic union is idempotent: retrying or rediscovering the same
    # sealed catalogue must not inflate provenance or byte accounting.
    normalized = list({value["catalogueSha256"]: value for value in validated}.values())
    normalized.sort(key=lambda value: value["catalogueSha256"])
    reference = normalized[0]
    for value in normalized[1:]:
        result = catalogue_compatibility(reference, value)
        if not result["compatible"]:
            raise IncompatibleCatalogueError(
                "Cannot merge module catalogues: " + "; ".join(result["reasons"])
            )
    images = [record for value in normalized for record in value["finiteImages"]]
    modules = [module for value in normalized for module in value["modules"]]
    scopes = sorted([value["scope"] for value in normalized], key=canonical_json)
    return build_catalogue(
        source_sha256=reference["hashes"]["sourceSha256"],
        matrix_sha256=reference["hashes"]["matrixSha256"],
        witness_sha256=reference["hashes"]["witnessSha256"],
        witness_count=reference["witnessCount"],
        source_generator_count=reference["sourceGeneratorCount"],
        finite_images=images,
        modules=modules,
        scope={"kind": "deterministic-union", "catalogueScopes": scopes},
        complete=True,
        max_unique_packed_bytes=max_unique_packed_bytes,
    )


def module_degree_can_reach_target(module_degree: int, target_degree: int) -> bool:
    """Test the necessary divisibility condition for a diagonal orbit.

    Projection from a transitive diagonal orbit onto each factor is a
    surjective equivariant map with constant-size fibres.  Therefore every
    factor degree divides the orbit degree.  The converse need not hold.
    """

    module = _require_positive_integer(module_degree, "module degree")
    target = _require_positive_integer(target_degree, "target degree")
    return target % module == 0


def screen_catalogue_for_target_degrees(
    catalogue: Mapping[str, Any],
    target_degrees: Iterable[int],
    *,
    expected_hashes: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Select reusable modules satisfying the necessary degree divisibility."""

    checked = validate_catalogue(
        catalogue, expected_hashes=expected_hashes, require_complete=True
    )
    targets = sorted(
        {_require_positive_integer(value, "target degree") for value in target_degrees}
    )
    if not targets:
        raise CatalogueError("At least one target degree is required.")
    eligible: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for module in checked["modules"]:
        compatible_targets = [
            target
            for target in targets
            if module_degree_can_reach_target(module["degree"], target)
        ]
        record = {
            "moduleId": module["id"],
            "moduleSha256": module["moduleSha256"],
            "degree": module["degree"],
            "compatibleTargets": compatible_targets,
        }
        (eligible if compatible_targets else excluded).append(record)
    return {
        "status": "passed",
        "criterion": "factor-degree-divides-diagonal-orbit-degree",
        "necessaryOnly": True,
        "catalogueSha256": checked["catalogueSha256"],
        "targetDegrees": targets,
        "eligibleModules": eligible,
        "excludedModules": excluded,
    }
