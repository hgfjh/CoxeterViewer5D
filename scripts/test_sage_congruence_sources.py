"""Focused contract tests for congruence sources and the GAP research runtime."""

from __future__ import annotations

import importlib.util
import re
import sys
import types
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def load_backend_helpers():
    """Import pure source helpers without requiring Sage in the test process."""

    sage = types.ModuleType("sage")
    sage_all = types.ModuleType("sage.all")
    sage_all.CyclotomicField = object
    sage_all.identity_matrix = object
    sage_all.matrix = object
    sage_all.next_prime = object
    sage_version = types.ModuleType("sage.version")
    sage_version.version = "test-sage"
    previous = {
        name: sys.modules.get(name) for name in ("sage", "sage.all", "sage.version")
    }
    sys.modules.update(
        {
            "sage": sage,
            "sage.all": sage_all,
            "sage.version": sage_version,
        }
    )
    sys.path.insert(0, str(SCRIPT_DIR))
    try:
        spec = importlib.util.spec_from_file_location(
            "sage_congruence_source_contract",
            SCRIPT_DIR / "sage_congruence_torsion_free.py",
        )
        if spec is None or spec.loader is None:
            raise RuntimeError("Cannot load Sage congruence backend")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


backend = load_backend_helpers()


def source_descriptor(**overrides):
    values = {
        "conductor": 12,
        "defining_polynomial": "x^4 - x^2 + 1",
        "rational_prime": 5,
        "ideal_basis": [["5"], ["0", "1"]],
        "ideal_norm": 25,
        "residue_degree": 2,
        "residue_field_order": 25,
        "ramification_index": 1,
    }
    values.update(overrides)
    if "finite_field_encoding" not in values:
        degree = values["residue_degree"]
        characteristic = values["rational_prime"]
        values["finite_field_encoding"] = {
            "format": "finite-field-polynomial-basis-v1",
            "characteristic": characteristic,
            "degree": degree,
            "order": values["residue_field_order"],
            "basis": ["1", *[f"u^{power}" for power in range(1, degree)]],
            "definingPolynomialCoefficients": (
                [0, 1] if degree == 1 else [2, *([0] * (degree - 1)), 1]
            ),
            "coefficientOrder": "low-degree-first",
        }
    return backend.congruence_source_descriptor(**values)


class CongruenceSourceTests(unittest.TestCase):
    def test_extension_field_source_is_explicit_and_hash_is_stable(self) -> None:
        first = source_descriptor()
        second = source_descriptor()

        self.assertEqual(first["kind"], "extension-field-residue")
        self.assertEqual(first["residueField"]["degree"], 2)
        self.assertEqual(first["residueField"]["order"], 25)
        self.assertFalse(first["gapMatrixBridge"]["compatible"])
        self.assertEqual(
            backend.congruence_source_hash(first),
            backend.congruence_source_hash(second),
        )
        self.assertRegex(backend.congruence_source_hash(first), r"^[0-9a-f]{64}$")

    def test_hash_binds_the_prime_ideal_not_its_display_name(self) -> None:
        first = source_descriptor()
        conjugate = source_descriptor(ideal_basis=[["5"], ["1", "1"]])
        different_field = source_descriptor(
            residue_degree=1,
            residue_field_order=5,
            ideal_norm=5,
        )

        self.assertNotIn("display", first["primeIdeal"])
        self.assertNotEqual(
            backend.congruence_source_hash(first),
            backend.congruence_source_hash(conjugate),
        )
        self.assertNotEqual(
            backend.congruence_source_hash(first),
            backend.congruence_source_hash(different_field),
        )
        self.assertEqual(different_field["kind"], "prime-field-residue")

    def test_extension_field_matrix_encoding_uses_fixed_polynomial_basis(self) -> None:
        class Polynomial:
            def __init__(self, coefficients):
                self.coefficients = coefficients

            def list(self):
                return self.coefficients

        class Field:
            def modulus(self):
                return Polynomial([2, 0, 1])

        class Element:
            def polynomial(self):
                return Polynomial([4, 7])

        encoding = backend.finite_field_encoding_descriptor(Field(), 5, 2)

        self.assertEqual(encoding["basis"], ["1", "u^1"])
        self.assertEqual(encoding["definingPolynomialCoefficients"], [2, 0, 1])
        self.assertEqual(
            backend.finite_field_element_encoding(Element(), 5, 2),
            [4, 2],
        )

    def test_prime_ideal_report_includes_checked_and_bounded_sources(self) -> None:
        class Ideal:
            def __init__(self, label, norm, degree):
                self.label = label
                self._norm = norm
                self._degree = degree

            def __str__(self):
                return self.label

            def norm(self):
                return self._norm

            def residue_class_degree(self):
                return self._degree

        class Field:
            def __init__(self, order):
                self._order = order

            def order(self):
                return self._order

        candidates = []
        for ordinal, (prime, degree, order) in enumerate(((3, 1, 3), (3, 2, 9))):
            descriptor = source_descriptor(
                rational_prime=prime,
                residue_degree=degree,
                residue_field_order=order,
                ideal_norm=order,
            )
            candidates.append(
                backend.PrimeIdealCandidate(
                    rational_prime=prime,
                    ideal=Ideal(f"P{ordinal}", order, degree),
                    residue_field=Field(order),
                    reduction_map=None,
                    source_descriptor=descriptor,
                    source_hash=backend.congruence_source_hash(descriptor),
                    source_ordinal=ordinal,
                )
            )
        attempts = [
            {
                "sourceHash": candidates[0].source_hash,
                "status": "accepted-materializable",
                "reason": "checked",
                "exactRelationStatus": "passed",
                "sphericalRestrictionStatus": "passed",
            }
        ]
        report = backend.prime_ideal_report(
            candidates,
            attempts,
            {
                "maxCongruencePrime": 3,
                "maxCongruenceResidueDegree": 1,
                "maxCandidates": 8,
            },
        )
        ideals = report["rationalPrimes"][0]["ideals"]

        self.assertEqual(len(ideals), 2)
        self.assertEqual(ideals[0]["decision"], "accepted")
        self.assertEqual(ideals[0]["exactRelationStatus"], "passed")
        self.assertEqual(ideals[1]["decision"], "not-inspected")
        self.assertEqual(ideals[1]["reason"], "residue-degree-bound")
        self.assertEqual(report["gapMatrixBridge"]["status"], "prime-fields-only")

    def test_source_order_is_prime_then_field_size_then_exact_hash(self) -> None:
        records = []
        for descriptor in (
            source_descriptor(rational_prime=7, ideal_norm=49, residue_field_order=49),
            source_descriptor(rational_prime=3, ideal_norm=9, residue_field_order=9),
            source_descriptor(
                rational_prime=3, ideal_norm=3, residue_degree=1, residue_field_order=3
            ),
        ):
            records.append(
                {
                    "descriptor": descriptor,
                    "sourceHash": backend.congruence_source_hash(descriptor),
                }
            )

        ordered = sorted(records, key=backend.source_record_sort_key)
        self.assertEqual(
            [record["descriptor"]["residueField"]["order"] for record in ordered],
            [3, 9, 49],
        )

    def test_regular_action_is_materialized_only_inside_the_bound(self) -> None:
        self.assertTrue(backend.should_materialize_action(97_920, 97_920))
        self.assertFalse(backend.should_materialize_action(97_921, 97_920))
        self.assertFalse(backend.should_materialize_action(None, 97_920))

    def test_finite_target_has_an_exact_general_linear_upper_bound(self) -> None:
        self.assertEqual(backend.general_linear_group_order(2, 2), 6)
        self.assertEqual(backend.general_linear_group_order(2, 3), 48)
        with self.assertRaises(ValueError):
            backend.general_linear_group_order(0, 3)


class GapToolchainScriptTests(unittest.TestCase):
    def test_research_packages_are_version_pinned_and_checked(self) -> None:
        text = (SCRIPT_DIR / "install_gap_research_toolchain.sh").read_text(
            encoding="utf8"
        )
        pins = dict(
            re.findall(
                r'^\s*"(orb|genss|recog|ClassicalMaximals):([^\"]+)"\s*$',
                text,
                re.MULTILINE,
            )
        )

        self.assertEqual(
            pins,
            {
                "orb": "5.1.0",
                "genss": "1.6.9",
                "recog": "1.5.1",
                "ClassicalMaximals": "1.1",
            },
        )
        self.assertIn("ARCHIVE_SHA256=", text)
        self.assertIn("installerSha256", text)
        self.assertIn("binarySha256", text)
        self.assertIn("--check", text)
        self.assertIn('"$GAP_BIN" -r', text)


if __name__ == "__main__":
    unittest.main()
