#!/usr/bin/env python3
"""Unit tests for the exact modular-kernel lifting utility."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import lift_modular_kernel as lift


def write_matrix(path: Path, rows: list[list[tuple[int, int]]], columns: int) -> None:
    lines = [f"{len(rows)} {columns} S"]
    for row in rows:
        lines.append(
            " ".join([str(len(row))] + [str(value) for pair in row for value in pair])
        )
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


def write_basis(path: Path, vectors: list[list[int]], prime: int, rank: int) -> None:
    lines = [f"{len(vectors[0])} {len(vectors)} {prime} {rank}"]
    for index, vector in enumerate(vectors):
        entries = [(coordinate, value % prime) for coordinate, value in enumerate(vector) if value % prime]
        words = [str(index), str(len(entries))]
        for coordinate, value in entries:
            symmetric = value - prime if value > prime // 2 else value
            words.extend([str(coordinate), str(symmetric)])
        lines.append(" ".join(words))
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


def mixed_basis(normalized: list[list[int]], prime: int) -> list[list[int]]:
    # Multiply the normalized columns by [[2,1],[1,1]], determinant one.
    return [
        [(2 * normalized[0][i] + normalized[1][i]) % prime for i in range(len(normalized[0]))],
        [(normalized[0][i] + normalized[1][i]) % prime for i in range(len(normalized[0]))],
    ]


class ModularKernelLiftTests(unittest.TestCase):
    def test_composite_modulus_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "basis.txt"
            write_basis(path, [[1]], 9, rank=0)
            with self.assertRaisesRegex(ValueError, "not prime"):
                lift.read_modular_basis(path)

    def test_rational_graph_basis_is_reconstructed_and_replayed(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            matrix = root / "matrix.linbox"
            basis = root / "basis.txt"
            output = root / "lift.txt"
            certificate = root / "certificate.json"
            write_matrix(matrix, [[(0, -1), (1, -1), (2, 2)]], 3)
            prime = 11
            inverse_two = pow(2, -1, prime)
            normalized = [[1, 0, inverse_two], [0, 1, inverse_two]]
            write_basis(basis, mixed_basis(normalized, prime), prime, rank=1)
            status = lift.main(
                [
                    "lift", "--matrix", str(matrix), "--basis", str(basis),
                    "--output", str(output), "--certificate", str(certificate),
                ]
            )
            self.assertEqual(status, 0)
            report = json.loads(certificate.read_text(encoding="utf-8"))
            self.assertEqual(
                report["status"],
                "verified-saturated-frame-in-reconstructed-rational-subspace",
            )
            self.assertEqual(report["selectedMethod"], "rational-reconstruction")
            vectors = lift.read_integral_basis(output)
            self.assertEqual(
                report["integralKernelFrame"]["saturation"]["parameterLatticeIndex"],
                "2",
            )
            # (1,1,1) must lie in the emitted lattice.  Clearing each reconstructed
            # column separately would miss this primitive mixed combination.
            self.assertTrue(
                any(
                    all(
                        left * coefficient_left + right * coefficient_right == target
                        for left, right, target in zip(vectors[0], vectors[1], [1, 1, 1])
                    )
                    for coefficient_left in range(-2, 3)
                    for coefficient_right in range(-2, 3)
                )
            )
            self.assertEqual(lift.main(["replay", "--certificate", str(certificate)]), 0)

    def test_two_primes_disambiguate_large_symmetric_entry(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            matrix = root / "matrix.linbox"
            write_matrix(matrix, [[(0, -20), (2, 1)], [(1, -1), (3, 1)]], 4)
            paths = []
            for prime in (11, 13):
                path = root / f"basis-{prime}.txt"
                normalized = [[1, 0, 20 % prime, 0], [0, 1, 0, 1]]
                write_basis(path, mixed_basis(normalized, prime), prime, rank=2)
                paths.append(path)
            output = root / "lift.txt"
            certificate = root / "certificate.json"
            arguments = ["lift", "--matrix", str(matrix)]
            for path in paths:
                arguments.extend(["--basis", str(path)])
            arguments.extend(["--output", str(output), "--certificate", str(certificate)])
            self.assertEqual(lift.main(arguments), 0)
            report = json.loads(certificate.read_text(encoding="utf-8"))
            self.assertEqual(report["combinedModulus"], "143")
            self.assertEqual(report["selectedMethod"], "symmetric-residue")
            self.assertEqual(lift.read_integral_basis(output), [[1, 0, 20, 0], [0, 1, 0, 1]])

    def test_bad_modular_vector_is_rejected_before_reconstruction(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            matrix = root / "matrix.linbox"
            basis = root / "basis.txt"
            write_matrix(matrix, [[(0, 1), (1, 1)]], 2)
            write_basis(basis, [[1, 0]], 11, rank=1)
            status = lift.main(
                [
                    "lift", "--matrix", str(matrix), "--basis", str(basis),
                    "--output", str(root / "out"),
                    "--certificate", str(root / "certificate.json"),
                ]
            )
            self.assertEqual(status, 2)


if __name__ == "__main__":
    unittest.main()
