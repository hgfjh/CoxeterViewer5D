# Compact hyperbolic Coxeter 5-cube: an index-17280 torsion-free subgroup

This directory contains an exact permutation certificate for a **non-normal,
torsion-free subgroup of index**

\[
17280 = 3\cdot5760
\]

in the Coxeter reflection group of the unique compact hyperbolic Coxeter
5-cube.

## Coxeter numbering

The generators are `s0,...,s9`. The five pairs of opposite facets, hence the
pairs with Coxeter exponent infinity, are

```text
(0,1), (2,8), (3,4), (5,7), (6,9).
```

The ten pairs with exponent 3 are

```text
(0,2), (0,3), (1,5), (1,6), (2,4),
(2,5), (3,6), (4,7), (6,7), (8,9).
```

Every other pair of distinct generators has exponent 2.

## What the certificate proves

The ten supplied permutations act transitively on 17,280 points. For every
one of the 32 vertices of the 5-cube, the five corresponding generators
generate the expected finite Coxeter group and act with every orbit having
the full group order. Thus each vertex parabolic acts freely on the point
set.

Every finite subgroup of a Coxeter group is conjugate into a finite standard
parabolic. Consequently, the stabilizer of any point in this action is
torsion-free. Because the action is transitive, its index is 17,280. It is
non-normal (the corresponding subgroup of the finite quotient is not
normal).

## Construction in brief

Let `B=2G` be the doubled Gram matrix. For the three non-diagonal dotted
edges let

\[
b=2\cosh(e),\qquad b^2-b-3=0,
\]

and for the two diagonal dotted edges let

\[
a=2\cosh(d),\qquad a^2=b+2.
\]

Reduce at the prime ideal

\[
(3,\ b-1,\ a).
\]

The resulting symmetric matrix over `F_3` has rank 6:

```text
2 2 2 2 0 0 0 0 0 0
2 2 0 0 0 2 2 0 0 0
2 0 2 0 2 2 0 0 0 0
2 0 0 2 2 0 2 0 0 0
0 0 2 2 2 0 0 2 0 0
0 2 2 0 0 2 0 2 0 0
0 2 0 2 0 0 2 2 0 0
0 0 0 0 2 2 2 2 0 0
0 0 0 0 0 0 0 0 2 2
0 0 0 0 0 0 0 0 2 2
```

The induced projective reflection image has order 51,840. Exact structural
checks give a central subgroup of order 2 and a simple derived subgroup of
order 25,920, so the image is `C2 × U4(2)`. The last two Coxeter
generators have the same image in this factor, so a second factor is added:

```text
s0,...,s7 -> identity in S3
s8         -> (1 2)
s9         -> (2 3)
```

This gives a surjection onto a finite group of order

\[
51840\cdot6=311040.
\]

An order-9 element in the first factor is represented by the word

```text
s2 s0 s1 s5 s1 s2 s7 s5.
```

Let `C9` be its cyclic subgroup and let `C2=< (1 2) >` in the `S3` factor.
The subgroup

\[
L=C_9\times C_2
\]

has order 18 and avoids every conjugate of every finite vertex-parabolic
image. Its full preimage is the desired subgroup, and

\[
[W:\Phi^{-1}(L)]
=\frac{311040}{18}
=17280.
\]

The subgroup is orientation-preserving as well: the orientation character
is the determinant character of the first reflection factor, while `C9`
has odd order and therefore lies in the determinant-one subgroup.

## Files

- `index17280_permutations.json.gz`: ten zero-based permutations plus all
  metadata needed for independent verification.
- `verify_index17280.py`: standard-library verifier.
- `index17280_action.g`: the same ten permutations in GAP syntax.
- `SHA256SUMS.txt`: checksum for the compressed certificate.

Run:

```bash
python verify_index17280.py
```

The verification is exact and does not use randomized tests.
