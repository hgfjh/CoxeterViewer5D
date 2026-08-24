#!/usr/bin/env python3
"""Build hash-bound compact-cube certificates in odd characteristic.

This module deliberately leaves the sealed characteristic-three path alone.
For p in {5, 7, 11}, it transfers the integral Tits representation to GAP and
checks every maximal spherical restriction.  Equality with the standard Omega
group is then certified either by a prescribed-order GenSS chain with replayed
generator words or by the one-sided ``RecogniseClassical`` containment test.
The latter is used only when its positive containment conclusion is conclusive;
a negative or incomplete search remains an unknown exact-index result.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import mod3_structural_certificate as runtime_common  # noqa: E402
import torsion_free_discovery as spherical  # noqa: E402


SCHEMA_VERSION = 1
CERTIFICATE_VERSION = "1.0.0"
CERTIFICATE_KIND = "compact-5-cube-odd-prime-structural-certificate"
SUPPORTED_CHARACTERISTICS = (5, 7, 11)
DEFAULT_SOURCE = Path("public/examples/compact_5_cube_gamma1.json")
DEFAULT_GAP_SCRIPT = Path("scripts/gap_odd_prime_structural_certificate.g")
DEFAULT_REPLAY_GAP_SCRIPT = Path("scripts/gap_odd_prime_structural_replay.g")
DEFAULT_GAP = runtime_common.DEFAULT_GAP
DEFAULT_MANIFEST = runtime_common.DEFAULT_MANIFEST
LOWER_BOUND = 5_760
MAX_INDEX = 576_000
DEFAULT_CLASSICAL_RECOGNITION_SEED = 20_260_811
DEFAULT_CLASSICAL_RECOGNITION_SAMPLES = 256
TRI_STATES = {"verified", "unknown", "failed"}


canonical_json = runtime_common.canonical_json
sha256_bytes = runtime_common.sha256_bytes
sha256_json = runtime_common.sha256_json
require_sha256 = runtime_common.require_sha256
read_runtime_file = runtime_common.read_runtime_file
resolve_gap_runtime = runtime_common.resolve_gap_runtime
apply_process_outcome = runtime_common.apply_process_outcome
_gap_literal = runtime_common._gap_literal
_gap_path = runtime_common._gap_path
_wsl_path = runtime_common._wsl_path
_wsl_prefix = runtime_common._wsl_prefix


class CertificateError(ValueError):
    """Stored evidence is malformed, stale, or stronger than its checks."""


def portable_source_path(source_path: Path) -> str:
    resolved = source_path.resolve()
    try:
        return resolved.relative_to(REPOSITORY_ROOT.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def certificate_kind(characteristic: int) -> str:
    require_supported_characteristic(characteristic)
    return f"{CERTIFICATE_KIND}-p{characteristic}"


def default_output(characteristic: int) -> Path:
    require_supported_characteristic(characteristic)
    return Path(
        "scripts/certificates/torsion-free/"
        f"compact_5_cube_mod{characteristic}_structural_certificate.json"
    )


def require_supported_characteristic(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise CertificateError("characteristic must be an integer.")
    if value not in SUPPORTED_CHARACTERISTICS:
        supported = ", ".join(map(str, SUPPORTED_CHARACTERISTICS))
        raise CertificateError(f"characteristic must be one of {supported}.")
    return value


def normalize_coxeter_matrix(source: Mapping[str, Any]) -> list[list[int]]:
    """Read the compact-cube m=2/m=3/infinity Coxeter matrix."""

    rank = source.get("rank")
    rows = source.get("coxeterMatrix")
    if not isinstance(rank, int) or rank <= 0 or not isinstance(rows, list):
        raise CertificateError("The source has no valid Coxeter matrix.")
    matrix: list[list[int]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) != rank:
            raise CertificateError("The Coxeter matrix must be square.")
        parsed: list[int] = []
        for entry in row:
            if entry == "inf":
                parsed.append(0)
            elif isinstance(entry, int) and not isinstance(entry, bool):
                parsed.append(entry)
            else:
                raise CertificateError(f"Unsupported Coxeter entry {entry!r}.")
        matrix.append(parsed)
    if len(matrix) != rank:
        raise CertificateError("The Coxeter matrix rank does not match its rows.")
    for left in range(rank):
        for right in range(rank):
            entry = matrix[left][right]
            if entry != matrix[right][left]:
                raise CertificateError("The Coxeter matrix is not symmetric.")
            if left == right and entry != 1:
                raise CertificateError("Every Coxeter diagonal entry must be one.")
            if left != right and entry not in {0, 2, 3}:
                raise CertificateError(
                    "The integral odd-prime model supports only m=2, m=3, and infinity."
                )
    return matrix


def modular_tits_generators(
    matrix: Sequence[Sequence[int]], characteristic: int
) -> list[list[list[int]]]:
    """Return the integral Tits reflections reduced exactly modulo ``p``.

    For the compact cube, the off-diagonal Cartan coefficients are 0 for
    m=2, 1 for m=3, and 2 for the chosen infinite-edge specialization.
    """

    p = require_supported_characteristic(characteristic)
    rank = len(matrix)
    result: list[list[list[int]]] = []
    for generator in range(rank):
        rows = [
            [1 if row == column else 0 for column in range(rank)]
            for row in range(rank)
        ]
        rows[generator][generator] = p - 1
        for column in range(rank):
            if column == generator:
                continue
            relation = matrix[generator][column]
            rows[generator][column] = 2 if relation == 0 else 0 if relation == 2 else 1
        result.append(rows)
    return result


def modular_tits_form(
    matrix: Sequence[Sequence[int]], characteristic: int
) -> list[list[int]]:
    """Return the symmetric form paired with the column-action reflections."""

    p = require_supported_characteristic(characteristic)
    inverse_two = pow(2, -1, p)
    result: list[list[int]] = []
    for left in range(len(matrix)):
        row: list[int] = []
        for right in range(len(matrix)):
            if left == right:
                row.append(1)
                continue
            relation = matrix[left][right]
            coefficient = 2 if relation == 0 else 0 if relation == 2 else 1
            row.append((-inverse_two * coefficient) % p)
        result.append(row)
    return result


def maximal_spherical_records(matrix: Sequence[Sequence[int]]) -> list[dict[str, Any]]:
    records = spherical.maximal_spherical_subsets(
        matrix, {"maxSubsets": (1 << len(matrix)) - 1, "maxSphericalOrder": 1_000_000}
    )
    return [
        {
            "id": "T:" + ",".join(map(str, item.subset)),
            "subset": list(item.subset),
            "type": item.type_name,
            "expectedOrder": item.expected_order,
        }
        for item in records
    ]


def build_exact_input(
    source_path: Path,
    manifest_bytes: bytes,
    characteristic: int,
    *,
    lower_bound: int = LOWER_BOUND,
    max_index: int = MAX_INDEX,
    orbit_length_limit: int = 1_000_000,
    equality_strategy: str = "genss",
    classical_recognition_seed: int = DEFAULT_CLASSICAL_RECOGNITION_SEED,
    classical_recognition_samples: int = DEFAULT_CLASSICAL_RECOGNITION_SAMPLES,
) -> dict[str, Any]:
    p = require_supported_characteristic(characteristic)
    if lower_bound <= 0 or max_index < lower_bound or orbit_length_limit <= 0:
        raise CertificateError("Certificate bounds must be positive and ordered.")
    if equality_strategy not in {
        "genss",
        "exact-slp-finder-first",
        "genss-then-exact-slp-finder",
        "classical-containment-first",
    }:
        raise CertificateError("Unsupported odd-prime equality strategy.")
    if classical_recognition_seed <= 0 or classical_recognition_samples <= 0:
        raise CertificateError(
            "Classical-recognition seed and sample count must be positive."
        )
    source_bytes = source_path.read_bytes()
    source = json.loads(source_bytes.decode("utf8"))
    matrix = normalize_coxeter_matrix(source)
    generators = modular_tits_generators(matrix, p)
    form = modular_tits_form(matrix, p)
    spherical_records = maximal_spherical_records(matrix)
    spherical_lower_bound = math.lcm(
        *(record["expectedOrder"] for record in spherical_records)
    )
    if lower_bound % spherical_lower_bound != 0:
        raise CertificateError(
            "The requested degree divisor is not divisible by every maximal spherical order."
        )
    representation_hash = sha256_json(
        {
            "characteristic": p,
            "matrixGeneratorRows": generators,
            "preservedFormRows": form,
        }
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "mode": "generate",
        "certificateKind": certificate_kind(p),
        "certificateVersion": CERTIFICATE_VERSION,
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
        "maximalSphericalSubgroups": spherical_records,
        "sphericalCatalogueSha256": sha256_json(spherical_records),
        "characteristic": p,
        "dimension": len(matrix),
        "lowerBound": lower_bound,
        "maxIndex": max_index,
        "orbitLengthLimit": orbit_length_limit,
        "equalityStrategy": equality_strategy,
        "classicalRecognitionRandomSeed": classical_recognition_seed,
        "classicalRecognitionSamples": classical_recognition_samples,
    }


def run_gap(
    payload: dict[str, Any],
    *,
    runtime: dict[str, Any],
    script: Path,
    timeout_seconds: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run the odd-prime GAP driver and retain its latest exact checkpoint."""

    if not script.is_file():
        raise FileNotFoundError(f"GAP certificate script not found: {script}")
    with tempfile.TemporaryDirectory(prefix="coxeter-odd-prime-") as temporary:
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
            f"ODD_INPUT := {_gap_literal(payload)};;\n"
            f'ODD_OUTPUT := "{output_for_gap}";;\n'
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
        return_code: int | None = None
        stdout = ""
        stderr = ""
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
        if output.is_file():
            artifact = json.loads(output.read_text(encoding="utf8"))
        else:
            detail = (stderr or stdout or "GAP wrote no checkpoint").strip()[-4000:]
            artifact = {
                "schemaVersion": SCHEMA_VERSION,
                "certificateKind": payload["certificateKind"],
                "status": "unknown",
                "reason": (
                    "gap-timeout-no-checkpoint"
                    if timed_out
                    else "process-interrupted-no-checkpoint"
                ),
                "detail": detail,
                "provenance": payload.get("provenance", {}),
            }
        exception_marker = "ODD_EXCEPTION_STAGE="
        if exception_marker in stdout:
            stage = stdout.split(exception_marker, 1)[1].splitlines()[0].strip()
            artifact["status"] = "unknown"
            artifact["reason"] = (
                f"GAP raised an exception during {stage}; the last exact "
                "checkpoint was retained."
            )
            artifact["failureStage"] = stage
        return (
            apply_process_outcome(
                artifact, timed_out=timed_out, return_code=return_code
            ),
            {
                "timedOut": timed_out,
                "returnCode": return_code,
                "stdoutTail": stdout[-4000:],
                "stderrTail": stderr[-4000:],
            },
        )


def _status(record: Any, name: str) -> str:
    if not isinstance(record, dict) or record.get("status") not in TRI_STATES:
        raise CertificateError(f"{name}.status must be verified, unknown, or failed.")
    return str(record["status"])


def generation_evidence_payload(artifact: Mapping[str, Any]) -> dict[str, Any]:
    excluded = {
        "artifactHash",
        "execution",
        "implementation",
        "provenanceChain",
        "replayVerification",
        "reason",
        "status",
    }
    return {
        key: copy.deepcopy(value)
        for key, value in artifact.items()
        if key not in excluded
    }


def attach_evidence_hashes(artifact: dict[str, Any]) -> dict[str, Any]:
    """Seal the large exact proof components independently for replay."""

    value = copy.deepcopy(artifact)
    structural = value.get("structuralIdentification")
    if isinstance(structural, dict):
        basis = structural.get("standardFormConjugacy")
        if isinstance(basis, dict) and basis.get("status") == "verified":
            basis["basisEvidenceSha256"] = sha256_json(
                {
                    key: basis.get(key)
                    for key in (
                        "standardFormRows",
                        "formSimilitudeMultiplier",
                        "changeOfBasisRows",
                        "transformedGeneratorRows",
                    )
                }
            )
        omega = structural.get("omegaDerivedSubgroup")
        if isinstance(omega, dict):
            slps = omega.get("standardGeneratorSlps")
            if isinstance(slps, dict) and slps.get("status") == "verified":
                slps["entriesSha256"] = sha256_json(slps.get("entries", []))
                slps["standardGeneratorRowsSha256"] = sha256_json(
                    omega.get("standardOmegaGeneratorRows", [])
                )
            classical = omega.get("classicalContainment")
            if isinstance(classical, dict) and classical.get("status") == "verified":
                classical["evidenceSha256"] = sha256_json(
                    {
                        key: classical.get(key)
                        for key in (
                            "algorithm",
                            "case",
                            "isOmegaContained",
                            "oneSidedPositiveIsConclusive",
                            "negativeWouldBeInconclusive",
                            "recognitionOutputTrustedForContainment",
                            "recognitionOutputTrustedForOrder",
                            "orderTakenFromStandardOmegaAfterMutualContainment",
                            "randomSeed",
                            "requestedRandomElements",
                            "sampledRandomElements",
                            "observedElementOrders",
                            "ppdExponents",
                            "largePpdExponents",
                            "basicPpdExponents",
                            "largeBasicPpdExponents",
                            "package",
                            "packageVersion",
                            "references",
                        )
                    }
                )
    sieve = value.get("degreeSieve")
    if isinstance(sieve, dict) and isinstance(sieve.get("degreeLedger"), list):
        sieve["degreeLedgerSha256"] = sha256_json(sieve["degreeLedger"])
        sieve["maximalCatalogueSha256"] = sha256_json(
            sieve.get("maximalCatalogue", {})
        )
    return value


def attach_hashes(
    artifact: dict[str, Any],
    *,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path = DEFAULT_REPLAY_GAP_SCRIPT,
) -> dict[str, Any]:
    value = attach_evidence_hashes(artifact)
    predecessor = value.get("artifactHash")
    previous_implementation = value.get("implementation")
    previous_implementation = (
        previous_implementation if isinstance(previous_implementation, dict) else {}
    )
    generation_tool_hash = previous_implementation.get(
        "generationToolSha256"
    ) or sha256_bytes(gap_script.read_bytes())
    generation_orchestrator_hash = previous_implementation.get(
        "generationOrchestratorSha256"
    ) or sha256_bytes(orchestrator.read_bytes())
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
            require_sha256(predecessor, "predecessorArtifactHash")
            if predecessor is not None
            else None
        ),
        "claimBoundary": (
            "Spherical injectivity certifies a finite-index torsion-free kernel. "
            "Exact index and bounded degree screening require replayed Omega equality."
        ),
    }
    value.pop("artifactHash", None)
    value["artifactHash"] = sha256_json(value)
    return value


def validate_stored_artifact_hash(artifact: Mapping[str, Any]) -> None:
    claimed = require_sha256(artifact.get("artifactHash"), "artifactHash")
    unhashed = dict(artifact)
    unhashed.pop("artifactHash", None)
    if sha256_json(unhashed) != claimed:
        raise CertificateError("The artifact hash is stale.")
    chain = artifact.get("provenanceChain")
    if not isinstance(chain, dict) or chain.get(
        "generationEvidenceSha256"
    ) != sha256_json(generation_evidence_payload(artifact)):
        raise CertificateError("The generation-evidence hash is stale.")


def _validate_kernel_certificate(artifact: Mapping[str, Any]) -> None:
    kernel = artifact.get("kernelCertificate")
    status = _status(kernel, "kernelCertificate")
    if status != "verified":
        return
    assert isinstance(kernel, dict)
    checks = kernel.get("maximalSphericalRestrictionChecks")
    if (
        not isinstance(checks, list)
        or len(checks) != 32
        or any(
            not isinstance(check, dict)
            or check.get("injective") is not True
            or check.get("actualOrder") != check.get("expectedOrder")
            for check in checks
        )
    ):
        raise CertificateError(
            "A verified torsion-free kernel requires all 32 spherical restrictions."
        )
    level = kernel.get("level")
    if level not in {
        "torsion-free-finite-index-kernel-exact-index-unknown",
        "torsion-free-finite-index-kernel-exact-index-known",
    }:
        raise CertificateError("The kernel certificate has an unsupported level.")
    exact_index = kernel.get("exactIndex")
    if level == "torsion-free-finite-index-kernel-exact-index-known" and (
        isinstance(exact_index, bool) or not isinstance(exact_index, int) or exact_index <= 0
    ):
        raise CertificateError("An exact-index kernel certificate needs its index.")


def validate_certificate(
    artifact: dict[str, Any],
    *,
    source_path: Path,
    manifest_bytes: bytes,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path = DEFAULT_REPLAY_GAP_SCRIPT,
) -> dict[str, Any]:
    p = require_supported_characteristic(artifact.get("characteristic"))
    if artifact.get("schemaVersion") != SCHEMA_VERSION:
        raise CertificateError("Unsupported odd-prime certificate schemaVersion.")
    if artifact.get("certificateKind") != certificate_kind(p):
        raise CertificateError("Unexpected odd-prime certificate kind.")
    _status(artifact, "artifact")
    validate_stored_artifact_hash(artifact)
    implementation = artifact.get("implementation")
    if not isinstance(implementation, dict):
        raise CertificateError("The artifact has no implementation hashes.")
    expected_implementation = {
        "generationToolSha256": sha256_bytes(gap_script.read_bytes()),
        "replayVerifierSha256": sha256_bytes(replay_script.read_bytes()),
        "sealingOrchestratorSha256": sha256_bytes(orchestrator.read_bytes()),
    }
    for key, expected_hash in expected_implementation.items():
        if implementation.get(key) != expected_hash:
            raise CertificateError(f"The {key} is stale.")
    require_sha256(
        implementation.get("generationOrchestratorSha256"),
        "generationOrchestratorSha256",
    )
    sieve = artifact.get("degreeSieve")
    lower_bound = int(sieve.get("targetLowerBound", LOWER_BOUND)) if isinstance(sieve, dict) else LOWER_BOUND
    max_index = int(sieve.get("targetMaximum", MAX_INDEX)) if isinstance(sieve, dict) else MAX_INDEX
    chain = artifact.get("structuralIdentification", {}).get(
        "omegaDerivedSubgroup", {}
    )
    equality_search = artifact.get("equalitySearch", {})
    if not isinstance(equality_search, dict):
        raise CertificateError("The equality-search record is missing.")
    orbit_limit = int(equality_search.get("orbitLengthLimit", 1_000_000))
    equality_strategy = str(equality_search.get("strategy", "genss"))
    classical_search = equality_search.get("classicalRecognition", {})
    if not isinstance(classical_search, dict):
        raise CertificateError("The classical-recognition configuration is missing.")
    classical_seed = int(
        classical_search.get("randomSeed", DEFAULT_CLASSICAL_RECOGNITION_SEED)
    )
    classical_samples = int(
        classical_search.get(
            "requestedRandomElements", DEFAULT_CLASSICAL_RECOGNITION_SAMPLES
        )
    )
    expected = build_exact_input(
        source_path,
        manifest_bytes,
        p,
        lower_bound=lower_bound,
        max_index=max_index,
        orbit_length_limit=orbit_limit,
        equality_strategy=equality_strategy,
        classical_recognition_seed=classical_seed,
        classical_recognition_samples=classical_samples,
    )
    provenance = artifact.get("provenance")
    if not isinstance(provenance, dict):
        raise CertificateError("The artifact has no provenance record.")
    for key in (
        "matrixDigest",
        "representationSha256",
        "toolchainManifestSha256",
        "sphericalCatalogueSha256",
    ):
        if provenance.get(key) != expected[key]:
            raise CertificateError(f"The certificate has a stale {key}.")
    if provenance.get("source", {}).get("sha256") != expected["source"]["sha256"]:
        raise CertificateError("The certificate source hash is stale.")
    representation = artifact.get("representation")
    if not isinstance(representation, dict):
        raise CertificateError("The exact representation is missing.")
    if representation.get("matrixGeneratorRows") != expected["matrixGeneratorRows"]:
        raise CertificateError("Stored matrix generators differ from the exact model.")
    if representation.get("preservedFormRows") != expected["preservedFormRows"]:
        raise CertificateError("Stored invariant form differs from the exact model.")
    if artifact.get("maximalSphericalSubgroups") != expected[
        "maximalSphericalSubgroups"
    ]:
        raise CertificateError("The maximal spherical catalogue is stale.")
    if artifact.get("equalitySearch") != {
        "strategy": expected["equalityStrategy"],
        "orbitLengthLimit": expected["orbitLengthLimit"],
        "classicalRecognition": {
            "randomSeed": expected["classicalRecognitionRandomSeed"],
            "requestedRandomElements": expected["classicalRecognitionSamples"],
        },
    }:
        raise CertificateError("The equality-search configuration is stale.")
    _validate_kernel_certificate(artifact)
    structural = artifact.get("structuralIdentification")
    if not isinstance(structural, dict):
        raise CertificateError("The structural-identification record is missing.")
    for key in (
        "preservedSplitForm",
        "standardFormConjugacy",
        "omegaDerivedSubgroup",
        "indexTwoExtension",
    ):
        _status(structural.get(key), key)
    basis = structural["standardFormConjugacy"]
    if basis.get("status") == "verified":
        multiplier = basis.get("formSimilitudeMultiplier")
        if not isinstance(multiplier, int) or multiplier % p == 0:
            raise CertificateError(
                "A verified standard-form conjugacy needs a nonzero similitude multiplier."
            )
        basis_payload = {
            key: basis.get(key)
            for key in (
                "standardFormRows",
                "formSimilitudeMultiplier",
                "changeOfBasisRows",
                "transformedGeneratorRows",
            )
        }
        if basis.get("basisEvidenceSha256") != sha256_json(basis_payload):
            raise CertificateError("The standard-form basis evidence hash is stale.")
    omega = structural["omegaDerivedSubgroup"]
    if omega.get("status") == "verified":
        chain_record = omega.get("stabilizerChain")
        slps = omega.get("standardGeneratorSlps")
        genss_proof = (
            isinstance(chain_record, dict)
            and chain_record.get("isProved") is True
            and chain_record.get("prescribedOrder") == omega.get("order")
        )
        exact_slp_proof = (
            omega.get("equalityMethod")
            == "mutual containment via exactly evaluated standard-generator SLPs"
            and isinstance(omega.get("wordFinder"), dict)
            and omega["wordFinder"].get("exactWordEvaluationIsPrimaryEvidence")
            is True
            and omega["wordFinder"].get("recognitionTreeTrustedForEquality")
            is False
            and omega["wordFinder"].get("recognitionTreeTrustedForOrder") is False
        )
        classical = omega.get("classicalContainment")
        classical_proof = (
            omega.get("equalityMethod")
            == "CM_InOmega containment and conclusive one-sided classical Omega-containment"
            and isinstance(classical, dict)
            and classical.get("status") == "verified"
            and classical.get("algorithm") == "RecogniseClassical"
            and classical.get("case") == "orthogonalplus"
            and classical.get("isOmegaContained") is True
            and classical.get("oneSidedPositiveIsConclusive") is True
            and classical.get("negativeWouldBeInconclusive") is True
            and classical.get("recognitionOutputTrustedForContainment") is True
            and classical.get("recognitionOutputTrustedForOrder") is False
            and classical.get("orderTakenFromStandardOmegaAfterMutualContainment")
            is True
            and classical.get("randomSeed")
            == expected["classicalRecognitionRandomSeed"]
            and classical.get("requestedRandomElements")
            == expected["classicalRecognitionSamples"]
        )
        slp_proof_complete = (
            isinstance(slps, dict)
            and slps.get("status") == "verified"
            and isinstance(slps.get("entries"), list)
            and bool(slps["entries"])
        )
        if not (
            (genss_proof or exact_slp_proof) and slp_proof_complete
        ) and not classical_proof:
            raise CertificateError(
                "Verified Omega equality requires replayable generator words or "
                "a conclusive one-sided classical-containment certificate."
            )
        if slp_proof_complete:
            if slps.get("entriesSha256") != sha256_json(slps["entries"]):
                raise CertificateError("The standard-generator SLP hash is stale.")
            if slps.get("standardGeneratorRowsSha256") != sha256_json(
                omega.get("standardOmegaGeneratorRows", [])
            ):
                raise CertificateError("The standard Omega generator hash is stale.")
        if classical_proof:
            classical_payload = {
                key: classical.get(key)
                for key in (
                    "algorithm",
                    "case",
                    "isOmegaContained",
                    "oneSidedPositiveIsConclusive",
                    "negativeWouldBeInconclusive",
                    "recognitionOutputTrustedForContainment",
                    "recognitionOutputTrustedForOrder",
                    "orderTakenFromStandardOmegaAfterMutualContainment",
                    "randomSeed",
                    "requestedRandomElements",
                    "sampledRandomElements",
                    "observedElementOrders",
                    "ppdExponents",
                    "largePpdExponents",
                    "basicPpdExponents",
                    "largeBasicPpdExponents",
                    "package",
                    "packageVersion",
                    "references",
                )
            }
            if classical.get("evidenceSha256") != sha256_json(classical_payload):
                raise CertificateError(
                    "The one-sided classical-containment evidence hash is stale."
                )
    if not isinstance(sieve, dict):
        raise CertificateError("The degree sieve is missing.")
    ledger = sieve.get("degreeLedger")
    expected_degrees = list(range(lower_bound, max_index + 1, lower_bound))
    if not isinstance(ledger, list) or [
        row.get("degree") if isinstance(row, dict) else None for row in ledger
    ] != expected_degrees:
        raise CertificateError("The bounded degree ledger is incomplete or unordered.")
    if sieve.get("degreeLedgerSha256") != sha256_json(ledger):
        raise CertificateError("The bounded degree-ledger hash is stale.")
    if sieve.get("maximalCatalogueSha256") != sha256_json(
        sieve.get("maximalCatalogue", {})
    ):
        raise CertificateError("The maximal-catalogue hash is stale.")
    for row in ledger:
        if row.get("outcome") not in {"admissible", "impossible", "unresolved"}:
            raise CertificateError("A degree row has an unsupported outcome.")
        if row.get("classificationComplete") is True and row.get("outcome") == "unresolved":
            raise CertificateError("A complete degree row cannot remain unresolved.")
        if row.get("outcome") == "impossible" and row.get("classificationComplete") is not True:
            raise CertificateError("An impossible degree row must be complete.")
    if artifact.get("status") == "verified":
        replay = artifact.get("replayVerification")
        if not isinstance(replay, dict) or replay.get("status") != "verified":
            raise CertificateError("Overall promotion requires an exact replay seal.")
        if any(
            structural[key].get("status") != "verified"
            for key in (
                "preservedSplitForm",
                "standardFormConjugacy",
                "omegaDerivedSubgroup",
                "indexTwoExtension",
            )
        ) or sieve.get("status") != "verified":
            raise CertificateError("Overall promotion requires every structural field.")
    return expected


def build_replay_payload(artifact: Mapping[str, Any]) -> dict[str, Any]:
    structural = artifact["structuralIdentification"]
    omega = structural["omegaDerivedSubgroup"]
    sieve = artifact["degreeSieve"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "mode": "replay",
        "certificateKind": artifact["certificateKind"],
        "characteristic": artifact["characteristic"],
        "dimension": 10,
        "coxeterMatrix": artifact["coxeterMatrix"],
        "matrixGeneratorRows": artifact["representation"]["matrixGeneratorRows"],
        "preservedFormRows": artifact["representation"]["preservedFormRows"],
        "maximalSphericalSubgroups": artifact["maximalSphericalSubgroups"],
        "standardFormRows": structural["standardFormConjugacy"].get(
            "standardFormRows", []
        ),
        "formSimilitudeMultiplier": structural["standardFormConjugacy"].get(
            "formSimilitudeMultiplier", 1
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
        "classicalContainment": omega.get("classicalContainment", {}),
        "equalityMethod": omega.get("equalityMethod"),
        "outerRepresentative": structural["indexTwoExtension"],
        "lowerBound": sieve.get("targetLowerBound", LOWER_BOUND),
        "maxIndex": sieve.get("targetMaximum", MAX_INDEX),
        "storedDegreeSieve": sieve,
        "provenance": artifact["provenance"],
    }


def write_artifact(path: Path, artifact: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    # Certificate byte hashes must agree on Windows and Unix checkouts.
    with temporary.open("w", encoding="utf8", newline="\n") as handle:
        handle.write(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
    os.replace(temporary, path)


def resolve_existing(path: Path, description: str) -> Path:
    result = path.expanduser().resolve()
    if not result.is_file():
        raise FileNotFoundError(f"{description} not found: {result}")
    return result


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument(
        "mode", choices=("generate", "replay", "validate"), nargs="?", default="generate"
    )
    result.add_argument("--prime", type=int, choices=SUPPORTED_CHARACTERISTICS, required=True)
    result.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    result.add_argument("--output", type=Path)
    result.add_argument("--gap-script", type=Path, default=DEFAULT_GAP_SCRIPT)
    result.add_argument(
        "--replay-gap-script", type=Path, default=DEFAULT_REPLAY_GAP_SCRIPT
    )
    result.add_argument("--gap", default=DEFAULT_GAP)
    result.add_argument("--manifest", default=DEFAULT_MANIFEST)
    result.add_argument("--wsl-distro")
    result.add_argument("--timeout", type=int, default=7_200)
    result.add_argument("--orbit-length-limit", type=int, default=1_000_000)
    result.add_argument(
        "--equality-strategy",
        choices=(
            "auto",
            "genss",
            "exact-slp-finder-first",
            "genss-then-exact-slp-finder",
            "classical-containment-first",
        ),
        default="auto",
        help=(
            "How to prove Omega equality. auto uses GenSS for p=5,7 and the "
            "one-sided specialized classical-containment test for p=11. A "
            "negative randomized search never becomes certificate evidence."
        ),
    )
    result.add_argument(
        "--classical-recognition-seed",
        type=int,
        default=DEFAULT_CLASSICAL_RECOGNITION_SEED,
    )
    result.add_argument(
        "--classical-recognition-samples",
        type=int,
        default=DEFAULT_CLASSICAL_RECOGNITION_SAMPLES,
    )
    result.add_argument("--lower-bound", type=int, default=LOWER_BOUND)
    result.add_argument("--max-index", type=int, default=MAX_INDEX)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    p = require_supported_characteristic(args.prime)
    source = resolve_existing(args.source, "compact 5-cube source")
    gap_script = resolve_existing(args.gap_script, "GAP generation script")
    replay_script = resolve_existing(args.replay_gap_script, "GAP replay script")
    manifest_bytes = read_runtime_file(args.manifest, args.wsl_distro)
    orchestrator = Path(__file__).resolve()
    output = (args.output or default_output(p)).expanduser().resolve()

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
        print(json.dumps({"artifact": str(output), "status": artifact["status"], "validation": "passed"}, sort_keys=True))
        return 0

    runtime = resolve_gap_runtime(args.gap, args.wsl_distro)
    if args.mode == "generate":
        equality_strategy = (
            "classical-containment-first"
            if args.equality_strategy == "auto" and p == 11
            else "genss"
            if args.equality_strategy == "auto"
            else args.equality_strategy
        )
        payload = build_exact_input(
            source,
            manifest_bytes,
            p,
            lower_bound=args.lower_bound,
            max_index=args.max_index,
            orbit_length_limit=args.orbit_length_limit,
            equality_strategy=equality_strategy,
            classical_recognition_seed=args.classical_recognition_seed,
            classical_recognition_samples=args.classical_recognition_samples,
        )
        payload["provenance"] = {
            key: payload[key]
            for key in (
                "source",
                "matrixDigest",
                "representationSha256",
                "toolchainManifestSha256",
                "sphericalCatalogueSha256",
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
            artifact["reason"] = "Generation passed; independent exact replay is required."
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
        print(json.dumps({"artifact": str(output), "kernel": artifact.get("kernelCertificate", {}).get("level"), "status": artifact.get("status")}, sort_keys=True))
        return 1 if artifact.get("status") == "failed" else 0

    artifact = json.loads(output.read_text(encoding="utf8"))
    # A replay may migrate implementation seals without changing the stored
    # scientific checkpoint. Validate the predecessor before attaching the
    # current verifier hashes, then run the ordinary strict validator.
    validate_stored_artifact_hash(artifact)
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
    omega = artifact.get("structuralIdentification", {}).get("omegaDerivedSubgroup", {})
    if omega.get("status") != "verified":
        print(json.dumps({"artifact": str(output), "replay": "not-run", "reason": "Omega equality evidence is incomplete."}, sort_keys=True))
        return 0
    replay, execution = run_gap(
        build_replay_payload(artifact),
        runtime=runtime,
        script=replay_script,
        timeout_seconds=args.timeout,
    )
    artifact["replayVerification"] = {
        **replay,
        "execution": execution,
        "generationEvidenceSha256": artifact["provenanceChain"]["generationEvidenceSha256"],
    }
    if replay.get("status") == "verified":
        artifact["status"] = "verified"
        artifact["reason"] = "Exact replay verified the structural proof and degree ledger."
    elif replay.get("status") == "failed":
        artifact["status"] = "failed"
        artifact["reason"] = "Exact replay rejected stored structural evidence."
    else:
        artifact["status"] = "unknown"
        artifact["reason"] = replay.get("reason", "Exact replay was incomplete.")
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
    print(json.dumps({"artifact": str(output), "replay": replay.get("status"), "status": artifact.get("status")}, sort_keys=True))
    return 1 if replay.get("status") == "failed" else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (CertificateError, FileNotFoundError, json.JSONDecodeError) as error:
        print(f"odd-prime structural certificate: {error}", file=sys.stderr)
        raise SystemExit(2) from error
