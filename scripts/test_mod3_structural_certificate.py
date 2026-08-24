"""Deterministic contracts for the compact-cube GF(3) certificate."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import mod3_structural_certificate as certificate  # noqa: E402
import finite_image_recognition as recognition  # noqa: E402
import torsion_free_discovery as portfolio  # noqa: E402
import torsion_free_finite_image as finite_image_worker  # noqa: E402


SOURCE = REPO_ROOT / "public/examples/compact_5_cube_gamma1.json"
GAP_SCRIPT = SCRIPT_DIR / "gap_mod3_structural_certificate.g"
REPLAY_SCRIPT = SCRIPT_DIR / "gap_mod3_structural_replay.g"
ORCHESTRATOR = SCRIPT_DIR / "mod3_structural_certificate.py"


def multiply(left: list[list[int]], right: list[list[int]]) -> list[list[int]]:
    size = len(left)
    return [
        [
            sum(left[row][inner] * right[inner][column] for inner in range(size)) % 3
            for column in range(size)
        ]
        for row in range(size)
    ]


def transpose(value: list[list[int]]) -> list[list[int]]:
    return [list(row) for row in zip(*value, strict=True)]


class Mod3CertificateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "compact-cube.json"
        self.source.write_bytes(SOURCE.read_bytes())
        self.manifest = self.root / "toolchain.json"
        self.manifest.write_text('{"gap":"4.16.0","recog":"1.5.1"}\n', encoding="utf8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def unknown_artifact(self) -> dict[str, object]:
        exact = certificate.build_exact_input(self.source, self.manifest.read_bytes())
        artifact: dict[str, object] = {
            "schemaVersion": 1,
            "certificateKind": certificate.CERTIFICATE_KIND,
            "status": "unknown",
            "reason": "test frontier",
            "provenance": {
                key: exact[key]
                for key in (
                    "source",
                    "matrixDigest",
                    "representationSha256",
                    "toolchainManifestSha256",
                )
            },
            "coxeterMatrix": exact["coxeterMatrix"],
            "representation": {
                "status": "verified",
                "characteristic": 3,
                "dimension": 10,
                "matrixGeneratorRows": exact["matrixGeneratorRows"],
                "preservedFormRows": exact["preservedFormRows"],
            },
            "structuralIdentification": {
                "preservedSplitForm": {"status": "verified"},
                "standardFormConjugacy": {"status": "verified"},
                "omegaDerivedSubgroup": {"status": "unknown", "reason": "not run"},
                "indexTwoExtension": {"status": "unknown", "reason": "not run"},
            },
            "degreeSieve": {
                "status": "unknown",
                "degreeLedger": [
                    {
                        "degree": degree,
                        "outcome": "unresolved",
                        "classificationComplete": False,
                    }
                    for degree in range(5_760, 576_000 + 1, 5_760)
                ],
                "unresolvedFrontier": [{"index": 1, "reason": "not run"}],
            },
        }
        return certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )

    def verified_artifact(self) -> dict[str, object]:
        artifact = self.unknown_artifact()
        exact = certificate.build_exact_input(self.source, self.manifest.read_bytes())
        relation_checks = [
            {"kind": "involution", "generator": index, "passed": True}
            for index in range(10)
        ]
        for left in range(10):
            for right in range(left + 1, 10):
                exponent = exact["coxeterMatrix"][left][right]
                if exponent:
                    relation_checks.append(
                        {
                            "kind": "coxeter",
                            "generatorA": left,
                            "generatorB": right,
                            "exponent": exponent,
                            "passed": True,
                        }
                    )
        artifact["representation"]["relationChecks"] = relation_checks
        artifact["structuralIdentification"] = {
            "preservedSplitForm": {"status": "verified"},
            "standardFormConjugacy": {"status": "verified"},
            "omegaDerivedSubgroup": {
                "status": "verified",
                "order": 1_289_512_799_941_305_139_200,
                "equalityMethod": (
                    "CM_InOmega containment and proved GenSS chain of prescribed "
                    "exact order"
                ),
                "stabilizerChain": {
                    "status": "verified",
                    "isProved": True,
                    "prescribedOrder": 1_289_512_799_941_305_139_200,
                    "orbitLengthLimit": 60_000,
                    "failInsteadOfError": True,
                    "errorBoundNumerator": 1,
                    "errorBoundDenominator": 1_048_576,
                },
                "faithfulOrbit": {"status": "unknown", "reason": "not needed"},
                "recognitionTree": {
                    "status": "unknown",
                    "reason": "not needed",
                },
                "standardGeneratorSlps": {
                    "status": "verified",
                    "evidenceFormat": "genss-composed-straight-line-program",
                    "entries": [
                        {
                            "inputCount": 9,
                            "lines": [[1, 1]],
                            "targetIndex": index,
                            "targetRows": [],
                        }
                        for index in range(2)
                    ],
                },
            },
            "indexTwoExtension": {
                "status": "verified",
                "quotientIndex": 2,
            },
        }
        for ordinal, row in enumerate(artifact["degreeSieve"]["degreeLedger"]):
            row.update(
                {
                    "outcome": "admissible" if ordinal == 16 else "impossible",
                    "classificationComplete": True,
                    "reason": "deterministic contract fixture",
                }
            )
        artifact["degreeSieve"].update({"status": "verified", "unresolvedFrontier": []})
        artifact["status"] = "unknown"
        artifact["reason"] = "deterministic fixture awaiting exact replay"
        return certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )

    def action_payload(
        self,
        artifact: dict[str, object],
        *,
        certificate_file_hash: str | None = None,
    ) -> dict[str, object]:
        representation = artifact["representation"]
        payload, _ = recognition.build_action_transfer(
            candidate_id="compact-5-cube-mod3-test",
            characteristic=3,
            finite_image_order=None,
            coxeter_matrix=artifact["coxeterMatrix"],
            lower_bound=5_760,
            max_index=576_000,
            manifest_hash=certificate.sha256_bytes(self.manifest.read_bytes()),
            matrix_generator_rows=representation["matrixGeneratorRows"],
            invariant_form_rows=representation["preservedFormRows"],
            residue_field_order=3,
            structural_certificate_sha256=certificate_file_hash,
        )
        return payload

    def validate(self, artifact: dict[str, object]) -> dict[str, object]:
        return certificate.validate_certificate(
            artifact,
            source_path=self.source,
            manifest_bytes=self.manifest.read_bytes(),
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
        )

    def test_exact_transfer_is_deterministic_and_matches_existing_digest(self) -> None:
        first = certificate.build_exact_input(self.source, self.manifest.read_bytes())
        second = certificate.build_exact_input(self.source, self.manifest.read_bytes())
        self.assertEqual(first, second)
        self.assertEqual(
            first["matrixDigest"],
            "b9550752af54e2d30d3106856d443384c66acb39b3ecd247b750f8732c695d67",
        )
        self.assertEqual(len(first["matrixGeneratorRows"]), 10)
        self.assertEqual(
            first["representationSha256"],
            certificate.sha256_json(
                {
                    "characteristic": 3,
                    "matrixGeneratorRows": first["matrixGeneratorRows"],
                    "preservedFormRows": first["preservedFormRows"],
                }
            ),
        )

    def test_every_generator_preserves_the_transferred_form(self) -> None:
        exact = certificate.build_exact_input(self.source, self.manifest.read_bytes())
        form = exact["preservedFormRows"]
        for generator in exact["matrixGeneratorRows"]:
            self.assertEqual(
                multiply(multiply(transpose(generator), form), generator), form
            )
            self.assertEqual(
                multiply(generator, generator),
                [
                    [1 if row == column else 0 for column in range(10)]
                    for row in range(10)
                ],
            )

    def test_unknown_artifact_is_valid_and_fail_closed(self) -> None:
        artifact = self.unknown_artifact()
        self.validate(artifact)
        self.assertEqual(artifact["status"], "unknown")
        omega = artifact["structuralIdentification"]["omegaDerivedSubgroup"]
        self.assertEqual(omega["status"], "unknown")

    def test_failed_artifact_is_valid_but_cannot_promote(self) -> None:
        artifact = self.unknown_artifact()
        artifact["status"] = "failed"
        artifact["structuralIdentification"]["preservedSplitForm"] = {
            "status": "failed",
            "reason": "exact preservation failed",
        }
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        self.validate(artifact)
        self.assertEqual(artifact["status"], "failed")

    def test_stale_source_hash_is_rejected(self) -> None:
        artifact = self.unknown_artifact()
        source = json.loads(self.source.read_text(encoding="utf8"))
        source["description"] = "changed after certification"
        self.source.write_text(json.dumps(source), encoding="utf8")
        with self.assertRaisesRegex(
            certificate.CertificateError, "source hash is stale"
        ):
            self.validate(artifact)

    def test_stale_matrix_evidence_is_rejected_even_with_fresh_artifact_hash(
        self,
    ) -> None:
        artifact = self.unknown_artifact()
        artifact["representation"]["matrixGeneratorRows"][0][0][0] = 0
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        with self.assertRaisesRegex(certificate.CertificateError, "generators differ"):
            self.validate(artifact)

    def test_stale_toolchain_hash_is_rejected(self) -> None:
        artifact = self.unknown_artifact()
        self.manifest.write_text('{"gap":"changed"}\n', encoding="utf8")
        with self.assertRaisesRegex(
            certificate.CertificateError, "toolchainManifestSha256"
        ):
            self.validate(artifact)

    def test_stale_implementation_and_artifact_hashes_are_rejected(self) -> None:
        artifact = self.unknown_artifact()
        artifact["reason"] = "mutated without rehashing"
        with self.assertRaisesRegex(
            certificate.CertificateError, "artifact hash is stale"
        ):
            self.validate(artifact)

        artifact = self.unknown_artifact()
        artifact["implementation"]["replayVerifierSha256"] = "0" * 64
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        # attach_hashes repairs implementation hashes, so corrupt after hashing and
        # recompute only the outer artifact digest.
        artifact["implementation"]["replayVerifierSha256"] = "0" * 64
        artifact.pop("artifactHash")
        artifact["artifactHash"] = certificate.sha256_json(artifact)
        with self.assertRaisesRegex(
            certificate.CertificateError, "GAP replay-verifier hash is stale"
        ):
            self.validate(artifact)

    def test_verified_omega_requires_replayable_slps(self) -> None:
        artifact = self.unknown_artifact()
        artifact["structuralIdentification"]["omegaDerivedSubgroup"] = {
            "status": "verified"
        }
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        with self.assertRaisesRegex(
            certificate.CertificateError, "requires replayable SLPs"
        ):
            self.validate(artifact)

    def test_incomplete_degree_row_cannot_claim_impossible(self) -> None:
        artifact = self.unknown_artifact()
        artifact["degreeSieve"]["degreeLedger"][0]["outcome"] = "impossible"
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        with self.assertRaisesRegex(
            certificate.CertificateError, "cannot be impossible"
        ):
            self.validate(artifact)

    def test_degree_ledger_is_exactly_the_100_requested_rows(self) -> None:
        artifact = self.unknown_artifact()
        self.validate(artifact)
        ledger = artifact["degreeSieve"]["degreeLedger"]
        self.assertEqual(len(ledger), 100)
        self.assertEqual(ledger[0]["degree"], 5_760)
        self.assertEqual(ledger[-1]["degree"], 576_000)

        malformed = copy.deepcopy(artifact)
        malformed["degreeSieve"]["degreeLedger"].pop()
        malformed = certificate.attach_hashes(
            malformed, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        with self.assertRaisesRegex(certificate.CertificateError, "exactly 100 rows"):
            self.validate(malformed)

    def test_validate_mode_does_not_resolve_or_run_gap(self) -> None:
        artifact = self.unknown_artifact()
        output = self.root / "certificate.json"
        certificate.write_artifact(output, artifact)
        result = certificate.main(
            [
                "validate",
                "--source",
                str(self.source),
                "--manifest",
                str(self.manifest),
                "--gap-script",
                str(GAP_SCRIPT),
                "--output",
                str(output),
                "--gap",
                str(self.root / "deliberately-missing-gap"),
            ]
        )
        self.assertEqual(result, 0)

    def test_gap_driver_names_exact_promotion_apis_and_no_generic_full_size(
        self,
    ) -> None:
        source = GAP_SCRIPT.read_text(encoding="utf8")
        for token in (
            'ValueGlobal("ClassicalMaximalsGeneric")',
            '["O+", 10, 3]',
            "CM_InOmega",
            "GeneratorsWithMemory",
            "StabilizerChain",
            "IsProved",
            "SLPOfElms",
            "SiftGroupElementSLP",
            "RecogniseMatrixGroup",
            "IsCorrect",
            "SLPforElement",
            "SLPforNiceGens",
            "CompositionOfStraightLinePrograms",
            "BaseChangeToCanonical",
            "MaximalSubgroupClassReps",
            "unresolvedFrontier",
        ):
            self.assertIn(token, source)
        self.assertNotIn("Size(group)", source)

    def test_replay_recomputes_every_exact_promotion_boundary(self) -> None:
        source = REPLAY_SCRIPT.read_text(encoding="utf8")
        for token in (
            "ForAll(evenGenerators, CVIsInStandardOmega)",
            "CVRecognizeOmegaByGenSS(evenGenerators, standardOmega)",
            "ResultOfStraightLineProgram(slp, evenGenerators)",
            "CVIsInStandardOmega(generator^outer)",
            "CVIsInStandardOmega(quotientElement * outer^-1)",
            "sieve.degreeLedger <> storedSieve.degreeLedger",
            "sieve.maximalCatalogue <> storedSieve.maximalCatalogue",
            "sieve.unresolvedFrontier <> storedSieve.unresolvedFrontier",
        ):
            self.assertIn(token, source)

    def test_interrupted_process_remains_unknown_without_scientific_failure(
        self,
    ) -> None:
        checkpoint = {"status": "unknown", "reason": "recognition-running"}
        interrupted = certificate.apply_process_outcome(
            checkpoint, timed_out=False, return_code=15
        )
        self.assertEqual(interrupted["status"], "unknown")
        self.assertEqual(interrupted["reason"], "process-interrupted-after-checkpoint")

        explicit_failure = certificate.apply_process_outcome(
            {"status": "failed", "reason": "exact matrix identity failed"},
            timed_out=False,
            return_code=15,
        )
        self.assertEqual(explicit_failure["status"], "failed")
        self.assertEqual(explicit_failure["reason"], "exact matrix identity failed")

    def test_auxiliary_timeout_is_explicit_and_never_reruns_when_sealed(self) -> None:
        artifact = self.verified_artifact()
        omega = artifact["structuralIdentification"]["omegaDerivedSubgroup"]
        omega["auxiliaryRecognition"] = {
            "status": "unknown",
            "reason": "gap-timeout-no-checkpoint",
            "strictTimeLimitSeconds": 20,
            "verifierSha256": certificate.sha256_bytes(REPLAY_SCRIPT.read_bytes()),
            "blocking": False,
            "execution": {"timedOut": True, "returnCode": 124},
        }
        with mock.patch.object(
            certificate, "run_gap", side_effect=AssertionError("must not rerun")
        ):
            result = certificate.attach_auxiliary_recognition(
                artifact,
                runtime={"kind": "native", "command": ["gap"]},
                replay_script=REPLAY_SCRIPT,
                timeout_seconds=20,
            )
        diagnostic = result["structuralIdentification"]["omegaDerivedSubgroup"][
            "auxiliaryRecognition"
        ]
        self.assertEqual(diagnostic["status"], "unknown")
        self.assertEqual(
            diagnostic["reason"],
            "auxiliary-recog-skipped-after-strict-time-bound",
        )

    def test_wsl_gap_runs_under_a_linux_process_timeout(self) -> None:
        source = ORCHESTRATOR.read_text(encoding="utf8")
        self.assertIn('"timeout",', source)
        self.assertIn('"--kill-after=5s",', source)

    def test_replay_payload_carries_the_exact_stored_ledger(self) -> None:
        artifact = self.verified_artifact()
        payload = certificate.build_replay_payload(artifact)
        self.assertEqual(payload["storedDegreeSieve"], artifact["degreeSieve"])
        self.assertEqual(len(payload["storedDegreeSieve"]["degreeLedger"]), 100)
        tampered = copy.deepcopy(payload)
        tampered["storedDegreeSieve"]["degreeLedger"][0]["outcome"] = "admissible"
        self.assertNotEqual(
            certificate.sha256_json(tampered["storedDegreeSieve"]),
            certificate.sha256_json(artifact["degreeSieve"]),
        )

    def test_power_shell_defaults_are_wsl_locations_not_windows_home_paths(
        self,
    ) -> None:
        options = certificate.parser().parse_args([])
        self.assertEqual(options.gap, certificate.DEFAULT_GAP)
        self.assertEqual(options.manifest, certificate.DEFAULT_MANIFEST)
        self.assertTrue(options.gap.startswith("~/"))
        self.assertTrue(options.manifest.startswith("~/"))

    def test_default_wsl_tilde_path_uses_the_linux_home_directory(self) -> None:
        completed = SimpleNamespace(
            returncode=0,
            stdout="/home/researcher\n",
            stderr="",
        )
        with mock.patch.object(
            certificate.subprocess, "run", return_value=completed
        ) as run:
            resolved = certificate._resolve_wsl_location(  # noqa: SLF001
                certificate.DEFAULT_MANIFEST, "Ubuntu"
            )
        self.assertEqual(
            resolved,
            "/home/researcher/.local/share/coxeter-viewer/gap-4.16.0/"
            "toolchain-manifest.json",
        )
        command = run.call_args.args[0]
        self.assertEqual(command[:4], ["wsl", "-d", "Ubuntu", "--"])
        self.assertIn('printf "%s\\n" "$HOME"', command)
        self.assertNotIn("readlink", command)

    def test_default_wsl_tilde_path_rejects_an_empty_home(self) -> None:
        completed = SimpleNamespace(returncode=0, stdout="\n", stderr="")
        with (
            mock.patch.object(certificate.subprocess, "run", return_value=completed),
            self.assertRaisesRegex(FileNotFoundError, "empty HOME"),
        ):
            certificate._resolve_wsl_location(  # noqa: SLF001
                certificate.DEFAULT_MANIFEST, None
            )

    def test_replayed_certificate_consumes_all_100_ledger_rows(self) -> None:
        artifact = self.verified_artifact()
        payload = self.action_payload(artifact)
        adapted = recognition.adapt_mod3_structural_certificate(
            artifact,
            payload,
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertEqual(adapted["recognition"]["complete"], True)
        self.assertEqual(len(adapted["screening"]["targetDecisions"]), 100)
        self.assertEqual(
            adapted["screening"]["targetDecisions"][16]["decision"],
            "admissible",
        )
        self.assertTrue(
            all(
                row["decision"] == "ruled-out"
                for index, row in enumerate(adapted["screening"]["targetDecisions"])
                if index != 16
            )
        )

    def test_structural_promotion_is_fail_closed_without_verified_slps(self) -> None:
        artifact = self.verified_artifact()
        artifact["structuralIdentification"]["omegaDerivedSubgroup"][
            "standardGeneratorSlps"
        ] = {"status": "unknown", "reason": "not available"}
        artifact["status"] = "unknown"
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        adapted = recognition.adapt_mod3_structural_certificate(
            artifact,
            self.action_payload(artifact),
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertEqual(adapted["status"], "unknown")
        self.assertNotEqual(adapted.get("orderDiscovery", {}).get("status"), "passed")

    def test_failed_structural_artifact_never_promotes(self) -> None:
        artifact = self.verified_artifact()
        artifact["status"] = "failed"
        artifact["reason"] = "contract failure"
        artifact = certificate.attach_hashes(
            artifact, gap_script=GAP_SCRIPT, orchestrator=ORCHESTRATOR
        )
        adapted = recognition.adapt_mod3_structural_certificate(
            artifact,
            self.action_payload(artifact),
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertEqual(adapted["status"], "unknown")
        self.assertEqual(adapted["structuralCertificate"]["promotion"], "not-promoted")

    def test_load_path_replays_slps_and_never_calls_generic_recognition(self) -> None:
        artifact = self.verified_artifact()
        artifact_path = self.root / "verified-certificate.json"
        certificate.write_artifact(artifact_path, artifact)
        payload = self.action_payload(
            artifact,
            certificate_file_hash=certificate.sha256_bytes(artifact_path.read_bytes()),
        )
        with (
            mock.patch.object(
                recognition.mod3_structural,
                "resolve_gap_runtime",
                return_value={"kind": "native", "command": ["gap"]},
            ),
            mock.patch.object(
                recognition.mod3_structural,
                "run_gap",
                return_value=({"status": "verified"}, {"returnCode": 0}),
            ) as replay,
            mock.patch.object(
                recognition, "run_gap_recognition", side_effect=AssertionError
            ),
        ):
            adapted, metrics = recognition.load_and_replay_mod3_structural_certificate(
                payload,
                certificate_path=artifact_path,
                source_path=self.source,
                manifest_bytes=self.manifest.read_bytes(),
                manifest_hash=certificate.sha256_bytes(self.manifest.read_bytes()),
                gap_location="gap",
                gap_script=GAP_SCRIPT,
                replay_script=REPLAY_SCRIPT,
                orchestrator=ORCHESTRATOR,
                timeout_seconds=10,
            )
        replay.assert_called_once()
        self.assertEqual(adapted["recognition"]["complete"], True)
        self.assertEqual(metrics["genericRecognitionRun"], False)

    def test_structural_certificate_changes_action_and_checkpoint_keys(self) -> None:
        artifact = self.verified_artifact()
        first = self.action_payload(artifact, certificate_file_hash="1" * 64)
        second = self.action_payload(artifact, certificate_file_hash="2" * 64)
        self.assertNotEqual(first["actionSha256"], second["actionSha256"])

        first_path = self.root / "first.json"
        second_path = self.root / "second.json"
        first_path.write_text("first", encoding="utf8")
        second_path.write_text("second", encoding="utf8")
        parser = finite_image_worker.build_parser()
        first_args = parser.parse_args(["--structural-certificate", str(first_path)])
        second_args = parser.parse_args(["--structural-certificate", str(second_path)])
        for args in (first_args, second_args):
            args.effective_lower_bound = 5_760
        image = SimpleNamespace(
            candidate=SimpleNamespace(candidate_id="mod3-test"), order=99
        )
        catalogue = {"witnessDigest": "a" * 64, "classOriginDigest": "b" * 64}
        first_header = finite_image_worker.checkpoint_header(
            "c" * 64, "d" * 64, catalogue, image, first_args
        )
        second_header = finite_image_worker.checkpoint_header(
            "c" * 64, "d" * 64, catalogue, image, second_args
        )
        self.assertNotEqual(first_header["configDigest"], second_header["configDigest"])

    def test_portfolio_passes_certificate_only_to_prime_three(self) -> None:
        runtime = SimpleNamespace(
            paths=SimpleNamespace(input_execution_path="/work/input.json")
        )
        staged = {
            "mod3:certificate": SimpleNamespace(execution_path="/work/cert.json"),
            "mod3:source": SimpleNamespace(execution_path="/work/source.json"),
            "mod3:gapScript": SimpleNamespace(execution_path="/work/replay.g"),
            "mod3:replayGapScript": SimpleNamespace(
                execution_path="/work/replay-verifier.g"
            ),
            "mod3:orchestrator": SimpleNamespace(execution_path="/work/replay.py"),
        }
        script = SimpleNamespace(execution_path="/work/worker.py")
        bounds = {
            "maxIndex": 576_000,
            "maxModuleCandidates": 4,
            "maxCandidates": 4,
            "maxWitnesses": 219,
            "maxSphericalOrder": 10_000,
            "maxSubsets": 64,
            "maxMemoryBytes": 2 * portfolio.GIB,
            "timeoutSeconds": 60,
            "maxCongruenceImageOrder": 1_000_000,
        }
        common = (runtime, script, "sage", bounds, 5_760)
        command_three = portfolio.finite_image_command(
            *common,
            3,
            "/work/out.json",
            "/work/checkpoint.json",
            "/work/cache",
            probe_only=True,
            mod3_staged=staged,
        )
        command_two = portfolio.finite_image_command(
            *common,
            2,
            "/work/out.json",
            "/work/checkpoint.json",
            "/work/cache",
            probe_only=True,
            mod3_staged=staged,
        )
        self.assertIn("--structural-certificate", command_three[-1])
        self.assertNotIn("--structural-certificate", command_two[-1])


if __name__ == "__main__":
    unittest.main()
