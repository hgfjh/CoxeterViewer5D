from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import certify_h1_residual_kernel as checker


class ResidualKernelCertificateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.matrix = self.root / "matrix.linbox"
        self.modular = self.root / "kernel.txt"
        self.vectors = self.root / "vectors.json"
        self.certificate = self.root / "certificate.json"
        # -x-y+2z=0 has saturated kernel generated, for example, by
        # (2,0,1) and (1,1,1).  The modular vectors below lift first to the
        # index-two pair (2,0,1),(0,2,1), exercising the saturation descent.
        self.matrix.write_text("1 3 S\n3 0 -1 1 -1 2 2\n", encoding="ascii")
        self.modular.write_text(
            "3 2 5 1\n"
            "0 2 0 1 2 -2\n"
            "1 2 1 1 2 -2\n",
            encoding="ascii",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_exact_replay_and_unimodular_saturation(self) -> None:
        result = checker.certify(
            self.matrix, self.modular, self.vectors, self.certificate
        )
        self.assertEqual(result["claim"]["rankOverQ"], 1)
        self.assertEqual(result["claim"]["nullityOverQ"], 2)
        self.assertTrue(result["claim"]["integerKernelSaturated"])
        self.assertEqual(len(result["saturation"]["steps"]), 1)
        self.assertEqual(abs(result["saturation"]["unimodularMinorDeterminant"]), 1)
        self.assertEqual(result["saturatedBasis"]["failureRows"], [0, 0])

    def test_rejects_a_tampered_modular_vector(self) -> None:
        self.modular.write_text(
            "3 2 5 1\n"
            "0 1 0 1\n"
            "1 2 1 1 2 -2\n",
            encoding="ascii",
        )
        with self.assertRaisesRegex(checker.CertificateError, "replay failed"):
            checker.certify(
                self.matrix, self.modular, self.vectors, self.certificate
            )

    def test_rejects_a_composite_modulus(self) -> None:
        self.modular.write_text(
            "3 2 9 1\n"
            "0 2 0 1 2 -4\n"
            "1 2 1 1 2 -4\n",
            encoding="ascii",
        )
        with self.assertRaisesRegex(checker.CertificateError, "not prime"):
            checker.certify(
                self.matrix, self.modular, self.vectors, self.certificate
            )


if __name__ == "__main__":
    unittest.main()
