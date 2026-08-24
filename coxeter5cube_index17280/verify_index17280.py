#!/usr/bin/env python3
"""
Exact standard-library verifier for the degree-17280 permutation certificate.

Checks:
  1. ten fixed-point-free involutions;
  2. all m=2 and m=3 Coxeter relations;
  3. transitivity;
  4. for every one of the 32 vertex parabolics, every orbit has size
     equal to the full finite Coxeter-group order.

The last condition means each vertex parabolic acts freely on the coset set.
By Tits' torsion theorem for Coxeter groups, the point stabilizer is torsion-free.
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter, deque
from pathlib import Path
from typing import Iterable, Sequence


Permutation = Sequence[int]


def compose(p: Permutation, q: Permutation) -> tuple[int, ...]:
    """Return p after q: i |-> p[q[i]]."""
    return tuple(p[q[i]] for i in range(len(p)))


def power(p: Permutation, exponent: int) -> tuple[int, ...]:
    n = len(p)
    result = tuple(range(n))
    base = tuple(p)
    k = exponent
    while k:
        if k & 1:
            result = compose(result, base)
        base = compose(base, base)
        k >>= 1
    return result


def is_identity(p: Permutation) -> bool:
    return all(i == image for i, image in enumerate(p))


def orbit(generators: Sequence[Permutation], start: int) -> set[int]:
    seen = {start}
    queue = deque([start])
    while queue:
        x = queue.popleft()
        for g in generators:
            y = g[x]
            if y not in seen:
                seen.add(y)
                queue.append(y)
    return seen


def all_orbit_sizes(
    generators: Sequence[Permutation], degree: int
) -> Counter[int]:
    unseen = bytearray(b"\x01") * degree
    sizes: Counter[int] = Counter()

    for start in range(degree):
        if not unseen[start]:
            continue
        unseen[start] = 0
        queue = deque([start])
        size = 0
        while queue:
            x = queue.popleft()
            size += 1
            for g in generators:
                y = g[x]
                if unseen[y]:
                    unseen[y] = 0
                    queue.append(y)
        sizes[size] += 1

    return sizes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "certificate",
        nargs="?",
        default=Path(__file__).with_name("index17280_permutations.json.gz"),
        type=Path,
    )
    args = parser.parse_args()

    with gzip.open(args.certificate, "rt", encoding="utf-8") as f:
        data = json.load(f)

    n = int(data["degree"])
    generators = [tuple(map(int, p)) for p in data["generators"]]
    if len(generators) != 10:
        raise AssertionError(f"expected 10 generators, got {len(generators)}")

    identity = tuple(range(n))

    print(f"degree: {n}")
    print("checking generators...")
    for i, g in enumerate(generators):
        if len(g) != n or set(g) != set(range(n)):
            raise AssertionError(f"s{i} is not a permutation of 0,...,{n-1}")
        if any(g[j] == j for j in range(n)):
            raise AssertionError(f"s{i} has a fixed point")
        if compose(g, g) != identity:
            raise AssertionError(f"s{i} is not an involution")
    print("  all ten generators are fixed-point-free involutions")

    opposite = {tuple(sorted(pair)) for pair in data["opposite_infinite_pairs"]}
    m3 = {tuple(sorted(pair)) for pair in data["m3_pairs"]}

    print("checking finite Coxeter relations...")
    count_m2 = 0
    count_m3 = 0
    for i in range(10):
        for j in range(i + 1, 10):
            pair = (i, j)
            if pair in opposite:
                continue
            exponent = 3 if pair in m3 else 2
            product = compose(generators[i], generators[j])
            if power(product, exponent) != identity:
                raise AssertionError(
                    f"(s{i}s{j})^{exponent} is not identity"
                )
            if exponent == 2:
                count_m2 += 1
            else:
                count_m3 += 1
    print(f"  passed {count_m2} m=2 and {count_m3} m=3 relations")

    print("checking transitivity...")
    full_orbit = orbit(generators, 0)
    if len(full_orbit) != n:
        raise AssertionError(
            f"action is not transitive: orbit of 0 has size {len(full_orbit)}"
        )
    print("  action is transitive")

    print("checking all 32 maximal spherical (vertex) parabolics...")
    type_summary: Counter[tuple[str, int, int]] = Counter()
    for item in data["vertex_parabolics"]:
        subset = list(map(int, item["generators"]))
        expected_order = int(item["order"])
        expected_count = int(item["expected_number_of_orbits"])
        coxeter_type = str(item["type"])
        sizes = all_orbit_sizes([generators[i] for i in subset], n)
        if sizes != Counter({expected_order: expected_count}):
            raise AssertionError(
                f"parabolic {subset} ({coxeter_type}) failed: "
                f"got {dict(sizes)}, expected "
                f"{expected_count} orbits of size {expected_order}"
            )
        type_summary[(coxeter_type, expected_order, expected_count)] += 1

    for (coxeter_type, order, orbit_count), number_of_vertices in sorted(
        type_summary.items()
    ):
        print(
            f"  {coxeter_type:18s}: {number_of_vertices:2d} parabolics; "
            f"{orbit_count:3d} free orbits of size {order}"
        )

    print()
    print("CERTIFICATE VERIFIED")
    print(
        "The point stabilizer has index 17280 and intersects every conjugate "
        "of every finite vertex parabolic trivially; hence it is torsion-free."
    )


if __name__ == "__main__":
    main()
