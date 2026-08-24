#!/usr/bin/env python3
"""Tests for the partial-module campaign integration boundary."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as module_catalogue  # noqa: E402
import partial_module_search_campaign as campaign  # noqa: E402


HASH_A = "a" * 64
HASH_B = "b" * 64


def witnesses() -> list[dict[str, object]]:
    return [
        {"id": "w0", "primeOrder": 2, "word": [0]},
        {"id": "w1", "primeOrder": 2, "word": [1]},
        {"id": "w2", "primeOrder": 3, "word": [0, 1]},
        {"id": "w3", "primeOrder": 5, "word": [0, 1, 0, 1]},
    ]


def exact_coverage(indexes: list[int], witness_hash: str) -> dict[str, object]:
    return module_catalogue.build_fixed_point_coverage(indexes, 4, witness_hash)


def order5_report(witness_hash: str, indexes: list[int]) -> dict[str, object]:
    coverage = exact_coverage(indexes, witness_hash)
    report: dict[str, object] = {
        "artifactType": "order5-first-partial-module-campaign",
        "mode": "real",
        "source": {
            "witnessSha256": witness_hash,
            "witnessCount": 4,
            "matrixSha256": HASH_A,
            "moduleSourceSha256": HASH_B,
        },
        "paretoPortfolio": {
            "modules": [
                {
                    "id": "primary",
                    "degree": 2,
                    "fixedPointCoverage": coverage,
                    "generatorRows": [[1, 0], [0, 1]],
                }
            ]
        },
        "unionCoverage": {"coveredCount": len(indexes)},
    }
    report["reportSha256"] = campaign.sha256_json(report)
    return report


def mod2_report(witness_hash: str, indexes: list[int]) -> dict[str, object]:
    bits = bytearray(1)
    for index in indexes:
        bits[index // 8] |= 1 << (index % 8)
    coverage_core = {
        "encoding": "lsb0-hex",
        "witnessSha256": witness_hash,
        "witnessCount": 4,
        "bitsetHex": bytes(bits).hex(),
        "coveredCount": len(indexes),
        "coveredWitnessIndexes": indexes,
    }
    coverage = {
        "status": "exact",
        **coverage_core,
        "sha256": campaign.sha256_json(coverage_core),
    }
    report: dict[str, object] = {
        "artifactType": "mod2-symbolic-partial-module-catalogue",
        "source": {
            "hashes": {
                "witnessCatalogueSha256": witness_hash,
                "coxeterMatrixSha256": HASH_A,
            }
        },
        "entries": [
            {
                "id": "symbolic",
                "kind": "exact-module",
                "degree": 97_920,
                "coverage": coverage,
            }
        ],
    }
    report["artifactSha256"] = campaign.sha256_json(report)
    return report


def composite_report(
    witness_hash: str,
    mod2_artifact_hash: str,
    mod2_file_hash: str,
    *,
    status: str = "incomplete-resource-bounded",
) -> dict[str, object]:
    report: dict[str, object] = {
        "artifactType": "mod2-symbolic-composite-search",
        "status": status,
        "sourceHashes": {
            "symbolicReportSha256": mod2_artifact_hash,
            "symbolicReportFileSha256": mod2_file_hash,
            "witnessCatalogueSha256": witness_hash,
            "coxeterMatrixSha256": HASH_A,
        },
        "baseExactCertificate": {
            "status": "exact-exhausted",
            "maximumDegree": 97_920,
        },
        "search": {
            "completeWithinDeclaredTargets": status == "exact-exhausted",
            "reason": "test bound",
        },
        "claims": [],
        "nonClaims": [],
    }
    report["artifactSha256"] = campaign.sha256_json(report)
    return report


class CampaignIntegrationTests(unittest.TestCase):
    def build(self, primary_indexes: list[int], mod2_indexes: list[int]):
        records = witnesses()
        witness_hash = campaign.sha256_json(records)
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "source.json"
            source_path.write_text("{}\n", encoding="utf8")
            return campaign.build_campaign_report(
                source_path=source_path,
                source={"name": "test"},
                witnesses=records,
                witness_sha256=witness_hash,
                order5_report=order5_report(witness_hash, primary_indexes),
                mod2_report=mod2_report(witness_hash, mod2_indexes),
                order5_file_sha256=HASH_A,
                mod2_file_sha256=HASH_B,
                fallback=None,
            )

    def test_gate_opens_only_after_complete_union_coverage(self) -> None:
        report = self.build([0, 1], [2, 3])
        self.assertTrue(report["compositionGate"]["ready"])
        self.assertEqual(report["portfolio"]["coverage"]["coveredCount"], 4)
        self.assertEqual(
            report["compositionGate"]["targetDegrees"],
            list(campaign.TARGET_DEGREES),
        )

    def test_incomplete_union_stays_blocked_with_order_counts(self) -> None:
        report = self.build([0], [2])
        self.assertFalse(report["compositionGate"]["ready"])
        self.assertEqual(
            report["compositionGate"]["status"],
            "blocked-incomplete-witness-union",
        )
        self.assertEqual(
            report["portfolio"]["coverage"]["byPrimeOrder"]["5"]["remaining"],
            1,
        )

    def test_stale_primary_seal_is_rejected(self) -> None:
        records = witnesses()
        witness_hash = campaign.sha256_json(records)
        report = order5_report(witness_hash, [0])
        report["unionCoverage"] = {"coveredCount": 2}
        with self.assertRaisesRegex(campaign.CampaignIntegrationError, "seal"):
            campaign.validate_order5_report(report, witness_hash, 4)

    def test_matrix_mismatch_is_rejected(self) -> None:
        records = witnesses()
        witness_hash = campaign.sha256_json(records)
        mod2 = mod2_report(witness_hash, [2])
        mod2["source"]["hashes"]["coxeterMatrixSha256"] = "c" * 64
        mod2["artifactSha256"] = campaign.sha256_json(
            {key: value for key, value in mod2.items() if key != "artifactSha256"}
        )
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "source.json"
            source_path.write_text("{}\n", encoding="utf8")
            with self.assertRaisesRegex(
                campaign.CampaignIntegrationError, "matrices differ"
            ):
                campaign.build_campaign_report(
                    source_path=source_path,
                    source={"name": "test"},
                    witnesses=records,
                    witness_sha256=witness_hash,
                    order5_report=order5_report(witness_hash, [0]),
                    mod2_report=mod2,
                    order5_file_sha256=HASH_A,
                    mod2_file_sha256=HASH_B,
                    fallback=None,
                )

    def test_pareto_frontier_does_not_delete_source_modules(self) -> None:
        modules = [
            {"id": "small", "degree": 2, "coverage": frozenset({0, 1})},
            {"id": "large", "degree": 4, "coverage": frozenset({0})},
            {"id": "different", "degree": 3, "coverage": frozenset({2})},
        ]
        self.assertEqual(campaign.pareto_module_ids(modules), ["small", "different"])
        self.assertEqual(len(modules), 3)

    def test_target_degree_screen_uses_strict_projection_divisor(self) -> None:
        modules = [
            {"id": "small", "degree": 2, "coverage": frozenset({0, 1, 2})},
            {"id": "large-a", "degree": 97_920, "coverage": frozenset({0, 3})},
            {"id": "large-b", "degree": 97_920, "coverage": frozenset({1, 2})},
        ]
        screen = campaign.screen_target_degrees(modules, 4)
        row = next(item for item in screen if item["degree"] == 97_920)
        self.assertEqual(row["status"], "impossible-by-coverage-and-index")

        extended = [
            *modules,
            {"id": "mid", "degree": 48_960, "coverage": frozenset({3})},
        ]
        row = next(
            item
            for item in campaign.screen_target_degrees(extended, 4)
            if item["degree"] == 97_920
        )
        self.assertEqual(row["status"], "double-coset-search-required")

    def test_bounded_composite_frontier_is_hash_bound_and_not_overclaimed(
        self,
    ) -> None:
        records = witnesses()
        witness_hash = campaign.sha256_json(records)
        mod2 = mod2_report(witness_hash, [2, 3])
        composite = composite_report(
            witness_hash,
            str(mod2["artifactSha256"]),
            HASH_B,
        )
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "source.json"
            source_path.write_text("{}\n", encoding="utf8")
            report = campaign.build_campaign_report(
                source_path=source_path,
                source={"name": "test"},
                witnesses=records,
                witness_sha256=witness_hash,
                order5_report=order5_report(witness_hash, [0, 1]),
                mod2_report=mod2,
                order5_file_sha256=HASH_A,
                mod2_file_sha256=HASH_B,
                composite_report=composite,
                composite_file_sha256="c" * 64,
            )

        self.assertEqual(
            report["status"],
            "requested-target-range-eliminated-next-frontier-incomplete",
        )
        self.assertEqual(report["symbolicComposite"]["baseExactThroughDegree"], 97_920)
        self.assertFalse(report["symbolicComposite"]["completeAtNextFrontier"])

    def test_stale_composite_binding_is_rejected(self) -> None:
        records = witnesses()
        witness_hash = campaign.sha256_json(records)
        mod2 = mod2_report(witness_hash, [2, 3])
        composite = composite_report(
            witness_hash,
            str(mod2["artifactSha256"]),
            "c" * 64,
        )
        with self.assertRaisesRegex(campaign.CampaignIntegrationError, "stale"):
            campaign.validate_composite_report(
                composite,
                mod2_artifact_sha256=str(mod2["artifactSha256"]),
                mod2_file_sha256=HASH_B,
                witness_sha256=witness_hash,
                matrix_sha256=HASH_A,
            )


if __name__ == "__main__":
    unittest.main()
