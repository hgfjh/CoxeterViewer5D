import { canonicalSha256, sha256Hex } from "../utils/canonicalSha256";
import {
  COMPACT_5_CUBE_WALL_COORDINATES,
  type StreamedH1ExactModularCoreRankWitness,
  type StreamedH1LatticePreparation,
} from "./streamedH1Lattice";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBIntegralCoordinate,
} from "./streamedTrackB";
import type { StreamedLawfulDavisOracle } from "./streamedLawfulDavis";

const HASH_CHUNK_SIZE = 4_096;
const WALL_RANK = 4;
const CORE_KERNEL_RANK = 15;
const H1_RANK = WALL_RANK + CORE_KERNEL_RANK;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

/**
 * Coordinate rows used to normalize the exact residual-kernel frame.  Their
 * 15-by-15 restriction is the identity, so the displayed integral frame is
 * primitive in the ambient cotree lattice.
 */
export const COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS = [
  0, 3, 7, 12, 15, 24, 30, 18_947, 18_950, 18_956, 18_959, 62_888, 62_889,
  62_906, 62_907,
] as const;

export interface StreamedH1IntegralCoreVectorSummary {
  id: string;
  nonzeroCount: number;
  maximumAbsoluteValue: number;
}

export interface StreamedH1IntegralCoreBasisCertificate {
  schemaVersion: 1;
  kind: "streamed-h1-integral-core-basis";
  status: "passed";
  format: "linbox-sparse-row-integral-basis";
  sourceArtifactSha256: string;
  coreRowCount: number;
  coreColumnCount: number;
  rank: 15;
  coordinateIds: string[];
  identityCoreColumns: number[];
  identityRestrictionDeterminant: "1";
  vectors: StreamedH1IntegralCoreVectorSummary[];
  maximumAbsoluteValue: number;
  sparseBasisDigest: string;
  checks: {
    dimensionsMatch: boolean;
    basisRowsCanonical: boolean;
    entriesStrictlyIncreasing: boolean;
    entriesNonzeroSafeIntegers: boolean;
    identityRestriction: boolean;
  };
}

export interface StreamedH1IntegralCoreBasis {
  readonly certificate: StreamedH1IntegralCoreBasisCertificate;
  readonly coordinateIds: readonly string[];
  value(coreColumn: number, coordinate: number): number;
  forEachVectorEntry(
    coordinate: number,
    visitor: (coreColumn: number, value: number) => void,
  ): void;
}

export interface ParseStreamedH1IntegralCoreBasisOptions {
  sourceArtifactSha256: string;
  expectedCoreColumnCount: number;
  expectedCoreRowCount: number;
}

export interface StreamedH1CompleteLatticeCertificate {
  schemaVersion: 1;
  kind: "streamed-h1-complete-integral-lattice-certificate";
  status: "passed" | "failed";
  method: "tree-gauge-split-kernel-plus-integral-core-frame-and-modular-rank";
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  preparationDigest: string;
  coreBasisCertificate: StreamedH1IntegralCoreBasisCertificate;
  modularRankWitnesses: StreamedH1ExactModularCoreRankWitness[];
  fullLatticeBasisDigest: string;
  fullCocycleSectionDigest: string;
  wallCoordinates: number[][];
  checks: {
    oracleBindingMatches: boolean;
    coreDimensionsMatch: boolean;
    exactCoreBoundaryReplay: boolean;
    coreIdentityMinor: boolean;
    modularWitnessesPresent: boolean;
    modularWitnessBindingsMatch: boolean;
    modularWitnessPrimes: boolean;
    modularWitnessPrimesDistinct: boolean;
    modularWitnessesExact: boolean;
    modularKernelFramesMatch: boolean;
    modularCoreRankIs87935: boolean;
    rationalBoundaryRankIs138222: boolean;
    fullBasisHasNineteenCoordinates: boolean;
    fullCoordinateMinorUnimodular: boolean;
    directedEdgeReversal: boolean;
    everyRankTwoBoundaryCloses: boolean;
  };
  replay: {
    coreBoundaryRowCount: number;
    coreBoundaryNonzeroResidualCount: number;
    coreBoundaryMaximumAbsoluteResidual: number;
    coreBoundaryReplayDigest: string;
    directedEdgeCount: number;
    reversalFailureCount: number;
    rankTwoBoundaryCount: number;
    rankTwoBoundaryNonzeroResidualCount: number;
    rankTwoBoundaryMaximumAbsoluteResidual: number;
    fullBoundaryReplayDigest: string;
  };
  result: {
    h1Rank: 19 | null;
    h1IsomorphicTo: "Z^19" | "not-certified";
    integralBasisIds: string[];
    wallSublatticeRank: 4;
    wallSublatticeIndexInSaturation: 2;
    wallSublatticeIndexInFullH1: "infinite";
    wallSaturationRank: 4;
    wallSaturationEqualsFullH1: false;
    quotientByWallLattice: "Z^15 + Z/2" | "not-certified";
  };
  claims: string[];
  nonClaims: string[];
  errors: string[];
  certificateDigest: string;
}

export interface StreamedH1LatticeCompletion {
  readonly certificate: StreamedH1CompleteLatticeCertificate;
  readonly integralCocycleBasis: StreamedTrackBIntegralCocycleBasis;
}

export interface CompleteStreamedH1LatticeOptions {
  oracle: StreamedLawfulDavisOracle;
  preparation: StreamedH1LatticePreparation;
  coreBasis: StreamedH1IntegralCoreBasis;
  modularRankWitnesses: readonly StreamedH1ExactModularCoreRankWitness[];
}

function isPrime(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function requireSha256(value: string, path: string): string {
  const normalized = value.toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${path} must be a lowercase SHA-256 digest.`);
  }
  return normalized;
}

function parseSafeInteger(token: string, path: string): number {
  if (!/^(0|-?[1-9][0-9]*)$/u.test(token)) {
    throw new Error(`${path} is not a canonical decimal integer.`);
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${path} is outside the safe-integer range.`);
  }
  return value;
}

/** Strictly parse the theorem-facing sparse integral residual-kernel frame. */
export function parseStreamedH1IntegralCoreBasis(
  text: string,
  options: ParseStreamedH1IntegralCoreBasisOptions,
): StreamedH1IntegralCoreBasis {
  if (text.length === 0 || text.length > 64 * 1024 * 1024) {
    throw new Error("Integral core-basis text must contain 1..64 MiB.");
  }
  const sourceArtifactSha256 = requireSha256(
    options.sourceArtifactSha256,
    "sourceArtifactSha256",
  );
  const actualSourceArtifactSha256 = sha256Hex(text);
  if (actualSourceArtifactSha256 !== sourceArtifactSha256) {
    throw new Error(
      `Integral core-basis SHA-256 mismatch: expected ${sourceArtifactSha256}, received ${actualSourceArtifactSha256}.`,
    );
  }
  const lines = text.trim().split(/\r?\n/u);
  const header = lines[0]?.split(" ") ?? [];
  if (header.length !== 3 || header[2] !== "Z") {
    throw new Error("Integral core-basis header must be `columns rank Z`.");
  }
  const coreColumnCount = parseSafeInteger(header[0], "header.columns");
  const rank = parseSafeInteger(header[1], "header.rank");
  if (
    coreColumnCount !== options.expectedCoreColumnCount ||
    rank !== CORE_KERNEL_RANK ||
    lines.length !== CORE_KERNEL_RANK + 1
  ) {
    throw new Error(
      `Integral core-basis dimensions are ${coreColumnCount}x${rank}; expected ${options.expectedCoreColumnCount}x${CORE_KERNEL_RANK}.`,
    );
  }
  const values = new Int32Array(coreColumnCount * CORE_KERNEL_RANK);
  const sparseEntries: Array<Array<[number, number]>> = [];
  const vectors: StreamedH1IntegralCoreVectorSummary[] = [];
  const digestChunks: string[] = [];
  let digestRecords: Array<[number, Array<[number, number]>]> = [];
  let maximumAbsoluteValue = 0;
  for (let coordinate = 0; coordinate < CORE_KERNEL_RANK; coordinate += 1) {
    const tokens = lines[coordinate + 1].split(" ");
    if (tokens.length < 2) throw new Error(`Missing basis row ${coordinate}.`);
    const suppliedCoordinate = parseSafeInteger(
      tokens[0],
      `basis[${coordinate}].coordinate`,
    );
    const nonzeroCount = parseSafeInteger(
      tokens[1],
      `basis[${coordinate}].nonzeroCount`,
    );
    if (
      suppliedCoordinate !== coordinate ||
      nonzeroCount < 0 ||
      tokens.length !== 2 + 2 * nonzeroCount
    ) {
      throw new Error(`Basis row ${coordinate} is not canonical.`);
    }
    const entries: Array<[number, number]> = [];
    let previousColumn = -1;
    let vectorMaximum = 0;
    for (let cursor = 2; cursor < tokens.length; cursor += 2) {
      const coreColumn = parseSafeInteger(
        tokens[cursor],
        `basis[${coordinate}].entries[${(cursor - 2) / 2}].column`,
      );
      const value = parseSafeInteger(
        tokens[cursor + 1],
        `basis[${coordinate}].entries[${(cursor - 2) / 2}].value`,
      );
      if (coreColumn <= previousColumn || coreColumn >= coreColumnCount) {
        throw new Error(
          `Basis ${coordinate} columns must be strictly increasing and in range.`,
        );
      }
      if (value === 0 || value < -2_147_483_648 || value > 2_147_483_647) {
        throw new Error(
          `Basis ${coordinate} contains an invalid sparse value.`,
        );
      }
      previousColumn = coreColumn;
      values[coreColumn * CORE_KERNEL_RANK + coordinate] = value;
      entries.push([coreColumn, value]);
      vectorMaximum = Math.max(vectorMaximum, Math.abs(value));
    }
    maximumAbsoluteValue = Math.max(maximumAbsoluteValue, vectorMaximum);
    sparseEntries.push(entries);
    vectors.push({
      id: `gamma${coordinate}`,
      nonzeroCount,
      maximumAbsoluteValue: vectorMaximum,
    });
    digestRecords.push([coordinate, entries]);
    if (digestRecords.length === HASH_CHUNK_SIZE) {
      digestChunks.push(
        canonicalSha256({
          chunkIndex: digestChunks.length,
          records: digestRecords,
        }),
      );
      digestRecords = [];
    }
  }
  if (digestRecords.length > 0) {
    digestChunks.push(
      canonicalSha256({
        chunkIndex: digestChunks.length,
        records: digestRecords,
      }),
    );
  }
  let identityRestriction = true;
  for (let row = 0; row < CORE_KERNEL_RANK; row += 1) {
    for (let column = 0; column < CORE_KERNEL_RANK; column += 1) {
      identityRestriction &&=
        values[
          COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS[row] * CORE_KERNEL_RANK +
            column
        ] === (row === column ? 1 : 0);
    }
  }
  if (!identityRestriction) {
    throw new Error("The declared core coordinate minor is not the identity.");
  }
  const coordinateIds = Array.from(
    { length: CORE_KERNEL_RANK },
    (_unused, coordinate) => `gamma${coordinate}`,
  );
  const sparseBasisDigest = canonicalSha256({
    schemaVersion: 1,
    method: "canonical-sparse-integral-core-frame",
    sourceArtifactSha256,
    coreRowCount: options.expectedCoreRowCount,
    coreColumnCount,
    rank,
    coordinateIds,
    identityCoreColumns: [...COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS],
    chunks: digestChunks,
  });
  const certificate: StreamedH1IntegralCoreBasisCertificate = {
    schemaVersion: 1,
    kind: "streamed-h1-integral-core-basis",
    status: "passed",
    format: "linbox-sparse-row-integral-basis",
    sourceArtifactSha256,
    coreRowCount: options.expectedCoreRowCount,
    coreColumnCount,
    rank: CORE_KERNEL_RANK,
    coordinateIds,
    identityCoreColumns: [...COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS],
    identityRestrictionDeterminant: "1",
    vectors,
    maximumAbsoluteValue,
    sparseBasisDigest,
    checks: {
      dimensionsMatch: true,
      basisRowsCanonical: true,
      entriesStrictlyIncreasing: true,
      entriesNonzeroSafeIntegers: true,
      identityRestriction: true,
    },
  };
  return Object.freeze({
    certificate,
    coordinateIds,
    value: (coreColumn: number, coordinate: number): number => {
      if (
        !Number.isInteger(coreColumn) ||
        coreColumn < 0 ||
        coreColumn >= coreColumnCount
      ) {
        throw new RangeError(`Core column ${coreColumn} is out of range.`);
      }
      if (
        !Number.isInteger(coordinate) ||
        coordinate < 0 ||
        coordinate >= CORE_KERNEL_RANK
      ) {
        throw new RangeError(`Core coordinate ${coordinate} is out of range.`);
      }
      return values[coreColumn * CORE_KERNEL_RANK + coordinate];
    },
    forEachVectorEntry: (
      coordinate: number,
      visitor: (coreColumn: number, value: number) => void,
    ): void => {
      if (
        !Number.isInteger(coordinate) ||
        coordinate < 0 ||
        coordinate >= CORE_KERNEL_RANK
      ) {
        throw new RangeError(`Core coordinate ${coordinate} is out of range.`);
      }
      for (const [coreColumn, value] of sparseEntries[coordinate]) {
        visitor(coreColumn, value);
      }
    },
  });
}

function vectorFromPairs(
  rank: number,
  pairs: readonly (readonly [number, StreamedTrackBIntegralCoordinate])[],
): number[] {
  const result = Array<number>(rank).fill(0);
  for (const [coordinate, supplied] of pairs) {
    const value = Number(supplied);
    if (!Number.isSafeInteger(value)) {
      throw new Error("The compact-5-cube H^1 replay requires safe integers.");
    }
    result[coordinate] = value;
  }
  return result;
}

/**
 * Combine the rank-four saturated wall frame with the exact rank-fifteen core
 * frame, replay every cocycle equation, and prove completeness integrally.
 */
export function completeStreamedH1Lattice(
  options: CompleteStreamedH1LatticeOptions,
): StreamedH1LatticeCompletion {
  const { oracle, preparation, coreBasis } = options;
  const prep = preparation.certificate;
  const errors: string[] = [];
  const oracleBindingMatches =
    prep.oracleStructureHash === oracle.structureHash &&
    prep.actionRowsCanonicalSha256 === oracle.actionRowsCanonicalSha256;
  const coreDimensionsMatch =
    coreBasis.certificate.coreRowCount === prep.peel.nonpivotRowCount &&
    coreBasis.certificate.coreColumnCount === prep.peel.unresolvedColumnCount;

  let coreBoundaryNonzeroResidualCount = 0;
  let coreBoundaryMaximumAbsoluteResidual = 0;
  const coreReplayChunks: string[] = [];
  let coreReplayRecords: Array<[number, number[]]> = [];
  let coreBoundaryRowCount = 0;
  preparation.forEachCoreRow((row) => {
    const sums = Array<number>(CORE_KERNEL_RANK).fill(0);
    for (const [coreColumn, coefficient] of row.entries) {
      for (let coordinate = 0; coordinate < CORE_KERNEL_RANK; coordinate += 1) {
        sums[coordinate] +=
          coefficient * coreBasis.value(coreColumn, coordinate);
      }
    }
    for (const sum of sums) {
      if (sum !== 0) coreBoundaryNonzeroResidualCount += 1;
      coreBoundaryMaximumAbsoluteResidual = Math.max(
        coreBoundaryMaximumAbsoluteResidual,
        Math.abs(sum),
      );
    }
    coreReplayRecords.push([row.sourceRowIndex, sums]);
    if (coreReplayRecords.length === HASH_CHUNK_SIZE) {
      coreReplayChunks.push(
        canonicalSha256({
          chunkIndex: coreReplayChunks.length,
          records: coreReplayRecords,
        }),
      );
      coreReplayRecords = [];
    }
    coreBoundaryRowCount += 1;
  });
  if (coreReplayRecords.length > 0) {
    coreReplayChunks.push(
      canonicalSha256({
        chunkIndex: coreReplayChunks.length,
        records: coreReplayRecords,
      }),
    );
  }
  const coreBoundaryReplayDigest = canonicalSha256({
    schemaVersion: 1,
    method: "exact-integral-core-boundary-replay",
    coreMatrixDigest: prep.peel.coreMatrixDigest,
    sparseBasisDigest: coreBasis.certificate.sparseBasisDigest,
    chunks: coreReplayChunks,
  });
  const exactCoreBoundaryReplay =
    coreBoundaryRowCount === prep.peel.nonpivotRowCount &&
    coreBoundaryNonzeroResidualCount === 0;
  let coreIdentityMinor = true;
  for (let row = 0; row < CORE_KERNEL_RANK; row += 1) {
    for (let column = 0; column < CORE_KERNEL_RANK; column += 1) {
      coreIdentityMinor &&=
        coreBasis.value(
          COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS[row],
          column,
        ) === (row === column ? 1 : 0);
    }
  }

  const modularRankWitnesses = options.modularRankWitnesses.map((witness) => ({
    ...witness,
  }));
  const modularWitnessesPresent = modularRankWitnesses.length >= 2;
  const modularWitnessBindingsMatch = modularRankWitnesses.every(
    (witness) =>
      witness.preparationDigest === prep.preparationDigest &&
      witness.coreMatrixDigest === prep.peel.coreMatrixDigest &&
      witness.ledgerDigest === prep.peel.ledgerDigest &&
      witness.rowCount === prep.peel.nonpivotRowCount &&
      witness.columnCount === prep.peel.unresolvedColumnCount &&
      SHA256_PATTERN.test(witness.transcriptSha256),
  );
  const modularWitnessPrimes = modularRankWitnesses.every((witness) =>
    isPrime(witness.modulusPrime),
  );
  const modularWitnessPrimesDistinct =
    new Set(modularRankWitnesses.map((witness) => witness.modulusPrime))
      .size === modularRankWitnesses.length;
  const modularWitnessesExact = modularRankWitnesses.every(
    (witness) => witness.status === "passed" && witness.exactFieldArithmetic,
  );
  const modularKernelFramesMatch = modularRankWitnesses.every(
    (witness) =>
      witness.identityChartInvertible &&
      witness.normalizedBasisMatchesIntegralCoreBasis &&
      witness.identityChartColumns.length === CORE_KERNEL_RANK &&
      witness.identityChartColumns.every(
        (column, index) =>
          column === COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS[index],
      ) &&
      SHA256_PATTERN.test(witness.normalizedKernelBasisSha256),
  );
  const modularCoreRankIs87935 = modularRankWitnesses.every(
    (witness) =>
      witness.rank === prep.peel.unresolvedColumnCount - CORE_KERNEL_RANK,
  );
  const rationalBoundaryRankIs138222 =
    prep.peel.pivotCount +
      (prep.peel.unresolvedColumnCount - CORE_KERNEL_RANK) ===
    prep.boundary.columnCount - H1_RANK;

  const coreColumnByEdge = new Int32Array(oracle.geometricEdgeCount);
  coreColumnByEdge.fill(-1);
  let mappedCoreColumnCount = 0;
  preparation.forEachCoreColumn((column) => {
    if (column.coreColumn !== mappedCoreColumnCount) {
      throw new Error("Core-column stream is not canonical.");
    }
    coreColumnByEdge[column.edgeIndex] = column.coreColumn;
    mappedCoreColumnCount += 1;
  });
  if (mappedCoreColumnCount !== prep.peel.unresolvedColumnCount) {
    errors.push("The core-to-edge map is incomplete.");
  }
  const coordinateIds = [
    ...preparation.wallSaturationCocycleBasis.coordinateIds,
    ...coreBasis.coordinateIds,
  ];
  const fullLatticeBasisDigest = canonicalSha256({
    schemaVersion: 1,
    method: "split-integral-h1-basis-beta-plus-core-gamma",
    oracleStructureHash: oracle.structureHash,
    wallSaturationBasisDigest:
      preparation.wallSaturationCocycleBasis.latticeBasisDigest,
    coreBasisDigest: coreBasis.certificate.sparseBasisDigest,
    coreMatrixDigest: prep.peel.coreMatrixDigest,
    seedBetaDeterminant: prep.saturation.seedBetaDeterminant,
    coreIdentityColumns: coreBasis.certificate.identityCoreColumns,
    coordinateIds,
  });
  const edgeCoordinatePairs = (
    point: number,
    generator: number,
  ): readonly (readonly [number, StreamedTrackBIntegralCoordinate])[] => {
    const result: Array<[number, StreamedTrackBIntegralCoordinate]> = [
      ...preparation.wallSaturationCocycleBasis.edgeCoordinatePairs(
        point,
        generator,
      ),
    ].map(([coordinate, value]) => [coordinate, value]);
    const edge = oracle.geometricEdge(point, generator);
    const coreColumn = coreColumnByEdge[edge.edgeIndex];
    if (coreColumn >= 0) {
      const traversal = point === edge.sourcePoint ? 1 : -1;
      for (let coordinate = 0; coordinate < CORE_KERNEL_RANK; coordinate += 1) {
        const value = traversal * coreBasis.value(coreColumn, coordinate);
        if (value !== 0) result.push([WALL_RANK + coordinate, value]);
      }
    }
    return result;
  };
  const fullCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  const integralCocycleBasis: StreamedTrackBIntegralCocycleBasis = {
    coordinateIds,
    latticeBasisDigest: fullLatticeBasisDigest,
    expectedCocycleSectionDigest: fullCocycleSectionDigest,
    edgeCoordinatePairs,
  };

  let reversalFailureCount = 0;
  let directedEdgeCount = 0;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const forward = vectorFromPairs(
        H1_RANK,
        edgeCoordinatePairs(point, generator),
      );
      const reverse = vectorFromPairs(
        H1_RANK,
        edgeCoordinatePairs(oracle.neighbor(point, generator), generator),
      );
      for (let coordinate = 0; coordinate < H1_RANK; coordinate += 1) {
        if (forward[coordinate] + reverse[coordinate] !== 0) {
          reversalFailureCount += 1;
        }
      }
      directedEdgeCount += 1;
    }
  }

  let rankTwoBoundaryCount = 0;
  let rankTwoBoundaryNonzeroResidualCount = 0;
  let rankTwoBoundaryMaximumAbsoluteResidual = 0;
  const fullReplayChunks: string[] = [];
  let fullReplayRecords: Array<[number, string, number[]]> = [];
  oracle.forEachRankTwoCell((cell) => {
    const sums = Array<number>(H1_RANK).fill(0);
    for (const occurrence of cell.boundary) {
      const directed = vectorFromPairs(
        H1_RANK,
        edgeCoordinatePairs(occurrence.sourcePoint, occurrence.generator),
      );
      for (let coordinate = 0; coordinate < H1_RANK; coordinate += 1) {
        sums[coordinate] += directed[coordinate];
      }
    }
    for (const sum of sums) {
      if (sum !== 0) rankTwoBoundaryNonzeroResidualCount += 1;
      rankTwoBoundaryMaximumAbsoluteResidual = Math.max(
        rankTwoBoundaryMaximumAbsoluteResidual,
        Math.abs(sum),
      );
    }
    fullReplayRecords.push([
      rankTwoBoundaryCount,
      oracle.cellId(cell.cell),
      sums,
    ]);
    if (fullReplayRecords.length === HASH_CHUNK_SIZE) {
      fullReplayChunks.push(
        canonicalSha256({
          chunkIndex: fullReplayChunks.length,
          records: fullReplayRecords,
        }),
      );
      fullReplayRecords = [];
    }
    rankTwoBoundaryCount += 1;
  });
  if (fullReplayRecords.length > 0) {
    fullReplayChunks.push(
      canonicalSha256({
        chunkIndex: fullReplayChunks.length,
        records: fullReplayRecords,
      }),
    );
  }
  const fullBoundaryReplayDigest = canonicalSha256({
    schemaVersion: 1,
    method: "all-rank-two-boundaries-full-integral-h1-replay",
    oracleStructureHash: oracle.structureHash,
    fullLatticeBasisDigest,
    chunks: fullReplayChunks,
  });
  const directedEdgeReversal = reversalFailureCount === 0;
  const everyRankTwoBoundaryCloses =
    rankTwoBoundaryCount === oracle.rankTwoCellCount &&
    rankTwoBoundaryNonzeroResidualCount === 0;
  const fullBasisHasNineteenCoordinates = coordinateIds.length === H1_RANK;
  const fullCoordinateMinorUnimodular =
    prep.saturation.seedBetaDeterminant === "-1" && coreIdentityMinor;
  const checks = {
    oracleBindingMatches,
    coreDimensionsMatch,
    exactCoreBoundaryReplay,
    coreIdentityMinor,
    modularWitnessesPresent,
    modularWitnessBindingsMatch,
    modularWitnessPrimes,
    modularWitnessPrimesDistinct,
    modularWitnessesExact,
    modularKernelFramesMatch,
    modularCoreRankIs87935,
    rationalBoundaryRankIs138222,
    fullBasisHasNineteenCoordinates,
    fullCoordinateMinorUnimodular,
    directedEdgeReversal,
    everyRankTwoBoundaryCloses,
  };
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) errors.push(`Complete H^1 check failed: ${name}.`);
  }
  const passed = errors.length === 0;
  const wallCoordinates = [
    ...COMPACT_5_CUBE_WALL_COORDINATES.map((row) => [...row]),
    ...Array.from({ length: CORE_KERNEL_RANK }, () => Array(10).fill(0)),
  ];
  const result: StreamedH1CompleteLatticeCertificate["result"] = {
    h1Rank: passed ? 19 : null,
    h1IsomorphicTo: passed ? "Z^19" : "not-certified",
    integralBasisIds: passed ? coordinateIds : [],
    wallSublatticeRank: 4,
    wallSublatticeIndexInSaturation: 2,
    wallSublatticeIndexInFullH1: "infinite",
    wallSaturationRank: 4,
    wallSaturationEqualsFullH1: false,
    quotientByWallLattice: passed ? "Z^15 + Z/2" : "not-certified",
  };
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "streamed-h1-complete-integral-lattice-certificate" as const,
    status: (passed ? "passed" : "failed") as "passed" | "failed",
    method:
      "tree-gauge-split-kernel-plus-integral-core-frame-and-modular-rank" as const,
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    preparationDigest: prep.preparationDigest,
    coreBasisCertificate: coreBasis.certificate,
    modularRankWitnesses,
    fullLatticeBasisDigest,
    fullCocycleSectionDigest,
    wallCoordinates,
    checks,
    replay: {
      coreBoundaryRowCount,
      coreBoundaryNonzeroResidualCount,
      coreBoundaryMaximumAbsoluteResidual,
      coreBoundaryReplayDigest,
      directedEdgeCount,
      reversalFailureCount,
      rankTwoBoundaryCount,
      rankTwoBoundaryNonzeroResidualCount,
      rankTwoBoundaryMaximumAbsoluteResidual,
      fullBoundaryReplayDigest,
    },
    result,
    claims: passed
      ? [
          "H^1(G;Z) is Z^19 with the displayed beta-plus-gamma integral basis.",
          "The ten wall classes have rank four and index two in their rank-four saturation.",
          "The wall saturation is a proper primitive direct summand of rank four in H^1.",
          "H^1/L_wall is isomorphic to Z^15 plus Z/2.",
        ]
      : [
          "The rank-four wall saturation remains certified, but the complete H^1 lattice failed replay.",
        ],
    nonClaims: [
      "This certificate does not compute torsion in H_1(G;Z).",
      "The modular rank records bind reproducible deterministic exact LinBox eliminations; they are not embedded proof-carrying pivot ledgers.",
      "No Morse-link, fibering, or kernel-finiteness conclusion follows from H^1 alone.",
    ],
    errors: [...new Set(errors)].sort(),
  };
  const certificate: StreamedH1CompleteLatticeCertificate = {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
  return Object.freeze({ certificate, integralCocycleBasis });
}
