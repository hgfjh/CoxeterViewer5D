#!/usr/bin/env python3
"""Build and replay the compact 5-cube characteristic-three certificate.

The certificate is deliberately self-contained: it stores the small exact
matrix representation, both bilinear forms, the change of basis, and any SLP
evidence GAP actually constructs.  Hash checks happen before GAP is invoked,
so a stale source file or toolchain can never inherit an earlier conclusion.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import posixpath
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence


SCHEMA_VERSION = 1
CERTIFICATE_KIND = "compact-5-cube-mod3-structural-certificate"
DEFAULT_SOURCE = Path("public/examples/compact_5_cube_gamma1.json")
DEFAULT_OUTPUT = Path(
    "scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json"
)
DEFAULT_GAP_SCRIPT = Path("scripts/gap_mod3_structural_certificate.g")
DEFAULT_REPLAY_GAP_SCRIPT = Path("scripts/gap_mod3_structural_replay.g")
DEFAULT_GAP = "~/.local/opt/coxeter-gap/gap-4.16.0/gap"
DEFAULT_MANIFEST = "~/.local/share/coxeter-viewer/gap-4.16.0/toolchain-manifest.json"
TRI_STATES = {"verified", "unknown", "failed"}


class CertificateError(ValueError):
    """Raised when stored evidence is malformed, stale, or overclaims a result."""


def portable_source_path(source_path: Path) -> str:
    resolved = source_path.resolve()
    repository_root = Path(__file__).resolve().parent.parent
    try:
        return resolved.relative_to(repository_root).as_posix()
    except ValueError:
        return resolved.as_posix()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf8"))


def require_sha256(value: Any, name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise CertificateError(f"{name} must be a lowercase SHA-256 digest.")
    return value


def normalize_coxeter_matrix(source: dict[str, Any]) -> list[list[int]]:
    rank = source.get("rank")
    rows = source.get("coxeterMatrix")
    if not isinstance(rank, int) or rank <= 0 or not isinstance(rows, list):
        raise CertificateError("The source has no valid Coxeter matrix.")
    matrix: list[list[int]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) != rank:
            raise CertificateError("The Coxeter matrix must be square.")
        parsed: list[int] = []
        for value in row:
            if value == "inf":
                parsed.append(0)
            elif isinstance(value, int) and not isinstance(value, bool):
                parsed.append(value)
            else:
                raise CertificateError(f"Unsupported Coxeter entry {value!r}.")
        matrix.append(parsed)
    if len(matrix) != rank:
        raise CertificateError("The Coxeter matrix rank does not match its rows.")
    for left in range(rank):
        for right in range(rank):
            value = matrix[left][right]
            if matrix[right][left] != value:
                raise CertificateError("The Coxeter matrix is not symmetric.")
            if left == right and value != 1:
                raise CertificateError("Every Coxeter diagonal entry must be one.")
            if left != right and value not in {0, 2, 3}:
                raise CertificateError(
                    "This integral GF(3) model supports only m=2, m=3, and infinity."
                )
    return matrix


def integral_tits_generators(matrix: Sequence[Sequence[int]]) -> list[list[list[int]]]:
    """Return the exact integral Tits matrices reduced modulo three."""

    rank = len(matrix)
    generators: list[list[list[int]]] = []
    for generator in range(rank):
        rows = [
            [1 if row == column else 0 for column in range(rank)] for row in range(rank)
        ]
        rows[generator][generator] = 2  # -1 in GF(3)
        for column in range(rank):
            if column == generator:
                continue
            relation = matrix[generator][column]
            rows[generator][column] = 2 if relation == 0 else 0 if relation == 2 else 1
        generators.append(rows)
    return generators


def integral_tits_form(matrix: Sequence[Sequence[int]]) -> list[list[int]]:
    """Return the symmetric form preserved by the column-action matrices."""

    rank = len(matrix)
    rows: list[list[int]] = []
    for left in range(rank):
        row: list[int] = []
        for right in range(rank):
            if left == right:
                row.append(1)
                continue
            relation = matrix[left][right]
            coefficient = 2 if relation == 0 else 0 if relation == 2 else 1
            # B_ij=-coefficient/2 and 2^-1=2 in GF(3).
            row.append((-2 * coefficient) % 3)
        rows.append(row)
    return rows


def build_exact_input(source_path: Path, manifest_bytes: bytes) -> dict[str, Any]:
    source_bytes = source_path.read_bytes()
    source = json.loads(source_bytes.decode("utf8"))
    matrix = normalize_coxeter_matrix(source)
    generators = integral_tits_generators(matrix)
    form = integral_tits_form(matrix)
    representation_hash = sha256_json(
        {
            "characteristic": 3,
            "matrixGeneratorRows": generators,
            "preservedFormRows": form,
        }
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "mode": "generate",
        "certificateKind": CERTIFICATE_KIND,
        "source": {
            "name": str(source.get("name", "compact 5-cube")),
            "path": portable_source_path(source_path),
            "sha256": sha256_bytes(source_bytes),
        },
        "matrixDigest": sha256_json({"coxeterMatrix": matrix}),
        "representationSha256": representation_hash,
        "toolchainManifestSha256": sha256_bytes(manifest_bytes),
        "coxeterMatrix": matrix,
        "matrixGeneratorRows": generators,
        "preservedFormRows": form,
        "characteristic": 3,
        "dimension": len(matrix),
        "lowerBound": 5_760,
        "maxIndex": 576_000,
    }


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
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_gap_literal(item) for item in value) + "]"
    if isinstance(value, dict):
        fields: list[str] = []
        for key in sorted(value):
            if not isinstance(key, str) or not key.replace("_", "a").isalnum():
                raise CertificateError(f"Unsupported GAP record key {key!r}.")
            fields.append(f"{key}:={_gap_literal(value[key])}")
        return "rec(" + ",".join(fields) + ")"
    raise CertificateError(f"Cannot encode {type(value).__name__} as a GAP literal.")


def _gap_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace('"', '\\"')


def _wsl_prefix(distro: str | None) -> list[str]:
    command = ["wsl"]
    if distro:
        command.extend(["-d", distro])
    command.append("--")
    return command


def _wsl_path(path: Path, distro: str | None) -> str:
    windows_path = str(path.resolve()).replace("\\", "/")
    completed = subprocess.run(
        [*_wsl_prefix(distro), "wslpath", "-a", "-u", windows_path],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _resolve_wsl_location(location: str, distro: str | None) -> str:
    if location == "~" or location.startswith("~/"):
        # Resolve HOME separately. Passing "$HOME" as part of a readlink
        # expression proved brittle when Windows launched WSL through pnpm or
        # PowerShell, and it could silently resolve against the wrong home.
        completed = subprocess.run(
            [*_wsl_prefix(distro), "bash", "-lc", 'printf "%s\\n" "$HOME"'],
            check=False,
            capture_output=True,
            text=True,
        )
        home = completed.stdout.strip()
        if completed.returncode != 0 or not home.startswith("/"):
            detail = completed.stderr.strip()
            raise FileNotFoundError(
                f"WSL home directory cannot be resolved: {detail or 'empty HOME'}"
            )
        suffix = "" if location == "~" else location[2:]
        return posixpath.normpath(posixpath.join(home, suffix))

    expression = shlex.quote(location)
    completed = subprocess.run(
        [
            *_wsl_prefix(distro),
            "bash",
            "-lc",
            f"readlink -f -- {expression}",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    resolved = completed.stdout.strip()
    if completed.returncode != 0 or not resolved:
        detail = completed.stderr.strip()
        raise FileNotFoundError(f"WSL path cannot be resolved: {location}: {detail}")
    return resolved


def read_runtime_file(location: str, distro: str | None) -> bytes:
    """Read a native or WSL file without assuming which home directory owns it."""

    native = Path(location).expanduser()
    if native.is_file():
        return native.read_bytes()
    if os.name != "nt":
        raise FileNotFoundError(f"Runtime file not found: {native}")
    resolved = _resolve_wsl_location(location, distro)
    completed = subprocess.run(
        [*_wsl_prefix(distro), "cat", resolved],
        check=False,
        capture_output=True,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf8", "replace").strip()
        raise FileNotFoundError(f"WSL runtime file not found: {location}: {detail}")
    return completed.stdout


def resolve_gap_runtime(location: str, distro: str | None) -> dict[str, Any]:
    """Resolve GAP either natively or inside the configured WSL distribution."""

    native = Path(location).expanduser()
    if native.is_file():
        return {"kind": "native", "command": [str(native.resolve())]}
    if os.name != "nt":
        raise FileNotFoundError(f"Research GAP executable not found: {native}")
    resolved = _resolve_wsl_location(location, distro)
    completed = subprocess.run(
        [*_wsl_prefix(distro), "test", "-x", resolved],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise FileNotFoundError(f"Research GAP executable not found in WSL: {location}")
    return {
        "kind": "wsl",
        "command": [*_wsl_prefix(distro), resolved],
        "distro": distro,
    }


def run_gap(
    payload: dict[str, Any],
    *,
    runtime: dict[str, Any],
    script: Path,
    timeout_seconds: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run GAP and retain its latest fail-closed checkpoint on timeout."""

    if not script.is_file():
        raise FileNotFoundError(f"GAP certificate script not found: {script}")
    with tempfile.TemporaryDirectory(prefix="coxeter-mod3-") as temporary:
        root = Path(temporary)
        output = root / "gap-certificate.json"
        driver = root / "driver.g"
        if runtime["kind"] == "wsl":
            distro = runtime.get("distro")
            output_for_gap = _wsl_path(output, distro)
            script_for_gap = _wsl_path(script, distro)
        else:
            output_for_gap = _gap_path(output)
            script_for_gap = _gap_path(script)
        driver.write_text(
            f"MOD3_INPUT := {_gap_literal(payload)};;\n"
            f'MOD3_OUTPUT := "{output_for_gap}";;\n'
            f'Read("{script_for_gap}");;\n',
            encoding="utf8",
        )
        if runtime["kind"] == "wsl":
            driver_for_gap = _wsl_path(driver, runtime.get("distro"))
            command = [
                *_wsl_prefix(runtime.get("distro")),
                "timeout",
                "--signal=TERM",
                "--kill-after=5s",
                str(max(1, timeout_seconds)),
                runtime["command"][-1],
                "-r",
                "-q",
                "--quitonbreak",
                "--nointeract",
                driver_for_gap,
            ]
        else:
            command = [
                *runtime["command"],
                "-r",
                "-q",
                "--quitonbreak",
                "--nointeract",
                str(driver),
            ]
        timed_out = False
        stdout = ""
        stderr = ""
        return_code: int | None = None
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=(
                    max(15, timeout_seconds + 10)
                    if runtime["kind"] == "wsl"
                    else max(1, timeout_seconds)
                ),
            )
            return_code = completed.returncode
            stdout, stderr = completed.stdout, completed.stderr
            if runtime["kind"] == "wsl" and return_code in {124, 137, 143}:
                timed_out = True
        except subprocess.TimeoutExpired as error:
            timed_out = True
            stdout = (
                (error.stdout or b"").decode("utf8", "replace")
                if isinstance(error.stdout, bytes)
                else (error.stdout or "")
            )
            stderr = (
                (error.stderr or b"").decode("utf8", "replace")
                if isinstance(error.stderr, bytes)
                else (error.stderr or "")
            )
        if not output.is_file():
            detail = (stderr or stdout or "GAP wrote no checkpoint").strip()[-4000:]
            return (
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "certificateKind": CERTIFICATE_KIND,
                    "status": "unknown",
                    "reason": (
                        "gap-timeout-no-checkpoint"
                        if timed_out
                        else "process-interrupted-no-checkpoint"
                    ),
                    "detail": detail,
                    "provenance": (
                        payload["provenance"]
                        if isinstance(payload.get("provenance"), dict)
                        else {
                            key: payload[key]
                            for key in (
                                "source",
                                "matrixDigest",
                                "representationSha256",
                                "toolchainManifestSha256",
                            )
                            if key in payload
                        }
                    ),
                },
                {"timedOut": timed_out, "returnCode": return_code},
            )
        raw_output = output.read_text(encoding="utf8")
        try:
            artifact = json.loads(raw_output)
        except json.JSONDecodeError as error:
            start = max(0, error.pos - 240)
            end = min(len(raw_output), error.pos + 240)
            raise CertificateError(
                "GAP wrote invalid JSON near "
                f"offset {error.pos}: {raw_output[start:end]!r}"
            ) from error
        artifact = apply_process_outcome(
            artifact, timed_out=timed_out, return_code=return_code
        )
        return artifact, {"timedOut": timed_out, "returnCode": return_code}


def apply_process_outcome(
    artifact: dict[str, Any], *, timed_out: bool, return_code: int | None
) -> dict[str, Any]:
    """Classify process completion without inventing a mathematical failure.

    A signal, timeout, or wrapper failure says only that GAP did not finish.  A
    scientific ``failed`` status is retained solely when GAP wrote that status
    after an exact check failed.
    """

    value = dict(artifact)
    if value.get("status") == "failed":
        return value
    if timed_out:
        value["status"] = "unknown"
        value["reason"] = "gap-timeout-after-checkpoint"
    elif return_code not in {0, None}:
        value["status"] = "unknown"
        value["reason"] = "process-interrupted-after-checkpoint"
    return value


def _status(record: Any, name: str) -> str:
    if not isinstance(record, dict) or record.get("status") not in TRI_STATES:
        raise CertificateError(f"{name}.status must be verified, unknown, or failed.")
    return str(record["status"])


def validate_stored_artifact_hash(artifact: dict[str, Any]) -> None:
    """Check the existing seal before any implementation-hash migration."""

    claimed_hash = require_sha256(artifact.get("artifactHash"), "artifactHash")
    unhashed = dict(artifact)
    unhashed.pop("artifactHash", None)
    if sha256_json(unhashed) != claimed_hash:
        raise CertificateError("The artifact hash is stale.")
    provenance_chain = artifact.get("provenanceChain")
    if isinstance(provenance_chain, dict) and provenance_chain.get(
        "generationEvidenceSha256"
    ) != sha256_json(generation_evidence_payload(artifact)):
        raise CertificateError("The generation-evidence hash is stale.")


def generation_evidence_payload(artifact: dict[str, Any]) -> dict[str, Any]:
    """Return the scientific checkpoint independently of later replay seals."""

    excluded = {
        "artifactHash",
        "execution",
        "implementation",
        "provenanceChain",
        "replayVerification",
        "reason",
        "status",
    }
    value = {
        key: copy.deepcopy(item)
        for key, item in artifact.items()
        if key not in excluded
    }
    structural = value.get("structuralIdentification")
    omega = (
        structural.get("omegaDerivedSubgroup") if isinstance(structural, dict) else None
    )
    if isinstance(omega, dict):
        omega.pop("auxiliaryRecognition", None)
    return value


def attach_hashes(
    artifact: dict[str, Any],
    *,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path = DEFAULT_REPLAY_GAP_SCRIPT,
) -> dict[str, Any]:
    value = dict(artifact)
    previous_hash = value.get("artifactHash")
    previous_implementation = value.get("implementation")
    previous_implementation = (
        previous_implementation if isinstance(previous_implementation, dict) else {}
    )
    generation_tool_hash = previous_implementation.get(
        "generationToolSha256", previous_implementation.get("gapScriptSha256")
    ) or sha256_bytes(gap_script.read_bytes())
    generation_orchestrator_hash = previous_implementation.get(
        "generationOrchestratorSha256",
        previous_implementation.get("orchestratorSha256"),
    ) or sha256_bytes(orchestrator.read_bytes())
    if "generationOutcome" not in value:
        value["generationOutcome"] = {
            "status": value.get("status", "unknown"),
            "reason": value.get("reason", "generation outcome unavailable"),
            "execution": value.get("execution"),
        }
    value["implementation"] = {
        "generationToolSha256": require_sha256(
            generation_tool_hash, "generationToolSha256"
        ),
        "generationOrchestratorSha256": require_sha256(
            generation_orchestrator_hash, "generationOrchestratorSha256"
        ),
        "replayVerifierSha256": sha256_bytes(replay_script.read_bytes()),
        "sealingOrchestratorSha256": sha256_bytes(orchestrator.read_bytes()),
    }
    value["provenanceChain"] = {
        "generationEvidenceSha256": sha256_json(generation_evidence_payload(value)),
        "predecessorArtifactHash": (
            require_sha256(previous_hash, "predecessorArtifactHash")
            if previous_hash is not None
            else None
        ),
        "claimBoundary": (
            "Generation records attempted recognition. Promotion requires the "
            "separately hashed exact replay verifier."
        ),
    }
    value.pop("artifactHash", None)
    value["artifactHash"] = sha256_json(value)
    return value


def validate_certificate(
    artifact: dict[str, Any],
    *,
    source_path: Path,
    manifest_bytes: bytes,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path = DEFAULT_REPLAY_GAP_SCRIPT,
) -> dict[str, Any]:
    if artifact.get("schemaVersion") != SCHEMA_VERSION:
        raise CertificateError("Unsupported mod-3 certificate schemaVersion.")
    if artifact.get("certificateKind") != CERTIFICATE_KIND:
        raise CertificateError("Unexpected mod-3 certificate kind.")
    _status(artifact, "artifact")
    generation_outcome = artifact.get("generationOutcome")
    if not isinstance(generation_outcome, dict):
        raise CertificateError("The artifact has no immutable generation outcome.")
    _status(generation_outcome, "generationOutcome")
    validate_stored_artifact_hash(artifact)

    expected = build_exact_input(source_path, manifest_bytes)
    provenance = artifact.get("provenance")
    if not isinstance(provenance, dict):
        raise CertificateError("The artifact has no provenance record.")
    for key in ("matrixDigest", "representationSha256", "toolchainManifestSha256"):
        if provenance.get(key) != expected[key]:
            raise CertificateError(f"The certificate has a stale {key}.")
    source = provenance.get("source")
    if (
        not isinstance(source, dict)
        or source.get("sha256") != expected["source"]["sha256"]
    ):
        raise CertificateError("The certificate source hash is stale.")
    implementation = artifact.get("implementation")
    if not isinstance(implementation, dict):
        raise CertificateError("The artifact has no implementation hashes.")
    generation_tool_hash = require_sha256(
        implementation.get("generationToolSha256"), "generationToolSha256"
    )
    if generation_tool_hash != sha256_bytes(gap_script.read_bytes()):
        raise CertificateError("The GAP generation-tool hash is stale.")
    require_sha256(
        implementation.get("generationOrchestratorSha256"),
        "generationOrchestratorSha256",
    )
    if implementation.get("replayVerifierSha256") != sha256_bytes(
        replay_script.read_bytes()
    ):
        raise CertificateError("The GAP replay-verifier hash is stale.")
    if implementation.get("sealingOrchestratorSha256") != sha256_bytes(
        orchestrator.read_bytes()
    ):
        raise CertificateError("The Python sealing-orchestrator hash is stale.")
    provenance_chain = artifact.get("provenanceChain")
    if not isinstance(provenance_chain, dict):
        raise CertificateError(
            "The artifact has no generation/replay provenance chain."
        )
    if provenance_chain.get("generationEvidenceSha256") != sha256_json(
        generation_evidence_payload(artifact)
    ):
        raise CertificateError("The generation-evidence hash is stale.")
    predecessor = provenance_chain.get("predecessorArtifactHash")
    if predecessor is not None:
        require_sha256(predecessor, "predecessorArtifactHash")

    representation = artifact.get("representation")
    if not isinstance(representation, dict):
        raise CertificateError("The exact representation is missing.")
    if representation.get("matrixGeneratorRows") != expected["matrixGeneratorRows"]:
        raise CertificateError("Stored GF(3) generators differ from the source model.")
    if representation.get("preservedFormRows") != expected["preservedFormRows"]:
        raise CertificateError("Stored GF(3) form differs from the source model.")
    if artifact.get("coxeterMatrix") != expected["coxeterMatrix"]:
        raise CertificateError("Stored Coxeter matrix differs from the source model.")

    structural = artifact.get("structuralIdentification")
    if not isinstance(structural, dict):
        raise CertificateError("The structural-identification section is missing.")
    form_status = _status(structural.get("preservedSplitForm"), "preservedSplitForm")
    basis_status = _status(
        structural.get("standardFormConjugacy"), "standardFormConjugacy"
    )
    omega_status = _status(
        structural.get("omegaDerivedSubgroup"), "omegaDerivedSubgroup"
    )
    outer_status = _status(structural.get("indexTwoExtension"), "indexTwoExtension")
    sieve = artifact.get("degreeSieve")
    sieve_status = _status(sieve, "degreeSieve")
    if artifact.get("status") == "verified" and {
        form_status,
        basis_status,
        omega_status,
        outer_status,
        sieve_status,
    } != {"verified"}:
        raise CertificateError("Overall verification requires every promotion field.")
    replay = artifact.get("replayVerification")
    if artifact.get("status") == "verified" and (
        not isinstance(replay, dict) or replay.get("status") != "verified"
    ):
        raise CertificateError("Overall verification requires an exact replay seal.")
    if omega_status == "verified":
        omega = structural["omegaDerivedSubgroup"]
        slps = omega.get("standardGeneratorSlps")
        if not isinstance(slps, dict) or slps.get("status") != "verified":
            raise CertificateError("Verified Omega equality requires replayable SLPs.")
        chain = omega.get("stabilizerChain")
        chain_verified = (
            isinstance(chain, dict)
            and chain.get("status") == "verified"
            and chain.get("isProved") is True
            and chain.get("prescribedOrder") == omega.get("order")
            and chain.get("orbitLengthLimit") == 60_000
            and chain.get("errorBoundNumerator") == 1
            and chain.get("errorBoundDenominator") == 1_048_576
        )
        orbit = omega.get("faithfulOrbit")
        tree = omega.get("recognitionTree")
        orbit_verified = (
            isinstance(orbit, dict)
            and orbit.get("status") == "verified"
            and orbit.get("kernelTrivialBySpanningOrbit") is True
            and orbit.get("orderEquality") is True
            and orbit.get("spanRank") == 10
            and orbit.get("moduleDimension") == 10
            and orbit.get("permutationActionOrder") == omega.get("order")
            and orbit.get("standardOmegaOrder") == omega.get("order")
        )
        tree_verified = (
            isinstance(tree, dict)
            and tree.get("status") == "verified"
            and tree.get("isCorrect") is True
            and tree.get("isReady") is True
        )
        if not chain_verified and not orbit_verified and not tree_verified:
            raise CertificateError(
                "Verified Omega equality requires GenSS, a faithful orbit, or a verified recog tree."
            )
        if chain_verified:
            if slps.get("evidenceFormat") != "genss-composed-straight-line-program":
                raise CertificateError(
                    "GenSS promotion requires composed straight-line programs."
                )
            entries = slps.get("entries")
            if not isinstance(entries, list) or not entries:
                raise CertificateError("The standard-generator SLP list is empty.")
            if any(
                not isinstance(entry, dict) or not isinstance(entry.get("lines"), list)
                for entry in entries
            ):
                raise CertificateError("A GenSS standard-generator SLP is malformed.")
        elif orbit_verified:
            if slps.get("evidenceFormat") != "free-group-extrep-signed-words":
                raise CertificateError(
                    "Faithful-orbit promotion requires signed free-group words."
                )
            entries = slps.get("entries")
            if not isinstance(entries, list) or not entries:
                raise CertificateError("The standard-generator word list is empty.")
            target_indices = sorted(
                entry.get("targetIndex") for entry in entries if isinstance(entry, dict)
            )
            if target_indices != list(range(len(entries))):
                raise CertificateError(
                    "Standard-generator word targets are incomplete or duplicated."
                )
            for entry in entries:
                if (
                    entry.get("wordFormat") != "free-group-extrep"
                    or not isinstance(entry.get("extRep"), list)
                    or len(entry["extRep"]) % 2 != 0
                ):
                    raise CertificateError(
                        "A signed standard-generator word is malformed."
                    )
    if isinstance(sieve, dict):
        ledger = sieve.get("degreeLedger")
        if not isinstance(ledger, list):
            raise CertificateError("degreeSieve.degreeLedger must be an array.")
        expected_degrees = list(range(5_760, 576_000 + 1, 5_760))
        actual_degrees = [
            row.get("degree") if isinstance(row, dict) else None for row in ledger
        ]
        if actual_degrees != expected_degrees:
            raise CertificateError(
                "The degree ledger must contain exactly 100 rows for 5760..576000."
            )
        for row in ledger:
            if row.get("outcome") not in {"admissible", "impossible", "unresolved"}:
                raise CertificateError("A degree row has an unsupported outcome.")
            if (
                row.get("outcome") == "impossible"
                and row.get("classificationComplete") is not True
            ):
                raise CertificateError("An incomplete degree row cannot be impossible.")
    return expected


def build_replay_payload(artifact: dict[str, Any]) -> dict[str, Any]:
    structural = artifact["structuralIdentification"]
    omega = structural["omegaDerivedSubgroup"]
    sieve = artifact["degreeSieve"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "mode": "replay",
        "certificateKind": CERTIFICATE_KIND,
        "coxeterMatrix": artifact["coxeterMatrix"],
        "characteristic": 3,
        "dimension": 10,
        "matrixGeneratorRows": artifact["representation"]["matrixGeneratorRows"],
        "preservedFormRows": artifact["representation"]["preservedFormRows"],
        "standardFormRows": structural["standardFormConjugacy"].get(
            "standardFormRows", []
        ),
        "changeOfBasisRows": structural["standardFormConjugacy"].get(
            "changeOfBasisRows", []
        ),
        "transformedGeneratorRows": structural["standardFormConjugacy"].get(
            "transformedGeneratorRows", []
        ),
        "evenGeneratorRows": omega.get("evenGeneratorRows", []),
        "standardOmegaGeneratorRows": omega.get("standardOmegaGeneratorRows", []),
        "standardGeneratorSlps": omega.get("standardGeneratorSlps", {}),
        "stabilizerChain": omega.get("stabilizerChain", {}),
        "faithfulOrbit": omega.get("faithfulOrbit", {}),
        "outerRepresentative": structural["indexTwoExtension"],
        "lowerBound": int(sieve.get("targetLowerBound", 5_760)),
        "maxIndex": int(sieve.get("targetMaximum", 576_000)),
        "maxSubgroupNodes": int(sieve.get("configuredNodeCap", 20_000)),
        "storedDegreeSieve": sieve,
        "provenance": artifact["provenance"],
    }


def build_auxiliary_recog_payload(artifact: dict[str, Any]) -> dict[str, Any]:
    """Build the bounded, non-promotion recog diagnostic payload."""

    payload = build_replay_payload(artifact)
    payload["mode"] = "auxiliary-recog"
    return payload


def attach_auxiliary_recognition(
    artifact: dict[str, Any],
    *,
    runtime: dict[str, Any],
    replay_script: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    """Store a strictly bounded recog diagnostic without changing proof status."""

    structural = artifact.get("structuralIdentification")
    omega = (
        structural.get("omegaDerivedSubgroup") if isinstance(structural, dict) else None
    )
    if not isinstance(omega, dict) or omega.get("status") != "verified":
        return artifact
    verifier_hash = sha256_bytes(replay_script.read_bytes())
    existing = omega.get("auxiliaryRecognition")
    if (
        isinstance(existing, dict)
        and existing.get("status") in TRI_STATES
        and existing.get("verifierSha256") == verifier_hash
        and existing.get("strictTimeLimitSeconds") == max(1, timeout_seconds)
    ):
        if (
            isinstance(existing.get("execution"), dict)
            and existing["execution"].get("timedOut") is True
        ):
            existing["status"] = "unknown"
            existing["reason"] = "auxiliary-recog-skipped-after-strict-time-bound"
        return artifact
    diagnostic, execution = run_gap(
        build_auxiliary_recog_payload(artifact),
        runtime=runtime,
        script=replay_script,
        timeout_seconds=max(1, timeout_seconds),
    )
    if execution.get("timedOut") is True:
        diagnostic["status"] = "unknown"
        diagnostic["reason"] = "auxiliary-recog-skipped-after-strict-time-bound"
    omega["auxiliaryRecognition"] = {
        **diagnostic,
        "execution": execution,
        "strictTimeLimitSeconds": max(1, timeout_seconds),
        "verifierSha256": verifier_hash,
        "blocking": False,
    }
    return artifact


def write_artifact(path: Path, artifact: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(artifact, indent=2, sort_keys=True) + "\n"
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    # Certificate byte hashes must agree on Windows and Unix checkouts.
    with temporary.open("w", encoding="utf8", newline="\n") as handle:
        handle.write(encoded)
    os.replace(temporary, path)


def resolve_existing(path: Path, description: str) -> Path:
    value = path.expanduser().resolve()
    if not value.is_file():
        raise FileNotFoundError(f"{description} not found: {value}")
    return value


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument(
        "mode",
        choices=("generate", "replay", "validate"),
        nargs="?",
        default="generate",
    )
    value.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    value.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    value.add_argument("--gap-script", type=Path, default=DEFAULT_GAP_SCRIPT)
    value.add_argument(
        "--replay-gap-script", type=Path, default=DEFAULT_REPLAY_GAP_SCRIPT
    )
    value.add_argument(
        "--gap",
        default=DEFAULT_GAP,
        help="Native GAP executable or Linux path inside WSL.",
    )
    value.add_argument(
        "--manifest",
        default=DEFAULT_MANIFEST,
        help="Native manifest file or Linux path inside WSL.",
    )
    value.add_argument("--wsl-distro", help="Optional WSL distribution name.")
    value.add_argument("--timeout", type=int, default=3600)
    value.add_argument("--aux-recog-timeout", type=int, default=20)
    value.add_argument("--max-subgroup-nodes", type=int, default=20_000)
    return value


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    source = resolve_existing(args.source, "compact 5-cube source")
    gap_script = resolve_existing(args.gap_script, "GAP generation script")
    replay_script = resolve_existing(
        args.replay_gap_script, "GAP replay-verifier script"
    )
    manifest_bytes = read_runtime_file(args.manifest, args.wsl_distro)
    orchestrator = Path(__file__).resolve()
    output = args.output.expanduser().resolve()

    if args.mode == "validate":
        artifact = json.loads(output.read_text(encoding="utf8"))
        validate_certificate(
            artifact,
            source_path=source,
            manifest_bytes=manifest_bytes,
            gap_script=gap_script,
            orchestrator=orchestrator,
            replay_script=replay_script,
        )
        print(
            json.dumps(
                {
                    "artifact": str(output),
                    "artifactHash": artifact["artifactHash"],
                    "status": artifact.get("status"),
                    "validation": "passed",
                },
                sort_keys=True,
            )
        )
        return 0

    runtime = resolve_gap_runtime(args.gap, args.wsl_distro)

    if args.mode == "generate":
        payload = build_exact_input(source, manifest_bytes)
        payload["maxSubgroupNodes"] = max(1, args.max_subgroup_nodes)
        payload["provenance"] = {
            key: payload[key]
            for key in (
                "source",
                "matrixDigest",
                "representationSha256",
                "toolchainManifestSha256",
            )
        }
        artifact, execution = run_gap(
            payload, runtime=runtime, script=gap_script, timeout_seconds=args.timeout
        )
        artifact["execution"] = execution
        artifact["generationOutcome"] = {
            "status": artifact.get("status", "unknown"),
            "reason": artifact.get("reason", "generation outcome unavailable"),
            "execution": execution,
        }
        if artifact.get("status") == "verified":
            artifact["status"] = "unknown"
            artifact["reason"] = (
                "Generation checks passed; exact replay is required for promotion."
            )
        artifact = attach_auxiliary_recognition(
            artifact,
            runtime=runtime,
            replay_script=replay_script,
            timeout_seconds=args.aux_recog_timeout,
        )
        artifact = attach_hashes(
            artifact,
            gap_script=gap_script,
            orchestrator=orchestrator,
            replay_script=replay_script,
        )
        write_artifact(output, artifact)
        validate_certificate(
            artifact,
            source_path=source,
            manifest_bytes=manifest_bytes,
            gap_script=gap_script,
            orchestrator=orchestrator,
            replay_script=replay_script,
        )
        print(
            json.dumps(
                {
                    "artifact": str(output),
                    "artifactHash": artifact["artifactHash"],
                    "status": artifact.get("status"),
                    "sieveStatus": artifact.get("degreeSieve", {}).get("status"),
                    "unresolvedFrontiers": len(
                        artifact.get("degreeSieve", {}).get("unresolvedFrontier", [])
                    ),
                },
                sort_keys=True,
            )
        )
        return 1 if artifact.get("status") == "failed" else 0

    artifact = json.loads(output.read_text(encoding="utf8"))
    validate_stored_artifact_hash(artifact)
    if artifact.get("status") == "verified" and not isinstance(
        artifact.get("replayVerification"), dict
    ):
        artifact["status"] = "unknown"
        artifact["reason"] = (
            "Generation checks passed; exact replay is required for promotion."
        )
    artifact = attach_hashes(
        artifact,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_script,
    )
    artifact = attach_auxiliary_recognition(
        artifact,
        runtime=runtime,
        replay_script=replay_script,
        timeout_seconds=args.aux_recog_timeout,
    )
    artifact = attach_hashes(
        artifact,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_script,
    )
    write_artifact(output, artifact)
    validate_certificate(
        artifact,
        source_path=source,
        manifest_bytes=manifest_bytes,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_script,
    )
    replay, execution = run_gap(
        build_replay_payload(artifact),
        runtime=runtime,
        script=replay_script,
        timeout_seconds=args.timeout,
    )
    artifact["replayVerification"] = {**replay, "execution": execution}
    if replay.get("status") == "verified":
        artifact["status"] = "verified"
        artifact["reason"] = "Exact independent replay verified every promotion field."
    elif replay.get("status") == "failed":
        artifact["status"] = "failed"
        artifact["reason"] = "Exact replay rejected stored certificate evidence."
    else:
        artifact["status"] = "unknown"
        artifact["reason"] = replay.get(
            "reason", "Exact replay left a scientific frontier unresolved."
        )
    artifact = attach_hashes(
        artifact,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_script,
    )
    write_artifact(output, artifact)
    validate_certificate(
        artifact,
        source_path=source,
        manifest_bytes=manifest_bytes,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_script,
    )
    print(
        json.dumps(
            {
                "artifact": str(output),
                "artifactHash": artifact["artifactHash"],
                "replay": replay.get("status", "unknown"),
                "reason": replay.get("reason"),
                "execution": execution,
            },
            sort_keys=True,
        )
    )
    return 1 if replay.get("status") == "failed" else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (CertificateError, FileNotFoundError, json.JSONDecodeError) as error:
        print(f"mod3 structural certificate: {error}", file=sys.stderr)
        raise SystemExit(2) from error
