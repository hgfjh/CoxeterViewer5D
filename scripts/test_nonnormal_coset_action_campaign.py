"""Tests for the bounded characteristic-2/3 nonnormal campaign."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from scripts import nonnormal_coset_action_campaign as campaign  # noqa: E402


def sealed(value: dict) -> dict:
    value = json.loads(campaign.canonical_json(value))
    value["artifactHash"] = campaign.sha256_json(value)
    return value


def partial_catalogue(input_hash: str, matrix: str, witness: str) -> dict:
    value = {
        "schemaVersion": 1,
        "artifactType": "finite-image-partial-module-catalogue",
        "complete": True,
        "hashes": {
            "sourceSha256": input_hash,
            "matrixSha256": matrix,
            "witnessSha256": witness,
        },
        "finiteImages": [{"id": "Q", "characteristic": 2, "sha256": "f" * 64}],
        "witnessCount": 3,
        "sourceGeneratorCount": 10,
        "modules": [{"id": "module-0", "degree": 3}],
        "storage": {},
    }
    value["catalogueSha256"] = campaign.sha256_json(value)
    return value


def child_artifact(
    input_hash: str,
    prime: int,
    *,
    max_index: int = 576_000,
    complete: bool = True,
    candidate: bool = False,
    matrix_digest: str = "a" * 64,
    witness_suffix: str = "",
) -> dict:
    restrictions = [
        {"id": f"T:{index}", "subset": [index % 10], "order": 2} for index in range(32)
    ]
    witnesses = [
        {"id": f"tw-{index}{witness_suffix}", "primeOrder": 2, "word": [index % 10]}
        for index in range(3)
    ]
    witness_digest = campaign.sha256_json(witnesses)
    artifact = {
        "schemaVersion": 1,
        "artifactType": "coxeter-finite-image-search",
        "status": "passed" if candidate else "exhausted",
        "ok": True,
        "inputHash": input_hash,
        "matrixDigest": matrix_digest,
        "bounds": {"primes": [prime], "maxIndex": max_index},
        "sphericalCatalogue": {
            "maximalSphericalSubgroups": restrictions,
            "sphericalDigest": campaign.sha256_json(restrictions),
            "witnessCount": len(witnesses),
            "witnessDigest": witness_digest,
        },
        "torsionWitnesses": witnesses,
        "residueAttempts": [
            {
                "status": "accepted",
                "subgroupSearch": {
                    "complete": complete,
                    "indexScreeningComplete": complete,
                },
            }
        ],
        "searchCompleteness": {
            "status": (
                "certified-candidate-found"
                if candidate
                else "exhausted-within-recorded-bounds"
                if complete
                else "incomplete"
            ),
            "boundedComplete": complete,
        },
        "errors": [],
        "warnings": [],
    }
    artifact["partialModuleCatalogue"] = partial_catalogue(
        input_hash, matrix_digest, witness_digest
    )
    artifact["partialModuleCatalogue"]["finiteImages"][0]["characteristic"] = prime
    artifact["partialModuleCatalogue"].pop("catalogueSha256")
    artifact["partialModuleCatalogue"]["catalogueSha256"] = campaign.sha256_json(
        artifact["partialModuleCatalogue"]
    )
    if candidate:
        artifact["coverOutcome"] = {
            "manageableCoverMaterialized": True,
            "status": "materialized-cover-found",
        }
        artifact["passingAction"] = {
            "degree": 5_760,
            "generatorCount": 10,
            "materialization": "packed",
            "packedPermutationRows": {
                "degree": 5_760,
                "generatorCount": 10,
                "byteLength": 115_200,
                "sha256": "b" * 64,
            },
            "certificate": {
                "status": "passed",
                "criterion": "prime-order-fixed-points+spherical-regular-orbits",
                "fixedPointCountsDigest": "c" * 64,
                "sphericalOrbitChecks": [{"free": True} for _ in range(32)],
            },
        }
    return sealed(artifact)


class NonnormalCampaignTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.input = self.root / "source.json"
        self.input.write_text('{"name":"test"}\n', encoding="utf-8")
        self.input_hash = campaign.source_input_hash(self.input)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_child(self, prime: int, **options) -> Path:
        path = self.root / f"p{prime}.json"
        path.write_text(
            json.dumps(
                child_artifact(self.input_hash, prime, **options), sort_keys=True
            ),
            encoding="utf-8",
        )
        return path

    def test_deterministic_complete_aggregation(self) -> None:
        paths = [self.write_child(2), self.write_child(3)]
        first = campaign.aggregate_campaign(
            input_path=self.input, artifact_paths=paths, max_index=576_000
        )
        second = campaign.aggregate_campaign(
            input_path=self.input,
            artifact_paths=list(reversed(paths)),
            max_index=576_000,
        )
        self.assertEqual(first, second)
        self.assertEqual(first["status"], "exhausted")
        self.assertTrue(first["complete"])
        self.assertEqual(first["campaignVersion"], campaign.CAMPAIGN_VERSION)
        self.assertEqual(
            first["provenance"]["implementationSha256"],
            campaign.sha256_file(Path(campaign.__file__).resolve()),
        )
        self.assertEqual(
            first["geometryPruningCertificate"]["status"], "cross-prime-matched"
        )
        self.assertEqual(len(first["partialModuleCatalogueReferences"]), 2)

    def test_stale_child_hash_is_rejected(self) -> None:
        path = self.write_child(2)
        value = json.loads(path.read_text(encoding="utf-8"))
        value["warnings"].append("tampered")
        path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(campaign.CampaignError, "stale artifactHash"):
            campaign.validate_child_artifact(
                path, input_hash=self.input_hash, max_index=576_000
            )

    def test_source_mismatch_is_rejected(self) -> None:
        path = self.write_child(2)
        with self.assertRaisesRegex(campaign.CampaignError, "different source"):
            campaign.validate_child_artifact(
                path, input_hash="d" * 64, max_index=576_000
            )

    def test_cross_prime_catalogue_mismatch_is_rejected(self) -> None:
        paths = [self.write_child(2), self.write_child(3, witness_suffix="-other")]
        with self.assertRaisesRegex(campaign.CampaignError, "different matrix"):
            campaign.aggregate_campaign(
                input_path=self.input, artifact_paths=paths, max_index=576_000
            )

    def test_incomplete_prime_keeps_campaign_incomplete(self) -> None:
        paths = [self.write_child(2), self.write_child(3, complete=False)]
        result = campaign.aggregate_campaign(
            input_path=self.input, artifact_paths=paths, max_index=576_000
        )
        self.assertEqual(result["status"], "incomplete")
        self.assertFalse(result["complete"])
        self.assertEqual(result["children"][1]["outcome"], "incomplete")

    def test_independently_checked_candidate_wins(self) -> None:
        path = self.write_child(2, candidate=True)
        result = campaign.aggregate_campaign(
            input_path=self.input, artifact_paths=[path], max_index=576_000
        )
        self.assertEqual(result["status"], "candidate-found")
        self.assertEqual(result["candidate"]["degree"], 5_760)
        self.assertEqual(result["candidate"]["sphericalOrbitChecksPassed"], 32)

    def test_worker_command_is_resumable_and_prime_scoped(self) -> None:
        output = self.root / "campaign.p3.json"
        command = campaign.plan_worker_command(
            worker_python="sage",
            worker_script=Path("scripts/torsion_free_finite_image.py"),
            input_path=self.input,
            output_path=output,
            prime=3,
            max_index=576_000,
        )
        self.assertEqual(command[0], "sage")
        self.assertEqual(command[command.index("--prime") + 1], "3")
        self.assertEqual(command[command.index("--max-index") + 1], "576000")
        self.assertIn("--checkpoint", command)
        self.assertEqual(
            command[command.index("--checkpoint") + 1],
            str(self.root / "campaign.p3.checkpoint.json"),
        )
        self.assertIn("--resume", command)


if __name__ == "__main__":
    unittest.main()
