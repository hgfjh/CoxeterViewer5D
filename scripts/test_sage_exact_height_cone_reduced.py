#!/usr/bin/env python3
"""Small exact differential checks for the reduced height-cone backend."""

from __future__ import annotations

import random
import unittest

import sage_exact_height_cone as cone


class ReducedHeightConeTests(unittest.TestCase):
    def test_projection_edge_cases(self) -> None:
        collapsed = cone.solve_reduced(
            2, [[1, 0], [0, 1]], [[1, -1]], [1, 2], [0]
        )
        self.assertTrue(collapsed[0])
        self.assertEqual(collapsed[1], ["1", "1"])

        opposing = cone.solve_reduced(
            2, [[1, 0], [0, -1]], [[1, -1]], [1, 2], [0]
        )
        self.assertFalse(opposing[0])
        self.assertTrue(opposing[3])

        zero_projected = cone.solve_reduced(
            2, [[1, 0]], [[1, 0]], [1], [0]
        )
        self.assertFalse(zero_projected[0])
        self.assertEqual(zero_projected[3], [{"assignmentIndex": 1, "value": "1"}])

    def test_random_small_classification_matches_legacy(self) -> None:
        generator = random.Random(17820)
        for case in range(40):
            rank = 4
            strict_rows = []
            equality_rows = []
            for _ in range(generator.randint(1, 9)):
                row = [generator.randint(-3, 3) for _ in range(rank)]
                if all(value == 0 for value in row):
                    row[0] = 1
                strict_rows.append(row)
            for _ in range(generator.randint(0, 3)):
                row = [generator.randint(-2, 2) for _ in range(rank)]
                if all(value == 0 for value in row):
                    row[-1] = 1
                equality_rows.append(row)

            legacy_feasible = cone.solve_feasible(
                rank, strict_rows, equality_rows
            )[0]
            reduced_feasible = cone.solve_reduced(
                rank,
                strict_rows,
                equality_rows,
                list(range(len(strict_rows))),
                list(
                    range(
                        len(strict_rows),
                        len(strict_rows) + len(equality_rows),
                    )
                ),
            )[0]
            self.assertEqual(
                reduced_feasible,
                legacy_feasible,
                f"classification mismatch in randomized case {case}",
            )


if __name__ == "__main__":
    unittest.main()
