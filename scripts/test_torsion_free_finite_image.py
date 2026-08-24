"""Focused tests for the additive exact finite-image backend.

These tests run in ordinary CPython.  The module's ``--self-test`` adds the
Sage/libGAP checks for matrix orders, source-generator mapping, coset actions,
and packed permutation rows.
"""

from __future__ import annotations

import tempfile
import unittest
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import torsion_free_finite_image as backend


class FiniteImageBackendTests(unittest.TestCase):
    def test_structural_certificate_characteristic_is_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mod3 = root / "mod3.json"
            mod3.write_text(
                json.dumps({"certificateKind": backend.mod3_structural.CERTIFICATE_KIND}),
                encoding="utf-8",
            )
            mod5 = root / "mod5.json"
            mod5.write_text(
                json.dumps(
                    {
                        "certificateKind": backend.odd_prime_structural.certificate_kind(5),
                        "characteristic": 5,
                    }
                ),
                encoding="utf-8",
            )
            mismatched = root / "mismatched.json"
            mismatched.write_text(
                json.dumps(
                    {
                        "certificateKind": backend.odd_prime_structural.certificate_kind(5),
                        "characteristic": 7,
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(backend.structural_certificate_characteristic(mod3), 3)
            self.assertEqual(backend.structural_certificate_characteristic(mod5), 5)
            with self.assertRaisesRegex(Exception, "neither the sealed"):
                backend.structural_certificate_characteristic(mismatched)

    def test_compact_subgroup_row_hash_matches_gap_encoding(self) -> None:
        rows = [[2, 1, 3], [1, 3, 2]]
        expected = hashlib.sha256(
            (("a" * 64) + ":" + "[[2,1,3],[1,3,2]]").encode("utf8")
        ).hexdigest()

        self.assertEqual(
            backend.compact_subgroup_rows_hash("a" * 64, rows), expected
        )

    def test_content_addressed_rows_are_reverified_and_reused(self) -> None:
        payload = bytes(range(24))
        digest = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "checkpoint.bin"
            source.write_bytes(payload)
            descriptor = backend._copy_content_addressed_rows(
                {
                    "path": str(source),
                    "encoding": "uint16-le",
                    "rowMajor": True,
                    "zeroBasedPoints": True,
                    "generatorCount": 2,
                    "sourceGeneratorOrder": [0, 1],
                    "degree": 6,
                    "sha256": digest,
                    "byteLength": len(payload),
                },
                root / "catalogue",
            )
            retained = root / "catalogue" / descriptor["storageKey"]
            self.assertEqual(retained.read_bytes(), payload)
            self.assertEqual(descriptor["sha256"], digest)

    def test_partial_module_catalogue_survives_search_bound_changes(self) -> None:
        payload = b"\x01\x00\x00\x00"
        digest = hashlib.sha256(payload).hexdigest()
        witness = {"id": "tw0"}
        witness_digest = backend.digest_json([witness])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packed_path = root / "checkpoint.permutations.bin"
            packed_path.write_bytes(payload)
            checkpoint = {
                "candidateId": "GF(2)",
                "finiteImageOrder": 24,
                "complete": True,
                "reason": "bounded-subgroup-search-exhausted",
                "config": {"maxIndex": 24, "maxModules": 8, "maxSubgroups": 32},
                "modules": [
                    {
                        "id": "fim-test-0",
                        "finiteImageCandidateId": "GF(2)",
                        "subgroupFingerprint": "d" * 64,
                        "degree": 2,
                        "coveredWitnessIds": ["tw0"],
                        "status": "partial",
                        "origin": {"kind": "unit-test"},
                        "packedPermutationRows": {
                            "path": str(packed_path),
                            "encoding": "uint16-le",
                            "rowMajor": True,
                            "zeroBasedPoints": True,
                            "generatorCount": 1,
                            "sourceGeneratorOrder": [0],
                            "degree": 2,
                            "sha256": digest,
                            "byteLength": len(payload),
                        },
                    }
                ],
            }
            catalogue, storage_root = backend.persist_partial_module_catalogue(
                source={"generators": [{"id": "s0"}]},
                input_hash="a" * 64,
                matrix_digest="b" * 64,
                witness_catalogue={
                    "witnesses": [witness],
                    "witnessDigest": witness_digest,
                },
                attempts=[
                    {
                        "candidateId": "GF(2)",
                        "rationalPrime": 2,
                        "recognitionBridge": {"actionHash": "c" * 64},
                        "structuralRecognition": {"status": "passed"},
                    }
                ],
                checkpoint=checkpoint,
                cache_dir=root / "cache",
                max_unique_packed_bytes=1024,
            )
            self.assertEqual(catalogue["storage"]["uniqueModuleCount"], 1)
            self.assertEqual(catalogue["modules"][0]["degree"], 2)
            self.assertTrue(Path(storage_root, "aggregate.json").is_file())

    def test_kernel_certificate_normalizes_to_the_ui_contract(self) -> None:
        raw = {
            "status": "passed",
            "normal": True,
            "indexDecimal": "24",
            "sourceFiniteImage": {
                "candidateId": "GF(2)",
                "characteristic": 2,
                "fieldOrder": 2,
            },
            "certificate": {
                "criterion": "tits-maximal-spherical-injective-kernel",
                "sphericalRestrictionChecks": [
                    {
                        "id": "T:0",
                        "subset": [0],
                        "expectedOrder": 2,
                        "imageOrder": 2,
                        "injective": True,
                    }
                ],
                "relationChecks": [{"passed": True}],
            },
            "materialization": {
                "currentDegreeBound": 12,
                "reason": "The regular action exceeds the configured bound.",
            },
        }
        raw["certificateSha256"] = backend.shared.sha256_text(
            backend.shared.canonical_json(raw)
        )
        checked = backend.shared.independently_validate_kernel_cover(
            raw, [SimpleNamespace(subset=(0,), expected_order=2)]
        )
        self.assertEqual(checked["index"], "24")
        self.assertEqual(checked["kind"], "normal-congruence-kernel")
        self.assertEqual(checked["materialization"]["status"], "too-large")
        self.assertEqual(checked["sphericalImageChecks"][0]["imageOrder"], "2")

    def test_kernel_cover_is_certified_without_materializing_regular_action(
        self,
    ) -> None:
        field = SimpleNamespace(order=lambda: 2)
        candidate = SimpleNamespace(
            candidate_id="GF(2)",
            rational_prime=2,
            field=field,
            generators=[],
            metadata={"matrixDimension": 10},
        )
        finite_image = SimpleNamespace(
            candidate=candidate,
            order=2_368_880_640,
            relation_checks=[{"passed": True}],
            spherical_checks=[
                {
                    "id": "T:0",
                    "subset": [0],
                    "type": "A1",
                    "expectedOrder": 2,
                    "imageOrder": 2,
                    "injective": True,
                }
            ],
        )
        certificate = backend.kernel_cover_certificate(
            finite_image,
            matrix_digest="a" * 64,
            spherical_digest=backend.digest_json(
                [{"id": "T:0", "subset": [0], "type": "A1", "order": 2}]
            ),
            finite_image_digest="c" * 64,
            manageable_degree=100_000,
        )
        self.assertEqual(certificate["status"], "passed")
        self.assertEqual(certificate["certificateLevel"], "exact-index-kernel")
        self.assertEqual(certificate["indexStatus"], "exact")
        self.assertEqual(certificate["indexDecimal"], "2368880640")
        self.assertTrue(certificate["normal"])
        self.assertEqual(certificate["materialization"]["status"], "not-materialized")
        self.assertEqual(
            certificate["sourceFiniteImage"]["ambientFiniteGroup"]["notation"],
            "GL(10,2)",
        )
        self.assertNotIn("generatorActions", backend.canonical_json(certificate))

    def test_unknown_image_order_still_certifies_a_finite_index_kernel(self) -> None:
        field = SimpleNamespace(order=lambda: 7)
        finite_image = SimpleNamespace(
            candidate=SimpleNamespace(
                candidate_id="GF(7)",
                rational_prime=7,
                field=field,
                generators=[],
                metadata={"matrixDimension": 2},
            ),
            order=None,
            relation_checks=[{"kind": "involution", "passed": True}],
            spherical_checks=[
                {
                    "id": "T:0",
                    "subset": [0],
                    "type": "A1",
                    "expectedOrder": 2,
                    "imageOrder": 2,
                    "injective": True,
                }
            ],
        )
        certificate = backend.kernel_cover_certificate(
            finite_image,
            matrix_digest="a" * 64,
            spherical_digest=backend.digest_json(
                [{"id": "T:0", "subset": [0], "type": "A1", "order": 2}]
            ),
            finite_image_digest="c" * 64,
            manageable_degree=576_000,
        )

        self.assertEqual(certificate["certificateLevel"], "finite-index-kernel")
        self.assertEqual(certificate["indexStatus"], "unknown")
        self.assertNotIn("indexDecimal", certificate)
        self.assertNotIn("imageOrderDecimal", certificate["sourceFiniteImage"])
        self.assertEqual(
            certificate["indexEvidence"],
            {
                "status": "unknown",
                "divisibilityLowerBoundDecimal": "2",
                "finiteUpperBoundDecimal": "2016",
                "upperBoundSource": "ambient-general-linear-group",
            },
        )
        self.assertIn("exact congruence-kernel index", certificate["nonClaims"])

    def test_unknown_index_certificate_normalizes_and_rejects_overclaims(self) -> None:
        field = SimpleNamespace(order=lambda: 7)
        finite_image = SimpleNamespace(
            candidate=SimpleNamespace(
                candidate_id="GF(7)",
                rational_prime=7,
                field=field,
                generators=[],
                metadata={"matrixDimension": 2},
            ),
            order=None,
            relation_checks=[{"kind": "involution", "passed": True}],
            spherical_checks=[
                {
                    "id": "T:0",
                    "subset": [0],
                    "type": "A1",
                    "expectedOrder": 2,
                    "imageOrder": 2,
                    "injective": True,
                }
            ],
        )
        spherical = [
            SimpleNamespace(subset=(0,), expected_order=2, type_name="A1")
        ]
        spherical_digest = backend.digest_json(
            [{"id": "T:0", "subset": [0], "type": "A1", "order": 2}]
        )
        raw = backend.kernel_cover_certificate(
            finite_image,
            matrix_digest="a" * 64,
            spherical_digest=spherical_digest,
            finite_image_digest="c" * 64,
            manageable_degree=576_000,
        )
        checked = backend.shared.independently_validate_kernel_cover(
            raw, spherical, expected_matrix_digest="a" * 64
        )
        self.assertEqual(checked["certificateLevel"], "finite-index-kernel")
        self.assertEqual(checked["indexStatus"], "unknown")
        self.assertNotIn("index", checked)
        self.assertEqual(checked["finiteImage"]["orderStatus"], "unknown")
        self.assertEqual(
            checked["indexBounds"],
            {
                "divisibilityLowerBound": "2",
                "finiteUpperBound": "2016",
                "upperBoundSource": "ambient-general-linear-group",
            },
        )

        overclaim = json.loads(backend.canonical_json(raw))
        overclaim["indexDecimal"] = "2016"
        overclaim["certificateSha256"] = backend.digest_json(
            {
                key: value
                for key, value in overclaim.items()
                if key != "certificateSha256"
            }
        )
        with self.assertRaisesRegex(ValueError, "overclaims an exact index"):
            backend.shared.independently_validate_kernel_cover(overclaim, spherical)

        stale_proof = json.loads(backend.canonical_json(raw))
        stale_proof["certificate"]["relationChecks"][0]["kind"] = "changed"
        stale_proof["certificateSha256"] = backend.digest_json(
            {
                key: value
                for key, value in stale_proof.items()
                if key != "certificateSha256"
            }
        )
        with self.assertRaisesRegex(ValueError, "proof hashes are stale"):
            backend.shared.independently_validate_kernel_cover(stale_proof, spherical)

    def test_result_summary_keeps_kernel_and_materialized_levels_distinct(self) -> None:
        parser = backend.build_parser()
        args = backend.normalize_portfolio_args(
            parser.parse_args(["--input", "unused.json", "--probe-only"])
        )
        args.effective_lower_bound = 2
        unknown = {
            "status": "passed",
            "certificateLevel": "finite-index-kernel",
            "indexEvidence": {"finiteUpperBoundDecimal": "2016"},
            "sourceFiniteImage": {"candidateId": "GF(7)"},
        }
        exact = {
            "status": "passed",
            "certificateLevel": "exact-index-kernel",
            "indexDecimal": "168",
            "sourceFiniteImage": {"candidateId": "GF(2)"},
        }
        attempts = [
            {"status": "accepted", "kernelCover": unknown},
            {"status": "accepted", "kernelCover": exact},
        ]
        result = backend.result_artifact(
            {"name": "test", "generators": [], "coxeterMatrix": []},
            "a" * 64,
            "b" * 64,
            None,
            attempts,
            None,
            None,
            args,
            backend.Deadline(10),
            [],
            [],
        )
        self.assertEqual(
            result["coverOutcome"]["certificateLevel"], "exact-index-kernel"
        )
        self.assertFalse(result["coverOutcome"]["manageableCoverMaterialized"])
        self.assertEqual(
            result["searchCompleteness"]["coverCertification"],
            {
                "highestLevel": "exact-index-kernel",
                "finiteIndexKernelCount": 1,
                "exactIndexKernelCount": 1,
                "materializedCoverCount": 0,
                "independentOfBoundedSubgroupSearch": True,
            },
        )
        materialized = backend.result_artifact(
            {"name": "test", "generators": [], "coxeterMatrix": []},
            "a" * 64,
            "b" * 64,
            None,
            attempts,
            None,
            {"degree": 24, "certificate": {"status": "passed"}},
            args,
            backend.Deadline(10),
            [],
            [],
        )
        self.assertEqual(
            materialized["coverOutcome"]["certificateLevel"],
            "materialized-cover",
        )
        self.assertTrue(materialized["coverOutcome"]["manageableCoverMaterialized"])

    def test_single_prime_cli_is_a_stable_portfolio_worker(self) -> None:
        parser = backend.build_parser()
        args = backend.normalize_portfolio_args(
            parser.parse_args(["--prime", "3", "--probe-only"])
        )
        self.assertEqual(args.portfolio_mode, "single-prime")
        self.assertEqual(args.primes, [3])
        self.assertTrue(args.probe_only)

    def test_auto_cli_keeps_the_deterministic_prime_list(self) -> None:
        parser = backend.build_parser()
        args = backend.normalize_portfolio_args(
            parser.parse_args(["--auto", "--primes", "2,3,7"])
        )
        self.assertEqual(args.portfolio_mode, "auto")
        self.assertEqual(args.primes, [2, 3, 7])

    def test_lower_bound_override_cannot_exclude_valid_degrees(self) -> None:
        self.assertEqual(backend.resolve_lower_bound(5760, None), 5760)
        self.assertEqual(backend.resolve_lower_bound(5760, 2880), 2880)
        with self.assertRaisesRegex(ValueError, "must divide"):
            backend.resolve_lower_bound(5760, 11520)

    def test_only_natural_orbit_seeds_bypass_the_degree_divisor(self) -> None:
        natural = {"seedKind": backend.NATURAL_ORBIT_SEED_KIND}
        ordinary = {"seedKind": "subgroup-search"}
        self.assertTrue(backend.module_degree_allowed(natural, 3, 5760, 23_040))
        self.assertTrue(backend.module_degree_allowed(natural, 119, 5760, 23_040))
        self.assertFalse(backend.module_degree_allowed(ordinary, 3, 5760, 23_040))
        self.assertFalse(backend.module_degree_allowed(natural, 23_041, 5760, 23_040))

    def test_partial_module_degree_must_divide_a_target_diagonal_orbit(self) -> None:
        targets = [5_760, 11_520, 17_280, 23_040]
        self.assertTrue(backend.partial_module_degree_can_reach_target(3, targets))
        self.assertFalse(backend.partial_module_degree_can_reach_target(119, targets))
        self.assertFalse(backend.partial_module_degree_can_reach_target(9_801, targets))

    def test_recognized_orbit_degrees_require_complete_domain_coverage(self) -> None:
        certificate = {
            "action": {"degree": 122},
            "actionValidation": {"orbitSizes": [119, 3]},
        }
        self.assertEqual(
            backend.recognized_natural_orbit_degrees(certificate), [3, 119]
        )
        certificate["actionValidation"]["orbitSizes"] = [3]  # type: ignore[index]
        self.assertIsNone(backend.recognized_natural_orbit_degrees(certificate))

    def test_large_unrecognized_images_do_not_enter_generic_maximals(self) -> None:
        self.assertFalse(
            backend.unrecognized_root_search_allowed(
                2_368_880_640, "maximal", False, 5_000_000, False
            )
        )
        self.assertFalse(
            backend.unrecognized_root_search_allowed(
                2_368_880_640, "maximal", True, 5_000_000, True
            )
        )
        self.assertTrue(
            backend.unrecognized_root_search_allowed(
                24, "maximal", False, 5_000_000, False
            )
        )
        self.assertTrue(
            backend.unrecognized_root_search_allowed(
                2_368_880_640, "maximal", False, 5_000_000, True
            )
        )

    def test_checkpoint_rejects_a_stale_witness_digest(self) -> None:
        header = {
            "schemaVersion": backend.SCHEMA_VERSION,
            "artifactType": backend.CHECKPOINT_TYPE,
            "backendVersion": backend.BACKEND_VERSION,
            "implementationSha256": backend.IMPLEMENTATION_SHA256,
            "inputHash": "a" * 64,
            "matrixDigest": "b" * 64,
            "witnessDigest": "c" * 64,
            "classOriginDigest": "f" * 64,
            "candidateId": "GF(2)",
            "finiteImageOrder": 24,
            "configDigest": "d" * 64,
        }
        checkpoint = backend.fresh_checkpoint(header)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            backend.atomic_write_json(path, checkpoint)
            self.assertEqual(
                backend.load_checkpoint(path, header, True)["candidateId"],
                "GF(2)",
            )
            stale = {**header, "witnessDigest": "e" * 64}
            with self.assertRaisesRegex(backend.ExactInvariantError, "stale"):
                backend.load_checkpoint(path, stale, True)

    def test_checkpoint_has_no_witness_or_permutation_payloads(self) -> None:
        checkpoint = backend.fresh_checkpoint(
            {
                "schemaVersion": backend.SCHEMA_VERSION,
                "artifactType": backend.CHECKPOINT_TYPE,
            }
        )
        encoded = backend.canonical_json(checkpoint)
        self.assertNotIn("torsionWitnesses", encoded)
        self.assertNotIn("generatorActions", encoded)

    def test_maximal_subgroup_siblings_are_durable_before_evaluation(self) -> None:
        checkpoint = backend.fresh_checkpoint(
            {
                "schemaVersion": backend.SCHEMA_VERSION,
                "artifactType": backend.CHECKPOINT_TYPE,
            }
        )
        checkpoint["visitedFingerprints"] = ["parent"]
        children = [
            {
                "fingerprint": "child-b",
                "order": 4,
                "depth": 1,
                "generatorWords": [[[0, 1]]],
            },
            {
                "fingerprint": "child-a",
                "order": 6,
                "depth": 1,
                "generatorWords": [[[1, 1]]],
            },
        ]
        queued = backend.persist_frontier_expansion(checkpoint, children, 24, 12)
        self.assertEqual(
            [backend.descriptor_candidate_fingerprint(item) for item in queued],
            ["child-a", "child-b"],
        )
        self.assertEqual(len(checkpoint["pendingModules"]), 2)
        self.assertEqual(len(checkpoint["frontier"]), 2)

        # Simulate a process that completed the first sibling and was then
        # killed. The second sibling remains in the serialized work queue.
        backend.remove_pending_descriptor(checkpoint, queued[0])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "frontier.json"
            backend.atomic_write_json(path, checkpoint)
            resumed = backend.read_json_object(path)
        self.assertEqual(
            [item["fingerprint"] for item in resumed["pendingModules"]],
            ["child-b"],
        )

    def test_success_does_not_imply_frontier_exhaustion(self) -> None:
        checkpoint = backend.fresh_checkpoint(
            {
                "schemaVersion": backend.SCHEMA_VERSION,
                "artifactType": backend.CHECKPOINT_TYPE,
            }
        )
        self.assertFalse(checkpoint["terminal"])
        self.assertFalse(checkpoint["frontierExhausted"])
        self.assertFalse(checkpoint["minimumProved"])

    def test_passing_result_carries_full_witness_records(self) -> None:
        parser = backend.build_parser()
        args = backend.normalize_portfolio_args(parser.parse_args([]))
        args.effective_lower_bound = 10
        witness = {
            "id": "tw0",
            "word": [0],
            "primeOrder": 2,
            "subset": [0],
            "sphericalSubsetId": "T:0",
            "classOrigins": [
                {
                    "sphericalSubsetId": "T:0",
                    "subset": [0],
                    "sphericalType": "A1",
                    "sphericalOrder": 2,
                    "primeOrder": 2,
                    "classSize": 1,
                    "canonicalWord": [0],
                }
            ],
        }
        origin_digest = backend.digest_json(witness["classOrigins"])
        catalogue = {
            "maximalSphericalSubgroups": [],
            "sphericalDigest": "a" * 64,
            "indexDivisibilityLowerBound": 10,
            "witnessEnumerationSeed": backend.WITNESS_ENUMERATION_SEED,
            "witnessCount": 1,
            "witnessDigest": backend.digest_json([witness]),
            "classOriginCount": 1,
            "classOriginDigest": origin_digest,
            "implementationSha256": backend.IMPLEMENTATION_SHA256,
            "witnesses": [witness],
        }
        artifact = backend.result_artifact(
            {"name": "test", "rank": 1, "generators": [], "coxeterMatrix": [[1]]},
            "b" * 64,
            "c" * 64,
            catalogue,
            [{"status": "accepted", "subgroupSearch": {"complete": True}}],
            None,
            {"degree": 10},
            args,
            backend.Deadline(60),
            [],
            [],
        )
        self.assertEqual(artifact["torsionWitnesses"], [witness])

    def test_nonpassing_result_keeps_witnesses_for_composite_solver(self) -> None:
        parser = backend.build_parser()
        args = backend.normalize_portfolio_args(parser.parse_args([]))
        args.effective_lower_bound = 10
        witness = {
            "id": "tw0",
            "word": [0],
            "primeOrder": 2,
            "classOrigins": [],
        }
        catalogue = {
            "maximalSphericalSubgroups": [],
            "sphericalDigest": "a" * 64,
            "indexDivisibilityLowerBound": 10,
            "witnessEnumerationSeed": backend.WITNESS_ENUMERATION_SEED,
            "witnessCount": 1,
            "witnessDigest": backend.digest_json([witness]),
            "classOriginCount": 0,
            "classOriginDigest": backend.digest_json([]),
            "implementationSha256": backend.IMPLEMENTATION_SHA256,
            "witnesses": [witness],
        }
        artifact = backend.result_artifact(
            {"name": "test", "rank": 1, "generators": [], "coxeterMatrix": [[1]]},
            "b" * 64,
            "c" * 64,
            catalogue,
            [],
            None,
            None,
            args,
            backend.Deadline(60),
            [],
            [],
        )
        self.assertEqual(artifact["torsionWitnesses"], [witness])

    def test_catalogue_cache_binds_class_origins_and_implementation(self) -> None:
        origin = {
            "sphericalSubsetId": "T:0",
            "subset": [0],
            "sphericalType": "A1",
            "sphericalOrder": 2,
            "primeOrder": 2,
            "classSize": 1,
            "canonicalWord": [0],
        }
        witness = {
            "id": "tw0",
            "word": [0],
            "primeOrder": 2,
            "classOrigins": [origin],
        }
        header = {
            "implementationSha256": backend.IMPLEMENTATION_SHA256,
            "matrixDigest": "a" * 64,
            "sphericalDigest": "b" * 64,
            "witnessEnumerationSeed": backend.WITNESS_ENUMERATION_SEED,
        }
        value = {
            "schemaVersion": backend.SCHEMA_VERSION,
            "artifactType": backend.CATALOGUE_TYPE,
            "backendVersion": backend.BACKEND_VERSION,
            **header,
            "witnessCount": 1,
            "witnessDigest": backend.digest_json([witness]),
            "classOriginCount": 1,
            "classOriginDigest": backend.digest_json([origin]),
            "witnesses": [witness],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalogue.json"
            backend.atomic_write_json(path, value)
            self.assertIsNotNone(backend.load_cached_catalogue(path, header))
            self.assertIsNone(
                backend.load_cached_catalogue(
                    path, {**header, "implementationSha256": "c" * 64}
                )
            )

    def test_output_is_honored_for_pure_self_test(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            with patch(
                "sys.argv",
                [
                    "torsion_free_finite_image.py",
                    "--pure-self-test",
                    "--output",
                    str(output),
                ],
            ):
                self.assertEqual(backend.main(), 0)
            self.assertTrue(output.is_file())
            self.assertTrue(backend.read_json_object(output)["ok"])


if __name__ == "__main__":
    unittest.main()
