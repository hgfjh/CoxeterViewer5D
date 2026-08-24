#!/usr/bin/env python3
"""Search exact mod-2 partial modules by symbolic stabilizer intersections.

The input catalogue describes transitive actions ``G/H`` by fixed-point
marks.  A diagonal orbit in ``G/H x G/K`` has stabilizer
``H intersect gKg^-1`` for one double coset ``HgK``.  This script keeps those
stabilizers inside the certified 122-point mod-2 image and asks GAP to reason
about their intersections before any large coset action is constructed.

The current compact-5-cube catalogue has degree floor 97,920.  The first
degree at which a proper intersection can improve witness coverage is
195,840.  GAP therefore enumerates every double coset between the ten floor
stabilizer classes and tests every resulting index-195,840 intersection.
Larger and deeper intersections are reported as a separate bounded frontier.
A large coset action is materialized only if an exact stabilizer has zero
fixed points for all 186 prime-order torsion witnesses.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "mod2-symbolic-composite-search"
REQUEST_TYPE = "mod2-symbolic-composite-search-request"
RESPONSE_TYPE = "mod2-symbolic-composite-search-response"
BUILDER_VERSION = "1.0.0"
TARGET_DEGREES = (5_760, 11_520, 17_280, 23_040, 46_080, 97_920, 195_840)
EXACT_PAIR_DEGREE = 195_840
BOUNDED_LARGER_CEILING = 576_000

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_REPORT = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod2_symbolic_partial_modules.json"
)
DEFAULT_LOCAL_ACTION = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod2_ambient_action.json"
)
DEFAULT_WSL_ACTION = (
    "~/.cache/coxeter-viewer/portfolio-cache/recognition/"
    "ec2220d4164c79b92c2b6ab390b32e73171e42fcbf00fecaa9a52e01cda5ccf7/"
    "action.json"
)
GAP_SCRIPT = SCRIPT_DIR / "gap_mod2_symbolic_composite_search.g"
RECOGNIZER_SCRIPT = SCRIPT_DIR / "gap_finite_image_recognition.g"


class CompositeSearchError(ValueError):
    """The symbolic search input or certificate is stale or malformed."""


def canonical_json(value: Any) -> str:
    """Return the byte-level JSON convention used by search seals."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CompositeSearchError(f"Value is not canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _copy(value: Any) -> Any:
    return json.loads(canonical_json(value))


def _hash(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise CompositeSearchError(f"{field} must be a lowercase SHA-256 digest.")
    return value


def _positive(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise CompositeSearchError(f"{field} must be a positive integer.")
    return value


def _nonnegative(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CompositeSearchError(f"{field} must be a nonnegative integer.")
    return value


def _rows_fingerprint(action_sha256: str, rows: Sequence[Sequence[int]]) -> str:
    # GAP hashes the compact rows without whitespace and with one-based images.
    row_text = (
        "["
        + ",".join(
            "[" + ",".join(str(int(image)) for image in row) + "]" for row in rows
        )
        + "]"
    )
    return hashlib.sha256(f"{action_sha256}:{row_text}".encode("ascii")).hexdigest()


def _validate_compact_rows(
    rows: Any,
    *,
    action_sha256: str,
    expected_fingerprint: str,
    field: str,
) -> list[list[int]]:
    if not isinstance(rows, list) or not rows:
        raise CompositeSearchError(f"{field} must contain subgroup generators.")
    expected = list(range(1, 123))
    checked: list[list[int]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, list) or sorted(row) != expected:
            raise CompositeSearchError(
                f"{field}[{index}] is not a permutation of the 122-point image."
            )
        checked.append([int(image) for image in row])
    actual = _rows_fingerprint(action_sha256, checked)
    if actual != expected_fingerprint:
        raise CompositeSearchError(f"{field} does not match its stabilizer digest.")
    return checked


def _compact_rows_from_entry(entry: Mapping[str, Any]) -> Any:
    """Accept the final field name and two development aliases.

    Older exact-marks reports omitted these rows.  Such reports remain usable:
    the GAP stage reconstructs the rows from the hash-bound recognition data.
    The composite-search result always emits the rows explicitly.
    """

    for container in (
        entry,
        (
            entry.get("provenance", {}).get("stabilizer", {})
            if isinstance(entry.get("provenance"), Mapping)
            else {}
        ),
        (
            entry.get("provenance", {}).get("stabilizer", {}).get("subgroupClass", {})
            if isinstance(entry.get("provenance"), Mapping)
            and isinstance(entry.get("provenance", {}).get("stabilizer"), Mapping)
            else {}
        ),
    ):
        if not isinstance(container, Mapping):
            continue
        for name in (
            "compactAmbientSubgroupGeneratorRows",
            "compactSubgroupGeneratorRows",
            "subgroupGeneratorRows",
        ):
            if name in container:
                return container[name]
    return None


def validate_symbolic_report(report: Mapping[str, Any]) -> dict[str, Any]:
    """Validate all exact marks and return a compact GAP request payload."""

    if report.get("artifactType") != "mod2-symbolic-partial-module-catalogue":
        raise CompositeSearchError("The input is not a mod-2 symbolic catalogue.")
    stored = _hash(report.get("artifactSha256"), "artifactSha256")
    core = _copy(report)
    core.pop("artifactSha256", None)
    if sha256_json(core) != stored:
        raise CompositeSearchError("The symbolic catalogue seal is stale or corrupt.")

    source = report.get("source")
    if not isinstance(source, Mapping) or not isinstance(source.get("hashes"), Mapping):
        raise CompositeSearchError("The symbolic catalogue has no source hashes.")
    source_hashes = source["hashes"]
    witness_sha256 = _hash(
        source_hashes.get("witnessCatalogueSha256"),
        "source.hashes.witnessCatalogueSha256",
    )
    matrix_sha256 = _hash(
        source_hashes.get("coxeterMatrixSha256"),
        "source.hashes.coxeterMatrixSha256",
    )
    input_sha256 = _hash(source_hashes.get("inputSha256"), "source.hashes.inputSha256")
    entries = report.get("entries")
    if not isinstance(entries, list) or not entries:
        raise CompositeSearchError("The symbolic catalogue has no modules.")

    checked_entries: list[dict[str, Any]] = []
    ids: set[str] = set()
    action_hashes: set[str] = set()
    witness_count: int | None = None
    for position, entry in enumerate(entries):
        if not isinstance(entry, Mapping):
            raise CompositeSearchError(f"entries[{position}] is not an object.")
        class_id = entry.get("provenance", {}).get("classId")
        if not isinstance(class_id, str) or not class_id or class_id in ids:
            raise CompositeSearchError("Every exact class needs a unique classId.")
        ids.add(class_id)
        if entry.get("kind") != "exact-module" or not entry.get(
            "compositeSolverEligible"
        ):
            raise CompositeSearchError(
                f"Class {class_id} is not an exact composite-eligible module."
            )
        degree = _positive(entry.get("degree"), f"{class_id}.degree")
        coverage = entry.get("coverage")
        evidence = entry.get("marksEvidence")
        if not isinstance(coverage, Mapping) or coverage.get("status") != "exact":
            raise CompositeSearchError(f"Class {class_id} has no exact coverage.")
        if not isinstance(evidence, Mapping) or evidence.get("status") != "exact":
            raise CompositeSearchError(f"Class {class_id} has no exact marks.")
        counts = evidence.get("fixedPointCounts")
        if not isinstance(counts, list) or not counts:
            raise CompositeSearchError(f"Class {class_id} has no fixed-point vector.")
        checked_counts = [
            _nonnegative(value, f"{class_id}.fixedPointCounts[{index}]")
            for index, value in enumerate(counts)
        ]
        if witness_count is None:
            witness_count = len(checked_counts)
        if len(checked_counts) != witness_count:
            raise CompositeSearchError(
                "Exact classes use different witness catalogues."
            )
        covered = [index for index, count in enumerate(checked_counts) if count == 0]
        if (
            coverage.get("witnessCount") != witness_count
            or coverage.get("witnessSha256") != witness_sha256
            or coverage.get("coveredWitnessIndexes") != covered
            or coverage.get("coveredCount") != len(covered)
        ):
            raise CompositeSearchError(f"Class {class_id} has stale coverage bits.")

        provenance = entry.get("provenance")
        stabilizer = (
            provenance.get("stabilizer") if isinstance(provenance, Mapping) else None
        )
        subgroup_class = (
            stabilizer.get("subgroupClass") if isinstance(stabilizer, Mapping) else None
        )
        if not isinstance(subgroup_class, Mapping):
            raise CompositeSearchError(f"Class {class_id} lacks stabilizer provenance.")
        fingerprint = _hash(
            stabilizer.get("stabilizerFingerprint"),
            f"{class_id}.stabilizerFingerprint",
        )
        action_hash = _hash(
            subgroup_class.get("ambientActionSha256"),
            f"{class_id}.ambientActionSha256",
        )
        action_hashes.add(action_hash)
        if subgroup_class.get("ambientActionDegree") != 122:
            raise CompositeSearchError("A class uses another ambient action degree.")
        if subgroup_class.get("subgroupIndex") != degree:
            raise CompositeSearchError(
                "A class index disagrees with its module degree."
            )
        ordinal = _positive(
            provenance.get("classOrdinalWithinDegree"),
            f"{class_id}.classOrdinalWithinDegree",
        )
        rows = _compact_rows_from_entry(entry)
        if rows is None:
            raise CompositeSearchError(
                f"Class {class_id} omits compactSubgroupGeneratorRows."
            )
        checked_rows = _validate_compact_rows(
            rows,
            action_sha256=action_hash,
            expected_fingerprint=fingerprint,
            field=f"{class_id}.compactSubgroupGeneratorRows",
        )
        checked_entries.append(
            {
                "classId": class_id,
                "classOrdinalWithinDegree": ordinal,
                "degree": degree,
                "expectedFixedPointCounts": checked_counts,
                "expectedStabilizerFingerprint": fingerprint,
                "provenance": _copy(subgroup_class),
                "compactAmbientSubgroupGeneratorRows": checked_rows,
            }
        )

    if len(action_hashes) != 1:
        raise CompositeSearchError("Exact classes use different ambient actions.")
    if witness_count != 186:
        raise CompositeSearchError(
            f"Expected the complete 186-witness catalogue, received {witness_count}."
        )
    checked_entries.sort(
        key=lambda item: (item["degree"], item["classOrdinalWithinDegree"])
    )
    if len(checked_entries) != 45:
        raise CompositeSearchError(
            f"Expected all 45 exact mod-2 classes, received {len(checked_entries)}."
        )
    return {
        "artifactSha256": stored,
        "ambientActionSha256": next(iter(action_hashes)),
        "inputSha256": input_sha256,
        "matrixSha256": matrix_sha256,
        "witnessCatalogueSha256": witness_sha256,
        "witnessCount": witness_count,
        "entries": checked_entries,
    }


def symbolic_degree_gate(
    entries: Sequence[Mapping[str, Any]],
    targets: Sequence[int] = TARGET_DEGREES,
) -> dict[str, Any]:
    """Prove what intersection actions can occur at or below the degree floor.

    If ``J`` is an intersection of conjugates of input stabilizers, then
    ``J`` is contained in every factor, hence ``[G:J] >= [G:H_i]``.  At the
    minimum index equality forces ``J`` to equal every factor.  At twice the
    minimum index every genuinely improving iterated intersection already
    occurs as a pairwise intersection: repeated equal factors do nothing, and
    the first factor that cuts the stabilizer has index 195,840.
    """

    checked_targets = tuple(int(value) for value in targets)
    if checked_targets != TARGET_DEGREES:
        raise CompositeSearchError(
            "Target degrees must be exactly " + ", ".join(map(str, TARGET_DEGREES))
        )
    degrees = [_positive(entry.get("degree"), "entry.degree") for entry in entries]
    if not degrees:
        raise CompositeSearchError("The degree gate requires at least one module.")
    floor = min(degrees)
    maximum = max(checked_targets)
    floor_entries = [entry for entry in entries if int(entry["degree"]) == floor]
    witness_count = len(floor_entries[0]["expectedFixedPointCounts"])
    floor_survivors = [
        entry["classId"]
        for entry in floor_entries
        if all(count == 0 for count in entry["expectedFixedPointCounts"])
    ]
    unreachable = [target for target in checked_targets if target < floor]
    pair_class_count = len(floor_entries) * (len(floor_entries) + 1) // 2
    return {
        "method": "stabilizer-intersection index monotonicity",
        "moduleDegreeFloor": floor,
        "maximumTargetDegree": maximum,
        "targetsBelowFloor": unreachable,
        "floorClassCount": len(floor_entries),
        "floorWitnessFreeClassIds": floor_survivors,
        "exactPairDegree": EXACT_PAIR_DEGREE,
        "exactFloorPairTypeCount": pair_class_count,
        "witnessCount": witness_count,
        "allTargetsAtOrBelowTwiceFloor": maximum <= 2 * floor,
        "conclusion": (
            "requires-complete-floor-pair-double-cosets"
            if maximum <= 2 * floor
            else "requires-explicit-higher-intersections"
        ),
    }


def validate_action(
    action: Mapping[str, Any], checked: Mapping[str, Any]
) -> dict[str, Any]:
    stored = _hash(action.get("actionSha256"), "action.actionSha256")
    core = _copy(action)
    core.pop("actionSha256", None)
    if sha256_json(core) != stored:
        raise CompositeSearchError("The 122-point action seal is stale or corrupt.")
    if stored != checked["ambientActionSha256"]:
        raise CompositeSearchError("The exact classes name another ambient action.")
    if action.get("degree") != 122 or action.get("expectedOrder") != 2_368_880_640:
        raise CompositeSearchError("The action is not the certified mod-2 image.")
    rows = action.get("generatorRows")
    if not isinstance(rows, list) or len(rows) != 10:
        raise CompositeSearchError("The ambient action has no ten generator rows.")
    expected = list(range(1, 123))
    if any(not isinstance(row, list) or sorted(row) != expected for row in rows):
        raise CompositeSearchError("An ambient generator row is not a permutation.")
    witnesses = action.get("torsionWitnesses")
    if not isinstance(witnesses, list) or len(witnesses) != checked["witnessCount"]:
        raise CompositeSearchError("The ambient action has another witness catalogue.")
    for index, witness in enumerate(witnesses):
        if (
            not isinstance(witness, Mapping)
            or not isinstance(witness.get("id"), str)
            or not isinstance(witness.get("word"), list)
            or witness.get("primeOrder") not in (2, 3, 5)
        ):
            raise CompositeSearchError(f"torsionWitnesses[{index}] is malformed.")
    matrix = action.get("coxeterMatrix")
    if not isinstance(matrix, list) or len(matrix) != 10:
        raise CompositeSearchError("The ambient action has no Coxeter matrix.")
    return _copy(action)


def build_request(
    report: Mapping[str, Any],
    action: Mapping[str, Any],
    *,
    report_file_sha256: str,
    maximum_pair_types: int = 1_035,
    maximum_exact_double_cosets: int = 1_000_000,
    maximum_larger_intersection_classes: int = 2_000,
) -> dict[str, Any]:
    checked = validate_symbolic_report(report)
    checked_action = validate_action(action, checked)
    gate = symbolic_degree_gate(checked["entries"])
    request: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": REQUEST_TYPE,
        "builderVersion": BUILDER_VERSION,
        "targetDegrees": list(TARGET_DEGREES),
        "classes": checked["entries"],
        "sourceHashes": {
            "ambientActionSha256": checked["ambientActionSha256"],
            "coxeterInputSha256": checked["inputSha256"],
            "coxeterMatrixSha256": checked["matrixSha256"],
            "gapSearchScriptSha256": sha256_file(GAP_SCRIPT),
            "pythonBuilderSha256": sha256_file(Path(__file__)),
            "recognizerLibraryPrefixSha256": hashlib.sha256(
                _recognizer_library_prefix().encode("utf8")
            ).hexdigest(),
            "recognizerScriptSha256": sha256_file(RECOGNIZER_SCRIPT),
            "symbolicReportFileSha256": _hash(
                report_file_sha256, "symbolicReportFileSha256"
            ),
            "symbolicReportSha256": checked["artifactSha256"],
            "witnessCatalogueSha256": checked["witnessCatalogueSha256"],
        },
        "witnessCount": checked["witnessCount"],
        "degreeGate": gate,
        "baseExactCertificate": {
            "maximumDegree": 97_920,
            "status": "exact-exhausted",
            "reason": (
                "Targets below 97,920 violate the stabilizer-index floor; all "
                "ten index-97,920 classes have nonzero fixed-point marks."
            ),
        },
        "bounds": {
            "maximumPairTypes": _positive(maximum_pair_types, "maximumPairTypes"),
            "maximumExactDoubleCosets": _positive(
                maximum_exact_double_cosets,
                "maximumExactDoubleCosets",
            ),
            "maximumLargerIntersectionClasses": _positive(
                maximum_larger_intersection_classes,
                "maximumLargerIntersectionClasses",
            ),
            "maximumMaterializedDegree": EXACT_PAIR_DEGREE,
            "boundedLargerDegreeCeiling": BOUNDED_LARGER_CEILING,
        },
        "compactRows": {
            "providedClassCount": len(checked["entries"]),
            "reconstructMissingFromCertifiedRecognition": False,
        },
        "claims": ["hash-bound request for exact stabilizer-intersection arithmetic"],
        "nonClaims": [
            "a torsion-free action before independent witness replay",
            "completeness above the declared target degrees",
        ],
    }
    request["requestSha256"] = sha256_json(request)
    # Pass the action separately in the GAP driver.  Keeping it out of the
    # request makes the request seal useful without duplicating 1,220 images.
    request["ambientAction"] = checked_action
    return request


def verify_request(request: Mapping[str, Any]) -> str:
    if request.get("artifactType") != REQUEST_TYPE:
        raise CompositeSearchError("The GAP request has the wrong artifact type.")
    core = _copy(request)
    action = core.pop("ambientAction", None)
    if not isinstance(action, Mapping):
        raise CompositeSearchError("The GAP request has no ambient action.")
    stored = _hash(core.pop("requestSha256", None), "requestSha256")
    if sha256_json(core) != stored:
        raise CompositeSearchError("The GAP request seal is stale or corrupt.")
    if action.get("actionSha256") != request["sourceHashes"]["ambientActionSha256"]:
        raise CompositeSearchError("The GAP request carries another ambient action.")
    return stored


def _recognizer_library_prefix() -> str:
    source = RECOGNIZER_SCRIPT.read_text(encoding="utf8")
    marker = "\nif not IsBound(COXETER_INPUT) then\n"
    if marker not in source:
        raise CompositeSearchError("The recognizer entrypoint marker changed.")
    return source.split(marker, 1)[0] + "\n"


def _gap_literal(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "fail"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, list):
        return "[" + ",".join(_gap_literal(item) for item in value) + "]"
    if isinstance(value, Mapping):
        fields: list[str] = []
        for key in sorted(value):
            if not isinstance(key, str) or not key.replace("_", "a").isalnum():
                raise CompositeSearchError(f"Unsupported GAP component {key!r}.")
            fields.append(f"{key}:={_gap_literal(value[key])}")
        return "rec(" + ",".join(fields) + ")"
    raise CompositeSearchError(f"Cannot encode {type(value).__name__} for GAP.")


def _wsl_path(path: Path) -> str:
    process = subprocess.run(
        ["wsl", "wslpath", "-a", path.resolve().as_posix()],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if process.returncode != 0:
        raise CompositeSearchError(
            "Could not translate a temporary path for WSL: "
            + (process.stderr or process.stdout).strip()
        )
    return process.stdout.strip()


def read_wsl_json(path: str) -> dict[str, Any]:
    command = (
        [
            "wsl",
            "sh",
            "-lc",
            'cat -- "$HOME/$1"',
            "coxeter-read-json",
            path[2:],
        ]
        if path.startswith("~/")
        else ["wsl", "cat", "--", path]
    )
    process = subprocess.run(
        command, check=False, capture_output=True, timeout=90
    )
    if process.returncode != 0:
        raise CompositeSearchError(
            f"Could not read WSL JSON {path}: "
            + process.stderr.decode("utf8", errors="replace").strip()
        )
    value = json.loads(process.stdout.decode("utf8"))
    if not isinstance(value, dict):
        raise CompositeSearchError("The WSL action is not a JSON object.")
    return value


def load_action(action_path: Path | None, wsl_path: str) -> tuple[dict[str, Any], str]:
    """Prefer a tracked local transfer and retain the WSL cache fallback."""

    selected = action_path
    if selected is None and DEFAULT_LOCAL_ACTION.is_file():
        selected = DEFAULT_LOCAL_ACTION
    if selected is not None:
        if not selected.is_file():
            raise CompositeSearchError(f"Local action file does not exist: {selected}")
        value = json.loads(selected.read_text(encoding="utf8"))
        if not isinstance(value, dict):
            raise CompositeSearchError("The local action file is not a JSON object.")
        resolved = selected.resolve()
        try:
            source = resolved.relative_to(SCRIPT_DIR.parent.resolve()).as_posix()
        except ValueError:
            source = resolved.as_posix()
        return value, source
    return read_wsl_json(wsl_path), "wsl-cache:certified-mod2-ambient-action"


def run_gap_search(
    request: Mapping[str, Any],
    *,
    wsl_gap: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Run the bounded GAP stage and preserve timeout as an incomplete result."""

    request_hash = verify_request(request)
    prefix = _recognizer_library_prefix()
    if (
        hashlib.sha256(prefix.encode("utf8")).hexdigest()
        != request["sourceHashes"]["recognizerLibraryPrefixSha256"]
    ):
        raise CompositeSearchError("The recognizer library prefix changed.")
    gap_request = _copy(request)
    action = gap_request.pop("ambientAction")
    with tempfile.TemporaryDirectory(prefix="coxeter-mod2-composite-") as directory:
        root = Path(directory)
        library_path = root / "recognizer-library.g"
        driver_path = root / "driver.g"
        response_path = root / "response.json"
        library_path.write_text(prefix, encoding="utf8")
        driver_path.write_text(
            f"COXETER_INPUT := {_gap_literal(action)};;\n"
            f"COXETER_REQUEST := {_gap_literal(gap_request)};;\n"
            f'COXETER_OUTPUT := "{_wsl_path(response_path)}";;\n'
            f'Read("{_wsl_path(library_path)}");;\n'
            f'Read("{_wsl_path(GAP_SCRIPT)}");;\n',
            encoding="utf8",
        )
        command = [
            "wsl",
            wsl_gap,
            "-r",
            "-q",
            "--quitonbreak",
            "--nointeract",
            _wsl_path(driver_path),
        ]
        try:
            process = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=max(1, timeout_seconds),
            )
        except subprocess.TimeoutExpired as exc:
            return None, {
                "status": "incomplete-resource-bounded",
                "reason": f"GAP exceeded the {timeout_seconds}-second wall-clock bound.",
                "timeoutSeconds": timeout_seconds,
                "requestSha256": request_hash,
                "stdoutTail": (
                    (exc.stdout or "")[-2000:] if isinstance(exc.stdout, str) else ""
                ),
                "stderrTail": (
                    (exc.stderr or "")[-2000:] if isinstance(exc.stderr, str) else ""
                ),
            }
        metadata = {
            "status": "completed" if process.returncode == 0 else "failed",
            "command": command,
            "returnCode": process.returncode,
            "timeoutSeconds": timeout_seconds,
            "stdoutTail": (process.stdout or "")[-2000:],
            "stderrTail": (process.stderr or "")[-2000:],
        }
        if process.returncode != 0 or not response_path.is_file():
            raise CompositeSearchError(
                "The GAP composite search failed: "
                + (process.stderr or process.stdout or "no response")[-4000:]
            )
        response = json.loads(response_path.read_text(encoding="utf8"))
        if not isinstance(response, dict):
            raise CompositeSearchError("The GAP response is not an object.")
    return response, metadata


def _apply_word(
    row_generators: Sequence[Sequence[int]], word: Sequence[int], point: int
) -> int:
    for generator in word:
        point = int(row_generators[int(generator)][point])
    return point


def independently_replay_materialized_action(
    candidate: Mapping[str, Any],
    action: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay Coxeter relations and all torsion witnesses in Python.

    GAP rows are one-based.  They are shifted once here so the hot replay loop
    uses ordinary zero-based list indexing.
    """

    degree = _positive(candidate.get("degree"), "candidate.degree")
    raw_rows = candidate.get("generatorRows")
    if not isinstance(raw_rows, list) or len(raw_rows) != 10:
        raise CompositeSearchError("A survivor lacks ten materialized rows.")
    expected = list(range(1, degree + 1))
    rows: list[list[int]] = []
    for index, raw in enumerate(raw_rows):
        if not isinstance(raw, list) or sorted(raw) != expected:
            raise CompositeSearchError(
                f"candidate.generatorRows[{index}] is not a permutation."
            )
        rows.append([int(image) - 1 for image in raw])

    matrix = action["coxeterMatrix"]
    relation_failures: list[dict[str, Any]] = []
    for left in range(10):
        if any(rows[left][rows[left][point]] != point for point in range(degree)):
            relation_failures.append({"generators": [left], "relation": "s^2"})
        for right in range(left + 1, 10):
            order = int(matrix[left][right])
            if order <= 0:
                continue
            word = [left, right] * order
            if any(_apply_word(rows, word, point) != point for point in range(degree)):
                relation_failures.append(
                    {
                        "generators": [left, right],
                        "relation": f"(s{left}s{right})^{order}",
                    }
                )

    fixed_counts: list[int] = []
    for witness in action["torsionWitnesses"]:
        word = [int(letter) for letter in witness["word"]]
        fixed_counts.append(
            sum(_apply_word(rows, word, point) == point for point in range(degree))
        )
    passed = not relation_failures and all(count == 0 for count in fixed_counts)
    return {
        "passed": passed,
        "degree": degree,
        "relationFailures": relation_failures,
        "witnessFixedPointCounts": fixed_counts,
        "witnessFree": all(count == 0 for count in fixed_counts),
        "method": "independent Python replay of materialized permutation rows",
    }


def validate_gap_response(
    request: Mapping[str, Any], response: Mapping[str, Any]
) -> dict[str, Any]:
    request_hash = verify_request(request)
    if (
        response.get("artifactType") != RESPONSE_TYPE
        or response.get("requestSha256") != request_hash
        or response.get("targetDegrees") != list(TARGET_DEGREES)
    ):
        raise CompositeSearchError("The GAP response is stale or has the wrong scope.")
    status = response.get("status")
    if status not in {
        "exact-exhausted",
        "candidate-found",
        "incomplete-resource-bounded",
    }:
        raise CompositeSearchError("The GAP response has an unsupported status.")
    compact = response.get("compactSubgroups")
    if not isinstance(compact, list) or len(compact) != len(request["classes"]):
        raise CompositeSearchError("The GAP response omits compact stabilizers.")
    expected_by_id = {item["classId"]: item for item in request["classes"]}
    normalized: list[dict[str, Any]] = []
    for position, item in enumerate(compact):
        if not isinstance(item, Mapping) or item.get("classId") not in expected_by_id:
            raise CompositeSearchError("A compact stabilizer has an unknown class id.")
        expected = expected_by_id[item["classId"]]
        if (
            item.get("degree") != expected["degree"]
            or item.get("fixedPointCounts") != expected["expectedFixedPointCounts"]
            or item.get("stabilizerFingerprint")
            != expected["expectedStabilizerFingerprint"]
        ):
            raise CompositeSearchError(
                f"Compact stabilizer {item.get('classId')} failed exact replay."
            )
        rows = _validate_compact_rows(
            item.get("compactAmbientSubgroupGeneratorRows"),
            action_sha256=request["sourceHashes"]["ambientActionSha256"],
            expected_fingerprint=expected["expectedStabilizerFingerprint"],
            field=f"compactSubgroups[{position}].rows",
        )
        normalized.append(
            {
                "classId": item["classId"],
                "degree": item["degree"],
                "stabilizerFingerprint": item["stabilizerFingerprint"],
                "fixedPointCounts": _copy(item["fixedPointCounts"]),
                "compactAmbientSubgroupGeneratorRows": rows,
                "subgroupOrder": _positive(
                    item.get("subgroupOrder"), f"{item['classId']}.subgroupOrder"
                ),
            }
        )
    if len({item["classId"] for item in normalized}) != len(normalized):
        raise CompositeSearchError("The GAP response repeats a compact stabilizer.")

    search = response.get("search")
    if not isinstance(search, Mapping):
        raise CompositeSearchError("The GAP response has no search accounting.")
    complete = status in {"exact-exhausted", "candidate-found"}
    if complete and search.get("completeWithinDeclaredTargets") is not True:
        raise CompositeSearchError(
            "An exact response does not prove scope completeness."
        )
    survivor = response.get("survivor")
    if status == "candidate-found" and not isinstance(survivor, Mapping):
        raise CompositeSearchError("A candidate response has no materialized survivor.")
    if status != "candidate-found" and survivor is not None:
        raise CompositeSearchError("A non-candidate response contains a survivor.")
    return {
        "status": status,
        "compactSubgroups": normalized,
        "coverageUnion": _copy(response.get("coverageUnion")),
        "search": _copy(search),
        "survivor": _copy(survivor),
        "gapTool": _copy(response.get("tool")),
        "gapResponseSha256": sha256_json(response),
    }


def build_report(
    request: Mapping[str, Any],
    response: Mapping[str, Any] | None,
    execution: Mapping[str, Any],
) -> dict[str, Any]:
    """Seal the full search result and independently gate every success claim."""

    request_hash = verify_request(request)
    if response is None:
        report: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "builderVersion": BUILDER_VERSION,
            "status": "incomplete-resource-bounded",
            "sourceHashes": _copy(request["sourceHashes"]),
            "requestSha256": request_hash,
            "targetDegrees": list(TARGET_DEGREES),
            "degreeGate": _copy(request["degreeGate"]),
            "baseExactCertificate": _copy(request["baseExactCertificate"]),
            "execution": _copy(execution),
            "compactSubgroups": [],
            "search": {
                "completeWithinDeclaredTargets": False,
                "reason": execution.get("reason", "GAP did not complete."),
            },
            "claims": [
                "exact exclusion of the declared target degrees through 97920",
                "resource-bounded accounting at degree 195840",
            ],
            "nonClaims": [
                "exhaustion at degree 195840",
                "existence or nonexistence of a torsion-free action",
            ],
        }
    else:
        validated = validate_gap_response(request, response)
        independent = None
        status = validated["status"]
        if status == "candidate-found":
            independent = independently_replay_materialized_action(
                validated["survivor"], request["ambientAction"]
            )
            if not independent["passed"]:
                raise CompositeSearchError(
                    "GAP reported a survivor that failed independent Python replay."
                )
            status = "certified-candidate"
        report = {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "builderVersion": BUILDER_VERSION,
            "status": status,
            "sourceHashes": _copy(request["sourceHashes"]),
            "requestSha256": request_hash,
            "targetDegrees": list(TARGET_DEGREES),
            "degreeGate": _copy(request["degreeGate"]),
            "baseExactCertificate": _copy(request["baseExactCertificate"]),
            "coverageUnion": validated["coverageUnion"],
            "compactSubgroups": validated["compactSubgroups"],
            "search": validated["search"],
            "survivor": validated["survivor"],
            "independentReplay": independent,
            "gapResponseSha256": validated["gapResponseSha256"],
            "tool": validated["gapTool"],
            "execution": _copy(execution),
            "claims": (
                [
                    "exact exhaustion of singleton and pairwise mod-2 stabilizer intersections through degree 195840",
                    "all compact stabilizer rows and fixed-point marks replayed in GAP",
                ]
                if status == "exact-exhausted"
                else (
                    [
                        "materialized transitive action passed independent Coxeter-relation and torsion-witness replay"
                    ]
                    if status == "certified-candidate"
                    else [
                        "exact exclusion of the declared target degrees through 97920",
                        "resource-bounded accounting at degree 195840",
                    ]
                )
            ),
            "nonClaims": [
                "completeness above degree 195,840",
                "a Davis quotient or fibering certificate",
                "torsion-freeness without complete prime-order witness provenance",
            ],
        }
    report["artifactSha256"] = sha256_json(report)
    return report


def concise_summary(report: Mapping[str, Any]) -> str:
    if report["status"] == "exact-exhausted":
        union = report.get("coverageUnion", {})
        return (
            "mod-2 symbolic composite: exact pairwise exhaustion at targets "
            + ", ".join(f"{value:,}" for value in TARGET_DEGREES)
            + f"; marks union {union.get('coveredCount', '?')}/186; no survivor"
        )
    if report["status"] == "certified-candidate":
        return (
            "mod-2 symbolic composite: independently certified survivor at degree "
            f"{report['survivor']['degree']:,}"
        )
    return (
        "mod-2 symbolic composite: exact through 97,920; "
        "degree-195,840 frontier incomplete within the declared bound"
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--action",
        type=Path,
        help=(
            "Local certified 122-point action JSON. Defaults to the tracked "
            "certificate when present, otherwise uses --wsl-action."
        ),
    )
    parser.add_argument("--wsl-action", default=DEFAULT_WSL_ACTION)
    parser.add_argument(
        "--wsl-gap",
        default="gap",
    )
    parser.add_argument("--timeout-seconds", type=int, default=1_200)
    parser.add_argument("--maximum-pair-types", type=int, default=1_035)
    parser.add_argument("--maximum-exact-double-cosets", type=int, default=1_000_000)
    parser.add_argument(
        "--maximum-larger-intersection-classes", type=int, default=2_000
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    raw_report = json.loads(args.input.read_text(encoding="utf8"))
    if not isinstance(raw_report, dict):
        raise CompositeSearchError("The symbolic report root must be an object.")
    action, action_source = load_action(args.action, args.wsl_action)
    request = build_request(
        raw_report,
        action,
        report_file_sha256=sha256_file(args.input),
        maximum_pair_types=args.maximum_pair_types,
        maximum_exact_double_cosets=args.maximum_exact_double_cosets,
        maximum_larger_intersection_classes=args.maximum_larger_intersection_classes,
    )
    response, execution = run_gap_search(
        request, wsl_gap=args.wsl_gap, timeout_seconds=args.timeout_seconds
    )
    report = build_report(request, response, execution)
    report["execution"]["actionSource"] = action_source
    report.pop("artifactSha256", None)
    report["artifactSha256"] = sha256_json(report)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf8"
        )
    print(json.dumps(report, sort_keys=True) if args.json else concise_summary(report))
    return 0 if report["status"] != "incomplete-resource-bounded" else 2


if __name__ == "__main__":
    raise SystemExit(main())
