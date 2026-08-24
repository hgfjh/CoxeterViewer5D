#!/usr/bin/env python3
"""Run the three bounded torsion-free-cover searches under one contract.

The coordinator does not decide that a subgroup is torsion-free.  Each track
produces search evidence, and a materialized action still passes through the
independent spherical-orbit certifier before it can enter the Davis-quotient
pipeline.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from discovery_runtime.processes import ManagedProcessRunner
import torsion_free_discovery as discovery


SCRIPT_DIR = Path(__file__).resolve().parent
SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-coordinated-cover-search"
TRACK_ARTIFACT_TYPE = "coxeter-cover-search-track"
TRACKS = {
    "finite-target-synthesis": SCRIPT_DIR / "finite_target_synthesis.py",
    "everitt-composite-modules": SCRIPT_DIR / "everitt_composite_portfolio.py",
    "geometric-orbifold-cover": SCRIPT_DIR / "orbifold_cover_search.py",
}


class CoordinatorError(RuntimeError):
    """A track artifact or coordinator input violated the search contract."""


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def prime_factorization(value: int) -> dict[int, int]:
    """Factor a positive search divisor without floating-point arithmetic."""

    if value < 1:
        raise ValueError("factorization input must be positive")
    factors: dict[int, int] = {}
    divisor = 2
    remainder = value
    while divisor * divisor <= remainder:
        while remainder % divisor == 0:
            factors[divisor] = factors.get(divisor, 0) + 1
            remainder //= divisor
        divisor = 3 if divisor == 2 else divisor + 2
    if remainder > 1:
        factors[remainder] = factors.get(remainder, 0) + 1
    return factors


def divisibility_certificate(
    maximal: Sequence[Mapping[str, Any]], lower_bound: int
) -> dict[str, Any]:
    """Record which local finite groups force each prime-power divisor."""

    factorization = prime_factorization(lower_bound)
    prime_powers: list[dict[str, Any]] = []
    for prime, exponent in sorted(factorization.items()):
        witnesses = []
        for subgroup in maximal:
            subgroup_exponent = prime_factorization(int(subgroup["order"])).get(
                prime, 0
            )
            if subgroup_exponent == exponent:
                witnesses.append(str(subgroup["id"]))
        prime_powers.append(
            {
                "prime": prime,
                "exponent": exponent,
                "value": prime**exponent,
                "witnessSubgroupIds": witnesses,
            }
        )
    return {
        "lowerBoundDivisor": lower_bound,
        "primeFactorization": [
            {"prime": prime, "exponent": exponent}
            for prime, exponent in sorted(factorization.items())
        ],
        "primePowerWitnesses": prime_powers,
        "criterion": "free-restriction-to-every-spherical-special-subgroup",
        "maximalSphericalSubgroups": list(maximal),
        "necessaryNotSufficient": True,
    }


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def source_plan(path: Path) -> tuple[dict[str, Any], int, list[dict[str, Any]]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CoordinatorError(f"Cannot read Coxeter input {path}: {exc}") from exc
    source, matrix = discovery.validate_source(raw)
    maximal = discovery.maximal_spherical_subsets(
        matrix, {"maxSubsets": 65_536, "maxSphericalOrder": 1_000_000}
    )
    lower_bound = math.lcm(*(item.expected_order for item in maximal))
    catalogue = [
        {
            "id": "T:" + ",".join(map(str, item.subset)),
            "subset": list(item.subset),
            "type": item.type_name,
            "order": item.expected_order,
        }
        for item in maximal
    ]
    return source, lower_bound, catalogue


@dataclass(frozen=True)
class TrackRun:
    track: str
    status: str
    complete: bool
    artifact_path: str | None
    artifact_sha256: str | None
    returncode: int
    timed_out: bool
    cancelled: bool
    memory_enforcement: str
    candidate_count: int
    warnings: tuple[str, ...]
    errors: tuple[str, ...]


def _as_string_list(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(str(item) for item in value)


def _candidate_count(value: Mapping[str, Any]) -> int:
    candidates = value.get("candidates")
    if isinstance(candidates, list):
        return len(candidates)
    candidate = value.get("candidate")
    return int(candidate is not None)


def validate_track_artifact(
    path: Path,
    *,
    track: str,
    input_hash: str,
    lower_bound: int,
) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CoordinatorError(f"Cannot read {track} artifact {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CoordinatorError(f"{track} artifact is not a JSON object")
    if value.get("schemaVersion") != SCHEMA_VERSION:
        raise CoordinatorError(f"{track} artifact has an unsupported schemaVersion")
    if value.get("artifactType") != TRACK_ARTIFACT_TYPE:
        raise CoordinatorError(f"{track} artifact has the wrong artifactType")
    if value.get("track") != track:
        raise CoordinatorError(f"{track} artifact identifies another search track")
    if value.get("inputHash") != input_hash:
        raise CoordinatorError(f"{track} artifact belongs to another input file")
    if int(value.get("lowerBoundDivisor", 0)) != lower_bound:
        raise CoordinatorError(f"{track} artifact uses another index divisor")
    if not isinstance(value.get("complete"), bool):
        raise CoordinatorError(f"{track} artifact does not declare completeness")
    supplied_hash = value.get("artifactHash")
    expected_hash = sha256_text(
        canonical_json(
            {key: item for key, item in value.items() if key != "artifactHash"}
        )
    )
    if supplied_hash != expected_hash:
        raise CoordinatorError(f"{track} artifact hash does not replay")
    return value


def _track_command(
    *,
    track: str,
    script: Path,
    input_path: Path,
    output_path: Path,
    dry_run: bool,
    catalogues: Sequence[Path],
    witness_catalogue: Path | None,
) -> list[str]:
    command = [
        sys.executable,
        str(script),
        "--input",
        str(input_path),
        "--output",
        str(output_path),
    ]
    if dry_run:
        command.append("--dry-run")
    else:
        checkpoint = output_path.with_name(output_path.stem + ".checkpoint.json")
        command.extend(["--checkpoint", str(checkpoint)])
        if track == "everitt-composite-modules":
            seal = checkpoint.with_name(checkpoint.name + ".integrity.json")
            # A partial checkpoint pair is evidence of interrupted or altered
            # state.  Ask the worker to validate it and fail closed rather than
            # quietly erasing the surviving file.
            if checkpoint.exists() or seal.exists():
                command.append("--resume")
        elif track == "geometric-orbifold-cover" and checkpoint.exists():
            command.append("--resume")
    if track == "everitt-composite-modules":
        for catalogue in catalogues:
            command.extend(["--catalogue", str(catalogue)])
        if witness_catalogue is not None:
            command.extend(["--witness-catalogue", str(witness_catalogue)])
    return command


def run_track(
    *,
    track: str,
    script: Path,
    input_path: Path,
    output_dir: Path,
    input_hash: str,
    lower_bound: int,
    dry_run: bool,
    catalogues: Sequence[Path],
    witness_catalogue: Path | None,
    timeout_seconds: int,
    memory_limit_bytes: int,
) -> TrackRun:
    artifact_path = output_dir / f"{track}.json"
    stdout_path = output_dir / "logs" / f"{track}.stdout.log"
    stderr_path = output_dir / "logs" / f"{track}.stderr.log"
    if not script.is_file():
        return TrackRun(
            track,
            "failed",
            False,
            None,
            None,
            127,
            False,
            False,
            "not-started",
            0,
            (),
            (f"Track script is missing: {script}",),
        )
    command = _track_command(
        track=track,
        script=script,
        input_path=input_path,
        output_path=artifact_path,
        dry_run=dry_run,
        catalogues=catalogues,
        witness_catalogue=witness_catalogue,
    )
    result = ManagedProcessRunner().run(
        command,
        cwd=SCRIPT_DIR.parent,
        timeout_seconds=timeout_seconds,
        memory_limit_bytes=memory_limit_bytes,
        stdout_path=stdout_path,
        stderr_path=stderr_path,
    )
    if not artifact_path.is_file():
        reason = result.termination_reason or f"exit status {result.returncode}"
        return TrackRun(
            track,
            "timeout" if result.timed_out else "failed",
            False,
            None,
            None,
            result.returncode,
            result.timed_out,
            result.cancelled,
            result.memory_enforcement,
            0,
            (),
            (f"Track produced no artifact ({reason}). See {stderr_path}.",),
        )
    try:
        artifact = validate_track_artifact(
            artifact_path,
            track=track,
            input_hash=input_hash,
            lower_bound=lower_bound,
        )
    except CoordinatorError as exc:
        return TrackRun(
            track,
            "failed",
            False,
            str(artifact_path),
            sha256_file(artifact_path),
            result.returncode,
            result.timed_out,
            result.cancelled,
            result.memory_enforcement,
            0,
            (),
            (str(exc),),
        )
    return TrackRun(
        track=track,
        status=str(artifact.get("status", "incomplete")),
        complete=bool(artifact["complete"]),
        artifact_path=str(artifact_path),
        artifact_sha256=sha256_file(artifact_path),
        returncode=result.returncode,
        timed_out=result.timed_out,
        cancelled=result.cancelled,
        memory_enforcement=result.memory_enforcement,
        candidate_count=_candidate_count(artifact),
        warnings=_as_string_list(artifact.get("warnings")),
        errors=_as_string_list(artifact.get("errors")),
    )


def coordinated_search(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    input_path = Path(args.input).resolve()
    source, lower_bound, maximal = source_plan(input_path)
    # Bind every track to the file as supplied. Decoding and re-encoding here
    # would make line endings or a UTF-8 BOM invisible to the coordinator.
    input_hash = sha256_file(input_path)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = tuple(dict.fromkeys(args.track)) if args.track else tuple(TRACKS)
    unknown = sorted(set(selected) - set(TRACKS))
    if unknown:
        raise CoordinatorError(f"Unknown search tracks: {', '.join(unknown)}")
    catalogues = tuple(Path(path).resolve() for path in args.catalogue)
    missing_catalogues = [path for path in catalogues if not path.is_file()]
    if missing_catalogues:
        raise CoordinatorError(
            "Missing module catalogues: "
            + ", ".join(str(path) for path in missing_catalogues)
        )
    witness_catalogue = (
        None if args.witness_catalogue is None else Path(args.witness_catalogue).resolve()
    )
    if witness_catalogue is not None and not witness_catalogue.is_file():
        raise CoordinatorError(f"Missing witness catalogue: {witness_catalogue}")

    per_track_memory = max(256 * 1024 * 1024, args.max_memory_bytes // len(selected))
    runs: list[TrackRun] = []
    with ThreadPoolExecutor(max_workers=min(args.parallel, len(selected))) as executor:
        futures = {
            executor.submit(
                run_track,
                track=track,
                script=TRACKS[track],
                input_path=input_path,
                output_dir=output_dir,
                input_hash=input_hash,
                lower_bound=lower_bound,
                dry_run=args.dry_run,
                catalogues=catalogues,
                witness_catalogue=witness_catalogue,
                timeout_seconds=args.timeout,
                memory_limit_bytes=per_track_memory,
            ): track
            for track in selected
        }
        for future in as_completed(futures):
            runs.append(future.result())
    runs.sort(key=lambda run: run.track)

    passing_statuses = {"candidate-found", "passed"}
    candidate_tracks = [
        run.track
        for run in runs
        if run.status in passing_statuses and run.candidate_count > 0
    ]
    all_complete = all(run.complete for run in runs)
    any_failed = any(run.status in {"failed", "timeout", "cancelled"} for run in runs)
    status = (
        "candidate-found"
        if candidate_tracks
        else "failed"
        if any_failed
        else "exhausted"
        if all_complete
        else "incomplete"
    )
    artifact: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "status": status,
        "complete": all_complete,
        "sourceSystem": {"name": source["name"], "rank": source["rank"]},
        "inputHash": input_hash,
        "inputFileSha256": sha256_file(input_path),
        "indexDivisibility": divisibility_certificate(maximal, lower_bound),
        "execution": {
            "parallelTracks": min(args.parallel, len(selected)),
            "perTrackMemoryLimitBytes": per_track_memory,
            "timeoutSecondsPerTrack": args.timeout,
            "dryRun": args.dry_run,
        },
        "tracks": [asdict(run) for run in runs],
        "candidateTracks": candidate_tracks,
        "promotionGate": {
            "automaticPromotion": False,
            "required": [
                "complete generator permutations",
                "independent Coxeter relation replay",
                "regular orbits for every maximal spherical subgroup",
                "complete prime-order witness fixed-point replay",
            ],
            "reason": (
                "Search candidates are evidence until the materialized-action "
                "pipeline independently certifies them."
            ),
        },
        "warnings": [warning for run in runs for warning in run.warnings],
        "errors": [error for run in runs for error in run.errors],
    }
    artifact["artifactHash"] = sha256_text(canonical_json(artifact))
    output_path = Path(args.output).resolve() if args.output else output_dir / "summary.json"
    atomic_write_json(output_path, artifact)
    return artifact, 0 if not any_failed else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", default="public/examples/compact_5_cube_gamma1.json"
    )
    parser.add_argument("--output-dir", default=".cover-search/coordinated")
    parser.add_argument("--output")
    parser.add_argument("--track", action="append", choices=sorted(TRACKS))
    parser.add_argument("--catalogue", action="append", default=[])
    parser.add_argument("--witness-catalogue")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--parallel", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=7_200)
    parser.add_argument("--max-memory-bytes", type=int, default=12 * 1024**3)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.parallel < 1 or args.timeout < 1 or args.max_memory_bytes < 1:
        raise SystemExit("parallel, timeout, and max-memory-bytes must be positive")
    try:
        artifact, code = coordinated_search(args)
    except CoordinatorError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps(artifact, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
