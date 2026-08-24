#!/usr/bin/env tsx

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CUBE_RESCUE_ALGORITHM_REVISION,
  CUBE_RESCUE_PRODUCTION_ORDER_KINDS,
  CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES,
  commitCubeRescueOriginalVertexCegar,
  commitCubeRescuePotentialSearch,
  computeCubeRescueTrialId,
  parseCubeRescueGenerationCheckpoint,
  replayCompactCubeBoundedRescueCertificate,
  sealCompactCubeBoundedRescueCertificate,
  sealCubeRescueGenerationCheckpoint,
  sealCubeRescueTrialRecord,
  selectCubeRescueMotifs,
  selectBestCubeRescueTrialId,
  type CompactCubeBoundedRescueCertificate,
  type CubeRescueTrialRecord,
} from "../src/fibering/cubeRescueCertificate";
import {
  extractCubeRescueSeparatorMotifs,
  readCubeRescueTemplateDerivedCacheMetrics,
  resetCubeRescueTemplateDerivedCacheMetrics,
  searchCubeRescuePeriodicPotential,
  type CubeRescuePotentialSearchBounds,
  type CubeRescueSubdivisionFamily,
} from "../src/fibering/cubeRescue";
import {
  buildCubeRescueVertexOrder,
  createCubeRescueLocalTemplateBuilder,
  cubeRescueSubdivisionVertexLinksAreCertified,
  type CubeRescueLocalTemplateBuilder,
  type CubeRescueOrderKind,
} from "../src/fibering/cubeRescueTopology";
import { loadCubeRescueAdaptiveArchive } from "../src/fibering/node/cubeRescueArchive";
import { loadCompactCubeRank19Inputs } from "../src/fibering/node/compactCubeRank19Inputs";
import { replayStreamedRank19AdaptiveRunnerArtifact } from "../src/fibering/streamedRank19Adaptive";
import {
  runCubeRescueOriginalVertexCegar,
  type CubeRescueOriginalVertexCegarBounds,
} from "../src/fibering/cubeRescueCegar";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

export const RANK19_CUBE_RESCUE_DEFAULT_OUTPUT =
  "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_bounded_rescue.json";

const DEFAULTS = {
  system: "public/examples/compact_5_cube_gamma1.json",
  certificate: "coxeter5cube_index17280/index17280_permutations.json.gz",
  generalizedCompression:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_compression.json",
  coreBasis:
    "scripts/certificates/torsion-free/compact_5_cube_h1_integral_core_basis.txt.gz",
  modularTranscript30011:
    "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p30011.txt.gz",
  modularTranscript32749:
    "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p32749.txt.gz",
  adaptive:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
  adaptiveManifest:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
  output: RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
  orderKinds: [...CUBE_RESCUE_PRODUCTION_ORDER_KINDS] as CubeRescueOrderKind[],
  subdivisionFamilies: [
    ...CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES,
  ] as CubeRescueSubdivisionFamily[],
  maxMotifs: 38,
  localBounds: {
    maxIterations: 2,
    beamWidth: 2,
    maxStates: 32,
    maxVariablesPerFailure: 4,
    maxCandidateValuesPerVariable: 4,
    maxAbsolutePotential: 32,
  } satisfies CubeRescuePotentialSearchBounds,
  globalCegarBounds: {
    maxRounds: 4,
    maxCounterexamplesPerRound: 1,
    constraintSearchBounds: {
      maxIterations: 3,
      beamWidth: 2,
      maxStates: 64,
      maxVariablesPerFailure: 6,
      maxCandidateValuesPerVariable: 5,
      maxAbsolutePotential: 64,
    },
  } satisfies CubeRescueOriginalVertexCegarBounds,
} as const;

interface Arguments {
  system: string;
  certificate: string;
  generalizedCompression: string;
  coreBasis: string;
  modularTranscript30011: string;
  modularTranscript32749: string;
  adaptive: string;
  adaptiveManifest: string;
  output: string;
  orderKinds: CubeRescueOrderKind[];
  subdivisionFamilies: CubeRescueSubdivisionFamily[];
  maxMotifs: number;
  localBounds: CubeRescuePotentialSearchBounds;
  globalCegarBounds: CubeRescueOriginalVertexCegarBounds;
  verifyOnly: boolean;
  overwrite: boolean;
}

export interface CompactCubeBoundedRescueRunnerArtifact {
  schemaVersion: 1;
  kind: "compact-5-cube-index34560-bounded-rescue-runner-artifact";
  certificate: CompactCubeBoundedRescueCertificate;
  replay: ReturnType<typeof replayCompactCubeBoundedRescueCertificate>;
  runner: {
    inputPaths: Record<string, string>;
    noGlobalNormalCatalogueLoaded: true;
    boundedSearchImplementation: "exact-integral-separator-threshold-cegar";
    elapsedSeconds: number;
  };
  artifactDigest: string;
}

const ORDER_KINDS = new Set<CubeRescueOrderKind>(
  CUBE_RESCUE_PRODUCTION_ORDER_KINDS,
);
const SUBDIVISION_FAMILIES = new Set<CubeRescueSubdivisionFamily>(
  CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES,
);

function portable(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

function booleanArgument(value: string | undefined, label: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${label} must be true or false.`);
}

function enumList<T extends string>(
  value: string | undefined,
  fallback: readonly T[],
  allowed: ReadonlySet<T>,
  label: string,
): T[] {
  const entries =
    value === undefined
      ? [...fallback]
      : (value.split(",").filter(Boolean) as T[]);
  if (entries.length === 0 || new Set(entries).size !== entries.length) {
    throw new Error(
      `${label} must be a nonempty comma-separated list without duplicates.`,
    );
  }
  for (const entry of entries) {
    if (!allowed.has(entry))
      throw new Error(`${label} contains unsupported value ${entry}.`);
  }
  return entries;
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error(
        "Arguments must be supplied as distinct --name value pairs.",
      );
    }
    values.set(key, value);
  }
  const known = new Set([
    "--system",
    "--certificate",
    "--generalized-compression",
    "--core-basis",
    "--modular-transcript-30011",
    "--modular-transcript-32749",
    "--adaptive",
    "--adaptive-manifest",
    "--output",
    "--orders",
    "--subdivisions",
    "--max-motifs",
    "--global-cegar-rounds",
    "--global-counterexamples-per-round",
    "--local-iterations",
    "--local-beam",
    "--local-states",
    "--local-variables",
    "--local-values",
    "--local-potential-bound",
    "--global-iterations",
    "--global-beam",
    "--global-states",
    "--global-variables",
    "--global-values",
    "--global-potential-bound",
    "--verify-only",
    "--overwrite",
  ]);
  for (const key of values.keys())
    if (!known.has(key)) throw new Error(`Unknown argument ${key}.`);
  const bounds = (
    prefix: "local" | "global",
    fallback: CubeRescuePotentialSearchBounds,
  ): CubeRescuePotentialSearchBounds => ({
    maxIterations: positiveInteger(
      values.get(`--${prefix}-iterations`),
      fallback.maxIterations,
      `${prefix} iterations`,
    ),
    beamWidth: positiveInteger(
      values.get(`--${prefix}-beam`),
      fallback.beamWidth,
      `${prefix} beam`,
    ),
    maxStates: positiveInteger(
      values.get(`--${prefix}-states`),
      fallback.maxStates,
      `${prefix} states`,
    ),
    maxVariablesPerFailure: positiveInteger(
      values.get(`--${prefix}-variables`),
      fallback.maxVariablesPerFailure,
      `${prefix} variables`,
    ),
    maxCandidateValuesPerVariable: positiveInteger(
      values.get(`--${prefix}-values`),
      fallback.maxCandidateValuesPerVariable,
      `${prefix} values`,
    ),
    maxAbsolutePotential: positiveInteger(
      values.get(`--${prefix}-potential-bound`),
      fallback.maxAbsolutePotential,
      `${prefix} potential bound`,
    ),
  });
  return {
    system: values.get("--system") ?? DEFAULTS.system,
    certificate: values.get("--certificate") ?? DEFAULTS.certificate,
    generalizedCompression:
      values.get("--generalized-compression") ??
      DEFAULTS.generalizedCompression,
    coreBasis: values.get("--core-basis") ?? DEFAULTS.coreBasis,
    modularTranscript30011:
      values.get("--modular-transcript-30011") ??
      DEFAULTS.modularTranscript30011,
    modularTranscript32749:
      values.get("--modular-transcript-32749") ??
      DEFAULTS.modularTranscript32749,
    adaptive: values.get("--adaptive") ?? DEFAULTS.adaptive,
    adaptiveManifest:
      values.get("--adaptive-manifest") ?? DEFAULTS.adaptiveManifest,
    output: values.get("--output") ?? DEFAULTS.output,
    orderKinds: enumList(
      values.get("--orders"),
      DEFAULTS.orderKinds,
      ORDER_KINDS,
      "orders",
    ),
    subdivisionFamilies: enumList(
      values.get("--subdivisions"),
      DEFAULTS.subdivisionFamilies,
      SUBDIVISION_FAMILIES,
      "subdivisions",
    ),
    maxMotifs: positiveInteger(
      values.get("--max-motifs"),
      DEFAULTS.maxMotifs,
      "max motifs",
    ),
    localBounds: bounds("local", DEFAULTS.localBounds),
    globalCegarBounds: {
      maxRounds: positiveInteger(
        values.get("--global-cegar-rounds"),
        DEFAULTS.globalCegarBounds.maxRounds,
        "global CEGAR rounds",
      ),
      maxCounterexamplesPerRound: positiveInteger(
        values.get("--global-counterexamples-per-round"),
        DEFAULTS.globalCegarBounds.maxCounterexamplesPerRound,
        "global counterexamples per round",
      ),
      constraintSearchBounds: bounds(
        "global",
        DEFAULTS.globalCegarBounds.constraintSearchBounds,
      ),
    },
    verifyOnly: booleanArgument(values.get("--verify-only"), "verify only"),
    overwrite: booleanArgument(values.get("--overwrite"), "overwrite"),
  };
}

function atomicJson(path: string, value: unknown, overwrite: boolean): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    if (!overwrite) {
      try {
        writeFileSync(target, "", { flag: "wx" });
      } catch {
        throw new Error(
          `${target} already exists; pass --overwrite true to replace it.`,
        );
      }
      unlinkSync(target);
    }
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The successful rename removed the temporary path.
    }
    throw error;
  }
}

function runnerArtifactDigest(
  value: CompactCubeBoundedRescueRunnerArtifact,
): string {
  return canonicalSha256({ ...value, artifactDigest: "" });
}

function parseStoredRunnerArtifact(
  path: string,
): CompactCubeBoundedRescueRunnerArtifact {
  const value = JSON.parse(
    readFileSync(resolve(path), "utf8"),
  ) as CompactCubeBoundedRescueRunnerArtifact;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "compact-5-cube-index34560-bounded-rescue-runner-artifact" ||
    runnerArtifactDigest(value) !== value.artifactDigest
  ) {
    throw new Error(
      "The stored bounded cube-rescue runner artifact is invalid.",
    );
  }
  return value;
}

export async function runRank19CubeRescue(
  argv: readonly string[] = process.argv.slice(2),
): Promise<CompactCubeBoundedRescueRunnerArtifact> {
  const started = performance.now();
  const args = parseArguments(argv);
  const stage = (message: string): void => {
    process.stderr.write(`[cube-rescue] ${message}\n`);
  };
  const adaptive = loadCubeRescueAdaptiveArchive({
    archive: args.adaptive,
    manifest: args.adaptiveManifest,
  });
  stage("replayed sealed adaptive archive and manifest");
  const loaded = loadCompactCubeRank19Inputs(
    {
      system: args.system,
      certificate: args.certificate,
      generalizedCompression: args.generalizedCompression,
      coreBasis: args.coreBasis,
      modularTranscript30011: args.modularTranscript30011,
      modularTranscript32749: args.modularTranscript32749,
    },
    stage,
  );
  const semanticReplay = replayStreamedRank19AdaptiveRunnerArtifact(
    adaptive.artifact,
    {
      oracle: loaded.oracle,
      generalizedCompression: loaded.generalizedCompression,
      h1Certificate: loaded.completion.certificate,
      cocycleBasis: loaded.completion.integralCocycleBasis,
    },
  );
  if (semanticReplay.status !== "passed") {
    throw new Error(
      `The adaptive semantic replay failed: ${semanticReplay.errors.join(" ")}`,
    );
  }
  stage(
    "replayed adaptive terminal result against exact quotient and H1 inputs",
  );
  const reportSource = adaptive.artifact.report.source;
  const source: CompactCubeBoundedRescueCertificate["source"] = {
    adaptiveArchivePath: portable(adaptive.archivePath),
    adaptiveArchiveSha256: adaptive.archiveSha256,
    adaptiveManifestDigest: adaptive.manifest.manifestDigest,
    adaptiveArtifactDigest: adaptive.artifact.artifactDigest,
    adaptiveReportDigest: adaptive.artifact.report.reportDigest,
    adaptiveSourceHash: reportSource.sourceHash,
    generalizedCompressionArchiveHash:
      loaded.generalizedCompression.archiveHash,
    h1CertificateDigest: loaded.completion.certificate.certificateDigest,
    latticeBasisDigest:
      loaded.completion.integralCocycleBasis.latticeBasisDigest,
    cocycleSectionDigest:
      loaded.completion.integralCocycleBasis.expectedCocycleSectionDigest,
    oracleStructureHash: loaded.oracle.structureHash,
    actionRowsCanonicalSha256: loaded.oracle.actionRowsCanonicalSha256,
    degree: 34_560,
    rank: 19,
  };
  if (
    reportSource.generalizedCompressionArchiveHash !==
      source.generalizedCompressionArchiveHash ||
    adaptive.artifact.report.h1CertificateDigest !==
      source.h1CertificateDigest ||
    reportSource.latticeBasisDigest !== source.latticeBasisDigest ||
    reportSource.cocycleSectionDigest !== source.cocycleSectionDigest ||
    reportSource.oracleStructureHash !== source.oracleStructureHash ||
    reportSource.actionRowsCanonicalSha256 !==
      source.actionRowsCanonicalSha256 ||
    loaded.oracle.degree !== 34_560
  ) {
    throw new Error(
      "The rescue source bindings do not agree with the sealed adaptive result.",
    );
  }
  const extraction = extractCubeRescueSeparatorMotifs(adaptive.artifact);
  const localPointIds = extraction.pointCensus.map(({ point }) => point);
  if (canonicalSha256(localPointIds) !== canonicalSha256([2, 4, 27])) {
    throw new Error(
      `Expected certified motif points q2,q4,q27; received ${localPointIds.join(",")}.`,
    );
  }
  let activeBuilderKind: CubeRescueOrderKind | undefined;
  let activeBuilder: CubeRescueLocalTemplateBuilder | undefined;
  const builder = (
    kind: CubeRescueOrderKind,
  ): CubeRescueLocalTemplateBuilder => {
    if (activeBuilderKind !== kind || !activeBuilder) {
      activeBuilder = createCubeRescueLocalTemplateBuilder({
        oracle: loaded.oracle,
        cocycleBasis: loaded.completion.integralCocycleBasis,
        generalizedCompression: loaded.generalizedCompression,
        order: buildCubeRescueVertexOrder(loaded.oracle.degree, kind),
      });
      activeBuilderKind = kind;
    }
    return activeBuilder;
  };
  const replayContext = {
    adaptiveArtifact: adaptive.artifact,
    degree: loaded.oracle.degree,
    source,
    adaptiveArchiveAndManifestReplayed: true,
    adaptiveSemanticReplayPassed: true,
    builder,
  } as const;
  if (args.verifyOnly) {
    const stored = parseStoredRunnerArtifact(args.output);
    const replay = replayCompactCubeBoundedRescueCertificate(
      stored.certificate,
      replayContext,
    );
    if (replay.status !== "passed") {
      throw new Error(
        `The stored cube rescue failed exact replay: ${replay.errors.join(" ")}`,
      );
    }
    if (canonicalSha256(replay) !== canonicalSha256(stored.replay)) {
      throw new Error(
        "The stored runner replay differs from the fresh exact certificate replay.",
      );
    }
    stage(
      `verified ${portable(args.output)} without loading the global normal catalogue`,
    );
    return stored;
  }

  const selected = selectCubeRescueMotifs(extraction, args.maxMotifs);
  const plannedTrialIds = args.orderKinds.flatMap((orderKind) => {
    const order = buildCubeRescueVertexOrder(loaded.oracle.degree, orderKind);
    return selected.flatMap((motif) =>
      args.subdivisionFamilies.map((subdivisionFamily) =>
        computeCubeRescueTrialId({
          sourceMotifId: motif.motifId,
          orderDigest: order.orderDigest,
          subdivisionFamily,
          localPointIds,
          localBounds: args.localBounds,
          globalCegarBounds: args.globalCegarBounds,
        }),
      ),
    );
  });
  const runBindingDigest = canonicalSha256({
    method: "compact-cube-rescue-generation-checkpoint-v1",
    algorithmRevision: CUBE_RESCUE_ALGORITHM_REVISION,
    source,
    motifDigest: extraction.motifDigest,
    selectedMotifIds: selected.map(({ motifId }) => motifId),
    planDigest: canonicalSha256(plannedTrialIds),
    orderKinds: args.orderKinds,
    subdivisionFamilies: args.subdivisionFamilies,
    localPointIds,
    localBounds: args.localBounds,
    globalCegarBounds: args.globalCegarBounds,
  });
  const checkpointPath = `${resolve(args.output)}.checkpoint.json`;
  const trials: CubeRescueTrialRecord[] = existsSync(checkpointPath)
    ? parseCubeRescueGenerationCheckpoint(
        JSON.parse(readFileSync(checkpointPath, "utf8")) as unknown,
        runBindingDigest,
        plannedTrialIds,
      ).trials
    : [];
  if (trials.length > 0) {
    stage(`resumed ${trials.length} completed trials from the checkpoint`);
  }
  let trialOrdinal = 0;
  const profiledTemplateFamilies = new Set<string>();
  for (const orderKind of args.orderKinds) {
    const order = buildCubeRescueVertexOrder(loaded.oracle.degree, orderKind);
    let templateBuilder: CubeRescueLocalTemplateBuilder | undefined;
    for (const motif of selected) {
      for (const subdivisionFamily of args.subdivisionFamilies) {
        const trialId = computeCubeRescueTrialId({
          sourceMotifId: motif.motifId,
          orderDigest: order.orderDigest,
          subdivisionFamily,
          localPointIds,
          localBounds: args.localBounds,
          globalCegarBounds: args.globalCegarBounds,
        });
        const checkpointTrial = trials[trialOrdinal];
        if (checkpointTrial !== undefined) {
          if (
            checkpointTrial.trialId !== trialId ||
            checkpointTrial.sourceMotifId !== motif.motifId ||
            checkpointTrial.orderKind !== orderKind ||
            checkpointTrial.orderId !== order.id ||
            checkpointTrial.orderDigest !== order.orderDigest ||
            checkpointTrial.subdivisionFamily !== subdivisionFamily ||
            checkpointTrial.sigma !== motif.sigma ||
            canonicalSha256(checkpointTrial.primitiveWitness) !==
              canonicalSha256(motif.primitiveWitness) ||
            canonicalSha256(checkpointTrial.localPointIds) !==
              canonicalSha256(localPointIds) ||
            canonicalSha256(checkpointTrial.localSearch.bounds) !==
              canonicalSha256(args.localBounds) ||
            (checkpointTrial.globalExpansion.status !== "not-run" &&
              canonicalSha256(checkpointTrial.globalExpansion.cegar.bounds) !==
                canonicalSha256(args.globalCegarBounds))
          ) {
            throw new Error(
              `Checkpoint trial ${trialOrdinal} is not the expected canonical execution-plan prefix.`,
            );
          }
          trialOrdinal += 1;
          continue;
        }
        const activeTemplateBuilder = (templateBuilder ??= builder(orderKind));
        const localTemplates = localPointIds.map((point) =>
          activeTemplateBuilder.build(point, subdivisionFamily),
        );
        const templateProfileKey = `${orderKind}:${subdivisionFamily}`;
        if (!profiledTemplateFamilies.has(templateProfileKey)) {
          profiledTemplateFamilies.add(templateProfileKey);
          stage(
            `${subdivisionFamily}/${orderKind} template sizes ${localTemplates
              .map(
                (template) =>
                  `q${template.point}:${template.vertices.length}v/${template.edges.length}e`,
              )
              .join(",")}`,
          );
        }
        resetCubeRescueTemplateDerivedCacheMetrics();
        const localSearch = searchCubeRescuePeriodicPotential({
          templates: localTemplates,
          primitiveWitness: motif.primitiveWitness,
          sigma: motif.sigma,
          bounds: args.localBounds,
        });
        let globalExpansion: CubeRescueTrialRecord["globalExpansion"] = {
          status: "not-run",
        };
        if (localSearch.status === "connector-found") {
          const cegar = runCubeRescueOriginalVertexCegar({
            builder: activeTemplateBuilder,
            subdivisionFamily,
            primitiveWitness: motif.primitiveWitness,
            sigma: motif.sigma,
            initialPointIds: localPointIds,
            initialPotential: localSearch.potential,
            bounds: args.globalCegarBounds,
          });
          globalExpansion = {
            status:
              cegar.status === "all-original-vertices-pass"
                ? "all-original-vertices-pass"
                : "stopped-within-bounds",
            cegar: commitCubeRescueOriginalVertexCegar(cegar),
          };
        }
        trials.push(
          sealCubeRescueTrialRecord({
            trialId,
            sourceMotifId: motif.motifId,
            primitiveWitness: [...motif.primitiveWitness],
            sigma: motif.sigma,
            orderKind,
            orderId: activeTemplateBuilder.order.id,
            orderDigest: activeTemplateBuilder.order.orderDigest,
            subdivisionFamily,
            localPointIds: [...localPointIds],
            localTemplateDigests: localTemplates.map(
              ({ templateDigest }) => templateDigest,
            ),
            localSearch: commitCubeRescuePotentialSearch(localSearch),
            globalExpansion,
          }),
        );
        trialOrdinal += 1;
        atomicJson(
          checkpointPath,
          sealCubeRescueGenerationCheckpoint({ runBindingDigest, trials }),
          true,
        );
        const cacheMetrics = readCubeRescueTemplateDerivedCacheMetrics();
        stage(
          `${subdivisionFamily}/${orderKind}/${motif.motifId.slice(0, 8)}: ${localSearch.status}${globalExpansion.status === "not-run" ? "" : `; global ${globalExpansion.status}`}; cache adjacency ${cacheMetrics.adjacencyHits}h/${cacheMetrics.adjacencyMisses}m, scale ${cacheMetrics.heightScaleHits}h/${cacheMetrics.heightScaleMisses}m`,
        );
      }
    }
  }
  if (trialOrdinal !== trials.length) {
    throw new Error(
      "The generation checkpoint contains trials beyond the canonical execution plan.",
    );
  }
  trials.sort((left, right) =>
    left.trialId < right.trialId ? -1 : left.trialId > right.trialId ? 1 : 0,
  );
  const bestTrialId = selectBestCubeRescueTrialId(trials);
  const productionCartesianPortfolioComplete =
    selected.length === extraction.motifs.length &&
    canonicalSha256(args.orderKinds) ===
      canonicalSha256(CUBE_RESCUE_PRODUCTION_ORDER_KINDS) &&
    canonicalSha256(args.subdivisionFamilies) ===
      canonicalSha256(CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES) &&
    trials.length ===
      extraction.motifs.length *
        CUBE_RESCUE_PRODUCTION_ORDER_KINDS.length *
        CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES.length;
  const checks: CompactCubeBoundedRescueCertificate["checks"] = {
    adaptiveArchiveAndManifestReplayed: true,
    adaptiveSemanticReplayPassed: true,
    sourceBindingsAgree: true,
    allSeparatorLeavesExtracted:
      extraction.terminalPruneCount === extraction.motifs.length,
    allSeparatorMotifsSelected: selected.length === extraction.motifs.length,
    productionCartesianPortfolioComplete,
    onlyThreeCertifiedMotifPointsUsed: true,
    noGlobalNormalCatalogueRecomputed: true,
    everyTrialDigestValid: true,
    everyLocalConnectorExactlyReplayed: true,
    boundedGlobalStatusHonest: trials.every(
      (trial) =>
        trial.globalExpansion.status !== "all-original-vertices-pass" ||
        (trial.globalExpansion.cegar.status === "all-original-vertices-pass" &&
          trial.globalExpansion.cegar.checkedAllOriginalVerticesInFinalRound),
    ),
    everyOriginalVertexPassCoversSubdivisionVertices: trials.every(
      (trial) =>
        trial.globalExpansion.status !== "all-original-vertices-pass" ||
        cubeRescueSubdivisionVertexLinksAreCertified(
          trial.globalExpansion.cegar.subdivisionVertexLinks,
        ),
    ),
  };
  const certificate = sealCompactCubeBoundedRescueCertificate({
    schemaVersion: 1,
    kind: "compact-5-cube-index34560-bounded-track-b-rescue",
    method:
      "sealed-separator-motifs-periodic-potentials-and-compatible-subdivision-portfolio",
    source,
    motifExtraction: extraction,
    selectedMotifIds: selected.map(({ motifId }) => motifId),
    portfolio: {
      algorithmRevision: CUBE_RESCUE_ALGORITHM_REVISION,
      orderKinds: [...args.orderKinds],
      subdivisionFamilies: [...args.subdivisionFamilies],
      localPointIds,
      localBounds: { ...args.localBounds },
      globalCegarBounds: {
        ...args.globalCegarBounds,
        constraintSearchBounds: {
          ...args.globalCegarBounds.constraintSearchBounds,
        },
      },
    },
    trials,
    bestTrialId,
    checks,
    claims: [
      `Exactly extracted ${extraction.terminalPruneCount} separator leaves at q${localPointIds.join(",q")} from the sealed rank-19 adaptive artifact.`,
      `Selected ${selected.length} of ${extraction.motifs.length} sealed separator witnesses and evaluated ${trials.length} declared witness/order/subdivision trials with integral affine height numerators under the recorded finite bounds.`,
      `The local bounded benchmark used at most ${args.localBounds.maxIterations} iterations, beam ${args.localBounds.beamWidth}, ${args.localBounds.maxStates} states, ${args.localBounds.maxVariablesPerFailure} variables per failure, ${args.localBounds.maxCandidateValuesPerVariable} values per variable, and absolute potential ${args.localBounds.maxAbsolutePotential}.`,
      "Any recorded connector has connected, nonempty ascending and descending link graphs at every point explicitly listed in that trial.",
      "For maximal-simplex stellar trials, every introduced center link is certified as a simplex boundary whose ascending and descending induced subcomplexes are nonempty contractible faces.",
    ],
    nonClaims: [
      "This bounded portfolio does not prove that the subgroup fibers or fails to fiber, and it does not determine its BNS invariant.",
      "A not-found local result is not infeasibility outside the recorded witnesses, total orders, subdivision families, integer thresholds, beam width, or potential bound.",
      "Only a CEGAR status of all-original-vertices-pass has scanned all 34,560 original quotient vertices; every other global branch stopped at an explicit solver or round bound.",
      "No asphericity, contractibility, manifold, or finiteness property of a kernel follows from this artifact alone.",
      "The 46,275-normal catalogue was neither loaded nor recomputed by this runner.",
    ],
  });
  const replay = replayCompactCubeBoundedRescueCertificate(
    certificate,
    replayContext,
  );
  if (replay.status !== "passed") {
    throw new Error(
      `The newly generated cube rescue failed replay: ${replay.errors.join(" ")}`,
    );
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-index34560-bounded-rescue-runner-artifact" as const,
    certificate,
    replay,
    runner: {
      inputPaths: {
        ...Object.fromEntries(
          Object.entries(loaded.paths).map(([name, path]) => [
            name,
            portable(path),
          ]),
        ),
        adaptive: portable(adaptive.archivePath),
        adaptiveManifest: portable(adaptive.manifestPath),
      },
      noGlobalNormalCatalogueLoaded: true as const,
      boundedSearchImplementation:
        "exact-integral-separator-threshold-cegar" as const,
      elapsedSeconds: (performance.now() - started) / 1_000,
    },
    artifactDigest: "",
  };
  const artifact: CompactCubeBoundedRescueRunnerArtifact = {
    ...withoutDigest,
    artifactDigest: canonicalSha256(withoutDigest),
  };
  atomicJson(args.output, artifact, args.overwrite);
  try {
    unlinkSync(checkpointPath);
  } catch {
    stage(
      `kept generation checkpoint ${portable(checkpointPath)}; the final artifact was written successfully`,
    );
  }
  stage(`wrote ${portable(args.output)} with status ${certificate.status}`);
  return artifact;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runRank19CubeRescue().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
