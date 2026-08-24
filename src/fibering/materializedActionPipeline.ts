import { parseCoxeterSystemInput } from "../coxeter";
import type { QuotientComplex } from "../quotient";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type SphericalEnumerationLimits,
  type SphericalSubsetPlan,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  searchFullDavisWallCoorientations,
  type FullDavisCoorientationSearchOptions,
  type FullDavisCoorientationSearchResult,
} from "./fullDavisSearch";
import {
  verifyFullDavisVirtualFiberingCertificate,
  type FullDavisCertificateVerification,
  type FullDavisVirtualFiberingCertificate,
} from "./fullDavisCertificate";
import {
  searchLawfulSubcomplexCoorientations,
  verifyLawfulSubcomplexActionCertificate,
  type LawfulCoorientationSearchOptions,
  type LawfulCoorientationSearchResult,
  type LawfulSubcomplexActionCertificate,
  type LawfulSubcomplexCertificateVerification,
} from "./lawfulSearch";

const PACKED_SOLVER_ID = "packed-composite-permutation-module-solver";
const PACKED_ACTION_DOMAIN = new TextEncoder().encode(
  "coxeter-materialized-composite-v1\0",
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const REQUIRED_IMPLEMENTATION_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "scripts/run_materialized_fibering.ts",
  "src/compression/construction.ts",
  "src/davis/fullQuotient.ts",
  "src/fibering/fullDavisCertificate.ts",
  "src/fibering/fullDavisMorse.ts",
  "src/fibering/fullDavisSearch.ts",
  "src/fibering/lawfulNpcCertificate.ts",
  "src/fibering/lawfulSearch.ts",
  "src/fibering/lawfulTrack.ts",
  "src/fibering/materializedActionPipeline.ts",
  "src/fibering/pullingTriangulation.ts",
  "src/fibering/schreierHomomorphism.ts",
  "src/fibering/schreierPresentation.ts",
  "src/fibering/wallHomomorphism.ts",
  "src/topology/collapsibility.ts",
  "src/torsionFree/certification.ts",
  "src/torsionFree/quotient.ts",
  "src/utils/canonicalSha256.ts",
  "src/walls/coorientation.ts",
  "src/walls/wallSystem.ts",
] as const;
const LEGACY_IMPLEMENTATION_HASH_PATHS = {
  runner: "scripts/run_materialized_fibering.ts",
  materializedActionPipeline: "src/fibering/materializedActionPipeline.ts",
  fullDavisSearch: "src/fibering/fullDavisSearch.ts",
  fullDavisCertificate: "src/fibering/fullDavisCertificate.ts",
  fullDavisMorse: "src/fibering/fullDavisMorse.ts",
} as const;

function compatibilityHashesFromManifest(
  manifest: MaterializedActionImplementationManifest,
): Record<string, string> {
  const byPath = new Map(
    manifest.files.map((file) => [file.path, file.sha256]),
  );
  return Object.fromEntries(
    Object.entries(LEGACY_IMPLEMENTATION_HASH_PATHS).map(([name, path]) => [
      name,
      byPath.get(path) ?? "",
    ]),
  );
}

function implementationManifestPayload(
  manifest: Omit<MaterializedActionImplementationManifest, "manifestSha256">,
): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    hashAlgorithm: manifest.hashAlgorithm,
    files: manifest.files,
    sourceTreeMerkleSha256: manifest.sourceTreeMerkleSha256,
    toolchain: manifest.toolchain,
  };
}

export function validateMaterializedActionImplementationManifest(
  manifest: MaterializedActionImplementationManifest | undefined,
): string[] {
  if (!manifest) return ["A complete implementation manifest is required."];
  const errors: string[] = [];
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "materialized-action-implementation-manifest" ||
    manifest.hashAlgorithm !== "sha256"
  ) {
    errors.push("The implementation manifest header is unsupported.");
  }
  const paths = new Set<string>();
  let previous = "";
  for (const file of manifest.files) {
    if (
      !file.path ||
      file.path.includes("\\") ||
      file.path.startsWith("/") ||
      file.path.split("/").includes("..")
    ) {
      errors.push(
        `Implementation path ${file.path || "<empty>"} is not canonical.`,
      );
    }
    if (!SHA256_PATTERN.test(file.sha256)) {
      errors.push(
        `Implementation file ${file.path || "<empty>"} has an invalid digest.`,
      );
    }
    if (paths.has(file.path)) {
      errors.push(`Implementation file ${file.path} occurs more than once.`);
    }
    if (previous && compareStrings(previous, file.path) >= 0) {
      errors.push("Implementation files must be strictly sorted by path.");
    }
    paths.add(file.path);
    previous = file.path;
  }
  for (const required of REQUIRED_IMPLEMENTATION_PATHS) {
    if (!paths.has(required)) {
      errors.push(`Implementation manifest omits ${required}.`);
    }
  }
  const expectedTreeHash = canonicalSha256(manifest.files);
  if (manifest.sourceTreeMerkleSha256 !== expectedTreeHash) {
    errors.push("The implementation source-tree Merkle hash is stale.");
  }
  if (
    Object.values(manifest.toolchain).some(
      (value) => typeof value !== "string" || value.trim().length === 0,
    )
  ) {
    errors.push("Every implementation toolchain version must be recorded.");
  }
  if (
    manifest.manifestSha256 !==
    canonicalSha256(
      implementationManifestPayload({
        schemaVersion: manifest.schemaVersion,
        kind: manifest.kind,
        hashAlgorithm: manifest.hashAlgorithm,
        files: manifest.files,
        sourceTreeMerkleSha256: manifest.sourceTreeMerkleSha256,
        toolchain: manifest.toolchain,
      }),
    )
  ) {
    errors.push("The implementation manifest hash is stale.");
  }
  return [...new Set(errors)].sort(compareStrings);
}

export type MaterializedActionPromotionStatus =
  | "passed"
  | "incomplete"
  | "failed";

export type MaterializedActionPromotionStageId =
  | "materialized-action"
  | "spherical-plan"
  | "spherical-freeness"
  | "quotient-2-skeleton"
  | "lawful-subcomplex"
  | "full-davis-fallback";

export interface MaterializedActionPromotionStage {
  id: MaterializedActionPromotionStageId;
  status: MaterializedActionPromotionStatus | "not-run";
  detail: string;
}

export interface MaterializedActionPipelineBudgets {
  /** Stops before copying a complete action larger than this degree. */
  maxActionDegree?: number;
  /** Bounds rank times degree, the number of supplied permutation entries. */
  maxGeneratorEntries?: number;
  /** Bounds the packed rows plus the orbit-code array used for input replay. */
  maxPackedActionBytes?: number;
  /** Bounds the exact quotient 1-skeleton before it is allocated. */
  maxQuotientEdges?: number;
  /** Bounds rank-two relation cells before quotient construction. */
  maxQuotientTwoCells?: number;
  /** Bounds all spherical cells in the complete Davis quotient. */
  maxFullDavisCells?: number;
}

export interface MaterializedActionPipelineOptions {
  budgets?: MaterializedActionPipelineBudgets;
  sphericalPlanLimits?: SphericalEnumerationLimits;
  actionCertification?: {
    maxSphericalSubgroupElements?: number;
    maxWitnesses?: number;
  };
  coorientationSearch?: FullDavisCoorientationSearchOptions;
  lawfulSearch?: LawfulCoorientationSearchOptions;
  /** Run the expensive fallback even after the lawful track certifies. */
  alwaysRunFullDavis?: boolean;
  /** SHA-256 of the Coxeter-system file bytes supplied by a file-oriented caller. */
  sourceSystemArtifactSha256?: string;
  /** SHA-256 of the materialized-action file bytes supplied by a file-oriented caller. */
  sourceActionArtifactSha256?: string;
  /** @deprecated Use the complete implementation manifest. */
  implementationHashes?: Readonly<Record<string, string>>;
  /** Hash-bound theorem-facing source tree and toolchain used by a CLI run. */
  implementationManifest?: MaterializedActionImplementationManifest;
}

export interface MaterializedActionImplementationFile {
  path: string;
  sha256: string;
}

export interface MaterializedActionImplementationManifest {
  schemaVersion: 1;
  kind: "materialized-action-implementation-manifest";
  hashAlgorithm: "sha256";
  files: MaterializedActionImplementationFile[];
  sourceTreeMerkleSha256: string;
  toolchain: {
    node: string;
    packageManager: string;
    typescript: string;
    vite: string;
    viteNode: string;
  };
  manifestSha256: string;
}

export interface MaterializedActionPromotionArtifact {
  schemaVersion: 2;
  kind: "materialized-action-two-track-promotion";
  status: MaterializedActionPromotionStatus;
  promotionOutcome: "certified" | "not-certified" | "inconclusive";
  selectedTrack: "lawful-subcomplex" | "full-davis" | null;
  implementation: {
    profile: "materialized-action-two-track-promotion-v3";
    hashes: Record<string, string>;
    manifest?: MaterializedActionImplementationManifest;
  };
  source: {
    systemName: string;
    candidateId?: string;
    actionDegree?: number;
    actionInputKind?:
      | "packed-composite-artifact"
      | "raw-candidate"
      | "candidate-wrapper";
    solverId?: string;
    solverVersion?: string;
    problemSha256?: string;
  };
  stages: MaterializedActionPromotionStage[];
  budgets: Required<MaterializedActionPipelineBudgets>;
  metrics: {
    generatorEntries?: number;
    logicalPackedActionBytes?: number;
    sphericalSubsetCount?: number;
    quotientVertexCount?: number;
    quotientEdgeCount?: number;
    quotientTwoCellCount?: number;
    estimatedFullDavisCellCount?: number;
  };
  hashes: {
    sourceSystemSha256: string;
    sourceSystemArtifactSha256?: string;
    sourceActionArtifactSha256?: string;
    materializedActionSha256?: string;
    materializedActionBindingSha256?: string;
    sphericalPlanSha256?: string;
    torsionFreeCertificateSha256?: string;
    quotientBindingSha256?: string;
    coorientationSearchSha256?: string;
    fiberingCertificateSha256?: string;
    fiberingCertificateReplaySha256?: string;
    lawfulSearchSha256?: string;
    lawfulCertificateSha256?: string;
    lawfulCertificateReplaySha256?: string;
    artifactSha256: string;
  };
  sphericalPlan?: SphericalSubsetPlan;
  torsionFreeCertificate?: TorsionFreeActionCertificate;
  quotientSummary?: {
    name: string;
    vertexCount: number;
    edgeCount: number;
    twoCellCount: number;
  };
  coorientationSearch?: DeterministicCoorientationSearchResult;
  fiberingCertificate?: FullDavisVirtualFiberingCertificate;
  fiberingCertificateReplay?: FullDavisCertificateVerification;
  lawfulSearch?: DeterministicLawfulSearchResult;
  lawfulCertificate?: LawfulSubcomplexActionCertificate;
  lawfulCertificateReplay?: LawfulSubcomplexCertificateVerification;
  claims: string[];
  nonClaims: string[];
  errors: string[];
  warnings: string[];
}

export interface MaterializedActionPromotionVerification {
  schemaVersion: 2;
  kind: "materialized-action-promotion-replay";
  valid: boolean;
  errors: string[];
  implementationManifestMatches: boolean;
  fiberingReplay?: FullDavisCertificateVerification;
  lawfulReplay?: LawfulSubcomplexCertificateVerification;
  checkedHashes: string[];
  replayHashAlgorithm: "sha256";
  replayHash: string;
}

export type DeterministicCoorientationSearchResult = Omit<
  FullDavisCoorientationSearchResult,
  "elapsedMilliseconds"
>;

export type DeterministicLawfulSearchResult = Omit<
  LawfulCoorientationSearchResult,
  "elapsedMilliseconds" | "certificate" | "certificateReplay"
>;

interface ParsedMaterializedAction {
  candidate: TorsionFreeActionCandidate;
  inputKind:
    | "packed-composite-artifact"
    | "raw-candidate"
    | "candidate-wrapper";
  solverId: string;
  solverVersion: string;
  problemSha256?: string;
  declaredActionSha256: string;
  materializedActionBindingSha256: string;
  generatorEntries: number;
  logicalPackedActionBytes: number;
}

class PipelineBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineBudgetError";
  }
}

class MaterializedActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterializedActionInputError";
  }
}

const DEFAULT_BUDGETS: Required<MaterializedActionPipelineBudgets> = {
  maxActionDegree: 576_000,
  maxGeneratorEntries: 8_000_000,
  maxPackedActionBytes: 128 * 1024 * 1024,
  maxQuotientEdges: 2_000_000,
  maxQuotientTwoCells: 2_000_000,
  maxFullDavisCells: 4_000_000,
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MaterializedActionInputError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: unknown,
  label: string,
  options: { sha256?: boolean } = {},
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new MaterializedActionInputError(
      `${label} must be a nonempty string.`,
    );
  }
  if (options.sha256 && !SHA256_PATTERN.test(value)) {
    throw new MaterializedActionInputError(
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new MaterializedActionInputError(
      `${label} must be a positive safe integer.`,
    );
  }
  return value as number;
}

function resolvePositiveBudget(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MaterializedActionInputError(
      `${label} must be a positive safe integer.`,
    );
  }
  return value;
}

function resolveBudgets(
  budgets: MaterializedActionPipelineBudgets | undefined,
): Required<MaterializedActionPipelineBudgets> {
  return {
    maxActionDegree: resolvePositiveBudget(
      budgets?.maxActionDegree,
      DEFAULT_BUDGETS.maxActionDegree,
      "maxActionDegree",
    ),
    maxGeneratorEntries: resolvePositiveBudget(
      budgets?.maxGeneratorEntries,
      DEFAULT_BUDGETS.maxGeneratorEntries,
      "maxGeneratorEntries",
    ),
    maxPackedActionBytes: resolvePositiveBudget(
      budgets?.maxPackedActionBytes,
      DEFAULT_BUDGETS.maxPackedActionBytes,
      "maxPackedActionBytes",
    ),
    maxQuotientEdges: resolvePositiveBudget(
      budgets?.maxQuotientEdges,
      DEFAULT_BUDGETS.maxQuotientEdges,
      "maxQuotientEdges",
    ),
    maxQuotientTwoCells: resolvePositiveBudget(
      budgets?.maxQuotientTwoCells,
      DEFAULT_BUDGETS.maxQuotientTwoCells,
      "maxQuotientTwoCells",
    ),
    maxFullDavisCells: resolvePositiveBudget(
      budgets?.maxFullDavisCells,
      DEFAULT_BUDGETS.maxFullDavisCells,
      "maxFullDavisCells",
    ),
  };
}

function integerWidthForDegree(degree: number): 2 | 4 | 8 {
  if (degree - 1 <= 0xffff) return 2;
  if (degree - 1 <= 0xffff_ffff) return 4;
  return 8;
}

function integerWidthForBound(bound: bigint): 2 | 4 | 8 {
  if (bound <= 0xffffn) return 2;
  if (bound <= 0xffff_ffffn) return 4;
  return 8;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

/** Replays the byte-level action digest written by packed_composite_solver.py. */
export async function computePackedMaterializedActionSha256(
  generatorActions: readonly (readonly number[])[],
  degree: number,
): Promise<string> {
  const rank = generatorActions.length;
  const width = integerWidthForDegree(degree);
  const byteLength =
    PACKED_ACTION_DOMAIN.length + 8 + 4 + rank * degree * width;
  if (!Number.isSafeInteger(byteLength)) {
    throw new MaterializedActionInputError(
      "The packed action is too large for a safe byte-length calculation.",
    );
  }
  const payload = new Uint8Array(byteLength);
  payload.set(PACKED_ACTION_DOMAIN, 0);
  const view = new DataView(payload.buffer);
  let offset = PACKED_ACTION_DOMAIN.length;
  view.setBigUint64(offset, BigInt(degree), true);
  offset += 8;
  view.setUint32(offset, rank, true);
  offset += 4;
  for (const row of generatorActions) {
    if (row.length !== degree) {
      throw new MaterializedActionInputError(
        `A generator row has ${row.length} entries; expected ${degree}.`,
      );
    }
    for (const image of row) {
      if (!Number.isSafeInteger(image) || image < 0 || image >= degree) {
        throw new MaterializedActionInputError(
          `Generator image ${String(image)} lies outside 0..${degree - 1}.`,
        );
      }
      if (width === 2) view.setUint16(offset, image, true);
      else if (width === 4) view.setUint32(offset, image, true);
      else view.setBigUint64(offset, BigInt(image), true);
      offset += width;
    }
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return bytesToHex(digest);
}

function ensurePermutation(
  row: readonly number[],
  degree: number,
  id: number,
): void {
  const seen = new Uint8Array(degree);
  for (const image of row) {
    if (!Number.isSafeInteger(image) || image < 0 || image >= degree) {
      throw new MaterializedActionInputError(
        `Generator ${id} has image ${String(image)} outside 0..${degree - 1}.`,
      );
    }
    if (seen[image] !== 0) {
      throw new MaterializedActionInputError(
        `Generator ${id} is not a permutation: image ${image} is repeated.`,
      );
    }
    seen[image] = 1;
  }
}

async function parseMaterializedAction(
  system: CoxeterSystemInput,
  input: unknown,
  budgets: Required<MaterializedActionPipelineBudgets>,
): Promise<ParsedMaterializedAction> {
  const artifact = record(input, "Materialized action artifact");
  const wrappedCandidate =
    artifact.candidate !== undefined
      ? record(artifact.candidate, "candidate")
      : undefined;
  const userCandidate = Object.hasOwn(artifact, "generatorImages")
    ? artifact
    : wrappedCandidate && Object.hasOwn(wrappedCandidate, "generatorImages")
      ? wrappedCandidate
      : undefined;
  if (userCandidate) {
    const inputKind = Object.hasOwn(artifact, "generatorImages")
      ? "raw-candidate"
      : "candidate-wrapper";
    const id = stringField(userCandidate.id, "candidate.id");
    const degree = positiveSafeInteger(userCandidate.index, "candidate.index");
    if (degree > budgets.maxActionDegree) {
      throw new PipelineBudgetError(
        `Action degree ${degree} exceeds the configured degree budget ${budgets.maxActionDegree}.`,
      );
    }
    const generatorEntries = system.rank * degree;
    if (!Number.isSafeInteger(generatorEntries)) {
      throw new PipelineBudgetError(
        "The generator-entry count exceeds JavaScript's safe integer range.",
      );
    }
    if (generatorEntries > budgets.maxGeneratorEntries) {
      throw new PipelineBudgetError(
        `The action has ${generatorEntries} generator entries; the budget is ${budgets.maxGeneratorEntries}.`,
      );
    }
    if (!Array.isArray(userCandidate.generatorImages)) {
      throw new MaterializedActionInputError(
        "candidate.generatorImages must be an array of complete permutation rows.",
      );
    }
    if (userCandidate.generatorImages.length !== system.rank) {
      throw new MaterializedActionInputError(
        `The action supplies ${userCandidate.generatorImages.length} generators; the source system has rank ${system.rank}.`,
      );
    }
    const generatorImages = userCandidate.generatorImages.map(
      (value, generator) => {
        if (!Array.isArray(value) || value.length !== degree) {
          throw new MaterializedActionInputError(
            `Generator ${generator} must contain exactly ${degree} images.`,
          );
        }
        for (const image of value) {
          if (!Number.isSafeInteger(image)) {
            throw new MaterializedActionInputError(
              `Generator ${generator} contains a non-integer image.`,
            );
          }
        }
        const row = value as number[];
        ensurePermutation(row, degree, generator);
        return row;
      },
    );
    const logicalPackedActionBytes =
      generatorEntries * integerWidthForDegree(degree);
    if (logicalPackedActionBytes > budgets.maxPackedActionBytes) {
      throw new PipelineBudgetError(
        `The action rows need about ${logicalPackedActionBytes} bytes; the budget is ${budgets.maxPackedActionBytes}.`,
      );
    }
    const actionSha256 = await computePackedMaterializedActionSha256(
      generatorImages,
      degree,
    );
    const optionalString = (value: unknown): string | undefined =>
      typeof value === "string" && value.length > 0 ? value : undefined;
    const stringArray = (
      value: unknown,
      label: string,
    ): string[] | undefined => {
      if (value === undefined) return undefined;
      if (
        !Array.isArray(value) ||
        value.some((entry) => typeof entry !== "string")
      ) {
        throw new MaterializedActionInputError(
          `${label} must be an array of strings.`,
        );
      }
      return value as string[];
    };
    const name = optionalString(userCandidate.name);
    const pointLabels = stringArray(
      userCandidate.pointLabels,
      "candidate.pointLabels",
    );
    if (pointLabels && pointLabels.length !== degree) {
      throw new MaterializedActionInputError(
        `candidate.pointLabels must contain exactly ${degree} entries.`,
      );
    }
    const backend = optionalString(userCandidate.backend);
    const backendVersion = optionalString(userCandidate.backendVersion);
    const source = optionalString(userCandidate.source);
    const notes = stringArray(userCandidate.notes, "candidate.notes");
    const candidate: TorsionFreeActionCandidate = {
      id,
      index: degree,
      generatorImages,
      ...(name ? { name } : {}),
      ...(pointLabels ? { pointLabels } : {}),
      ...(backend ? { backend } : {}),
      ...(backendVersion ? { backendVersion } : {}),
      ...(source ? { source } : {}),
      ...(notes ? { notes } : {}),
    };
    const solverId = backend ?? "user-supplied-permutation-action";
    const solverVersion = backendVersion ?? "1";
    const binding = {
      schemaVersion: 1,
      inputKind,
      solver: { id: solverId, version: solverVersion },
      candidate: { id, degree, actionSha256 },
    };
    return {
      candidate,
      inputKind,
      solverId,
      solverVersion,
      declaredActionSha256: actionSha256,
      materializedActionBindingSha256: canonicalSha256(binding),
      generatorEntries,
      logicalPackedActionBytes,
    };
  }
  if (artifact.schemaVersion !== 1) {
    throw new MaterializedActionInputError(
      "Materialized action schemaVersion must be 1.",
    );
  }
  const solver = record(artifact.solver, "solver");
  const solverId = stringField(solver.id, "solver.id");
  if (solverId !== PACKED_SOLVER_ID) {
    throw new MaterializedActionInputError(
      `Expected solver ${PACKED_SOLVER_ID}; received ${solverId}.`,
    );
  }
  const solverVersion = stringField(solver.version, "solver.version");
  const problemSha256 = stringField(artifact.problemSha256, "problemSha256", {
    sha256: true,
  });
  const rawCandidate = record(artifact.candidate, "candidate");
  const id = stringField(rawCandidate.id, "candidate.id");
  const degree = positiveSafeInteger(rawCandidate.degree, "candidate.degree");
  if (rawCandidate.actionMaterialized !== true) {
    throw new MaterializedActionInputError(
      "candidate.actionMaterialized must be true.",
    );
  }
  if (degree > budgets.maxActionDegree) {
    throw new PipelineBudgetError(
      `Action degree ${degree} exceeds the configured degree budget ${budgets.maxActionDegree}.`,
    );
  }
  const generatorEntries = system.rank * degree;
  if (!Number.isSafeInteger(generatorEntries)) {
    throw new PipelineBudgetError(
      "The generator-entry count exceeds JavaScript's safe integer range.",
    );
  }
  if (generatorEntries > budgets.maxGeneratorEntries) {
    throw new PipelineBudgetError(
      `The action has ${generatorEntries} generator entries; the budget is ${budgets.maxGeneratorEntries}.`,
    );
  }
  let cartesianDegree: bigint;
  try {
    cartesianDegree = BigInt(String(rawCandidate.cartesianDegree));
  } catch {
    throw new MaterializedActionInputError(
      "candidate.cartesianDegree must be a positive integer string.",
    );
  }
  if (cartesianDegree < BigInt(degree)) {
    throw new MaterializedActionInputError(
      "candidate.cartesianDegree cannot be smaller than candidate.degree.",
    );
  }
  const rowWidth = integerWidthForDegree(degree);
  const orbitCodeWidth = integerWidthForBound(cartesianDegree - 1n);
  const logicalPackedActionBytes =
    generatorEntries * rowWidth + degree * orbitCodeWidth;
  if (logicalPackedActionBytes > budgets.maxPackedActionBytes) {
    throw new PipelineBudgetError(
      `The packed action needs about ${logicalPackedActionBytes} bytes; the budget is ${budgets.maxPackedActionBytes}.`,
    );
  }
  if (!Array.isArray(artifact.generatorActions)) {
    throw new MaterializedActionInputError(
      "generatorActions must be an array of complete permutation rows.",
    );
  }
  if (artifact.generatorActions.length !== system.rank) {
    throw new MaterializedActionInputError(
      `The action supplies ${artifact.generatorActions.length} generators; the source system has rank ${system.rank}.`,
    );
  }
  const generatorImages = artifact.generatorActions.map((value, generator) => {
    if (!Array.isArray(value) || value.length !== degree) {
      throw new MaterializedActionInputError(
        `Generator ${generator} must contain exactly ${degree} images.`,
      );
    }
    for (const image of value) {
      if (!Number.isSafeInteger(image)) {
        throw new MaterializedActionInputError(
          `Generator ${generator} contains a non-integer image.`,
        );
      }
    }
    // The JSON parser already owns these arrays. Reusing them avoids a second
    // multi-million-entry allocation before exact spherical replay.
    const row = value as number[];
    ensurePermutation(row, degree, generator);
    return row;
  });
  if (
    !Array.isArray(artifact.orbitPointCodes) ||
    artifact.orbitPointCodes.length !== degree ||
    artifact.orbitPointCodes.some(
      (value) =>
        typeof value !== "number" || !Number.isInteger(value) || value < 0,
    )
  ) {
    throw new MaterializedActionInputError(
      "orbitPointCodes must contain one nonnegative integer per action point.",
    );
  }
  const declaredActionSha256 = stringField(
    rawCandidate.actionSha256,
    "candidate.actionSha256",
    { sha256: true },
  );
  const computedActionSha256 = await computePackedMaterializedActionSha256(
    generatorImages,
    degree,
  );
  if (computedActionSha256 !== declaredActionSha256) {
    throw new MaterializedActionInputError(
      "candidate.actionSha256 does not match the complete permutation rows.",
    );
  }
  const binding = {
    schemaVersion: 1,
    solver: { id: solverId, version: solverVersion },
    problemSha256,
    candidate: {
      id,
      degree,
      actionMaterialized: true,
      actionSha256: computedActionSha256,
      moduleIds: Array.isArray(rawCandidate.moduleIds)
        ? rawCandidate.moduleIds.map(String)
        : [],
      orbitIndex: rawCandidate.orbitIndex ?? null,
      decompositionKind: rawCandidate.decompositionKind ?? null,
    },
    orbitPointCodeCount: artifact.orbitPointCodes.length,
  };
  return {
    candidate: {
      id,
      name: `Packed composite action ${id}`,
      index: degree,
      generatorImages,
      backend: solverId,
      backendVersion: solverVersion,
      source: `packed problem ${problemSha256}`,
      notes: [
        "Complete rows were rehashed and then independently replayed against the source Coxeter system.",
      ],
    },
    inputKind: "packed-composite-artifact",
    solverId,
    solverVersion,
    problemSha256,
    declaredActionSha256,
    materializedActionBindingSha256: canonicalSha256(binding),
    generatorEntries,
    logicalPackedActionBytes,
  };
}

function estimateQuotientSize(
  system: CoxeterSystemInput,
  degree: number,
  sphericalPlan: SphericalSubsetPlan,
): {
  edgeCount: number;
  twoCellCount: number;
  fullDavisCellCount: number;
} {
  const edgeCount = system.rank * degree;
  let twoCellCount = 0;
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      const denominator = 2 * m;
      if (degree % denominator !== 0) {
        throw new MaterializedActionInputError(
          `A free (${left},${right}) dihedral action would require ${denominator} to divide degree ${degree}.`,
        );
      }
      twoCellCount += degree / denominator;
    }
  }
  let fullDavisCellCount = degree;
  for (const subgroup of sphericalPlan.sphericalSubgroups) {
    const order = Number(subgroup.order.decimal);
    if (!Number.isSafeInteger(order) || order < 1 || degree % order !== 0) {
      throw new MaterializedActionInputError(
        `Spherical subgroup ${subgroup.id} has order ${subgroup.order.decimal}, which is incompatible with degree ${degree}.`,
      );
    }
    fullDavisCellCount += degree / order;
  }
  return { edgeCount, twoCellCount, fullDavisCellCount };
}

function deterministicSearchResult(
  result: FullDavisCoorientationSearchResult,
): DeterministicCoorientationSearchResult {
  const { elapsedMilliseconds, ...deterministic } = result;
  void elapsedMilliseconds;
  return normalizeRuntimeTelemetry(deterministic);
}

function deterministicLawfulSearchResult(
  result: LawfulCoorientationSearchResult,
): DeterministicLawfulSearchResult {
  const {
    elapsedMilliseconds,
    certificate: _certificate,
    certificateReplay: _certificateReplay,
    ...deterministic
  } = result;
  void elapsedMilliseconds;
  void _certificate;
  void _certificateReplay;
  return normalizeRuntimeTelemetry(deterministic);
}

function normalizeRuntimeTelemetry<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRuntimeTelemetry(entry)) as T;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "elapsedMilliseconds" ? 0 : normalizeRuntimeTelemetry(entry),
    ]),
  ) as T;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function finalizeArtifact(
  artifact: Omit<MaterializedActionPromotionArtifact, "hashes"> & {
    hashes: Omit<
      MaterializedActionPromotionArtifact["hashes"],
      "artifactSha256"
    >;
  },
): MaterializedActionPromotionArtifact {
  const normalized = jsonClone(artifact);
  return {
    ...normalized,
    hashes: {
      ...normalized.hashes,
      artifactSha256: canonicalSha256(normalized),
    },
  };
}

/** Replay a serialized promotion without trusting its stored replay verdict. */
export function verifyMaterializedActionPromotionArtifact(
  artifact: MaterializedActionPromotionArtifact,
  currentImplementationManifest: MaterializedActionImplementationManifest,
): MaterializedActionPromotionVerification {
  const errors: string[] = [];
  const checkedHashes: string[] = [];
  if (
    artifact.schemaVersion !== 2 ||
    artifact.kind !== "materialized-action-two-track-promotion" ||
    artifact.implementation.profile !==
      "materialized-action-two-track-promotion-v3"
  ) {
    errors.push("The two-track promotion header is unsupported.");
  }
  const expectedStageIds: MaterializedActionPromotionStageId[] = [
    "materialized-action",
    "spherical-plan",
    "spherical-freeness",
    "quotient-2-skeleton",
    "lawful-subcomplex",
    "full-davis-fallback",
  ];
  const stageIds = artifact.stages.map((stage) => stage.id);
  if (
    stageIds.length !== expectedStageIds.length ||
    new Set(stageIds).size !== expectedStageIds.length ||
    expectedStageIds.some((id) => !stageIds.includes(id)) ||
    artifact.stages.some(
      (stage) =>
        !["passed", "incomplete", "failed", "not-run"].includes(stage.status),
    )
  ) {
    errors.push("The promotion stage ledger is incomplete or malformed.");
  }
  const storedManifest = artifact.implementation.manifest;
  errors.push(
    ...validateMaterializedActionImplementationManifest(storedManifest),
  );
  errors.push(
    ...validateMaterializedActionImplementationManifest(
      currentImplementationManifest,
    ).map((error) => `Current implementation: ${error}`),
  );
  const implementationManifestMatches = Boolean(
    storedManifest &&
    storedManifest.manifestSha256 ===
      currentImplementationManifest.manifestSha256,
  );
  if (!implementationManifestMatches) {
    errors.push(
      "The promotion was not produced by the currently recomputed implementation manifest.",
    );
  } else {
    checkedHashes.push("implementation-manifest");
  }
  if (storedManifest) {
    const manifestHashes = compatibilityHashesFromManifest(storedManifest);
    if (
      canonicalSha256(manifestHashes) !==
      canonicalSha256(artifact.implementation.hashes)
    ) {
      errors.push(
        "The legacy implementation-hash map disagrees with the manifest.",
      );
    } else {
      checkedHashes.push("implementation-files");
    }
  }

  const artifactClone = jsonClone(artifact);
  const declaredArtifactHash = artifactClone.hashes.artifactSha256;
  const { artifactSha256: _discarded, ...hashesWithoutArtifact } =
    artifactClone.hashes;
  void _discarded;
  const expectedArtifactHash = canonicalSha256({
    ...artifactClone,
    hashes: hashesWithoutArtifact,
  });
  if (declaredArtifactHash !== expectedArtifactHash) {
    errors.push("The promotion artifact hash is stale.");
  } else {
    checkedHashes.push("promotion-artifact");
  }

  let lawfulReplay: LawfulSubcomplexCertificateVerification | undefined;
  if (artifact.lawfulSearch) {
    const searchHash = canonicalSha256(jsonClone(artifact.lawfulSearch));
    if (artifact.hashes.lawfulSearchSha256 !== searchHash) {
      errors.push("The embedded lawful-search hash is stale.");
    } else {
      checkedHashes.push("lawful-search");
    }
  }
  if (artifact.lawfulCertificate) {
    const certificateHash = canonicalSha256(
      jsonClone(artifact.lawfulCertificate),
    );
    if (artifact.hashes.lawfulCertificateSha256 !== certificateHash) {
      errors.push("The embedded lawful-certificate hash is stale.");
    } else {
      checkedHashes.push("lawful-certificate");
    }
    lawfulReplay = verifyLawfulSubcomplexActionCertificate(
      artifact.lawfulCertificate,
    );
    if (!lawfulReplay.valid) {
      errors.push(
        ...lawfulReplay.errors.map((error) => `Lawful replay: ${error}`),
      );
    }
    if (
      artifact.hashes.lawfulCertificateReplaySha256 !==
        lawfulReplay.replayHash ||
      !artifact.lawfulCertificateReplay ||
      canonicalSha256(artifact.lawfulCertificateReplay) !==
        canonicalSha256(lawfulReplay)
    ) {
      errors.push("The stored lawful replay report is stale or self-attested.");
    } else {
      checkedHashes.push("lawful-replay");
    }
    if (
      artifact.hashes.sourceSystemSha256 !==
      artifact.lawfulCertificate.hashes.sourceSystemSha256
    ) {
      errors.push(
        "The promotion and lawful certificate bind different systems.",
      );
    }
  } else if (
    artifact.status === "passed" &&
    artifact.selectedTrack === "lawful-subcomplex"
  ) {
    errors.push("A lawful-track promotion omits its lawful certificate.");
  }

  let fiberingReplay: FullDavisCertificateVerification | undefined;
  if (artifact.coorientationSearch) {
    const searchHash = canonicalSha256(jsonClone(artifact.coorientationSearch));
    if (artifact.hashes.coorientationSearchSha256 !== searchHash) {
      errors.push("The embedded full-Davis search hash is stale.");
    } else {
      checkedHashes.push("full-davis-search");
    }
  }
  if (artifact.fiberingCertificate) {
    const certificateHash = canonicalSha256(
      jsonClone(artifact.fiberingCertificate),
    );
    if (artifact.hashes.fiberingCertificateSha256 !== certificateHash) {
      errors.push("The embedded fibering-certificate hash is stale.");
    } else {
      checkedHashes.push("fibering-certificate");
    }
    fiberingReplay = verifyFullDavisVirtualFiberingCertificate(
      artifact.fiberingCertificate,
    );
    if (!fiberingReplay.valid) {
      errors.push(
        ...fiberingReplay.errors.map((error) => `Full-Davis replay: ${error}`),
      );
    }
    if (
      artifact.hashes.fiberingCertificateReplaySha256 !==
        fiberingReplay.replayHash ||
      !artifact.fiberingCertificateReplay ||
      canonicalSha256(artifact.fiberingCertificateReplay) !==
        canonicalSha256(fiberingReplay)
    ) {
      errors.push(
        "The stored full-Davis replay report is stale or self-attested.",
      );
    } else {
      checkedHashes.push("fibering-replay");
    }
    if (
      artifact.hashes.sourceSystemSha256 !==
      artifact.fiberingCertificate.hashes.sourceSystemSha256
    ) {
      errors.push(
        "The promotion and nested certificate bind different systems.",
      );
    }
  } else if (
    artifact.status === "passed" &&
    artifact.selectedTrack === "full-davis"
  ) {
    errors.push("A passed promotion omits its full-Davis certificate.");
  }

  if (artifact.status === "passed") {
    if (artifact.errors.length > 0) {
      errors.push("A passed promotion contains recorded errors.");
    }
    const commonPassed = [
      "materialized-action",
      "spherical-plan",
      "spherical-freeness",
      "quotient-2-skeleton",
    ].every(
      (id) =>
        artifact.stages.find((stage) => stage.id === id)?.status === "passed",
    );
    const selectedTrackPassed =
      artifact.selectedTrack === "lawful-subcomplex"
        ? artifact.stages.find((stage) => stage.id === "lawful-subcomplex")
            ?.status === "passed" &&
          artifact.lawfulCertificate?.status === "passed" &&
          lawfulReplay?.valid === true &&
          lawfulReplay.mandatoryChecksPassed
        : artifact.selectedTrack === "full-davis"
          ? artifact.stages.find((stage) => stage.id === "full-davis-fallback")
              ?.status === "passed" &&
            artifact.fiberingCertificate?.status === "passed" &&
            fiberingReplay?.valid === true &&
            fiberingReplay.mandatoryStagesPassed
          : false;
    if (
      !commonPassed ||
      !selectedTrackPassed ||
      !implementationManifestMatches
    ) {
      errors.push(
        "A passed promotion lacks its common stages, selected-track replay, or implementation binding.",
      );
    }
    if (artifact.promotionOutcome !== "certified") {
      errors.push("A passed promotion is not recorded as certified.");
    }
  } else {
    if (artifact.promotionOutcome === "certified") {
      errors.push("A non-passing promotion is incorrectly marked certified.");
    }
    if (artifact.selectedTrack !== null) {
      errors.push("A non-passing promotion identifies a successful track.");
    }
    const nestedClaim =
      artifact.lawfulCertificate?.lawful.conclusion
        .virtualAlgebraicFibrationCertified === true ||
      artifact.fiberingCertificate?.result.virtualAlgebraicFibration === true;
    if (
      nestedClaim ||
      artifact.claims.some((claim) =>
        claim.toLowerCase().includes("virtual algebraic fibration"),
      )
    ) {
      errors.push("A non-passing promotion carries a fibering claim.");
    }
  }

  const payload = {
    schemaVersion: 2 as const,
    kind: "materialized-action-promotion-replay" as const,
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(compareStrings),
    implementationManifestMatches,
    ...(lawfulReplay ? { lawfulReplay } : {}),
    ...(fiberingReplay ? { fiberingReplay } : {}),
    checkedHashes: [...new Set(checkedHashes)].sort(compareStrings),
    replayHashAlgorithm: "sha256" as const,
  };
  return { ...payload, replayHash: canonicalSha256(payload) };
}

function initialStages(): MaterializedActionPromotionStage[] {
  return [
    {
      id: "materialized-action",
      status: "not-run",
      detail: "Complete packed permutation rows have not been replayed.",
    },
    {
      id: "spherical-plan",
      status: "not-run",
      detail: "The complete spherical-subgroup plan has not been built.",
    },
    {
      id: "spherical-freeness",
      status: "not-run",
      detail: "The finite action has not been certified torsion-free.",
    },
    {
      id: "quotient-2-skeleton",
      status: "not-run",
      detail: "The exact quotient 2-skeleton has not been constructed.",
    },
    {
      id: "lawful-subcomplex",
      status: "not-run",
      detail: "The inexpensive lawful-subcomplex search has not run.",
    },
    {
      id: "full-davis-fallback",
      status: "not-run",
      detail: "The full Davis fallback has not been needed or run.",
    },
  ];
}

function setStage(
  stages: MaterializedActionPromotionStage[],
  id: MaterializedActionPromotionStageId,
  status: MaterializedActionPromotionStage["status"],
  detail: string,
): void {
  const target = stages.find((entry) => entry.id === id);
  if (!target) throw new Error(`Unknown promotion stage ${id}.`);
  target.status = status;
  target.detail = detail;
}

function statusFromSearch(
  search: DeterministicCoorientationSearchResult,
  replay: FullDavisCertificateVerification | undefined,
  implementationManifestValid: boolean,
): MaterializedActionPromotionStatus {
  if (search.status === "found") {
    return search.certificate?.status === "passed" &&
      replay?.valid === true &&
      replay.mandatoryStagesPassed &&
      implementationManifestValid
      ? "passed"
      : search.certificate?.status === "failed"
        ? "failed"
        : "incomplete";
  }
  if (search.status === "not-found" || search.status === "invalid") {
    return "failed";
  }
  return "incomplete";
}

function statusFromLawfulSearch(
  search: LawfulCoorientationSearchResult,
  replay: LawfulSubcomplexCertificateVerification | undefined,
  implementationManifestValid: boolean,
): MaterializedActionPromotionStatus {
  if (search.status === "found") {
    return search.certificate?.status === "passed" &&
      replay?.valid === true &&
      replay.mandatoryChecksPassed &&
      implementationManifestValid
      ? "passed"
      : search.certificate?.status === "failed"
        ? "failed"
        : "incomplete";
  }
  return search.status === "invalid" ? "failed" : "incomplete";
}

/**
 * Promotes one materialized packed action through the exact in-repo pipeline.
 *
 * The packed solver's witness flags are treated only as provenance. Promotion
 * starts over from the complete generator permutations and a newly enumerated
 * spherical plan. Resource limits return `incomplete`; they never support a
 * nonexistence or failed-fibering claim.
 */
export async function promoteMaterializedActionToFullDavisFibering(
  systemInput: unknown,
  actionInput: unknown,
  options: MaterializedActionPipelineOptions = {},
): Promise<MaterializedActionPromotionArtifact> {
  const system = parseCoxeterSystemInput(systemInput);
  const budgets = resolveBudgets(options.budgets);
  for (const [field, digest] of [
    ["sourceSystemArtifactSha256", options.sourceSystemArtifactSha256],
    ["sourceActionArtifactSha256", options.sourceActionArtifactSha256],
  ] as const) {
    if (digest !== undefined && !SHA256_PATTERN.test(digest)) {
      throw new MaterializedActionInputError(
        `${field} must be a lowercase SHA-256 digest.`,
      );
    }
  }
  const implementationManifest = options.implementationManifest
    ? jsonClone(options.implementationManifest)
    : undefined;
  const implementationManifestErrors =
    validateMaterializedActionImplementationManifest(implementationManifest);
  const manifestHashes = implementationManifest
    ? compatibilityHashesFromManifest(implementationManifest)
    : {};
  const legacyHashes = Object.fromEntries(
    Object.entries(options.implementationHashes ?? {})
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, digest]) => {
        if (!name || !SHA256_PATTERN.test(digest)) {
          throw new MaterializedActionInputError(
            `implementationHashes.${name || "<empty>"} must be a lowercase SHA-256 digest.`,
          );
        }
        return [name, digest];
      }),
  );
  if (
    implementationManifest &&
    Object.keys(legacyHashes).length > 0 &&
    canonicalSha256(legacyHashes) !== canonicalSha256(manifestHashes)
  ) {
    throw new MaterializedActionInputError(
      "implementationHashes does not match the complete implementation manifest.",
    );
  }
  const implementationHashes = implementationManifest
    ? manifestHashes
    : legacyHashes;
  const sourceSystemSha256 = canonicalSha256(jsonClone(system));
  const stages = initialStages();
  const source: MaterializedActionPromotionArtifact["source"] = {
    systemName: system.name,
  };
  const metrics: MaterializedActionPromotionArtifact["metrics"] = {};
  const hashes: Omit<
    MaterializedActionPromotionArtifact["hashes"],
    "artifactSha256"
  > = {
    sourceSystemSha256,
    ...(options.sourceSystemArtifactSha256
      ? { sourceSystemArtifactSha256: options.sourceSystemArtifactSha256 }
      : {}),
    ...(options.sourceActionArtifactSha256
      ? { sourceActionArtifactSha256: options.sourceActionArtifactSha256 }
      : {}),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const claims: string[] = [];
  const nonClaims = [
    "minimum possible torsion-free cover index",
    "a locally trivial topological bundle",
    "a smooth fibration or smooth bundle over the circle",
    "fibering when any stage is incomplete or failed",
  ];
  let sphericalPlan: SphericalSubsetPlan | undefined;
  let quotientSummary: MaterializedActionPromotionArtifact["quotientSummary"];
  const promotedEvidence: {
    torsionFreeCertificate?: TorsionFreeActionCertificate;
    coorientationSearch?: DeterministicCoorientationSearchResult;
    fiberingCertificate?: FullDavisVirtualFiberingCertificate;
    fiberingCertificateReplay?: FullDavisCertificateVerification;
    lawfulSearch?: DeterministicLawfulSearchResult;
    lawfulCertificate?: LawfulSubcomplexActionCertificate;
    lawfulCertificateReplay?: LawfulSubcomplexCertificateVerification;
  } = {};
  let status: MaterializedActionPromotionStatus = "incomplete";
  let selectedTrack: MaterializedActionPromotionArtifact["selectedTrack"] =
    null;

  const finish = (): MaterializedActionPromotionArtifact =>
    finalizeArtifact({
      schemaVersion: 2,
      kind: "materialized-action-two-track-promotion",
      status,
      promotionOutcome:
        status === "passed"
          ? "certified"
          : status === "incomplete"
            ? "inconclusive"
            : "not-certified",
      selectedTrack,
      implementation: {
        profile: "materialized-action-two-track-promotion-v3",
        hashes: implementationHashes,
        ...(implementationManifest ? { manifest: implementationManifest } : {}),
      },
      source,
      stages,
      budgets,
      metrics,
      hashes,
      ...(sphericalPlan ? { sphericalPlan } : {}),
      ...(promotedEvidence.torsionFreeCertificate
        ? { torsionFreeCertificate: promotedEvidence.torsionFreeCertificate }
        : {}),
      ...(quotientSummary ? { quotientSummary } : {}),
      ...(promotedEvidence.coorientationSearch
        ? { coorientationSearch: promotedEvidence.coorientationSearch }
        : {}),
      ...(promotedEvidence.fiberingCertificate
        ? { fiberingCertificate: promotedEvidence.fiberingCertificate }
        : {}),
      ...(promotedEvidence.fiberingCertificateReplay
        ? {
            fiberingCertificateReplay:
              promotedEvidence.fiberingCertificateReplay,
          }
        : {}),
      ...(promotedEvidence.lawfulSearch
        ? { lawfulSearch: promotedEvidence.lawfulSearch }
        : {}),
      ...(promotedEvidence.lawfulCertificate
        ? { lawfulCertificate: promotedEvidence.lawfulCertificate }
        : {}),
      ...(promotedEvidence.lawfulCertificateReplay
        ? {
            lawfulCertificateReplay: promotedEvidence.lawfulCertificateReplay,
          }
        : {}),
      claims,
      nonClaims,
      errors,
      warnings,
    });

  if (implementationManifestErrors.length > 0) {
    errors.push(...implementationManifestErrors);
    warnings.push(
      "The mathematical pipeline may still run, but promotion cannot pass without a replayable implementation manifest.",
    );
  }

  let parsed: ParsedMaterializedAction;
  try {
    parsed = await parseMaterializedAction(system, actionInput, budgets);
    source.candidateId = parsed.candidate.id;
    source.actionDegree = parsed.candidate.index;
    source.actionInputKind = parsed.inputKind;
    source.solverId = parsed.solverId;
    source.solverVersion = parsed.solverVersion;
    source.problemSha256 = parsed.problemSha256;
    metrics.generatorEntries = parsed.generatorEntries;
    metrics.logicalPackedActionBytes = parsed.logicalPackedActionBytes;
    hashes.materializedActionSha256 = parsed.declaredActionSha256;
    hashes.materializedActionBindingSha256 =
      parsed.materializedActionBindingSha256;
    setStage(
      stages,
      "materialized-action",
      "passed",
      parsed.inputKind === "packed-composite-artifact"
        ? "Complete permutation rows are well formed and match the packed solver action hash."
        : "The complete user-supplied permutation rows are well formed and were independently hashed before certification.",
    );
    claims.push(
      "complete materialized permutation rows independently rehashed",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status = error instanceof PipelineBudgetError ? "incomplete" : "failed";
    setStage(stages, "materialized-action", status, message);
    errors.push(message);
    if (status === "incomplete") {
      warnings.push(
        "A resource bound stopped replay; this does not show that a suitable cover or fibering does not exist.",
      );
    }
    return finish();
  }

  try {
    sphericalPlan = planSphericalSpecialSubgroups(
      system,
      options.sphericalPlanLimits,
    );
    metrics.sphericalSubsetCount = sphericalPlan.sphericalSubgroups.length;
    hashes.sphericalPlanSha256 = canonicalSha256(jsonClone(sphericalPlan));
    if (sphericalPlan.status !== "complete") {
      status = "incomplete";
      setStage(
        stages,
        "spherical-plan",
        "incomplete",
        "The configured spherical-subset limits prevented a complete plan.",
      );
      warnings.push(...sphericalPlan.warnings);
      return finish();
    }
    setStage(
      stages,
      "spherical-plan",
      "passed",
      `Enumerated all ${sphericalPlan.sphericalSubgroups.length} nonempty spherical special subgroups.`,
    );
    claims.push(
      "complete spherical-special-subgroup plan for the source system",
    );
  } catch (error) {
    status = "failed";
    const message = error instanceof Error ? error.message : String(error);
    setStage(stages, "spherical-plan", "failed", message);
    errors.push(message);
    return finish();
  }

  const torsionFreeCertificate = certifyTorsionFreeAction(
    system,
    parsed.candidate,
    sphericalPlan,
    options.actionCertification,
  );
  promotedEvidence.torsionFreeCertificate = torsionFreeCertificate;
  hashes.torsionFreeCertificateSha256 = canonicalSha256(
    jsonClone(torsionFreeCertificate),
  );
  if (torsionFreeCertificate.status !== "passed") {
    status = torsionFreeCertificate.status;
    setStage(
      stages,
      "spherical-freeness",
      torsionFreeCertificate.status,
      torsionFreeCertificate.errors.join(" ") ||
        "The complete spherical-action replay did not pass.",
    );
    errors.push(...torsionFreeCertificate.errors);
    warnings.push(...torsionFreeCertificate.warnings);
    return finish();
  }
  setStage(
    stages,
    "spherical-freeness",
    "passed",
    "Every spherical special subgroup has full-size orbits, so the point stabilizer is torsion-free.",
  );
  claims.push(
    "torsion-free point stabilizer certified by complete spherical freeness",
  );

  let quotient: QuotientComplex;
  try {
    const estimate = estimateQuotientSize(
      system,
      parsed.candidate.index,
      sphericalPlan,
    );
    metrics.quotientVertexCount = parsed.candidate.index;
    metrics.quotientEdgeCount = estimate.edgeCount;
    metrics.quotientTwoCellCount = estimate.twoCellCount;
    metrics.estimatedFullDavisCellCount = estimate.fullDavisCellCount;
    if (estimate.edgeCount > budgets.maxQuotientEdges) {
      throw new PipelineBudgetError(
        `The quotient needs ${estimate.edgeCount} oriented generator edges; the budget is ${budgets.maxQuotientEdges}.`,
      );
    }
    if (estimate.twoCellCount > budgets.maxQuotientTwoCells) {
      throw new PipelineBudgetError(
        `The quotient needs ${estimate.twoCellCount} rank-two cells; the budget is ${budgets.maxQuotientTwoCells}.`,
      );
    }
    const accepted = {
      candidate: parsed.candidate,
      certificate: torsionFreeCertificate,
    };
    quotient = acceptedActionToQuotientComplex(system, accepted, {
      subgroupName: `Stab(q0) from ${parsed.candidate.id}`,
    });
    quotientSummary = {
      name: quotient.name,
      vertexCount: quotient.vertices.length,
      edgeCount: quotient.edges.length,
      twoCellCount: quotient.twoCells.length,
    };
    hashes.quotientBindingSha256 = canonicalSha256({
      sourceSystemSha256,
      materializedActionSha256: parsed.declaredActionSha256,
      builder: "acceptedActionToQuotientComplex:v1",
      summary: quotientSummary,
    });
    setStage(
      stages,
      "quotient-2-skeleton",
      "passed",
      `Built the exact ${quotient.vertices.length}-vertex quotient with ${quotient.twoCells.length} rank-two cells.`,
    );
    claims.push(
      "exact quotient incidence constructed from the certified action",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status = error instanceof PipelineBudgetError ? "incomplete" : "failed";
    setStage(stages, "quotient-2-skeleton", status, message);
    errors.push(message);
    if (status === "incomplete") {
      warnings.push(
        "Quotient construction was skipped at a resource gate; no nonexistence conclusion follows.",
      );
    }
    return finish();
  }

  const rawLawfulSearch = searchLawfulSubcomplexCoorientations({
    quotient,
    options: {
      exactWallLimit:
        options.lawfulSearch?.exactWallLimit ??
        options.coorientationSearch?.exactWallLimit,
      maxCandidates:
        options.lawfulSearch?.maxCandidates ??
        options.coorientationSearch?.maxCandidates,
      timeBudgetMs:
        options.lawfulSearch?.timeBudgetMs ??
        options.coorientationSearch?.timeBudgetMs,
      deterministicCandidateBudgetOnly:
        options.lawfulSearch?.deterministicCandidateBudgetOnly ??
        options.coorientationSearch?.deterministicCandidateBudgetOnly,
      certificationComplex:
        options.lawfulSearch?.certificationComplex ?? "rank-two-lawful",
      applicability: options.lawfulSearch?.applicability,
      includeFullClosure: options.lawfulSearch?.includeFullClosure,
    },
  });
  const lawfulSearch = deterministicLawfulSearchResult(rawLawfulSearch);
  promotedEvidence.lawfulSearch = lawfulSearch;
  hashes.lawfulSearchSha256 = canonicalSha256(jsonClone(lawfulSearch));
  const lawfulCertificate = rawLawfulSearch.certificate;
  const lawfulCertificateReplay = rawLawfulSearch.certificateReplay;
  promotedEvidence.lawfulCertificate = lawfulCertificate;
  promotedEvidence.lawfulCertificateReplay = lawfulCertificateReplay;
  if (lawfulCertificate) {
    hashes.lawfulCertificateSha256 = canonicalSha256(
      jsonClone(lawfulCertificate),
    );
  }
  if (lawfulCertificateReplay) {
    hashes.lawfulCertificateReplaySha256 = lawfulCertificateReplay.replayHash;
  }
  const lawfulStatus = statusFromLawfulSearch(
    rawLawfulSearch,
    lawfulCertificateReplay,
    implementationManifestErrors.length === 0,
  );
  setStage(
    stages,
    "lawful-subcomplex",
    lawfulStatus,
    lawfulStatus === "passed"
      ? "The rank-two lawful complex passed exact metric-link asphericity, Morse-link, primitive-character, kernel-transfer, and action-rooted replay checks."
      : rawLawfulSearch.status === "not-found"
        ? "The exact wall-sign space contains no certificate under the lawful-subcomplex profile; the full Davis fallback will run."
        : rawLawfulSearch.status === "incomplete"
          ? `The bounded lawful search stopped with ${rawLawfulSearch.terminationReason}; the full Davis fallback will run.`
          : rawLawfulSearch.errors.join(" ") ||
            "The lawful-subcomplex profile did not certify.",
  );
  warnings.push(...rawLawfulSearch.warnings);
  if (rawLawfulSearch.errors.length > 0) {
    warnings.push(
      ...rawLawfulSearch.errors.map((error) => `Lawful track: ${error}`),
    );
  }
  if (lawfulStatus === "passed") {
    selectedTrack = "lawful-subcomplex";
    status = "passed";
    claims.push(
      "explicit virtual algebraic fibration certified by the lawful-subcomplex Morse and kernel-transfer track",
    );
    if (!options.alwaysRunFullDavis) {
      setStage(
        stages,
        "full-davis-fallback",
        "not-run",
        "Skipped because the cheaper lawful-subcomplex track already certified the algebraic fibration.",
      );
      return finish();
    }
  }

  if (
    (metrics.estimatedFullDavisCellCount ?? Number.POSITIVE_INFINITY) >
    budgets.maxFullDavisCells
  ) {
    const message = `The full Davis quotient needs about ${metrics.estimatedFullDavisCellCount} spherical cells; the budget is ${budgets.maxFullDavisCells}.`;
    setStage(stages, "full-davis-fallback", "incomplete", message);
    warnings.push(
      `${message} The lawful result, if passed, remains valid; otherwise this run is inconclusive.`,
    );
    if (selectedTrack === null) status = "incomplete";
    return finish();
  }

  const rawSearch = searchFullDavisWallCoorientations({
    quotient,
    options: options.coorientationSearch,
  });
  const coorientationSearch = deterministicSearchResult(rawSearch);
  promotedEvidence.coorientationSearch = coorientationSearch;
  hashes.coorientationSearchSha256 = canonicalSha256(
    jsonClone(coorientationSearch),
  );
  const fiberingCertificate = coorientationSearch.certificate;
  promotedEvidence.fiberingCertificate = fiberingCertificate;
  const fiberingCertificateReplay = fiberingCertificate
    ? verifyFullDavisVirtualFiberingCertificate(fiberingCertificate)
    : undefined;
  promotedEvidence.fiberingCertificateReplay = fiberingCertificateReplay;
  if (fiberingCertificate) {
    hashes.fiberingCertificateSha256 = canonicalSha256(
      jsonClone(fiberingCertificate),
    );
  }
  if (fiberingCertificateReplay) {
    hashes.fiberingCertificateReplaySha256 =
      fiberingCertificateReplay.replayHash;
    if (!fiberingCertificateReplay.valid) {
      errors.push(
        ...fiberingCertificateReplay.errors.map(
          (error) => `Full-Davis replay: ${error}`,
        ),
      );
    }
  }
  const fullDavisStatus = statusFromSearch(
    coorientationSearch,
    fiberingCertificateReplay,
    implementationManifestErrors.length === 0,
  );
  setStage(
    stages,
    "full-davis-fallback",
    fullDavisStatus,
    fullDavisStatus === "passed"
      ? "Found and independently replayed a primitive wall character that extends across every Coxeter cell and whose ascending and descending links pass the full Davis quotient checks."
      : fiberingCertificate?.status === "passed" &&
          fiberingCertificateReplay?.valid !== true
        ? "A candidate certificate was produced, but independent action-rooted replay did not pass. No fibering claim is promoted."
        : implementationManifestErrors.length > 0 &&
            fiberingCertificate?.status === "passed"
          ? "A candidate certificate passed mathematically, but its implementation manifest is missing or invalid. No archival claim is promoted."
          : coorientationSearch.errors.join(" ") ||
            `Search stopped with ${coorientationSearch.terminationReason}.`,
  );
  if (selectedTrack === null) {
    errors.push(...coorientationSearch.errors);
  } else if (coorientationSearch.errors.length > 0) {
    warnings.push(
      ...coorientationSearch.errors.map(
        (error) => `Optional full-Davis fallback: ${error}`,
      ),
    );
  }
  warnings.push(...coorientationSearch.warnings);
  if (fullDavisStatus === "passed") {
    if (selectedTrack === null) selectedTrack = "full-davis";
    status = "passed";
    claims.push(
      "explicit virtual algebraic fibration certified by the full Davis wall, Schreier, full-cell extension, pulling, and directed-link pipeline",
    );
  } else if (selectedTrack !== null) {
    status = "passed";
    warnings.push(
      "The optional full Davis fallback did not certify, but the independently replayed lawful track remains sufficient for virtual algebraic fibering.",
    );
  } else if (fullDavisStatus === "incomplete") {
    status = "incomplete";
    warnings.push(
      "The coorientation search was bounded. Failure to find a witness is inconclusive.",
    );
  } else if (coorientationSearch.status === "not-found") {
    status = "failed";
    nonClaims.push(
      "nonexistence outside the exhaustively searched wall-sign space for this quotient",
    );
  } else {
    status = fullDavisStatus;
  }
  return finish();
}

/**
 * Preferred name for the lawful-first, full-Davis-fallback promotion. The old
 * name remains exported so stored scripts from the full-Davis-only release do
 * not break.
 */
export async function promoteMaterializedActionToVirtualFibering(
  systemInput: unknown,
  actionInput: unknown,
  options: MaterializedActionPipelineOptions = {},
): Promise<MaterializedActionPromotionArtifact> {
  return promoteMaterializedActionToFullDavisFibering(
    systemInput,
    actionInput,
    options,
  );
}
