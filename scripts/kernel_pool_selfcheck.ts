// Start a real worker_threads kernel pool and check it against the inline
// kernels on the A4 permutation action (|W| = 120, regular).  Prints one JSON
// line; exit code 1 on any mismatch.  Used by tests/kernel-pool.test.ts.
import {
  buildStreamedLawfulDavisOracle,
  buildStreamedLawfulDavisOracleParallel,
} from "../src/fibering/streamedLawfulDavis";
import { createNodeKernelPool } from "../src/parallel/nodeKernelPool";
import {
  certifyTorsionFreeAction,
  certifyTorsionFreeActionParallel,
  planSphericalSpecialSubgroups,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const A4: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A4",
  rank: 4,
  generators: [0, 1, 2, 3].map((generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: [0, 1, 2, 3].map((i) =>
    [0, 1, 2, 3].map((j) => (i === j ? 1 : Math.abs(i - j) === 1 ? 3 : 2)),
  ),
};

function permutations(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (rest) => [value, ...rest],
    ),
  );
}

const points = permutations([0, 1, 2, 3, 4]);
const indexOf = new Map(
  points.map((permutation, index) => [permutation.join(","), index]),
);
const rows = [0, 1, 2, 3].map((generator) =>
  Uint32Array.from(
    points.map((permutation) => {
      const image = [...permutation];
      [image[generator], image[generator + 1]] = [
        image[generator + 1],
        image[generator],
      ];
      return indexOf.get(image.join(","))!;
    }),
  ),
);

const pool = await createNodeKernelPool(3);
try {
  const candidate = {
    id: "a4-regular",
    index: points.length,
    generatorImages: rows,
  };
  const plan = planSphericalSpecialSubgroups(A4);
  const torsionSequential = canonicalSha256(
    certifyTorsionFreeAction(A4, candidate, plan),
  );
  const torsionParallel = canonicalSha256(
    await certifyTorsionFreeActionParallel(A4, candidate, plan, pool),
  );
  const input = {
    system: A4,
    generatorImages: rows,
    ordinalIndex: "lazy" as const,
    cache: false,
  };
  const oracleSequential = buildStreamedLawfulDavisOracle(input).structureHash;
  const oracleParallel = (
    await buildStreamedLawfulDavisOracleParallel(input, pool)
  ).structureHash;
  const report = {
    poolKind: pool.kind,
    torsionEqual: torsionSequential === torsionParallel,
    oracleEqual: oracleSequential === oracleParallel,
  };
  console.log(JSON.stringify(report));
  if (!report.torsionEqual || !report.oracleEqual) process.exitCode = 1;
} finally {
  await pool.close();
}
