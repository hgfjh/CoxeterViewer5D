import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  extractCubeRescueSeparatorMotifs,
  searchCubeRescuePeriodicPotential,
  type CubeRescueMotifExtraction,
  type CubeRescuePotentialSearchBounds,
  type CubeRescuePotentialSearchResult,
  type CubeRescueSeparatorMotif,
  type CubeRescueSubdivisionFamily,
} from "./cubeRescue";
import {
  buildCubeRescueVertexOrder,
  cubeRescueSubdivisionVertexLinksAreCertified,
  type CubeRescueLocalTemplateBuilder,
  type CubeRescueOrderKind,
  type CubeRescueSubdivisionVertexLinkCertificate,
} from "./cubeRescueTopology";
import {
  runCubeRescueOriginalVertexCegar,
  type CubeRescueOriginalVertexCegarBounds,
  type CubeRescueOriginalVertexCegarResult,
} from "./cubeRescueCegar";

export interface CubeRescuePotentialSearchCommitment {
  schemaVersion: 1;
  kind: "bounded-exact-periodic-potential-search-commitment";
  status: CubeRescuePotentialSearchResult["status"];
  sigma: -1 | 1;
  primitiveWitness: string[];
  bounds: CubeRescuePotentialSearchBounds;
  exploredStateCount: number;
  iterationCount: number;
  initialScore: number[];
  bestScore: number[];
  potential: CubeRescuePotentialSearchResult["potential"];
  evaluationDigests: string[];
  /** Commits to the complete result, including all link components. */
  fullResultDigest: string;
}

export interface CubeRescueOriginalVertexCegarCommitment {
  schemaVersion: 1;
  kind: "bounded-exact-original-vertex-cegar-commitment";
  status: CubeRescueOriginalVertexCegarResult["status"];
  degree: number;
  primitiveWitness: string[];
  sigma: -1 | 1;
  orderId: string;
  orderDigest: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  initialPointIds: number[];
  bounds: CubeRescueOriginalVertexCegarBounds;
  roundDigests: string[];
  finalActivePointIds: number[];
  finalPotential: CubeRescueOriginalVertexCegarResult["finalPotential"];
  checkedAllOriginalVerticesInFinalRound: boolean;
  subdivisionVertexLinks: CubeRescueSubdivisionVertexLinkCertificate;
  /** Commits to the complete CEGAR transcript, including every link scan. */
  fullResultDigest: string;
}

export interface CubeRescueTrialRecord {
  trialId: string;
  sourceMotifId: string;
  primitiveWitness: string[];
  sigma: -1 | 1;
  orderKind: CubeRescueOrderKind;
  orderId: string;
  orderDigest: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  localPointIds: number[];
  localTemplateDigests: string[];
  localSearch: CubeRescuePotentialSearchCommitment;
  globalExpansion:
    | { status: "not-run" }
    | {
        status: "all-original-vertices-pass" | "stopped-within-bounds";
        cegar: CubeRescueOriginalVertexCegarCommitment;
      };
  trialDigest: string;
}

export interface CompactCubeRescueGenerationCheckpoint {
  schemaVersion: 1;
  kind: "compact-5-cube-bounded-rescue-generation-checkpoint";
  runBindingDigest: string;
  trials: CubeRescueTrialRecord[];
  completedTrialChainDigest: string;
  checkpointDigest: string;
}

export interface CompactCubeBoundedRescueCertificate {
  schemaVersion: 1;
  kind: "compact-5-cube-index34560-bounded-track-b-rescue";
  status:
    | "smoke-only"
    | "benchmark-archive"
    | "local-connectors-only"
    | "all-subdivision-vertices-pass"
    | "failed";
  method: "sealed-separator-motifs-periodic-potentials-and-compatible-subdivision-portfolio";
  source: {
    adaptiveArchivePath: string;
    adaptiveArchiveSha256: string;
    adaptiveManifestDigest: string;
    adaptiveArtifactDigest: string;
    adaptiveReportDigest: string;
    adaptiveSourceHash: string;
    generalizedCompressionArchiveHash: string;
    h1CertificateDigest: string;
    latticeBasisDigest: string;
    cocycleSectionDigest: string;
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    degree: 34560;
    rank: 19;
  };
  motifExtraction: CubeRescueMotifExtraction;
  selectedMotifIds: string[];
  portfolio: {
    algorithmRevision: typeof CUBE_RESCUE_ALGORITHM_REVISION;
    orderKinds: CubeRescueOrderKind[];
    subdivisionFamilies: CubeRescueSubdivisionFamily[];
    localPointIds: number[];
    localBounds: CubeRescuePotentialSearchBounds;
    globalCegarBounds: CubeRescueOriginalVertexCegarBounds;
    trialCount: number;
    localConnectorCount: number;
    originalVertexPassCount: number;
  };
  trials: CubeRescueTrialRecord[];
  bestTrialId: string | null;
  checks: {
    adaptiveArchiveAndManifestReplayed: boolean;
    adaptiveSemanticReplayPassed: boolean;
    sourceBindingsAgree: boolean;
    allSeparatorLeavesExtracted: boolean;
    allSeparatorMotifsSelected: boolean;
    productionCartesianPortfolioComplete: boolean;
    onlyThreeCertifiedMotifPointsUsed: boolean;
    noGlobalNormalCatalogueRecomputed: true;
    everyTrialDigestValid: boolean;
    everyLocalConnectorExactlyReplayed: boolean;
    boundedGlobalStatusHonest: boolean;
    everyOriginalVertexPassCoversSubdivisionVertices: boolean;
  };
  claims: string[];
  nonClaims: string[];
  certificateDigest: string;
}

export type CompactCubeBoundedRescueCertificateInput = Omit<
  CompactCubeBoundedRescueCertificate,
  "status" | "certificateDigest" | "portfolio"
> & {
  portfolio: Omit<
    CompactCubeBoundedRescueCertificate["portfolio"],
    "trialCount" | "localConnectorCount" | "originalVertexPassCount"
  >;
};

export interface CompactCubeBoundedRescueReplay {
  status: "passed" | "failed";
  checks: {
    certificateDigestValid: boolean;
    sourceBindingsMatch: boolean;
    motifExtractionMatches: boolean;
    selectedMotifsValid: boolean;
    portfolioStructureValid: boolean;
    bestTrialValid: boolean;
    everyTrialDigestValid: boolean;
    everyTemplateDigestRebuilt: boolean;
    everyPotentialSearchReplayed: boolean;
    statusMatchesTrials: boolean;
    storedChecksHonest: boolean;
  };
  errors: string[];
  replayDigest: string;
}

export interface CubeRescueReplayContext {
  adaptiveArtifact: unknown;
  degree: number;
  source: CompactCubeBoundedRescueCertificate["source"];
  adaptiveArchiveAndManifestReplayed: boolean;
  adaptiveSemanticReplayPassed: boolean;
  builder(orderKind: CubeRescueOrderKind): CubeRescueLocalTemplateBuilder;
}

export const CUBE_RESCUE_PRODUCTION_ORDER_KINDS = [
  "numeric",
  "reverse",
  "affine-7",
  "affine-11",
  "half-turn",
] as const satisfies readonly CubeRescueOrderKind[];

export const CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES = [
  "pulling",
  "maximal-simplex-stellar",
] as const satisfies readonly CubeRescueSubdivisionFamily[];

export const CUBE_RESCUE_CERTIFIED_LOCAL_POINTS = [2, 4, 27] as const;

export const CUBE_RESCUE_ALGORITHM_REVISION =
  "potential-search-v2+original-vertex-cegar-v1+compact-commitment-v1" as const;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Drops the potentially enormous link-component payload while retaining a
 * SHA-256 commitment to the complete deterministic search result. Exact replay
 * reconstructs that result and compares this compact projection fieldwise.
 */
export function commitCubeRescuePotentialSearch(
  result: CubeRescuePotentialSearchResult,
): CubeRescuePotentialSearchCommitment {
  return {
    schemaVersion: 1,
    kind: "bounded-exact-periodic-potential-search-commitment",
    status: result.status,
    sigma: result.sigma,
    primitiveWitness: [...result.primitiveWitness],
    bounds: { ...result.bounds },
    exploredStateCount: result.exploredStateCount,
    iterationCount: result.iterationCount,
    initialScore: [...result.initialScore],
    bestScore: [...result.bestScore],
    potential: {
      values: result.potential.values.map(([point, value]) => [point, value]),
      potentialDigest: result.potential.potentialDigest,
    },
    evaluationDigests: result.evaluations.map(
      ({ evaluationDigest }) => evaluationDigest,
    ),
    fullResultDigest: result.searchDigest,
  };
}

/** Compact commitment to a complete deterministic global CEGAR transcript. */
export function commitCubeRescueOriginalVertexCegar(
  result: CubeRescueOriginalVertexCegarResult,
): CubeRescueOriginalVertexCegarCommitment {
  return {
    schemaVersion: 1,
    kind: "bounded-exact-original-vertex-cegar-commitment",
    status: result.status,
    degree: result.degree,
    primitiveWitness: [...result.primitiveWitness],
    sigma: result.sigma,
    orderId: result.orderId,
    orderDigest: result.orderDigest,
    subdivisionFamily: result.subdivisionFamily,
    initialPointIds: [...result.initialPointIds],
    bounds: {
      ...result.bounds,
      constraintSearchBounds: { ...result.bounds.constraintSearchBounds },
    },
    roundDigests: result.rounds.map(({ roundDigest }) => roundDigest),
    finalActivePointIds: [...result.finalActivePointIds],
    finalPotential: {
      values: result.finalPotential.values.map(([point, value]) => [
        point,
        value,
      ]),
      potentialDigest: result.finalPotential.potentialDigest,
    },
    checkedAllOriginalVerticesInFinalRound:
      result.checkedAllOriginalVerticesInFinalRound,
    subdivisionVertexLinks: structuredClone(result.subdivisionVertexLinks),
    fullResultDigest: result.cegarDigest,
  };
}

function trialDigest(trial: CubeRescueTrialRecord): string {
  return canonicalSha256({ ...trial, trialDigest: "" });
}

export function sealCubeRescueTrialRecord(
  trial: Omit<CubeRescueTrialRecord, "trialDigest"> & {
    trialDigest?: string;
  },
): CubeRescueTrialRecord {
  const unsealed = { ...trial, trialDigest: "" } as CubeRescueTrialRecord;
  return { ...unsealed, trialDigest: trialDigest(unsealed) };
}

export function cubeRescueTrialDigestIsValid(
  trial: CubeRescueTrialRecord,
): boolean {
  return trial.trialDigest === trialDigest(trial);
}

export function computeCubeRescueGenerationCheckpointDigest(
  checkpoint: CompactCubeRescueGenerationCheckpoint,
): string {
  return canonicalSha256({ ...checkpoint, checkpointDigest: "" });
}

export function sealCubeRescueGenerationCheckpoint(input: {
  runBindingDigest: string;
  trials: readonly CubeRescueTrialRecord[];
}): CompactCubeRescueGenerationCheckpoint {
  const completedTrialChainDigest = input.trials.reduce(
    (previousDigest, trial, ordinal) =>
      canonicalSha256({
        method: "compact-cube-rescue-checkpoint-chain-v1",
        ordinal,
        previousDigest,
        trialId: trial.trialId,
        trialDigest: trial.trialDigest,
      }),
    canonicalSha256("compact-cube-rescue-empty-checkpoint-chain-v1"),
  );
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-bounded-rescue-generation-checkpoint" as const,
    runBindingDigest: input.runBindingDigest,
    trials: input.trials.map((trial) => structuredClone(trial)),
    completedTrialChainDigest,
    checkpointDigest: "",
  };
  return {
    ...withoutDigest,
    checkpointDigest: canonicalSha256(withoutDigest),
  };
}

export function parseCubeRescueGenerationCheckpoint(
  value: unknown,
  expectedRunBindingDigest: string,
  expectedPlanTrialIds: readonly string[],
): CompactCubeRescueGenerationCheckpoint {
  const checkpoint = value as CompactCubeRescueGenerationCheckpoint;
  if (
    checkpoint?.schemaVersion !== 1 ||
    checkpoint.kind !== "compact-5-cube-bounded-rescue-generation-checkpoint" ||
    checkpoint.runBindingDigest !== expectedRunBindingDigest ||
    !Array.isArray(checkpoint.trials) ||
    checkpoint.trials.some((trial) => !cubeRescueTrialDigestIsValid(trial)) ||
    new Set(checkpoint.trials.map(({ trialId }) => trialId)).size !==
      checkpoint.trials.length ||
    checkpoint.trials.length > expectedPlanTrialIds.length ||
    checkpoint.trials.some(
      (trial, ordinal) => trial.trialId !== expectedPlanTrialIds[ordinal],
    ) ||
    sealCubeRescueGenerationCheckpoint({
      runBindingDigest: checkpoint.runBindingDigest,
      trials: checkpoint.trials,
    }).completedTrialChainDigest !== checkpoint.completedTrialChainDigest ||
    computeCubeRescueGenerationCheckpointDigest(checkpoint) !==
      checkpoint.checkpointDigest
  ) {
    throw new Error(
      "The cube-rescue generation checkpoint is stale or invalid.",
    );
  }
  return checkpoint;
}

export function computeCubeRescueTrialId(input: {
  sourceMotifId: string;
  orderDigest: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  localPointIds: readonly number[];
  localBounds: CubeRescuePotentialSearchBounds;
  globalCegarBounds: CubeRescueOriginalVertexCegarBounds;
}): string {
  return canonicalSha256({
    method: "bounded-cube-rescue-trial",
    algorithmRevision: CUBE_RESCUE_ALGORITHM_REVISION,
    ...input,
  });
}

function scoreTrial(
  trial: CubeRescueTrialRecord,
): readonly (number | string)[] {
  const stage =
    trial.globalExpansion.status === "all-original-vertices-pass"
      ? 0
      : trial.localSearch.status === "connector-found"
        ? 1
        : 2;
  return [stage, ...trial.localSearch.bestScore, trial.trialId];
}

function trialCoversAllSubdivisionVertices(
  trial: CubeRescueTrialRecord,
): boolean {
  if (trial.globalExpansion.status !== "all-original-vertices-pass") {
    return false;
  }
  const cegar = trial.globalExpansion.cegar;
  const links = cegar.subdivisionVertexLinks;
  return (
    cegar.status === "all-original-vertices-pass" &&
    cegar.checkedAllOriginalVerticesInFinalRound &&
    links.subdivisionFamily === trial.subdivisionFamily &&
    links.orderId === trial.orderId &&
    links.orderDigest === trial.orderDigest &&
    cubeRescueSubdivisionVertexLinksAreCertified(links)
  );
}

function compareTrial(
  left: CubeRescueTrialRecord,
  right: CubeRescueTrialRecord,
): number {
  const leftScore = scoreTrial(left);
  const rightScore = scoreTrial(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    const a = leftScore[index];
    const b = rightScore[index];
    if (typeof a === "number" && typeof b === "number" && a !== b) return a - b;
    if (typeof a === "string" && typeof b === "string" && a !== b) {
      return compareCodeUnits(a, b);
    }
  }
  return 0;
}

export function selectBestCubeRescueTrialId(
  trials: readonly CubeRescueTrialRecord[],
): string | null {
  return [...trials].sort(compareTrial)[0]?.trialId ?? null;
}

export function computeCompactCubeBoundedRescueCertificateDigest(
  certificate: CompactCubeBoundedRescueCertificate,
): string {
  return canonicalSha256({ ...certificate, certificateDigest: "" });
}

export function selectCubeRescueMotifs(
  extraction: CubeRescueMotifExtraction,
  maximum: number,
): CubeRescueSeparatorMotif[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error("The selected motif bound must be positive.");
  }
  const byPoint = new Map<number, CubeRescueSeparatorMotif[]>();
  for (const motif of extraction.motifs) {
    const row = byPoint.get(motif.point) ?? [];
    row.push(motif);
    byPoint.set(motif.point, row);
  }
  const rows = [...byPoint.entries()].sort(([left], [right]) => left - right);
  for (const [, motifs] of rows) {
    motifs.sort(
      (left, right) =>
        right.coneDimension - left.coneDimension ||
        compareCodeUnits(left.motifId, right.motifId),
    );
  }
  const selected: CubeRescueSeparatorMotif[] = [];
  for (let cursor = 0; selected.length < maximum; cursor += 1) {
    let added = false;
    for (const [, motifs] of rows) {
      const motif = motifs[cursor];
      if (!motif || selected.length >= maximum) continue;
      selected.push(motif);
      added = true;
    }
    if (!added) break;
  }
  return selected;
}

function trialCombinationKey(input: {
  sourceMotifId: string;
  orderKind: CubeRescueOrderKind;
  subdivisionFamily: CubeRescueSubdivisionFamily;
}): string {
  return `${input.sourceMotifId}\u0000${input.orderKind}\u0000${input.subdivisionFamily}`;
}

function isSupportedOrderKind(value: unknown): value is CubeRescueOrderKind {
  return (
    value === "numeric" ||
    value === "reverse" ||
    value === "affine-7" ||
    value === "affine-11" ||
    value === "half-turn"
  );
}

function isSupportedSubdivisionFamily(
  value: unknown,
): value is CubeRescueSubdivisionFamily {
  return value === "pulling" || value === "maximal-simplex-stellar";
}

export function auditCubeRescuePortfolioStructure(
  certificate: Pick<
    CompactCubeBoundedRescueCertificate,
    "selectedMotifIds" | "portfolio" | "trials" | "bestTrialId"
  >,
  extraction: CubeRescueMotifExtraction,
): {
  structureValid: boolean;
  productionComplete: boolean;
  bestTrialValid: boolean;
} {
  const motifById = new Map(
    extraction.motifs.map((motif) => [motif.motifId, motif]),
  );
  const selectedSet = new Set(certificate.selectedMotifIds);
  const orders = certificate.portfolio.orderKinds;
  const families = certificate.portfolio.subdivisionFamilies;
  const expectedKeys = new Set<string>();
  for (const sourceMotifId of certificate.selectedMotifIds) {
    for (const orderKind of orders) {
      for (const subdivisionFamily of families) {
        expectedKeys.add(
          trialCombinationKey({ sourceMotifId, orderKind, subdivisionFamily }),
        );
      }
    }
  }
  const actualKeys = new Set<string>();
  const portfolioEnumsValid =
    certificate.portfolio.algorithmRevision ===
      CUBE_RESCUE_ALGORITHM_REVISION &&
    orders.every(isSupportedOrderKind) &&
    families.every(isSupportedSubdivisionFamily);
  let trialFieldsValid = portfolioEnumsValid;
  for (const trial of certificate.trials) {
    const motif = motifById.get(trial.sourceMotifId);
    const expectedOrder = isSupportedOrderKind(trial.orderKind)
      ? buildCubeRescueVertexOrder(34_560, trial.orderKind)
      : undefined;
    const key = trialCombinationKey(trial);
    if (actualKeys.has(key)) trialFieldsValid = false;
    actualKeys.add(key);
    const expectedTrialId = computeCubeRescueTrialId({
      sourceMotifId: trial.sourceMotifId,
      orderDigest: trial.orderDigest,
      subdivisionFamily: trial.subdivisionFamily,
      localPointIds: certificate.portfolio.localPointIds,
      localBounds: certificate.portfolio.localBounds,
      globalCegarBounds: certificate.portfolio.globalCegarBounds,
    });
    trialFieldsValid &&=
      motif !== undefined &&
      selectedSet.has(trial.sourceMotifId) &&
      expectedOrder !== undefined &&
      isSupportedSubdivisionFamily(trial.subdivisionFamily) &&
      orders.includes(trial.orderKind) &&
      families.includes(trial.subdivisionFamily) &&
      trial.sigma === motif?.sigma &&
      sameJson(trial.primitiveWitness, motif?.primitiveWitness) &&
      trial.orderId === expectedOrder?.id &&
      trial.orderDigest === expectedOrder?.orderDigest &&
      sameJson(trial.localPointIds, certificate.portfolio.localPointIds) &&
      trial.localSearch.schemaVersion === 1 &&
      trial.localSearch.kind ===
        "bounded-exact-periodic-potential-search-commitment" &&
      sameJson(trial.localSearch.bounds, certificate.portfolio.localBounds) &&
      trial.localSearch.sigma === trial.sigma &&
      sameJson(trial.localSearch.primitiveWitness, trial.primitiveWitness) &&
      trial.localSearch.evaluationDigests.length ===
        trial.localPointIds.length &&
      trial.localSearch.evaluationDigests.every((digest) =>
        /^[0-9a-f]{64}$/u.test(digest),
      ) &&
      /^[0-9a-f]{64}$/u.test(trial.localSearch.fullResultDigest) &&
      trial.trialId === expectedTrialId &&
      (trial.globalExpansion.status === "not-run" ||
        trial.globalExpansion.status === "all-original-vertices-pass" ||
        trial.globalExpansion.status === "stopped-within-bounds") &&
      (trial.localSearch.status === "connector-found") ===
        (trial.globalExpansion.status !== "not-run");
    if (trial.globalExpansion.status !== "not-run") {
      trialFieldsValid &&=
        sameJson(
          trial.globalExpansion.cegar.bounds,
          certificate.portfolio.globalCegarBounds,
        ) &&
        sameJson(
          trial.globalExpansion.cegar.initialPointIds,
          certificate.portfolio.localPointIds,
        ) &&
        sameJson(
          trial.globalExpansion.cegar.primitiveWitness,
          trial.primitiveWitness,
        ) &&
        trial.globalExpansion.cegar.sigma === trial.sigma &&
        trial.globalExpansion.cegar.orderId === trial.orderId &&
        trial.globalExpansion.cegar.orderDigest === trial.orderDigest &&
        trial.globalExpansion.cegar.subdivisionFamily ===
          trial.subdivisionFamily &&
        trial.globalExpansion.cegar.subdivisionVertexLinks.subdivisionFamily ===
          trial.subdivisionFamily &&
        trial.globalExpansion.cegar.subdivisionVertexLinks.orderId ===
          trial.orderId &&
        trial.globalExpansion.cegar.subdivisionVertexLinks.orderDigest ===
          trial.orderDigest &&
        cubeRescueSubdivisionVertexLinksAreCertified(
          trial.globalExpansion.cegar.subdivisionVertexLinks,
        ) &&
        /^[0-9a-f]{64}$/u.test(trial.globalExpansion.cegar.fullResultDigest) &&
        trial.globalExpansion.cegar.roundDigests.every((digest) =>
          /^[0-9a-f]{64}$/u.test(digest),
        ) &&
        (trial.globalExpansion.status === "all-original-vertices-pass") ===
          (trial.globalExpansion.cegar.status === "all-original-vertices-pass");
    }
  }
  const structureValid =
    certificate.selectedMotifIds.length > 0 &&
    selectedSet.size === certificate.selectedMotifIds.length &&
    certificate.selectedMotifIds.every((id) => motifById.has(id)) &&
    orders.length > 0 &&
    new Set(orders).size === orders.length &&
    families.length > 0 &&
    new Set(families).size === families.length &&
    sameJson(
      certificate.portfolio.localPointIds,
      CUBE_RESCUE_CERTIFIED_LOCAL_POINTS,
    ) &&
    certificate.trials.length === expectedKeys.size &&
    actualKeys.size === expectedKeys.size &&
    [...expectedKeys].every((key) => actualKeys.has(key)) &&
    trialFieldsValid;
  const allMotifsSelected =
    selectedSet.size === extraction.motifs.length &&
    extraction.motifs.every(({ motifId }) => selectedSet.has(motifId));
  const productionComplete =
    structureValid &&
    allMotifsSelected &&
    sameJson(orders, CUBE_RESCUE_PRODUCTION_ORDER_KINDS) &&
    sameJson(families, CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES);
  return {
    structureValid,
    productionComplete,
    bestTrialValid:
      certificate.bestTrialId ===
      selectBestCubeRescueTrialId(certificate.trials),
  };
}

function expectedStatus(
  certificate: Pick<
    CompactCubeBoundedRescueCertificate,
    | "selectedMotifIds"
    | "motifExtraction"
    | "portfolio"
    | "trials"
    | "bestTrialId"
  >,
): CompactCubeBoundedRescueCertificate["status"] {
  const portfolioAudit = auditCubeRescuePortfolioStructure(
    certificate,
    certificate.motifExtraction,
  );
  if (!portfolioAudit.productionComplete) return "smoke-only";
  const trials = certificate.trials;
  if (trials.some((trial) => trialCoversAllSubdivisionVertices(trial))) {
    return "all-subdivision-vertices-pass";
  }
  if (trials.some((trial) => trial.localSearch.status === "connector-found")) {
    return "local-connectors-only";
  }
  return "benchmark-archive";
}

export function sealCompactCubeBoundedRescueCertificate(
  input: CompactCubeBoundedRescueCertificateInput,
): CompactCubeBoundedRescueCertificate {
  const trials = input.trials.map(sealCubeRescueTrialRecord);
  const localConnectorCount = trials.filter(
    (trial) => trial.localSearch.status === "connector-found",
  ).length;
  const originalVertexPassCount = trials.filter(
    (trial) =>
      trial.globalExpansion.status !== "not-run" &&
      trial.globalExpansion.status === "all-original-vertices-pass",
  ).length;
  const preliminary: CompactCubeBoundedRescueCertificate = {
    ...input,
    status: "smoke-only",
    trials,
    portfolio: {
      ...input.portfolio,
      trialCount: trials.length,
      localConnectorCount,
      originalVertexPassCount,
    },
    certificateDigest: "",
  };
  const withoutDigest: CompactCubeBoundedRescueCertificate = {
    ...preliminary,
    status: expectedStatus(preliminary),
  };
  return {
    ...withoutDigest,
    certificateDigest:
      computeCompactCubeBoundedRescueCertificateDigest(withoutDigest),
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function validateStoredSearchCommitment(
  search: CubeRescuePotentialSearchCommitment,
): boolean {
  return (
    search.schemaVersion === 1 &&
    search.kind === "bounded-exact-periodic-potential-search-commitment" &&
    /^[0-9a-f]{64}$/u.test(search.fullResultDigest) &&
    search.evaluationDigests.every((digest) => /^[0-9a-f]{64}$/u.test(digest))
  );
}

export function replayCompactCubeBoundedRescueCertificate(
  certificate: CompactCubeBoundedRescueCertificate,
  context: CubeRescueReplayContext,
): CompactCubeBoundedRescueReplay {
  const checks: CompactCubeBoundedRescueReplay["checks"] = {
    certificateDigestValid: false,
    sourceBindingsMatch: false,
    motifExtractionMatches: false,
    selectedMotifsValid: false,
    portfolioStructureValid: false,
    bestTrialValid: false,
    everyTrialDigestValid: false,
    everyTemplateDigestRebuilt: false,
    everyPotentialSearchReplayed: false,
    statusMatchesTrials: false,
    storedChecksHonest: false,
  };
  const errors: string[] = [];
  try {
    checks.certificateDigestValid =
      computeCompactCubeBoundedRescueCertificateDigest(certificate) ===
      certificate.certificateDigest;
    if (!checks.certificateDigestValid)
      errors.push("The rescue certificate digest is stale.");
    checks.sourceBindingsMatch =
      certificate.source.degree === context.degree &&
      certificate.source.degree === 34560 &&
      certificate.source.rank === 19 &&
      sameJson(certificate.source, context.source);
    if (!checks.sourceBindingsMatch)
      errors.push("The rescue source bindings changed.");
    const extraction = extractCubeRescueSeparatorMotifs(
      context.adaptiveArtifact,
    );
    checks.motifExtractionMatches = sameJson(
      extraction,
      certificate.motifExtraction,
    );
    if (!checks.motifExtractionMatches)
      errors.push("The separator motifs do not replay.");
    const motifById = new Map(
      extraction.motifs.map((motif) => [motif.motifId, motif]),
    );
    checks.selectedMotifsValid =
      certificate.selectedMotifIds.length > 0 &&
      new Set(certificate.selectedMotifIds).size ===
        certificate.selectedMotifIds.length &&
      certificate.selectedMotifIds.every((id) => motifById.has(id));
    if (!checks.selectedMotifsValid)
      errors.push("The selected rescue motifs are invalid.");
    const portfolioAudit = auditCubeRescuePortfolioStructure(
      certificate,
      extraction,
    );
    checks.portfolioStructureValid = portfolioAudit.structureValid;
    checks.bestTrialValid = portfolioAudit.bestTrialValid;
    if (!checks.portfolioStructureValid) {
      errors.push(
        "The declared rescue portfolio is not its exact Cartesian product.",
      );
    }
    if (!checks.bestTrialValid)
      errors.push("The recorded best rescue trial is stale.");
    checks.everyTrialDigestValid = certificate.trials.every(
      (trial) =>
        cubeRescueTrialDigestIsValid(trial) &&
        validateStoredSearchCommitment(trial.localSearch),
    );
    if (!checks.everyTrialDigestValid)
      errors.push("A rescue trial digest is invalid.");
    let templatesValid = true;
    let searchesValid = true;
    let connectorLinksValid = true;
    let globalStatusesValid = true;
    let subdivisionCoverageValid = true;
    const orderPosition = new Map(
      certificate.portfolio.orderKinds.map((kind, index) => [kind, index]),
    );
    const replayTrials = [...certificate.trials].sort(
      (left, right) =>
        (orderPosition.get(left.orderKind) ?? Number.MAX_SAFE_INTEGER) -
          (orderPosition.get(right.orderKind) ?? Number.MAX_SAFE_INTEGER) ||
        compareCodeUnits(left.trialId, right.trialId),
    );
    for (const trial of replayTrials) {
      const motif = motifById.get(trial.sourceMotifId);
      if (!motif || !sameJson(motif.primitiveWitness, trial.primitiveWitness)) {
        templatesValid = false;
        searchesValid = false;
        continue;
      }
      const expectedOrder = buildCubeRescueVertexOrder(
        context.degree,
        trial.orderKind,
      );
      const builder = context.builder(trial.orderKind);
      if (
        expectedOrder.orderDigest !== trial.orderDigest ||
        builder.order.orderDigest !== trial.orderDigest ||
        builder.order.id !== trial.orderId
      ) {
        templatesValid = false;
      }
      const localTemplates = trial.localPointIds.map((point) =>
        builder.build(point, trial.subdivisionFamily),
      );
      if (
        !sameJson(
          localTemplates.map((template) => template.templateDigest),
          trial.localTemplateDigests,
        )
      ) {
        templatesValid = false;
      }
      const replayedLocal = searchCubeRescuePeriodicPotential({
        templates: localTemplates,
        primitiveWitness: trial.primitiveWitness,
        sigma: trial.sigma,
        bounds: trial.localSearch.bounds,
      });
      if (
        !sameJson(
          commitCubeRescuePotentialSearch(replayedLocal),
          trial.localSearch,
        )
      ) {
        searchesValid = false;
      }
      if (
        trial.localSearch.status === "connector-found" &&
        replayedLocal.evaluations.some(
          (evaluation) => evaluation.failures.length > 0,
        )
      ) {
        connectorLinksValid = false;
      }
      if (trial.globalExpansion.status !== "not-run") {
        const replayedGlobal = runCubeRescueOriginalVertexCegar({
          builder,
          subdivisionFamily: trial.subdivisionFamily,
          primitiveWitness: trial.primitiveWitness,
          sigma: trial.sigma,
          // The global replay must consume the freshly reconstructed local
          // output, not a potentially forged stored summary field.
          initialPotential: replayedLocal.potential,
          initialPointIds: trial.localPointIds,
          bounds: trial.globalExpansion.cegar.bounds,
        });
        if (
          !sameJson(
            commitCubeRescueOriginalVertexCegar(replayedGlobal),
            trial.globalExpansion.cegar,
          )
        ) {
          searchesValid = false;
        }
        const replayedAllOriginalVerticesPass =
          replayedGlobal.status === "all-original-vertices-pass";
        if (
          (trial.globalExpansion.status === "all-original-vertices-pass") !==
          replayedAllOriginalVerticesPass
        ) {
          globalStatusesValid = false;
        }
        if (
          replayedAllOriginalVerticesPass &&
          (!replayedGlobal.checkedAllOriginalVerticesInFinalRound ||
            !cubeRescueSubdivisionVertexLinksAreCertified(
              replayedGlobal.subdivisionVertexLinks,
            ))
        ) {
          subdivisionCoverageValid = false;
        }
      }
    }
    checks.everyTemplateDigestRebuilt = templatesValid;
    checks.everyPotentialSearchReplayed = searchesValid;
    if (!templatesValid)
      errors.push("A rescue template or order failed reconstruction.");
    if (!searchesValid)
      errors.push("An exact periodic-potential search failed replay.");
    checks.statusMatchesTrials =
      certificate.status === expectedStatus(certificate) &&
      certificate.portfolio.trialCount === certificate.trials.length &&
      certificate.portfolio.localConnectorCount ===
        certificate.trials.filter(
          (trial) => trial.localSearch.status === "connector-found",
        ).length &&
      certificate.portfolio.originalVertexPassCount ===
        certificate.trials.filter(
          (trial) =>
            trial.globalExpansion.status !== "not-run" &&
            trial.globalExpansion.status === "all-original-vertices-pass",
        ).length;
    if (!checks.statusMatchesTrials)
      errors.push("The rescue conclusion overstates its trials.");
    const exactLocalConnectorReplay = searchesValid && connectorLinksValid;
    const exactBoundedGlobalStatus = searchesValid && globalStatusesValid;
    const exactSubdivisionVertexCoverage =
      searchesValid && subdivisionCoverageValid;
    const expectedStoredChecks: CompactCubeBoundedRescueCertificate["checks"] =
      {
        adaptiveArchiveAndManifestReplayed:
          context.adaptiveArchiveAndManifestReplayed,
        adaptiveSemanticReplayPassed: context.adaptiveSemanticReplayPassed,
        sourceBindingsAgree: checks.sourceBindingsMatch,
        allSeparatorLeavesExtracted:
          extraction.terminalPruneCount === extraction.motifs.length,
        allSeparatorMotifsSelected:
          certificate.selectedMotifIds.length === extraction.motifs.length &&
          sameJson(
            [...certificate.selectedMotifIds].sort(),
            extraction.motifs.map(({ motifId }) => motifId).sort(),
          ),
        productionCartesianPortfolioComplete: portfolioAudit.productionComplete,
        onlyThreeCertifiedMotifPointsUsed:
          sameJson(
            certificate.portfolio.localPointIds,
            extraction.pointCensus.map(({ point }) => point),
          ) &&
          sameJson(
            extraction.pointCensus.map(({ point }) => point),
            [2, 4, 27],
          ),
        noGlobalNormalCatalogueRecomputed: true,
        everyTrialDigestValid: checks.everyTrialDigestValid,
        everyLocalConnectorExactlyReplayed: exactLocalConnectorReplay,
        boundedGlobalStatusHonest: exactBoundedGlobalStatus,
        everyOriginalVertexPassCoversSubdivisionVertices:
          exactSubdivisionVertexCoverage,
      };
    checks.storedChecksHonest = sameJson(
      certificate.checks,
      expectedStoredChecks,
    );
    if (!checks.storedChecksHonest)
      errors.push("The stored rescue check flags overstate replay.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort();
  const status =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed";
  const withoutDigest = {
    status: status as "passed" | "failed",
    checks,
    errors: uniqueErrors,
  };
  return { ...withoutDigest, replayDigest: canonicalSha256(withoutDigest) };
}
