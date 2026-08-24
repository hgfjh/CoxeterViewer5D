"""Pure contract tests for reusable exact finite-image module catalogues."""

from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import finite_image_module_catalogue as catalogue


SOURCE_HASH = "a" * 64
MATRIX_HASH = "b" * 64
WITNESS_HASH = "c" * 64
IMAGE_2_HASH = "d" * 64
IMAGE_3_HASH = "e" * 64
SUBGROUP_2_HASH = "1" * 64
SUBGROUP_3_HASH = "2" * 64
PACKED_3_HASH = catalogue.sha256_bytes(bytes(12))
PACKED_5_HASH = catalogue.sha256_bytes(bytes(20))


def image_record(prime: int) -> dict[str, object]:
    return catalogue.build_finite_image_record(
        image_id=f"GF({prime})",
        characteristic=prime,
        finite_image_sha256=IMAGE_2_HASH if prime == 2 else IMAGE_3_HASH,
        order=6 if prime == 2 else 120,
        origin={"kind": "exact-congruence-image", "prime": prime},
    )


def module_record(
    *,
    prime: int = 2,
    degree: int = 3,
    packed_hash: str = PACKED_3_HASH,
    covered: tuple[int, ...] = (0, 2),
    subgroup_hash: str | None = None,
    origin_label: str | None = None,
) -> dict[str, object]:
    image_hash = IMAGE_2_HASH if prime == 2 else IMAGE_3_HASH
    subgroup = subgroup_hash or (SUBGROUP_2_HASH if prime == 2 else SUBGROUP_3_HASH)
    descriptor = catalogue.build_packed_row_descriptor(
        degree=degree,
        generator_count=2,
        packed_sha256=packed_hash,
    )
    coverage = catalogue.build_fixed_point_coverage(
        covered, witness_count=5, witness_sha256=WITNESS_HASH
    )
    return catalogue.build_module_record(
        source_sha256=SOURCE_HASH,
        matrix_sha256=MATRIX_HASH,
        witness_sha256=WITNESS_HASH,
        finite_image_sha256=image_hash,
        finite_image_id=f"GF({prime})",
        characteristic=prime,
        degree=degree,
        origin={"kind": origin_label or "point-stabilizer", "prime": prime},
        subgroup_fingerprint=subgroup,
        packed_rows=descriptor,
        fixed_point_coverage=coverage,
    )


def complete_catalogue(
    *,
    prime: int = 2,
    modules: list[dict[str, object]] | None = None,
    complete: bool = True,
) -> dict[str, object]:
    return catalogue.build_catalogue(
        source_sha256=SOURCE_HASH,
        matrix_sha256=MATRIX_HASH,
        witness_sha256=WITNESS_HASH,
        witness_count=5,
        source_generator_count=2,
        finite_images=[image_record(prime)],
        modules=modules if modules is not None else [module_record(prime=prime)],
        scope={"kind": "finite-image-subgroup-classes", "prime": prime},
        complete=complete,
    )


class FiniteImageModuleCatalogueTests(unittest.TestCase):
    def test_coverage_bitset_is_deterministic_and_witness_bound(self) -> None:
        first = catalogue.build_fixed_point_coverage([4, 0, 2, 2], 5, WITNESS_HASH)
        second = catalogue.build_fixed_point_coverage([0, 2, 4], 5, WITNESS_HASH)

        self.assertEqual(first, second)
        self.assertEqual(first["bitsetHex"], "15")
        self.assertEqual(catalogue.coverage_indexes(first, WITNESS_HASH), (0, 2, 4))
        with self.assertRaisesRegex(catalogue.CatalogueError, "digest"):
            catalogue.coverage_indexes(first, "f" * 64)

    def test_coverage_rejects_out_of_range_and_unused_high_bits(self) -> None:
        with self.assertRaisesRegex(catalogue.CatalogueError, "outside"):
            catalogue.build_fixed_point_coverage([5], 5, WITNESS_HASH)
        coverage = catalogue.build_fixed_point_coverage([0], 5, WITNESS_HASH)
        coverage["bitsetHex"] = "81"
        coverage["coveredCount"] = 2
        with self.assertRaisesRegex(catalogue.CatalogueError, "Unused"):
            catalogue.coverage_indexes(coverage, WITNESS_HASH)

    def test_packed_descriptor_has_exact_byte_accounting(self) -> None:
        descriptor = catalogue.build_packed_row_descriptor(
            degree=3, generator_count=2, packed_sha256=PACKED_3_HASH
        )

        self.assertEqual(descriptor["encoding"], "uint16-le")
        self.assertEqual(descriptor["byteLength"], 12)
        self.assertEqual(
            descriptor["storageKey"], f"packed/{PACKED_3_HASH}.permutations.bin"
        )
        with self.assertRaisesRegex(catalogue.CatalogueError, "byteLength"):
            catalogue.build_packed_row_descriptor(
                degree=3,
                generator_count=2,
                packed_sha256=PACKED_3_HASH,
                byte_length=11,
            )

    def test_packed_blob_verification_detects_tampering(self) -> None:
        descriptor = catalogue.build_packed_row_descriptor(
            degree=3, generator_count=2, packed_sha256=PACKED_3_HASH
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / descriptor["storageKey"]
            path.parent.mkdir(parents=True)
            path.write_bytes(bytes(12))
            self.assertEqual(
                catalogue.verify_packed_rows_file(descriptor, root), path.resolve()
            )
            path.write_bytes(b"x" * 12)
            with self.assertRaisesRegex(catalogue.CatalogueError, "digest"):
                catalogue.verify_packed_rows_file(descriptor, root)

    def test_catalogue_is_deterministic_under_input_order(self) -> None:
        module_three = module_record()
        module_five = module_record(
            degree=5,
            packed_hash=PACKED_5_HASH,
            covered=(1, 3),
            subgroup_hash="3" * 64,
        )
        first = complete_catalogue(modules=[module_five, module_three])
        second = complete_catalogue(modules=[module_three, module_five])

        self.assertEqual(first, second)
        self.assertEqual([item["degree"] for item in first["modules"]], [3, 5])

    def test_validation_fails_closed_on_stale_hash(self) -> None:
        value = complete_catalogue()

        with self.assertRaisesRegex(catalogue.StaleCatalogueError, "matrix"):
            catalogue.validate_catalogue(
                value, expected_hashes={"matrixSha256": "f" * 64}
            )

    def test_validation_fails_closed_on_incomplete_scope(self) -> None:
        value = complete_catalogue(complete=False)

        catalogue.validate_catalogue(value, require_complete=False)
        with self.assertRaisesRegex(catalogue.IncompleteCatalogueError, "incomplete"):
            catalogue.validate_catalogue(value)

    def test_torsion_free_status_requires_full_witness_coverage(self) -> None:
        partial = module_record()
        with self.assertRaisesRegex(catalogue.CatalogueError, "every witness"):
            catalogue.build_module_record(
                source_sha256=SOURCE_HASH,
                matrix_sha256=MATRIX_HASH,
                witness_sha256=WITNESS_HASH,
                finite_image_sha256=IMAGE_2_HASH,
                finite_image_id="GF(2)",
                characteristic=2,
                degree=3,
                origin={"kind": "test"},
                subgroup_fingerprint=SUBGROUP_2_HASH,
                packed_rows=partial["packedPermutationRows"],
                fixed_point_coverage=partial["fixedPointCoverage"],
                status="torsion-free",
            )

    def test_merge_deduplicates_bytes_and_preserves_provenance(self) -> None:
        mod_two = module_record(prime=2, origin_label="mod-two")
        # The same ordered action bytes and witness coverage can be discovered
        # through a second exact image. Its storage is counted only once.
        mod_three = module_record(
            prime=3,
            subgroup_hash=SUBGROUP_3_HASH,
            origin_label="mod-three",
        )
        left = complete_catalogue(prime=2, modules=[mod_two])
        right = complete_catalogue(prime=3, modules=[mod_three])

        merged = catalogue.merge_catalogues([right, left])

        self.assertEqual(len(merged["finiteImages"]), 2)
        self.assertEqual(len(merged["modules"]), 1)
        self.assertEqual(len(merged["modules"][0]["provenance"]), 2)
        self.assertEqual(merged["storage"]["logicalPackedBytes"], 24)
        self.assertEqual(merged["storage"]["uniquePackedBytes"], 12)
        self.assertEqual(merged["storage"]["deduplicatedPackedBytes"], 12)

    def test_same_blob_with_conflicting_coverage_is_rejected(self) -> None:
        left = complete_catalogue(
            prime=2, modules=[module_record(prime=2, covered=(0, 2))]
        )
        right = complete_catalogue(
            prime=3, modules=[module_record(prime=3, covered=(1, 3))]
        )

        with self.assertRaisesRegex(
            catalogue.IncompatibleCatalogueError, "conflicting"
        ):
            catalogue.merge_catalogues([left, right])

    def test_byte_budget_counts_unique_blobs_not_aliases(self) -> None:
        left = complete_catalogue(prime=2)
        right = complete_catalogue(prime=3)

        merged = catalogue.merge_catalogues([left, right], max_unique_packed_bytes=12)
        self.assertEqual(merged["storage"]["uniquePackedBytes"], 12)
        with self.assertRaises(catalogue.CatalogueBudgetExceeded):
            catalogue.merge_catalogues([left, right], max_unique_packed_bytes=11)

    def test_compatibility_reports_mathematical_hash_mismatch(self) -> None:
        left = complete_catalogue()
        right = deepcopy(left)
        right["hashes"]["witnessSha256"] = "f" * 64
        right["catalogueSha256"] = catalogue.sha256_json(
            catalogue._catalogue_body(right)
        )

        result = catalogue.catalogue_compatibility(left, right)

        self.assertFalse(result["compatible"])
        self.assertTrue(any("witness" in reason for reason in result["reasons"]))

    def test_merge_is_deterministic_across_catalogue_order(self) -> None:
        left = complete_catalogue(prime=2)
        right = complete_catalogue(prime=3)

        self.assertEqual(
            catalogue.merge_catalogues([left, right]),
            catalogue.merge_catalogues([right, left]),
        )

    def test_merge_deduplicates_repeated_finite_image_registry(self) -> None:
        first = complete_catalogue(prime=2)
        second = catalogue.build_catalogue(
            source_sha256=SOURCE_HASH,
            matrix_sha256=MATRIX_HASH,
            witness_sha256=WITNESS_HASH,
            witness_count=5,
            source_generator_count=2,
            finite_images=[image_record(2)],
            modules=[module_record(prime=2)],
            scope={"kind": "second-exact-enumeration", "prime": 2},
            complete=True,
        )

        merged = catalogue.merge_catalogues([first, second])

        self.assertEqual(len(merged["finiteImages"]), 1)
        self.assertEqual(len(merged["modules"]), 1)
        self.assertEqual(merged["storage"]["uniquePackedBytes"], 12)
        self.assertEqual(merged["storage"]["logicalPackedBytes"], 24)

    def test_merge_is_idempotent_for_a_repeated_sealed_catalogue(self) -> None:
        value = complete_catalogue(prime=2)

        once = catalogue.merge_catalogues([value])
        repeated = catalogue.merge_catalogues([value, value])

        self.assertEqual(once, repeated)
        self.assertEqual(repeated["storage"]["logicalPackedBytes"], 12)

    def test_target_screen_applies_only_necessary_divisibility(self) -> None:
        modules = [
            module_record(degree=3, packed_hash=PACKED_3_HASH),
            module_record(
                degree=5,
                packed_hash=PACKED_5_HASH,
                covered=(1, 3),
                subgroup_hash="3" * 64,
            ),
        ]
        value = complete_catalogue(modules=modules)

        screen = catalogue.screen_catalogue_for_target_degrees(value, [12, 30])

        self.assertTrue(screen["necessaryOnly"])
        self.assertEqual(
            [record["degree"] for record in screen["eligibleModules"]], [3, 5]
        )
        by_degree = {
            record["degree"]: record["compatibleTargets"]
            for record in screen["eligibleModules"]
        }
        self.assertEqual(by_degree, {3: [12, 30], 5: [30]})

    def test_module_tampering_invalidates_catalogue_digest(self) -> None:
        value = complete_catalogue()
        value["modules"][0]["degree"] = 6

        with self.assertRaisesRegex(catalogue.CatalogueError, "catalogue digest"):
            catalogue.validate_catalogue(value)


if __name__ == "__main__":
    unittest.main()
