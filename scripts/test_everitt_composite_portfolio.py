"""Contract tests for the production Everitt composite-module coordinator."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import everitt_composite_portfolio as portfolio
import finite_image_module_catalogue as catalogue


IMAGE_TWO_HASH = "d" * 64
IMAGE_THREE_HASH = "e" * 64
SUBGROUP_TWO_HASH = "1" * 64
SUBGROUP_THREE_HASH = "2" * 64


class Fixture:
    def __init__(self, root: Path, *, complete: bool = True) -> None:
        self.root = root
        self.source = root / "a2.json"
        self.source.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "name": "A2 coordinator fixture",
                    "rank": 2,
                    "generators": [
                        {"id": "s0", "label": "s0"},
                        {"id": "s1", "label": "s1"},
                    ],
                    "coxeterMatrix": [[1, 3], [3, 1]],
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        self.source_hash = portfolio.sha256_file(self.source)
        self.matrix_hash = catalogue.sha256_json({"coxeterMatrix": [[1, 3], [3, 1]]})
        # In this fixture both natural A2 reflections have a fixed point in a
        # single factor. Their off-diagonal self-product orbit is nevertheless
        # free on both witnesses.
        self.witnesses = [
            {"id": "left-reflection", "word": [0], "primeOrder": 2},
            {"id": "right-reflection", "word": [1], "primeOrder": 2},
        ]
        self.witness_hash = catalogue.sha256_json(self.witnesses)
        self.witness_path = root / "witness-catalogue.json"
        self.witness_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "artifactType": "test-complete-witness-catalogue",
                    "complete": True,
                    "witnessCount": len(self.witnesses),
                    "witnessDigest": self.witness_hash,
                    "witnesses": self.witnesses,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        self.catalogue = self._write_catalogue(
            root / "catalogue-two", prime=2, complete=complete
        )

    @staticmethod
    def _packed_bytes() -> bytes:
        rows = ([1, 0, 2], [0, 2, 1])
        return b"".join(
            int(value).to_bytes(2, "little") for row in rows for value in row
        )

    def _write_catalogue(self, root: Path, *, prime: int, complete: bool) -> Path:
        root.mkdir(parents=True)
        packed = self._packed_bytes()
        packed_hash = portfolio.sha256_bytes(packed)
        descriptor = catalogue.build_packed_row_descriptor(
            degree=3,
            generator_count=2,
            packed_sha256=packed_hash,
            byte_length=len(packed),
        )
        blob = root.joinpath(*Path(descriptor["storageKey"]).parts)
        blob.parent.mkdir(parents=True)
        blob.write_bytes(packed)
        image_hash = IMAGE_TWO_HASH if prime == 2 else IMAGE_THREE_HASH
        subgroup_hash = SUBGROUP_TWO_HASH if prime == 2 else SUBGROUP_THREE_HASH
        image = catalogue.build_finite_image_record(
            image_id=f"GF({prime})",
            characteristic=prime,
            finite_image_sha256=image_hash,
            order=6,
            origin={"kind": "test-exact-image", "prime": prime},
        )
        coverage = catalogue.build_fixed_point_coverage(
            [], len(self.witnesses), self.witness_hash
        )
        module = catalogue.build_module_record(
            source_sha256=self.source_hash,
            matrix_sha256=self.matrix_hash,
            witness_sha256=self.witness_hash,
            finite_image_sha256=image_hash,
            finite_image_id=image["id"],
            characteristic=prime,
            degree=3,
            origin={"kind": "natural-A2-action", "prime": prime},
            subgroup_fingerprint=subgroup_hash,
            packed_rows=descriptor,
            fixed_point_coverage=coverage,
            status="partial",
        )
        value = catalogue.build_catalogue(
            source_sha256=self.source_hash,
            matrix_sha256=self.matrix_hash,
            witness_sha256=self.witness_hash,
            witness_count=len(self.witnesses),
            source_generator_count=2,
            finite_images=[image],
            modules=[module],
            scope={"kind": "test-bounded-image", "prime": prime},
            complete=complete,
        )
        path = root / "catalogue.json"
        path.write_text(
            json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return path

    def second_catalogue(self) -> Path:
        return self._write_catalogue(
            self.root / "catalogue-three", prime=3, complete=True
        )

    def run(
        self,
        *,
        bounds: portfolio.SearchBounds | None = None,
        catalogues: list[Path] | None = None,
        label: str = "result",
        checkpoint: Path | None = None,
        resume: bool = False,
    ) -> dict[str, object]:
        return portfolio.run_portfolio(
            input_path=self.source,
            catalogue_paths=catalogues or [self.catalogue],
            witness_catalogue_path=self.witness_path,
            bounds=bounds
            or portfolio.SearchBounds(
                max_factors=2,
                max_degree=6,
                max_cartesian_points=9,
                max_combinations=16,
                max_bytes=2_000_000,
                max_mapped_bytes=1_000_000,
                checkpoint_interval=2,
            ),
            checkpoint_path=checkpoint,
            resume=resume,
            materialized_action_path=self.root / f"{label}.action.json",
        )


class EverittCompositePortfolioTests(unittest.TestCase):
    def test_dry_run_needs_no_catalogue(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            artifact = portfolio.build_dry_run(
                fixture.source,
                [],
                portfolio.SearchBounds(max_degree=60),
            )

            self.assertEqual(artifact["artifactType"], "coxeter-cover-search-track")
            self.assertEqual(artifact["track"], "everitt-composite-modules")
            self.assertEqual(artifact["status"], "planned")
            self.assertFalse(artifact["complete"])
            self.assertEqual(artifact["completeScope"], "none")
            self.assertEqual(artifact["lowerBoundDivisor"], 6)
            self.assertEqual(
                artifact["evidence"]["targetDegreeScreen"],
                {"first": 6, "last": 60, "step": 6, "count": 10},
            )
            self.assertEqual(
                artifact["artifactHash"], portfolio._artifact_hash(artifact)
            )

    def test_cli_exposes_minimum_dry_run_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            output = fixture.root / "dry-run.json"

            code = portfolio.main(
                [
                    "--input",
                    str(fixture.source),
                    "--output",
                    str(output),
                    "--dry-run",
                ]
            )

            self.assertEqual(code, 0)
            artifact = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(artifact["status"], "planned")
            self.assertIn("plannedRequirements", artifact["evidence"])

    def test_off_base_diagonal_orbit_is_found_and_materialized(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            artifact = fixture.run()

            self.assertEqual(artifact["status"], "candidate-found")
            candidate = artifact["candidates"][0]
            self.assertEqual(candidate["degree"], 6)
            self.assertNotEqual(candidate["representativeTuple"], [0, 0])
            self.assertEqual(
                artifact["evidence"]["diagonalOrbitDiagnostics"][
                    "exceptional_witness_free_orbits"
                ],
                1,
            )
            self.assertEqual(
                candidate["materializedAction"]["witnessFixedPointCounts"], [0, 0]
            )
            certificate = candidate["certificate"]
            self.assertTrue(certificate["maximalSphericalRestrictionsRegular"])
            spherical = certificate["independentPointLevelCertificate"][
                "sphericalOrbitChecks"
            ]
            self.assertEqual(len(spherical), 1)
            self.assertEqual(spherical[0]["orbitSizeHistogram"], {"6": 1})
            partition = candidate["selectedProductOrbitPartition"]
            self.assertTrue(partition["allProductOrbitsEnumerated"])
            self.assertEqual(partition["orbitCount"], 2)
            self.assertEqual(partition["orbitDegreeHistogram"], {"3": 1, "6": 1})
            self.assertEqual(partition["selectedOrbit"]["representativeTuple"], [1, 0])
            completeness = artifact["evidence"]["completeness"]
            self.assertEqual(
                artifact["completeScope"],
                "bounded-supplied-catalogue-objective",
            )
            self.assertTrue(completeness["candidateCertificateComplete"])
            self.assertTrue(completeness["minimumWithinBoundedScopeProved"])
            self.assertTrue(completeness["terminatedAtExactLowerBound"])
            self.assertFalse(
                completeness["allBoundedFactorMultisetsAndOrbitsEnumerated"]
            )
            self.assertEqual(
                artifact["artifactHash"], portfolio._artifact_hash(artifact)
            )
            self.assertIn(
                "selectedProduct",
                artifact["evidence"]["orbitEnumerationContract"]["diagnosticRetention"],
            )

    def test_repeated_factor_intersection_is_not_pruned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            artifact = fixture.run(label="self-product")
            candidate = artifact["candidates"][0]

            self.assertEqual(len(candidate["moduleIds"]), 2)
            self.assertEqual(candidate["moduleIds"][0], candidate["moduleIds"][1])
            self.assertEqual(
                artifact["evidence"]["solver"]["diagnostics"]["factorPolicy"],
                "nondecreasing-module-multisets-with-repetition",
            )
            self.assertEqual(
                candidate["selectedProductOrbitPartition"]["repeatedFactorPositions"],
                [[0, 1]],
            )

    def test_compatible_catalogues_merge_and_preserve_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            second = fixture.second_catalogue()
            artifact = fixture.run(
                catalogues=[second, fixture.catalogue], label="merged"
            )

            merged = artifact["evidence"]["mergedCatalogue"]
            self.assertEqual(merged["moduleCount"], 1)
            self.assertEqual(merged["finiteImageCount"], 2)
            self.assertEqual(
                len(artifact["candidates"][0]["factors"][0]["provenance"]), 2
            )

    def test_stale_source_and_blob_hashes_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            original = fixture.source.read_text(encoding="utf-8")
            fixture.source.write_text(original + " ", encoding="utf-8")
            with self.assertRaisesRegex(portfolio.CoordinatorError, "stale source"):
                fixture.run(label="stale-source")

        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            raw = json.loads(fixture.catalogue.read_text(encoding="utf-8"))
            descriptor = raw["modules"][0]["packedPermutationRows"]
            blob = fixture.catalogue.parent.joinpath(
                *Path(descriptor["storageKey"]).parts
            )
            blob.write_bytes(b"x" * descriptor["byteLength"])
            with self.assertRaisesRegex(portfolio.CoordinatorError, "digest"):
                fixture.run(label="stale-blob")

    def test_resource_cap_is_reported_as_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            artifact = fixture.run(
                bounds=portfolio.SearchBounds(
                    max_factors=2,
                    max_degree=6,
                    max_cartesian_points=9,
                    max_combinations=1,
                    max_bytes=2_000_000,
                    max_mapped_bytes=1_000_000,
                    checkpoint_interval=1,
                ),
                label="capped",
            )

            self.assertEqual(artifact["status"], "incomplete")
            self.assertFalse(artifact["complete"])
            self.assertTrue(
                artifact["evidence"]["solver"]["diagnostics"]["combination_cap_hit"]
            )
            self.assertFalse(
                artifact["evidence"]["completeness"]["solverBoundedScopeComplete"]
            )

    def test_verified_partial_modules_survive_incomplete_catalogue_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory), complete=False)
            artifact = fixture.run(label="incomplete-catalogue")

            self.assertEqual(artifact["status"], "candidate-found")
            self.assertFalse(artifact["complete"])
            self.assertEqual(
                artifact["evidence"]["mergedCatalogue"]["partialModuleCount"], 1
            )
            self.assertTrue(
                artifact["candidates"][0]["certificate"][
                    "allWitnessFixedPointCountsZero"
                ]
            )

    def test_artifact_is_independent_of_catalogue_storage_path(self) -> None:
        artifacts = []
        for label in ("first", "second"):
            with tempfile.TemporaryDirectory() as directory:
                fixture = Fixture(Path(directory))
                artifacts.append(fixture.run(label=label))

        self.assertEqual(artifacts[0], artifacts[1])
        mapped = artifacts[0]["evidence"]["solver"]["diagnostics"][
            "mappedActionSources"
        ]
        self.assertTrue(mapped)
        self.assertNotIn("path", mapped[0])

    def test_nonfree_spherical_restriction_is_detected_independently(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            source = portfolio._load_source(fixture.source)
            candidate = portfolio.packed_solver.OrbitCandidate(
                module_indices=(0,),
                module_ids=("natural",),
                representative_code=0,
                representative_tuple=(0,),
                orbit_index=0,
                degree=3,
                cartesian_degree=3,
                decomposition_kind="single-transitive-factor",
            )
            action = portfolio.packed_solver.MaterializedAction(
                candidate=candidate,
                generator_actions=(
                    portfolio.array("H", [1, 0, 2]),
                    portfolio.array("H", [0, 2, 1]),
                ),
                orbit_point_codes=portfolio.array("H", [0, 1, 2]),
                witness_fixed_point_counts=(1, 1),
                action_sha256="0" * 64,
                packed_bytes=0,
            )

            certificate = portfolio._certify_materialized_action(
                source, fixture.witnesses, action
            )

            self.assertFalse(certificate["passed"])
            self.assertFalse(certificate["maximalSphericalRegularOrbitChecksPassed"])
            self.assertEqual(
                certificate["sphericalOrbitChecks"][0]["orbitSizeHistogram"],
                {"3": 1},
            )

    def test_checkpoint_is_sealed_resumes_and_rejects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            checkpoint = fixture.root / "search.checkpoint.json"
            capped = portfolio.SearchBounds(
                max_factors=2,
                max_degree=6,
                max_cartesian_points=9,
                max_combinations=1,
                max_bytes=2_000_000,
                max_mapped_bytes=1_000_000,
                checkpoint_interval=1,
            )
            partial = fixture.run(bounds=capped, checkpoint=checkpoint, label="partial")
            self.assertEqual(partial["status"], "incomplete")
            self.assertTrue(checkpoint.is_file())
            self.assertTrue(portfolio._checkpoint_seal_path(checkpoint).is_file())

            changed_catalogue = fixture._write_catalogue(
                fixture.root / "catalogue-changed-scope",
                prime=2,
                complete=False,
            )
            with self.assertRaisesRegex(
                portfolio.CoordinatorError, "integrity metadata changed"
            ):
                fixture.run(
                    bounds=portfolio.SearchBounds(
                        max_factors=2,
                        max_degree=6,
                        max_cartesian_points=9,
                        max_combinations=16,
                        max_bytes=2_000_000,
                        max_mapped_bytes=1_000_000,
                        checkpoint_interval=1,
                    ),
                    catalogues=[changed_catalogue],
                    checkpoint=checkpoint,
                    resume=True,
                    label="changed-catalogue-resume",
                )

            resumed_bounds = portfolio.SearchBounds(
                max_factors=2,
                max_degree=6,
                max_cartesian_points=9,
                max_combinations=16,
                max_bytes=2_000_000,
                max_mapped_bytes=1_000_000,
                checkpoint_interval=1,
            )
            resumed = fixture.run(
                bounds=resumed_bounds,
                checkpoint=checkpoint,
                resume=True,
                label="resumed",
            )
            self.assertEqual(resumed["status"], "candidate-found")
            self.assertEqual(
                resumed["evidence"]["checkpoint"]["problemSha256"],
                resumed["evidence"]["solver"]["problemSha256"],
            )
            self.assertEqual(
                resumed["evidence"]["checkpoint"]["coordinatorSha256"],
                portfolio.COORDINATOR_SHA256,
            )
            self.assertRegex(
                resumed["evidence"]["checkpoint"]["portfolioBindingSha256"],
                r"^[0-9a-f]{64}$",
            )

        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(Path(directory))
            checkpoint = fixture.root / "tampered.checkpoint.json"
            capped = portfolio.SearchBounds(
                max_factors=2,
                max_degree=6,
                max_cartesian_points=9,
                max_combinations=1,
                max_bytes=2_000_000,
                max_mapped_bytes=1_000_000,
                checkpoint_interval=1,
            )
            fixture.run(bounds=capped, checkpoint=checkpoint, label="tamper-seed")
            value = json.loads(checkpoint.read_text(encoding="utf-8"))
            value["complete"] = True
            checkpoint.write_text(
                json.dumps(value, sort_keys=True) + "\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(portfolio.CoordinatorError, "Checkpoint bytes"):
                fixture.run(
                    bounds=portfolio.SearchBounds(
                        max_factors=2,
                        max_degree=6,
                        max_cartesian_points=9,
                        max_combinations=16,
                        max_bytes=2_000_000,
                        max_mapped_bytes=1_000_000,
                        checkpoint_interval=1,
                    ),
                    checkpoint=checkpoint,
                    resume=True,
                    label="tampered-resume",
                )


if __name__ == "__main__":
    unittest.main()
