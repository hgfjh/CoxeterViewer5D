"""Deterministic contracts for the direct odd-prime structural path."""

from __future__ import annotations

import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_recognition as recognition  # noqa: E402
import odd_prime_structural_certificate as certificate  # noqa: E402


SOURCE = REPOSITORY_ROOT / "public/examples/compact_5_cube_gamma1.json"
GAP_SCRIPT = SCRIPT_DIR / "gap_odd_prime_structural_certificate.g"
REPLAY_SCRIPT = SCRIPT_DIR / "gap_odd_prime_structural_replay.g"
ORCHESTRATOR = SCRIPT_DIR / "odd_prime_structural_certificate.py"


def multiply(
    left: list[list[int]], right: list[list[int]], prime: int
) -> list[list[int]]:
    size = len(left)
    return [
        [
            sum(
                left[row][inner] * right[inner][column]
                for inner in range(size)
            )
            % prime
            for column in range(size)
        ]
        for row in range(size)
    ]


def transpose(value: list[list[int]]) -> list[list[int]]:
    return [list(row) for row in zip(*value, strict=True)]


def omega_order(prime: int) -> int:
    numerator = prime**20 * (prime**5 - 1)
    numerator *= math.prod(prime ** (2 * exponent) - 1 for exponent in range(1, 5))
    return numerator // math.gcd(4, prime**5 - 1)


class OddPrimeStructuralCertificateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "compact-cube.json"
        self.source.write_bytes(SOURCE.read_bytes())
        self.manifest = self.root / "toolchain.json"
        self.manifest.write_text(
            '{"gap":"4.16.0","ClassicalMaximals":"1.1","genss":"1.6.9"}\n',
            encoding="utf8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def exact(self, prime: int) -> dict[str, object]:
        return certificate.build_exact_input(
            self.source, self.manifest.read_bytes(), prime
        )

    def unknown_artifact(self, prime: int) -> dict[str, object]:
        exact = self.exact(prime)
        checks = [
            {
                **record,
                "actualOrder": record["expectedOrder"],
                "injective": True,
            }
            for record in exact["maximalSphericalSubgroups"]
        ]
        artifact: dict[str, object] = {
            "schemaVersion": 1,
            "certificateKind": certificate.certificate_kind(prime),
            "certificateVersion": certificate.CERTIFICATE_VERSION,
            "characteristic": prime,
            "status": "unknown",
            "reason": "test frontier",
            "provenance": {
                key: exact[key]
                for key in (
                    "source",
                    "matrixDigest",
                    "representationSha256",
                    "toolchainManifestSha256",
                    "sphericalCatalogueSha256",
                )
            },
            "coxeterMatrix": exact["coxeterMatrix"],
            "maximalSphericalSubgroups": exact["maximalSphericalSubgroups"],
            "representation": {
                "status": "verified",
                "characteristic": prime,
                "dimension": 10,
                "matrixGeneratorRows": exact["matrixGeneratorRows"],
                "preservedFormRows": exact["preservedFormRows"],
            },
            "equalitySearch": {
                "strategy": "genss",
                "orbitLengthLimit": 1_000_000,
                "classicalRecognition": {
                    "randomSeed": certificate.DEFAULT_CLASSICAL_RECOGNITION_SEED,
                    "requestedRandomElements": (
                        certificate.DEFAULT_CLASSICAL_RECOGNITION_SAMPLES
                    ),
                },
            },
            "kernelCertificate": {
                "status": "verified",
                "level": "torsion-free-finite-index-kernel-exact-index-unknown",
                "exactIndex": None,
                "maximalSphericalRestrictionChecks": checks,
            },
            "structuralIdentification": {
                "preservedSplitForm": {"status": "verified"},
                "standardFormConjugacy": {"status": "unknown", "reason": "not run"},
                "omegaDerivedSubgroup": {"status": "unknown", "reason": "not run"},
                "indexTwoExtension": {"status": "unknown", "reason": "not run"},
            },
            "degreeSieve": {
                "status": "unknown",
                "targetLowerBound": 5_760,
                "targetMaximum": 576_000,
                "appliesToImage": False,
                "maximalCatalogue": {"status": "unknown", "reason": "not run"},
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
            "generationOutcome": {"status": "unknown", "reason": "test"},
        }
        return certificate.attach_hashes(
            artifact,
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
            replay_script=REPLAY_SCRIPT,
        )

    def verified_artifact(self, prime: int) -> dict[str, object]:
        artifact = self.unknown_artifact(prime)
        exact = self.exact(prime)
        relations = [
            {"kind": "involution", "generator": index, "passed": True}
            for index in range(10)
        ]
        for left in range(10):
            for right in range(left + 1, 10):
                exponent = exact["coxeterMatrix"][left][right]
                if exponent:
                    relations.append(
                        {
                            "kind": "coxeter",
                            "generatorA": left,
                            "generatorB": right,
                            "exponent": exponent,
                            "passed": True,
                        }
                    )
        artifact["representation"]["relationChecks"] = relations
        order = omega_order(prime)
        artifact["structuralIdentification"]["standardFormConjugacy"].update(
            {
                "status": "verified",
                "standardFormRows": [],
                "formSimilitudeMultiplier": 1,
                "changeOfBasisRows": [],
                "transformedGeneratorRows": [],
            }
        )
        artifact["structuralIdentification"]["omegaDerivedSubgroup"] = {
            "status": "verified",
            "order": order,
            "equalityMethod": (
                "CM_InOmega containment and proved GenSS chain of prescribed exact order"
            ),
            "evenGeneratorRows": [],
            "standardOmegaGeneratorRows": [],
            "stabilizerChain": {
                "status": "verified",
                "isProved": True,
                "prescribedOrder": order,
                "orbitLengthLimit": 1_000_000,
            },
            "standardGeneratorSlps": {
                "status": "verified",
                "evidenceFormat": "genss-composed-straight-line-program",
                "entries": [
                    {
                        "inputCount": 9,
                        "lines": [[1, 1]],
                        "targetIndex": 0,
                        "targetRows": [],
                    }
                ],
            },
        }
        artifact["structuralIdentification"]["indexTwoExtension"] = {
            "status": "verified",
            "quotientIndex": 2,
            "imageEqualsExtension": True,
        }
        artifact["kernelCertificate"].update(
            {
                "level": "torsion-free-finite-index-kernel-exact-index-known",
                "exactIndex": 2 * order,
            }
        )
        for row in artifact["degreeSieve"]["degreeLedger"]:
            row.update(
                {
                    "outcome": "impossible",
                    "classificationComplete": True,
                    "reason": "complete deterministic fixture",
                }
            )
        artifact["degreeSieve"].update(
            {
                "status": "verified",
                "appliesToImage": True,
                "maximalCatalogue": {
                    "status": "verified",
                    "completeByPackageRange": True,
                    "maximalIndices": [488_906],
                },
                "unresolvedFrontier": [],
            }
        )
        artifact["status"] = "unknown"
        artifact["reason"] = "awaiting independent replay"
        return certificate.attach_hashes(
            artifact,
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
            replay_script=REPLAY_SCRIPT,
        )

    def action_payload(
        self, artifact: dict[str, object], certificate_file_hash: str | None = None
    ) -> dict[str, object]:
        representation = artifact["representation"]
        payload, _ = recognition.build_action_transfer(
            candidate_id=f"compact-cube-p{artifact['characteristic']}-test",
            characteristic=artifact["characteristic"],
            finite_image_order=None,
            coxeter_matrix=artifact["coxeterMatrix"],
            lower_bound=5_760,
            max_index=576_000,
            manifest_hash=certificate.sha256_bytes(self.manifest.read_bytes()),
            matrix_generator_rows=representation["matrixGeneratorRows"],
            invariant_form_rows=representation["preservedFormRows"],
            residue_field_order=artifact["characteristic"],
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
            replay_script=REPLAY_SCRIPT,
        )

    def test_exact_models_are_deterministic_and_preserve_the_form(self) -> None:
        for prime in certificate.SUPPORTED_CHARACTERISTICS:
            with self.subTest(prime=prime):
                exact = self.exact(prime)
                self.assertEqual(exact, self.exact(prime))
                self.assertEqual(len(exact["maximalSphericalSubgroups"]), 32)
                self.assertEqual(
                    math.lcm(
                        *(
                            row["expectedOrder"]
                            for row in exact["maximalSphericalSubgroups"]
                        )
                    ),
                    5_760,
                )
                form = exact["preservedFormRows"]
                identity = [
                    [1 if row == column else 0 for column in range(10)]
                    for row in range(10)
                ]
                for generator in exact["matrixGeneratorRows"]:
                    self.assertEqual(multiply(generator, generator, prime), identity)
                    preserved = multiply(
                        multiply(transpose(generator), form, prime),
                        generator,
                        prime,
                    )
                    self.assertEqual(preserved, form)

    def test_kernel_level_is_valid_without_exact_image_order(self) -> None:
        artifact = self.unknown_artifact(5)
        self.validate(artifact)
        payload = self.action_payload(artifact)
        adapted = recognition.adapt_odd_prime_structural_certificate(
            artifact,
            payload,
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "unknown"},
        )
        self.assertEqual(adapted["status"], "unknown")
        self.assertEqual(adapted["torsionFreeKernel"]["status"], "passed")
        self.assertIsNone(adapted["torsionFreeKernel"]["exactIndex"])

    def test_replayed_structural_certificate_promotes_without_recog(self) -> None:
        artifact = self.verified_artifact(7)
        self.validate(artifact)
        payload = self.action_payload(artifact)
        adapted = recognition.adapt_odd_prime_structural_certificate(
            artifact,
            payload,
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertEqual(adapted["status"], "passed")
        self.assertEqual(adapted["recognition"]["identifiedAs"], "Omega+(10,7):2")
        self.assertEqual(
            adapted["discoveredFiniteImageOrder"], 2 * omega_order(7)
        )
        self.assertTrue(
            all(
                row["decision"] == "ruled-out"
                for row in adapted["screening"]["targetDecisions"]
            )
        )

    def test_exact_word_finder_slps_promote_without_trusting_recog(self) -> None:
        artifact = self.verified_artifact(11)
        omega = artifact["structuralIdentification"]["omegaDerivedSubgroup"]
        omega.pop("stabilizerChain")
        omega["equalityMethod"] = (
            "mutual containment via exactly evaluated standard-generator SLPs"
        )
        omega["wordFinder"] = {
            "status": "diagnostic-only",
            "exactWordEvaluationIsPrimaryEvidence": True,
            "recognitionTreeTrustedForOrder": False,
            "recognitionTreeTrustedForEquality": False,
        }
        artifact["equalitySearch"]["strategy"] = "exact-slp-finder-first"
        artifact = certificate.attach_hashes(
            artifact,
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
            replay_script=REPLAY_SCRIPT,
        )
        self.validate(artifact)
        adapted = recognition.adapt_odd_prime_structural_certificate(
            artifact,
            self.action_payload(artifact),
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertTrue(
            adapted["orderDiscovery"]["exactMutualContainmentSlpsVerified"]
        )
        self.assertFalse(adapted["orderDiscovery"]["recognitionTreeVerified"])

    def test_one_sided_classical_containment_promotes_without_slps(self) -> None:
        artifact = self.verified_artifact(11)
        omega = artifact["structuralIdentification"]["omegaDerivedSubgroup"]
        omega.pop("stabilizerChain")
        omega["equalityMethod"] = (
            "CM_InOmega containment and conclusive one-sided classical "
            "Omega-containment"
        )
        omega["standardGeneratorSlps"] = {
            "status": "unknown",
            "reason": "classical containment proof",
        }
        omega["classicalContainment"] = {
            "status": "verified",
            "algorithm": "RecogniseClassical",
            "case": "orthogonalplus",
            "isOmegaContained": True,
            "oneSidedPositiveIsConclusive": True,
            "negativeWouldBeInconclusive": True,
            "recognitionOutputTrustedForContainment": True,
            "recognitionOutputTrustedForOrder": False,
            "orderTakenFromStandardOmegaAfterMutualContainment": True,
            "randomSeed": certificate.DEFAULT_CLASSICAL_RECOGNITION_SEED,
            "requestedRandomElements": (
                certificate.DEFAULT_CLASSICAL_RECOGNITION_SAMPLES
            ),
            "sampledRandomElements": 37,
            "observedElementOrders": [5, 11, 61],
            "ppdExponents": [5, 8],
            "largePpdExponents": [8],
            "basicPpdExponents": [5],
            "largeBasicPpdExponents": [],
            "package": "recog",
            "packageVersion": "1.5.1",
            "references": ["one-sided recognition fixture"],
        }
        artifact["equalitySearch"]["strategy"] = "classical-containment-first"
        artifact = certificate.attach_hashes(
            artifact,
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
            replay_script=REPLAY_SCRIPT,
        )
        self.validate(artifact)
        adapted = recognition.adapt_odd_prime_structural_certificate(
            artifact,
            self.action_payload(artifact),
            certificate.sha256_bytes(self.manifest.read_bytes()),
            {"status": "verified"},
        )
        self.assertTrue(
            adapted["orderDiscovery"]["oneSidedClassicalContainmentVerified"]
        )
        self.assertFalse(adapted["orderDiscovery"]["standardGeneratorWordsReplayed"])

    def test_tampering_with_slps_or_ledger_is_rejected(self) -> None:
        artifact = self.verified_artifact(5)
        tampered = copy.deepcopy(artifact)
        tampered["structuralIdentification"]["omegaDerivedSubgroup"][
            "standardGeneratorSlps"
        ]["entries"][0]["lines"] = [[2, 1]]
        tampered = certificate.attach_hashes(
            tampered,
            gap_script=GAP_SCRIPT,
            orchestrator=ORCHESTRATOR,
            replay_script=REPLAY_SCRIPT,
        )
        with self.assertRaisesRegex(certificate.CertificateError, "stale"):
            # Restore the old component hash to model a stale scientific payload.
            tampered["structuralIdentification"]["omegaDerivedSubgroup"][
                "standardGeneratorSlps"
            ]["entriesSha256"] = artifact["structuralIdentification"][
                "omegaDerivedSubgroup"
            ]["standardGeneratorSlps"]["entriesSha256"]
            tampered.pop("artifactHash")
            tampered["artifactHash"] = certificate.sha256_json(
                {key: value for key, value in tampered.items() if key != "artifactHash"}
            )
            self.validate(tampered)

        stale_ledger = copy.deepcopy(artifact)
        stale_ledger["degreeSieve"]["degreeLedger"][0]["outcome"] = "admissible"
        stale_ledger.pop("artifactHash")
        stale_ledger["artifactHash"] = certificate.sha256_json(
            {key: value for key, value in stale_ledger.items() if key != "artifactHash"}
        )
        with self.assertRaisesRegex(certificate.CertificateError, "stale"):
            self.validate(stale_ledger)

    def test_gap_drivers_use_direct_proof_and_complete_class_ledger(self) -> None:
        generation = GAP_SCRIPT.read_text(encoding="utf8")
        replay = REPLAY_SCRIPT.read_text(encoding="utf8")
        for token in (
            'ValueGlobal("CM_InOmega")',
            "GeneratorsWithMemory",
            "StabilizerChain",
            "IsProved",
            "SiftGroupElementSLP",
            'ValueGlobal("ClassicalMaximalsGeneric")',
            "[1..9]",
            "outerSurjectiveCase",
            "containedCase",
            "maximalSphericalRestrictionChecks",
            "RecogniseClassical",
            "oneSidedPositiveIsConclusive",
        ):
            self.assertIn(token, generation)
        for forbidden in ("IsCorrect",):
            self.assertNotIn(forbidden, generation)
            self.assertNotIn(forbidden, replay)
        for token in (
            "RecogniseMatrixGroup",
            "recognitionTreeTrustedForOrder := false",
            "exactWordEvaluationIsPrimaryEvidence := true",
        ):
            self.assertIn(token, generation)
        for token in (
            "ResultOfStraightLineProgram(slp, evenGenerators)",
            "ForAll(evenGenerators, generator -> CVIsInStandardOmega(generator, p))",
            "sieve.maximalCatalogue <> stored.maximalCatalogue",
            "sieve.degreeLedger <> stored.degreeLedger",
            "CVReplayClassicalContainment",
        ):
            self.assertIn(token, replay)

    def test_file_hash_is_part_of_the_action_transfer(self) -> None:
        artifact = self.unknown_artifact(11)
        first = self.action_payload(artifact, "1" * 64)
        second = self.action_payload(artifact, "2" * 64)
        self.assertNotEqual(first["actionSha256"], second["actionSha256"])

    def test_certificate_round_trip_json_is_deterministic(self) -> None:
        artifact = self.unknown_artifact(5)
        path = self.root / "certificate.json"
        certificate.write_artifact(path, artifact)
        first = path.read_bytes()
        self.assertNotIn(b"\r\n", first)
        certificate.write_artifact(path, json.loads(first))
        self.assertEqual(first, path.read_bytes())


if __name__ == "__main__":
    unittest.main()
