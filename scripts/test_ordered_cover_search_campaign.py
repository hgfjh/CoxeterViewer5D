"""Tests for strict ordering and fail-closed cover-search orchestration."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import textwrap
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("ordered_cover_search_campaign.py")
SPEC = importlib.util.spec_from_file_location(
    "ordered_cover_search_campaign", SCRIPT_PATH
)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import setup guard
    raise RuntimeError("Cannot load ordered_cover_search_campaign.py")
campaign = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = campaign
SPEC.loader.exec_module(campaign)


FAKE_CLI = r"""#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()

def seal(value, field):
    value = dict(value)
    value.pop(field, None)
    value[field] = digest(value)
    return value

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path)
parser.add_argument("--output-dir", type=Path)
parser.add_argument("--target-config", type=Path)
parser.add_argument("--checkpoint")
parser.add_argument("--search-mode")
parser.add_argument("--max-degree")
parser.add_argument("--max-index")
parser.add_argument("--max-candidate-degrees")
parser.add_argument("--action")
parser.add_argument("--resume", action="store_true")
parser.add_argument("--light-workers")
parser.add_argument("--seed-artifact", action="append", default=[])
args, _ = parser.parse_known_args()
source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
log = Path(os.environ["ORDERED_FAKE_LOG"])

if args.target_config:
    target = json.loads(args.target_config.read_text(encoding="utf-8"))["weylTypes"][0]
    stage = "finite-" + target
    statuses = json.loads(os.environ.get("ORDERED_FAKE_FINITE", "{}"))
    status = statuses.get(target, "exhausted")
    with log.open("a", encoding="utf-8") as stream:
        stream.write(stage + "\n")
    complete = status == "exhausted"
    candidate = status == "candidate-found"
    target_id = "weyl-" + target
    artifact = {
        "schemaVersion": 1,
        "artifactType": "coxeter-cover-search-track",
        "track": "finite-target-synthesis",
        "status": status,
        "complete": complete,
        "inputHash": source_hash,
        "lowerBoundDivisor": 5760,
        "bounds": {
            "maxSubsets": 65536,
            "maxSphericalOrder": 1000000,
            "maxTargetOrderForEnumeration": 100000,
            "maxInvolutions": 100000,
            "maxInvolutionClasses": 10000,
            "maxPrecheckNodesPerType": 50000000,
            "maxAnchorSearchNodes": 150000000,
            "maxAnchorClasses": 65536,
            "maxSearchNodes": 100000000,
            "maxSolutionsPerTarget": 8,
            "maxPermutationDegree": 100000,
            "maxVerifyImageOrder": 1000000,
            "timeoutSecondsPerPrecheck": 3600,
            "timeoutSecondsPerAnchor": 43200,
            "timeoutSecondsPerTarget": 86400,
        },
        "scope": {
            "declaredTargetCount": 1,
            "boundedHomomorphismSearchComplete": complete,
        },
        "candidates": ([{"accepted": True, "targetId": target_id}] if candidate else []),
        "evidence": {
            "targetPlans": [{"id": target_id}],
            "boundedSearchResults": [{"targetId": target_id, "complete": complete}],
        },
        "warnings": [],
        "errors": [],
    }
    write(args.output, seal(artifact, "artifactHash"))
elif args.output:
    with log.open("a", encoding="utf-8") as stream:
        stream.write("nonnormal\n")
    status = os.environ.get("ORDERED_FAKE_NONNORMAL", "incomplete")
    complete = status in {"candidate-found", "exhausted"}
    candidate = status == "candidate-found"
    artifact = {
        "schemaVersion": 1,
        "artifactType": "coxeter-nonnormal-finite-image-campaign",
        "campaignVersion": "1.0.0",
        "status": status,
        "complete": complete,
        "inputHash": source_hash,
        "bounds": {"primes": [2, 3], "maxIndex": int(args.max_index)},
        "geometryPruningCertificate": {
            "status": "cross-prime-matched",
            "maximalSphericalRestrictionCount": 32,
            "primeOrderWitnessesChecked": 186,
        },
        "children": [
            {
                "prime": prime,
                "outcome": "candidate-found" if candidate and prime == 2 else "exhausted",
                "boundedComplete": not candidate,
            }
            for prime in (2, 3)
        ],
        "missingPrimes": [],
        "candidate": ({"id": "nonnormal-candidate", "degree": 5760} if candidate else None),
        "warnings": [],
        "errors": [],
        "provenance": {
            "implementationSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
    }
    write(args.output, seal(artifact, "artifactHash"))
else:
    with log.open("a", encoding="utf-8") as stream:
        stream.write("portfolio\n")
    status = os.environ.get("ORDERED_FAKE_PORTFOLIO", "complete-no-survivor")
    candidate = status != "complete-no-survivor"
    artifact = {
        "schemaVersion": 1,
        "artifactType": "finite-image-residue-module-portfolio",
        "status": status,
        "inputSha256": source_hash,
        "scope": {"rationalPrimes": [3, 5, 7, 11]},
        "workerPortfolioCompleteness": {"complete": not candidate},
        "modulePortfolio": {"complete": not candidate},
        "compositeSearch": {
            "allBoundedDiagonalOrbits": True,
            "summary": {"searchComplete": not candidate},
        },
        "materializedAction": ({"id": "survivor"} if candidate else None),
        "promotionGate": {"completeRowsIndependentlyVerified": candidate},
        "warnings": [],
        "errors": [],
    }
    write(args.output_dir / "portfolio.json", seal(artifact, "portfolioSha256"))
"""


class OrderedCampaignTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "compact.json"
        self.source.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "name": "Compact 5-cube test source",
                    "rank": 10,
                    "generators": [
                        {"id": f"g{i}", "label": f"g{i}"} for i in range(10)
                    ],
                    "coxeterMatrix": [
                        [1 if i == j else 2 for j in range(10)] for i in range(10)
                    ],
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        self.fake = self.root / "fake_cli.py"
        self.fake.write_text(textwrap.dedent(FAKE_CLI), encoding="utf-8")
        self.log = self.root / "calls.log"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def argv(self, output: Path, *extra: str) -> list[str]:
        return [
            "--input",
            str(self.source),
            "--output-dir",
            str(output),
            "--finite-script",
            str(self.fake),
            "--nonnormal-script",
            str(self.fake),
            "--finite-image-worker-script",
            str(self.fake),
            "--finite-image-worker-python",
            os.sys.executable,
            "--portfolio-script",
            str(self.fake),
            "--python",
            os.sys.executable,
            "--portfolio-python",
            os.sys.executable,
            *extra,
        ]

    def load_manifest(self, output: Path) -> dict:
        return json.loads((output / "campaign.json").read_text(encoding="utf-8"))

    def call_log(self) -> list[str]:
        if not self.log.exists():
            return []
        return self.log.read_text(encoding="utf-8").splitlines()

    def environment(self, **values: str):
        return mock.patch.dict(
            os.environ,
            {"ORDERED_FAKE_LOG": str(self.log), **values},
            clear=False,
        )

    def run_main(self, argv: list[str]) -> int:
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return campaign.main(argv)

    def test_dry_run_is_deterministic_and_executes_nothing(self) -> None:
        first = self.root / "first"
        second = self.root / "second"
        with self.environment():
            self.assertEqual(self.run_main(self.argv(first, "--dry-run")), 0)
            self.assertEqual(self.run_main(self.argv(second, "--dry-run")), 0)
            self.assertEqual(self.run_main(self.argv(first, "--dry-run")), 0)
        left = self.load_manifest(first)
        right = self.load_manifest(second)
        self.assertEqual(left, right)
        self.assertEqual(self.call_log(), [])
        self.assertEqual(
            [stage["id"] for stage in left["stages"]],
            [
                "finite-weyl-d6",
                "finite-weyl-b6",
                "finite-weyl-e6",
                "finite-image-nonnormal-p2-p3",
                "odd-prime-composite",
            ],
        )

    def test_incomplete_d6_blocks_every_later_stage(self) -> None:
        output = self.root / "campaign"
        with self.environment(ORDERED_FAKE_FINITE=json.dumps({"D6": "incomplete"})):
            self.assertEqual(self.run_main(self.argv(output)), 2)
        manifest = self.load_manifest(output)
        self.assertEqual(manifest["status"], "blocked")
        self.assertEqual(self.call_log(), ["finite-D6"])
        self.assertTrue(
            all(stage["status"] == "blocked" for stage in manifest["stages"][1:])
        )

    def test_finite_targets_run_in_order_and_nonnormal_stage_blocks(self) -> None:
        output = self.root / "campaign"
        with self.environment(ORDERED_FAKE_NONNORMAL="incomplete"):
            self.assertEqual(self.run_main(self.argv(output)), 2)
        self.assertEqual(
            self.call_log(), ["finite-D6", "finite-B6", "finite-E6", "nonnormal"]
        )
        manifest = self.load_manifest(output)
        self.assertEqual(manifest["currentStage"], "finite-image-nonnormal-p2-p3")
        self.assertEqual(manifest["stages"][-1]["status"], "blocked")

    def test_candidate_stops_before_later_targets(self) -> None:
        output = self.root / "campaign"
        statuses = {"D6": "exhausted", "B6": "candidate-found"}
        with self.environment(ORDERED_FAKE_FINITE=json.dumps(statuses)):
            self.assertEqual(self.run_main(self.argv(output)), 0)
        manifest = self.load_manifest(output)
        self.assertEqual(manifest["status"], "candidate-found")
        self.assertEqual(manifest["candidateStage"], "finite-weyl-b6")
        self.assertEqual(self.call_log(), ["finite-D6", "finite-B6"])
        self.assertTrue(manifest["objectiveSatisfied"])

    def test_complete_chain_reaches_odd_prime_composite_solver(self) -> None:
        output = self.root / "campaign"
        with self.environment(
            ORDERED_FAKE_NONNORMAL="exhausted",
            ORDERED_FAKE_PORTFOLIO="complete-no-survivor",
        ):
            self.assertEqual(self.run_main(self.argv(output)), 0)
        self.assertEqual(
            self.call_log(),
            [
                "finite-D6",
                "finite-B6",
                "finite-E6",
                "nonnormal",
                "portfolio",
            ],
        )
        manifest = self.load_manifest(output)
        self.assertEqual(manifest["status"], "exhausted")
        self.assertTrue(manifest["complete"])

    def test_resume_reuses_exhausted_stage_and_retries_incomplete_stage(self) -> None:
        output = self.root / "campaign"
        first_statuses = {"D6": "exhausted", "B6": "incomplete"}
        with self.environment(ORDERED_FAKE_FINITE=json.dumps(first_statuses)):
            self.assertEqual(self.run_main(self.argv(output)), 2)
        second_statuses = {
            "D6": "exhausted",
            "B6": "exhausted",
            "E6": "incomplete",
        }
        with self.environment(ORDERED_FAKE_FINITE=json.dumps(second_statuses)):
            self.assertEqual(self.run_main(self.argv(output, "--resume")), 2)
        self.assertEqual(
            self.call_log(), ["finite-D6", "finite-B6", "finite-B6", "finite-E6"]
        )

    def test_changed_terminal_artifact_fails_closed_on_resume(self) -> None:
        output = self.root / "campaign"
        statuses = {"D6": "exhausted", "B6": "incomplete"}
        with self.environment(ORDERED_FAKE_FINITE=json.dumps(statuses)):
            self.assertEqual(self.run_main(self.argv(output)), 2)
        artifact = output / "stages" / "finite-weyl-d6" / "artifact.json"
        artifact.write_text(
            artifact.read_text(encoding="utf-8") + " ", encoding="utf-8"
        )
        with self.environment(ORDERED_FAKE_FINITE=json.dumps(statuses)):
            self.assertEqual(self.run_main(self.argv(output, "--resume")), 2)
        self.assertEqual(self.call_log(), ["finite-D6", "finite-B6"])

    def test_timed_out_process_cannot_claim_exhaustion(self) -> None:
        slow = self.root / "slow.py"
        slow.write_text(
            "import time\ntime.sleep(2)\n",
            encoding="utf-8",
        )
        output = self.root / "campaign"
        argv = self.argv(
            output,
            "--finite-script",
            str(slow),
            "--finite-timeout-seconds",
            "0.05",
        )
        with self.environment():
            self.assertEqual(self.run_main(argv), 2)
        manifest = self.load_manifest(output)
        first = manifest["stages"][0]
        self.assertEqual(first["status"], "timed-out")
        self.assertEqual(first["outcome"], "incomplete")
        self.assertFalse(first["complete"])

    def test_campaign_manifest_hash_replays(self) -> None:
        output = self.root / "campaign"
        with self.environment():
            self.assertEqual(self.run_main(self.argv(output, "--dry-run")), 0)
        manifest = self.load_manifest(output)
        supplied = manifest.pop("artifactHash")
        self.assertEqual(supplied, campaign.sha256_json(manifest))


if __name__ == "__main__":
    unittest.main()
