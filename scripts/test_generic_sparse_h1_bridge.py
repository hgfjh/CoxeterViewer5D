#!/usr/bin/env python3
"""Focused tests for the source-bound generic external H1 bridge."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import generic_sparse_h1_bridge as bridge
import lift_modular_kernel as lift


SCRIPT_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_ROOT.parent
TS_RANK_FIXTURE_ROOT = REPOSITORY_ROOT / "tests" / "fixtures" / "generic-sparse-h1"


def write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def sha(path: Path) -> str:
    return bridge.file_sha256(path)[0]


def write_modular_basis(path: Path, prime: int) -> None:
    inverse_two = pow(2, -1, prime)
    # Columns are mixed by [[2,1],[1,1]], whose determinant is one.
    normalized = [[1, 0, inverse_two], [0, 1, inverse_two]]
    vectors = [
        [
            (2 * normalized[0][coordinate] + normalized[1][coordinate]) % prime
            for coordinate in range(3)
        ],
        [
            (normalized[0][coordinate] + normalized[1][coordinate]) % prime
            for coordinate in range(3)
        ],
    ]
    lines = [f"3 2 {prime} 1"]
    for basis, vector in enumerate(vectors):
        entries = []
        for column, value in enumerate(vector):
            if value:
                symmetric = value - prime if value > prime // 2 else value
                entries.append((column, symmetric))
        words = [str(basis), str(len(entries))]
        for column, value in entries:
            words.extend([str(column), str(value)])
        lines.append(" ".join(words))
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


class GenericSparseH1BridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.request_path = self.root / "request.json"
        self.response_path = self.root / "response.json"
        self.matrix_path = self.root / "matrix.linbox"
        self.matrix_path.write_text("1 3 S\n3 0 -1 1 -1 2 2\n", encoding="ascii")
        self.bounds_dict = {
            "maxMatrixBytes": 1_000_000,
            "maxPreparationCertificateBytes": 1_000_000,
            "maxToolBytes": 100_000_000,
            "maxRows": 100,
            "maxColumns": 100,
            "maxNonzeros": 1_000,
            "maxCoefficientDigits": 100,
            "maxPrimeCount": 4,
            "maxTranscriptBytes": 1_000_000,
            "maxNullity": 20,
            "maxDenseLiftEntries": 10_000,
            "maxIntegralBasisBytes": 1_000_000,
            "maxLiftCertificateBytes": 1_000_000,
            "maxRankCertificateBytes": 1_000_000,
            "maxKernelNonzeros": 10_000,
            "maxMinorWorkingNonzeros": 10_000,
            "maxFieldOperations": 1_000_000,
            "workerTimeoutSeconds": 30,
        }
        self.bounds = bridge.parse_bounds(self.bounds_dict)
        self.matrix = bridge.summarize_matrix(self.matrix_path, self.bounds)

        self.preparation_path = self.root / "preparation.json"
        preparation_without_digest = {
            "schemaVersion": 1,
            "kind": "generic-streamed-integral-h1-preparation",
            "status": "prepared",
            "source": {
                "systemCanonicalSha256": bridge.canonical_sha256({"system": 1}),
                "oracleStructureHash": bridge.canonical_sha256({"oracle": 1}),
                "actionRowsCanonicalSha256": bridge.canonical_sha256({"action": 1}),
            },
            "graph": {
                "cotreeDigest": bridge.canonical_sha256({"cotree": 1}),
            },
            "boundary": {
                "rowCount": self.matrix.rows,
                "columnCount": self.matrix.columns,
                "nonzeroCount": self.matrix.nonzero_count,
                "maximumAbsoluteCoefficient": str(
                    self.matrix.maximum_absolute_coefficient
                ),
                "sparseBoundaryDigest": bridge.canonical_sha256({"boundary": 1}),
            },
            "export": {
                "linboxSparseRow": {
                    "logicalExportDigest": bridge.canonical_sha256(
                        {"linbox-export": 1}
                    ),
                    "genericSparseMatrixDigest": self.matrix.generic_sparse_matrix_digest,
                }
            },
            "checks": {"allRowsStreamed": True},
        }
        self.preparation = {
            **preparation_without_digest,
            "preparationDigest": bridge.canonical_sha256(preparation_without_digest),
        }
        write_json(self.preparation_path, self.preparation)
        self.bindings = bridge.preparation_bindings(self.preparation)
        self.bindings["torsion-free-certificate"] = bridge.canonical_sha256(
            {"torsionFreeCertificate": 1}
        )

        self.transcript_path = self.root / "kernel-p11.txt"
        write_modular_basis(self.transcript_path, 11)
        self.integral_basis_path = self.root / "integral-basis.txt"
        self.lift_certificate_path = self.root / "lift-certificate.json"
        status = lift.main(
            [
                "lift",
                "--matrix",
                str(self.matrix_path),
                "--basis",
                str(self.transcript_path),
                "--output",
                str(self.integral_basis_path),
                "--certificate",
                str(self.lift_certificate_path),
                "--preparation-digest",
                self.bindings["preparation"],
                "--core-matrix-digest",
                self.matrix.generic_sparse_matrix_digest,
                "--ledger-digest",
                self.bindings["linbox-export"],
            ]
        )
        self.assertEqual(status, 0)

        executable = Path(sys.executable)
        driver = SCRIPT_ROOT / "streamed_h1_core_nullspace.cpp"
        lift_script = SCRIPT_ROOT / "lift_modular_kernel.py"
        self.request = {
            "schemaVersion": 1,
            "kind": bridge.REQUEST_KIND,
            "executionMode": "consume-existing",
            "torsionFreeCertificateCanonicalSha256": self.bindings[
                "torsion-free-certificate"
            ],
            "preparation": {
                "path": self.preparation_path.name,
                "sha256": sha(self.preparation_path),
            },
            "matrix": {
                "path": self.matrix_path.name,
                "sha256": self.matrix.byte_sha256,
                "genericSparseMatrixDigest": self.matrix.generic_sparse_matrix_digest,
                "rows": self.matrix.rows,
                "columns": self.matrix.columns,
                "nonzeroCount": self.matrix.nonzero_count,
                "maximumAbsoluteCoefficient": str(
                    self.matrix.maximum_absolute_coefficient
                ),
            },
            "linboxWorker": {
                "executablePath": str(executable),
                "executableSha256": sha(executable),
                "driverSourcePath": str(driver),
                "driverSourceSha256": sha(driver),
                "backend": "LinBox/Givaro test provenance",
                "backendVersion": "fixture",
                "algorithm": "GaussDomain::InPlaceLinearPivoting + nullspacebasis",
            },
            "modularRuns": [
                {
                    "prime": 11,
                    "transcriptPath": self.transcript_path.name,
                    "expectedSha256": sha(self.transcript_path),
                }
            ],
            "lift": {
                "scriptPath": str(lift_script),
                "scriptSha256": sha(lift_script),
                "integralBasisPath": self.integral_basis_path.name,
                "certificatePath": self.lift_certificate_path.name,
                "expectedIntegralBasisSha256": sha(self.integral_basis_path),
                "expectedCertificateSha256": sha(self.lift_certificate_path),
            },
            "bounds": self.bounds_dict,
            "requestDigest": "",
        }
        self.seal_request()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def seal_request(self) -> None:
        payload = dict(self.request)
        payload.pop("requestDigest", None)
        self.request["requestDigest"] = bridge.canonical_sha256(payload)
        write_json(self.request_path, self.request)

    def make_rank_certificate(self) -> Path:
        prime = 11
        source_bindings = bridge.rank_source_bindings(self.bindings)
        binding_digest = bridge.canonical_sha256(
            {
                "schemaVersion": 1,
                "method": "caller-sources-plus-canonical-sparse-matrix",
                "sourceBindings": source_bindings,
                "matrixDigest": self.matrix.generic_sparse_matrix_digest,
            }
        )
        worker_request_digest = bridge.canonical_sha256(
            {
                "schemaVersion": 1,
                "kind": "generic-sparse-modular-rank-worker-request",
                "algorithmVersion": bridge.RANK_ALGORITHM,
                "modulusPrime": prime,
                "sourceBindings": source_bindings,
                "matrix": {
                    "schemaVersion": 1,
                    "rowCount": 1,
                    "columnCount": 3,
                },
                "matrixDigest": self.matrix.generic_sparse_matrix_digest,
                "bindingDigest": binding_digest,
            }
        )
        pivot_rows = [0]
        pivot_columns = [0]
        determinant = 10
        free_columns = [1, 2]
        kernel_basis = [
            {"chartColumn": 1, "entries": [[0, 10], [1, 1]]},
            {"chartColumn": 2, "entries": [[0, 2], [2, 1]]},
        ]
        lower = {
            "pivotRows": pivot_rows,
            "pivotColumns": pivot_columns,
            "minorDeterminantResidue": determinant,
            "minorDigest": bridge.canonical_sha256(
                {
                    "schemaVersion": 1,
                    "method": "selected-original-row-column-minor",
                    "matrixDigest": self.matrix.generic_sparse_matrix_digest,
                    "prime": prime,
                    "pivotRows": pivot_rows,
                    "pivotColumns": pivot_columns,
                    "determinantResidue": determinant,
                }
            ),
        }
        upper = {
            "freeColumns": free_columns,
            "kernelBasis": kernel_basis,
            "kernelBasisDigest": bridge.canonical_sha256(
                {
                    "schemaVersion": 1,
                    "method": "right-kernel-free-column-identity-chart",
                    "matrixDigest": self.matrix.generic_sparse_matrix_digest,
                    "prime": prime,
                    "freeColumns": free_columns,
                    "kernelBasis": kernel_basis,
                }
            ),
        }
        without_digest = {
            "schemaVersion": 1,
            "kind": bridge.RANK_KIND,
            "status": "passed",
            "method": "nonzero-pivot-minor-plus-right-kernel-identity-chart",
            "algorithmVersion": bridge.RANK_ALGORITHM,
            "source": {
                "sourceBindings": source_bindings,
                "matrixDigest": self.matrix.generic_sparse_matrix_digest,
                "bindingDigest": binding_digest,
                "workerRequestDigest": worker_request_digest,
            },
            "matrix": {
                "rowCount": 1,
                "columnCount": 3,
                "nonzeroCount": 3,
                "maximumAbsoluteCoefficient": "2",
            },
            "modulusPrime": prime,
            "rank": 1,
            "nullity": 2,
            "lowerBound": lower,
            "upperBound": upper,
            "backend": {
                "name": "fixture",
                "version": "1",
                "algorithm": "fixture",
                "exactFieldArithmetic": True,
            },
            "execution": {
                "fieldOperations": 0,
                "pivotRowScans": 0,
                "maximumWorkingNonzeros": 3,
                "kernelNonzeroCount": 4,
            },
        }
        certificate = {
            **without_digest,
            "certificateDigest": bridge.canonical_sha256(without_digest),
        }
        path = self.root / "rank-certificate.json"
        write_json(path, certificate)
        return path

    def write_rank_evidence(
        self, path: Path, *, determinant: int = 10, first_residue: int = 10
    ) -> None:
        with path.open("w", encoding="ascii", newline="\n") as stream:
            stream.write(
                "\n".join(
                    [
                        f"GENERIC_SPARSE_H1_RANK_EVIDENCE_V1 1 3 11 1 2 {determinant}",
                        "PIVOT_ROWS 1 0",
                        "PIVOT_COLUMNS 1 0",
                        "FREE_COLUMNS 2 1 2",
                        f"VECTOR 1 2 0 {first_residue} 1 1",
                        "VECTOR 2 2 0 2 2 1",
                    ]
                )
                + "\n"
            )

    def point_request_at_lift(self, basis: Path, certificate: Path) -> None:
        self.request["lift"]["integralBasisPath"] = basis.name
        self.request["lift"]["certificatePath"] = certificate.name
        self.request["lift"]["expectedIntegralBasisSha256"] = sha(basis)
        self.request["lift"]["expectedCertificateSha256"] = sha(certificate)
        self.seal_request()

    def test_backend_rank_is_not_promoted_without_a_proof_certificate(self) -> None:
        response = bridge.build_response(self.request_path, execute=False)
        self.assertEqual(response["status"], "verified-saturated-frame-only")
        self.assertFalse(response["claim"]["exactFiniteFieldRankCertified"])
        self.assertFalse(response["claim"]["fullIntegralKernelCertified"])
        self.assertNotIn("integralKernelRank", response["claim"])
        self.assertEqual(response["modularRuns"][0]["reportedRank"], 1)
        self.assertFalse(response["modularRuns"][0]["rankClaimedFromBackendReport"])

    def test_proof_carrying_rank_promotes_the_saturated_frame(self) -> None:
        rank_path = self.make_rank_certificate()
        self.request["rankProof"] = {
            "certificatePath": rank_path.name,
            "certificateSha256": sha(rank_path),
        }
        self.seal_request()
        response = bridge.build_response(self.request_path, execute=False)
        self.assertEqual(response["status"], "verified-full-integral-kernel")
        self.assertTrue(response["rankProof"]["lowerBoundReplayed"])
        self.assertTrue(response["rankProof"]["upperBoundReplayed"])
        self.assertEqual(response["claim"]["integralKernelRank"], 2)
        self.assertTrue(response["claim"]["fullIntegralKernelCertified"])

    def test_rank_worker_evidence_emits_a_replayed_certificate(self) -> None:
        evidence_path = self.root / "rank-evidence.txt"
        output_path = self.root / "rank-certificate-from-worker.json"
        self.write_rank_evidence(evidence_path)
        self.assertEqual(
            bridge.main(
                [
                    "emit-rank-certificate",
                    str(self.request_path),
                    str(evidence_path),
                    str(output_path),
                ]
            ),
            0,
        )
        certificate = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertEqual(certificate["rank"], 1)
        self.assertEqual(certificate["nullity"], 2)
        self.assertEqual(
            certificate["source"]["sourceBindings"],
            bridge.rank_source_bindings(self.bindings),
        )

        self.request["rankProof"] = {
            "certificatePath": output_path.name,
            "certificateSha256": sha(output_path),
        }
        self.seal_request()
        response = bridge.build_response(self.request_path, execute=False)
        self.assertEqual(response["status"], "verified-full-integral-kernel")
        self.assertEqual(response["claim"]["integralKernelRank"], 2)

        original = output_path.read_bytes()
        self.assertEqual(
            bridge.main(
                [
                    "emit-rank-certificate",
                    str(self.request_path),
                    str(evidence_path),
                    str(output_path),
                ]
            ),
            2,
        )
        self.assertEqual(output_path.read_bytes(), original)

    def test_rank_evidence_is_replayed_before_certificate_publication(self) -> None:
        cases = [(9, 10), (10, 9)]
        for index, (determinant, first_residue) in enumerate(cases):
            with self.subTest(determinant=determinant, residue=first_residue):
                evidence_path = self.root / f"bad-rank-evidence-{index}.txt"
                output_path = self.root / f"bad-rank-certificate-{index}.json"
                self.write_rank_evidence(
                    evidence_path,
                    determinant=determinant,
                    first_residue=first_residue,
                )
                self.assertEqual(
                    bridge.main(
                        [
                            "emit-rank-certificate",
                            str(self.request_path),
                            str(evidence_path),
                            str(output_path),
                        ]
                    ),
                    2,
                )
                self.assertFalse(output_path.exists())

    def test_full_response_emits_a_typescript_adapter_witness_without_overwrite(
        self,
    ) -> None:
        rank_path = self.make_rank_certificate()
        self.request["rankProof"] = {
            "certificatePath": rank_path.name,
            "certificateSha256": sha(rank_path),
        }
        self.seal_request()
        output = self.root / "adapter-integral-kernel.json"
        self.assertEqual(
            bridge.main(["emit-witness", str(self.request_path), str(output)]), 0
        )
        witness = json.loads(output.read_text(encoding="utf-8"))
        payload = dict(witness)
        supplied_digest = payload.pop("witnessDigest")
        self.assertEqual(supplied_digest, bridge.canonical_sha256(payload))
        self.assertEqual(
            witness["source"],
            {
                "preparationDigest": self.bindings["preparation"],
                "boundaryMatrixDigest": self.matrix.generic_sparse_matrix_digest,
                "modularRankCertificateDigest": json.loads(
                    rank_path.read_text(encoding="utf-8")
                )["certificateDigest"],
            },
        )
        self.assertEqual(len(witness["basis"]), 2)
        self.assertTrue(all(vector["entries"] for vector in witness["basis"]))
        original = output.read_bytes()
        self.assertEqual(
            bridge.main(["emit-witness", str(self.request_path), str(output)]), 2
        )
        self.assertEqual(output.read_bytes(), original)

    def test_replay_rebuilds_the_response_and_rejects_a_resealed_claim(self) -> None:
        response = bridge.build_response(self.request_path, execute=False)
        write_json(self.response_path, response)
        self.assertEqual(
            bridge.main(["replay", str(self.request_path), str(self.response_path)]),
            0,
        )
        forged = dict(response)
        forged["claim"] = dict(response["claim"])
        forged["claim"]["fullIntegralKernelCertified"] = True
        payload = dict(forged)
        payload.pop("responseDigest")
        forged["responseDigest"] = bridge.canonical_sha256(payload)
        write_json(self.response_path, forged)
        self.assertEqual(
            bridge.main(["replay", str(self.request_path), str(self.response_path)]),
            2,
        )

    def test_source_and_matrix_tampering_are_rejected(self) -> None:
        self.request["matrix"]["genericSparseMatrixDigest"] = "0" * 64
        self.seal_request()
        with self.assertRaisesRegex(bridge.BridgeError, "genericSparseMatrixDigest"):
            bridge.build_response(self.request_path, execute=False)

    def test_rank_proof_is_bound_to_the_declared_torsion_free_certificate(
        self,
    ) -> None:
        rank_path = self.make_rank_certificate()
        self.request["rankProof"] = {
            "certificatePath": rank_path.name,
            "certificateSha256": sha(rank_path),
        }
        self.request["torsionFreeCertificateCanonicalSha256"] = "0" * 64
        self.seal_request()
        with self.assertRaisesRegex(bridge.BridgeError, "source bindings differ"):
            bridge.build_response(self.request_path, execute=False)

    def test_rank_replay_digests_the_same_matrix_pass_used_for_the_proof(self) -> None:
        rank_path = self.make_rank_certificate()
        certificate = json.loads(rank_path.read_text(encoding="utf-8"))
        # This identity-chart vector is closed for the substitute matrix below,
        # while every recorded source digest still names the original matrix.
        certificate["upperBound"]["kernelBasis"][0]["entries"][0][1] = 1
        certificate["upperBound"]["kernelBasisDigest"] = bridge.canonical_sha256(
            {
                "schemaVersion": 1,
                "method": "right-kernel-free-column-identity-chart",
                "matrixDigest": self.matrix.generic_sparse_matrix_digest,
                "prime": 11,
                "freeColumns": certificate["upperBound"]["freeColumns"],
                "kernelBasis": certificate["upperBound"]["kernelBasis"],
            }
        )
        payload = dict(certificate)
        payload.pop("certificateDigest")
        certificate["certificateDigest"] = bridge.canonical_sha256(payload)
        write_json(rank_path, certificate)

        substitute = self.root / "proof-substitute.linbox"
        substitute.write_text("1 3 S\n3 0 -1 1 1 2 2\n", encoding="ascii")
        self.assertEqual(
            bridge.summarize_matrix(substitute, self.bounds).nonzero_count,
            self.matrix.nonzero_count,
        )
        with self.assertRaisesRegex(bridge.BridgeError, "changed after validation"):
            bridge.replay_rank_certificate(
                rank_path,
                sha(rank_path),
                substitute,
                self.matrix,
                self.bindings,
                self.bounds,
                self.request_path,
            )

    def test_same_statistics_different_matrix_is_rejected_by_preparation_digest(
        self,
    ) -> None:
        substitute = self.root / "same-statistics.linbox"
        substitute.write_text("1 3 S\n3 0 -1 1 1 2 2\n", encoding="ascii")
        summary = bridge.summarize_matrix(substitute, self.bounds)
        self.assertEqual(
            (
                summary.rows,
                summary.columns,
                summary.nonzero_count,
                summary.maximum_absolute_coefficient,
            ),
            (
                self.matrix.rows,
                self.matrix.columns,
                self.matrix.nonzero_count,
                self.matrix.maximum_absolute_coefficient,
            ),
        )
        self.request["matrix"] = {
            "path": substitute.name,
            "sha256": summary.byte_sha256,
            "genericSparseMatrixDigest": summary.generic_sparse_matrix_digest,
            "rows": summary.rows,
            "columns": summary.columns,
            "nonzeroCount": summary.nonzero_count,
            "maximumAbsoluteCoefficient": str(summary.maximum_absolute_coefficient),
        }
        self.seal_request()
        with self.assertRaisesRegex(bridge.BridgeError, "source-bound preparation"):
            bridge.build_response(self.request_path, execute=False)

    def test_invalid_execute_runs_launch_nothing_and_create_nothing(self) -> None:
        self.request["executionMode"] = "execute-workers"
        self.request["lift"].pop("expectedIntegralBasisSha256")
        self.request["lift"].pop("expectedCertificateSha256")
        cases = [
            ([{"prime": 9, "transcriptPath": "new-p9.txt"}], 4),
            (
                [
                    {"prime": 11, "transcriptPath": "new-p11.txt"},
                    {"prime": 13, "transcriptPath": "new-p13.txt"},
                ],
                1,
            ),
        ]
        for runs, maximum in cases:
            with self.subTest(runs=runs):
                self.request["modularRuns"] = runs
                self.request["bounds"]["maxPrimeCount"] = maximum
                self.seal_request()
                with mock.patch.object(bridge.subprocess, "run") as launched:
                    with self.assertRaises(bridge.BridgeError):
                        bridge.build_response(self.request_path, execute=True)
                    launched.assert_not_called()
                for run in runs:
                    self.assertFalse((self.root / run["transcriptPath"]).exists())

    def test_execute_preflights_every_output_before_the_first_worker(self) -> None:
        first_transcript = self.root / "new-p11.txt"
        existing_later_transcript = self.root / "existing-p13.txt"
        existing_later_transcript.write_text("sentinel\n", encoding="ascii")
        new_basis = self.root / "new-integral-basis.txt"
        new_lift_certificate = self.root / "new-lift-certificate.json"
        self.request["executionMode"] = "execute-workers"
        self.request["modularRuns"] = [
            {"prime": 11, "transcriptPath": first_transcript.name},
            {"prime": 13, "transcriptPath": existing_later_transcript.name},
        ]
        self.request["lift"]["integralBasisPath"] = new_basis.name
        self.request["lift"]["certificatePath"] = new_lift_certificate.name
        self.request["lift"].pop("expectedIntegralBasisSha256")
        self.request["lift"].pop("expectedCertificateSha256")
        self.seal_request()

        with mock.patch.object(bridge.subprocess, "run") as launched:
            with self.assertRaisesRegex(bridge.BridgeError, "refusing to overwrite"):
                bridge.build_response(self.request_path, execute=True)
            launched.assert_not_called()
        self.assertFalse(first_transcript.exists())
        self.assertFalse(new_basis.exists())
        self.assertFalse(new_lift_certificate.exists())
        self.assertEqual(
            existing_later_transcript.read_text(encoding="ascii"), "sentinel\n"
        )

    def test_strict_request_schema_rejects_unknown_keys(self) -> None:
        self.request["rank"] = 1
        self.seal_request()
        with self.assertRaisesRegex(bridge.BridgeError, "unknown keys"):
            bridge.build_response(self.request_path, execute=False)

    def test_oversized_integral_basis_coefficient_is_rejected_before_replay(
        self,
    ) -> None:
        oversized_basis = self.root / "oversized-integral-basis.txt"
        lines = self.integral_basis_path.read_text(encoding="ascii").splitlines()
        tokens = lines[1].split(" ")
        tokens[-1] = "9" * (self.bounds.max_coefficient_digits + 1)
        lines[1] = " ".join(tokens)
        oversized_basis.write_text("\n".join(lines) + "\n", encoding="ascii")

        certificate = json.loads(self.lift_certificate_path.read_text(encoding="utf-8"))
        certificate["integralKernelFrame"]["sha256"] = sha(oversized_basis)
        oversized_certificate = self.root / "oversized-basis-certificate.json"
        write_json(oversized_certificate, certificate)
        self.point_request_at_lift(oversized_basis, oversized_certificate)

        with self.assertRaisesRegex(bridge.BridgeError, "100-digit bound"):
            bridge.build_response(self.request_path, execute=False)

    def test_oversized_parameter_basis_coefficient_is_rejected_before_recovery(
        self,
    ) -> None:
        certificate = json.loads(self.lift_certificate_path.read_text(encoding="utf-8"))
        certificate["integralKernelFrame"]["rationalGraphChartParameterBasis"][0][0] = (
            int("9" * (self.bounds.max_coefficient_digits + 1))
        )
        oversized_certificate = self.root / "oversized-parameter-certificate.json"
        write_json(oversized_certificate, certificate)
        self.point_request_at_lift(self.integral_basis_path, oversized_certificate)

        with self.assertRaisesRegex(bridge.BridgeError, "100-digit bound"):
            bridge.build_response(self.request_path, execute=False)

    def test_typescript_generated_rank_certificate_replays_in_python(self) -> None:
        matrix_path = TS_RANK_FIXTURE_ROOT / "rank-matrix.linbox"
        certificate_path = TS_RANK_FIXTURE_ROOT / "rank-certificate-ts.json"
        summary = bridge.summarize_matrix(matrix_path, self.bounds)
        certificate = json.loads(certificate_path.read_text(encoding="utf-8"))
        source_bindings = certificate["source"]["sourceBindings"]
        bindings = {
            "action": bridge.canonical_sha256({"action": 1}),
            "generic-sparse-matrix": summary.generic_sparse_matrix_digest,
            "oracle": bridge.canonical_sha256({"oracle": 1}),
            "preparation": bridge.canonical_sha256({"preparation": 1}),
            "boundary": bridge.canonical_sha256({"boundary": 1}),
            "torsion-free-certificate": bridge.canonical_sha256(
                {"torsionFreeCertificate": 1}
            ),
        }
        self.assertEqual(source_bindings, bridge.rank_source_bindings(bindings))
        replay = bridge.replay_rank_certificate(
            certificate_path,
            sha(certificate_path),
            matrix_path,
            summary,
            bindings,
            self.bounds,
            certificate_path,
        )
        self.assertEqual(replay["certifiedRank"], 1)
        self.assertEqual(replay["certifiedNullity"], 2)
        self.assertTrue(replay["lowerBoundReplayed"])
        self.assertTrue(replay["upperBoundReplayed"])


if __name__ == "__main__":
    unittest.main()
