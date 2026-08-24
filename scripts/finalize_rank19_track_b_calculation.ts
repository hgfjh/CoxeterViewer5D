#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  replayStreamedRank19GlobalNormalCatalogue,
  replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs,
  type StreamedRank19GlobalNormalArtifact,
} from "../src/fibering/node/streamedRank19GlobalNormalCatalogue";
import { loadCompactCubeRank19Inputs } from "../src/fibering/node/compactCubeRank19Inputs";
import {
  replayStreamedRank19AdaptiveArchiveManifest,
  replayStreamedRank19AdaptiveTerminalEnvelope,
  STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES,
} from "../src/fibering/node/streamedRank19AdaptiveArchive";
import type { StreamedH1CompleteLatticeCertificate } from "../src/fibering/streamedH1Completion";
import {
  bindStreamedFullH1Lattice,
  type StreamedFullH1LatticeBinding,
} from "../src/fibering/streamedRank19TrackB";
import {
  replayStreamedRank19AdaptiveRunnerArtifact,
  type StreamedRank19AdaptiveRunnerArtifact,
} from "../src/fibering/streamedRank19Adaptive";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

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
  h1: "scripts/certificates/torsion-free/compact_5_cube_index34560_h1.json",
  globalCatalogue:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_global_normals.json.gz",
  globalManifest:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_global_normals.archive.json",
  adaptive:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
  adaptiveManifest:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
  output:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_track_b_final.json",
} as const;

interface Arguments {
  system: string;
  certificate: string;
  generalizedCompression: string;
  coreBasis: string;
  modularTranscript30011: string;
  modularTranscript32749: string;
  h1: string;
  globalCatalogue: string;
  globalManifest: string;
  adaptive: string;
  adaptiveManifest: string;
  output: string;
  verifyOnly: boolean;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portable(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${path} is not a bounded regular file.`);
  }
  return readFileSync(path);
}

function parseJson(bytes: Buffer, path: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decodeJson(
  path: string,
  compressedLimit: number,
  decodedLimit: number,
) {
  const container = boundedFile(path, compressedLimit);
  const gzip = container[0] === 0x1f && container[1] === 0x8b;
  const decoded = gzip
    ? gunzipSync(container, { maxOutputLength: decodedLimit })
    : container;
  return { container, decoded, encoding: gzip ? "gzip-json" : "json" } as const;
}

function parseBoolean(value: string | undefined, label: string): boolean {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function fullH1MathematicalBindingDigest(
  binding: StreamedFullH1LatticeBinding,
): string {
  return canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-full-h1-mathematical-binding",
    preparationDigest: binding.preparationDigest,
    oracleStructureHash: binding.oracleStructureHash,
    actionRowsCanonicalSha256: binding.actionRowsCanonicalSha256,
    fullLatticeBasisDigest: binding.fullLatticeBasisDigest,
    fullCocycleSectionDigest: binding.fullCocycleSectionDigest,
    h1Rank: binding.h1Rank,
    h1IsomorphicTo: binding.h1IsomorphicTo,
    integralBasisIds: binding.integralBasisIds,
    fullIntegralBasisCertified: binding.fullIntegralBasisCertified,
    wallSublatticeRank: binding.wallSublatticeRank,
    wallIndexInFullH1: binding.wallIndexInFullH1,
    wallSaturationDefect: binding.wallSaturationDefect,
    h1ModuloWall: binding.h1ModuloWall,
  });
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
      throw new Error("Arguments must be supplied as --name value pairs.");
    }
    values.set(key, value);
  }
  const keys = [
    "system",
    "certificate",
    "generalized-compression",
    "core-basis",
    "modular-transcript-30011",
    "modular-transcript-32749",
    "h1",
    "global-catalogue",
    "global-manifest",
    "adaptive",
    "adaptive-manifest",
    "output",
    "verify-only",
  ];
  for (const key of values.keys()) {
    if (!keys.includes(key.slice(2)))
      throw new Error(`Unknown argument ${key}.`);
  }
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
    h1: values.get("--h1") ?? DEFAULTS.h1,
    globalCatalogue:
      values.get("--global-catalogue") ?? DEFAULTS.globalCatalogue,
    globalManifest: values.get("--global-manifest") ?? DEFAULTS.globalManifest,
    adaptive: values.get("--adaptive") ?? DEFAULTS.adaptive,
    adaptiveManifest:
      values.get("--adaptive-manifest") ?? DEFAULTS.adaptiveManifest,
    output: values.get("--output") ?? DEFAULTS.output,
    verifyOnly: parseBoolean(values.get("--verify-only"), "--verify-only"),
  };
}

function archiveManifestChecks(
  manifest: unknown,
  archivePath: string,
  container: Buffer,
  decoded: Buffer,
  catalogue: StreamedRank19GlobalNormalArtifact,
  replay: ReturnType<typeof replayStreamedRank19GlobalNormalCatalogue>,
): boolean {
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    return false;
  }
  const record = manifest as Record<string, unknown>;
  const archive = record.archive as Record<string, unknown> | undefined;
  const payload = record.decoded as Record<string, unknown> | undefined;
  const compression = record.compression as Record<string, unknown> | undefined;
  if (
    archive === undefined ||
    payload === undefined ||
    compression?.method !== "node-zlib-gzip-level-9" ||
    typeof compression.nodeVersion !== "string" ||
    compression.nodeVersion.length === 0 ||
    typeof compression.zlibVersion !== "string" ||
    compression.zlibVersion.length === 0 ||
    container[0] !== 0x1f ||
    container[1] !== 0x8b ||
    !Object.values(replay.checks).every(Boolean)
  ) {
    return false;
  }
  const withoutDigest = {
    schemaVersion: 1,
    kind: "streamed-rank19-global-normal-catalogue-archive",
    archive: {
      path: portable(archivePath),
      encoding: "gzip-json",
      byteLength: container.byteLength,
      sha256: sha256(container),
    },
    decoded: {
      byteLength: decoded.byteLength,
      sha256: sha256(decoded),
      artifactDigest: catalogue.artifactDigest,
      bindingDigest: catalogue.binding.bindingDigest,
      normalCatalogueDigest: catalogue.normalCatalogueDigest,
      chunkManifestDigest: catalogue.chunkManifestDigest,
      degree: catalogue.degree,
      rank: catalogue.rank,
      germOccurrenceCount: catalogue.germOccurrenceCount,
      identicallyZeroGermCount: catalogue.identicallyZeroGermCount,
      normalCount: catalogue.normalCount,
    },
    replayChecks: replay.checks,
    compression: {
      method: "node-zlib-gzip-level-9",
      nodeVersion: compression.nodeVersion,
      zlibVersion: compression.zlibVersion,
    },
    manifestDigest: "",
  };
  const expected = {
    ...withoutDigest,
    manifestDigest: canonicalSha256(withoutDigest),
  };
  return canonicalSha256(record) === canonicalSha256(expected);
}

function atomicWrite(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // A successful rename already removed the temporary path.
    }
    throw error;
  }
}

function calculate(args: Arguments) {
  const paths = {
    h1: resolve(args.h1),
    globalCatalogue: resolve(args.globalCatalogue),
    globalManifest: resolve(args.globalManifest),
    adaptive: resolve(args.adaptive),
    adaptiveManifest: resolve(args.adaptiveManifest),
  };
  const loaded = loadCompactCubeRank19Inputs({
    system: args.system,
    certificate: args.certificate,
    generalizedCompression: args.generalizedCompression,
    coreBasis: args.coreBasis,
    modularTranscript30011: args.modularTranscript30011,
    modularTranscript32749: args.modularTranscript32749,
  });

  const h1Bytes = boundedFile(paths.h1, 4 * 1024 * 1024);
  const h1Report = parseJson(h1Bytes, paths.h1) as Record<string, unknown>;
  const h1Completion = h1Report.completion as
    | StreamedH1CompleteLatticeCertificate
    | undefined;
  const { reportDigest: storedH1ReportDigest, ...h1WithoutDigest } = h1Report;
  let trackedH1Binding: StreamedFullH1LatticeBinding | undefined;
  let trackedH1BindingError = "";
  try {
    if (h1Completion === undefined) {
      throw new Error("The tracked H1 report has no completion certificate.");
    }
    trackedH1Binding = bindStreamedFullH1Lattice(h1Completion);
  } catch (error) {
    trackedH1BindingError =
      error instanceof Error ? error.message : String(error);
  }
  const runtimeH1MathematicalBindingDigest = fullH1MathematicalBindingDigest(
    loaded.h1Binding,
  );
  const trackedH1MathematicalBindingDigest = trackedH1Binding
    ? fullH1MathematicalBindingDigest(trackedH1Binding)
    : undefined;
  const h1ReportValid =
    h1Report.status === "passed" &&
    storedH1ReportDigest === canonicalSha256(h1WithoutDigest) &&
    trackedH1Binding !== undefined &&
    trackedH1MathematicalBindingDigest === runtimeH1MathematicalBindingDigest &&
    h1Completion !== undefined &&
    canonicalSha256(h1Completion.result) ===
      canonicalSha256(loaded.completion.certificate.result);

  const globalPayload = decodeJson(
    paths.globalCatalogue,
    32 * 1024 * 1024,
    256 * 1024 * 1024,
  );
  const globalCatalogue = parseJson(
    globalPayload.decoded,
    paths.globalCatalogue,
  ) as StreamedRank19GlobalNormalArtifact;
  const globalReplay =
    replayStreamedRank19GlobalNormalCatalogue(globalCatalogue);
  const globalManifestBytes = boundedFile(
    paths.globalManifest,
    4 * 1024 * 1024,
  );
  const globalManifest = parseJson(globalManifestBytes, paths.globalManifest);
  const globalManifestValid = archiveManifestChecks(
    globalManifest,
    paths.globalCatalogue,
    globalPayload.container,
    globalPayload.decoded,
    globalCatalogue,
    globalReplay,
  );

  const adaptivePayload = decodeJson(
    paths.adaptive,
    STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
    STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
  );
  const adaptive = parseJson(
    adaptivePayload.decoded,
    paths.adaptive,
  ) as StreamedRank19AdaptiveRunnerArtifact;
  const adaptiveTerminalEnvelopeReplay =
    replayStreamedRank19AdaptiveTerminalEnvelope(adaptive);
  const adaptiveManifestBytes = boundedFile(
    paths.adaptiveManifest,
    STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES,
  );
  const adaptiveManifest = parseJson(
    adaptiveManifestBytes,
    paths.adaptiveManifest,
  );
  const adaptiveManifestReplay = replayStreamedRank19AdaptiveArchiveManifest(
    adaptiveManifest,
    {
      archivePath: portable(paths.adaptive),
      archiveBytes: adaptivePayload.container,
      decodedBytes: adaptivePayload.decoded,
      terminalReplay: adaptiveTerminalEnvelopeReplay,
    },
  );
  if (
    adaptivePayload.encoding !== "gzip-json" ||
    adaptiveTerminalEnvelopeReplay.status !== "passed" ||
    adaptiveManifestReplay.status !== "passed"
  ) {
    throw new Error(
      `The adaptive archive failed bounded packaging replay: terminal envelope ${adaptiveTerminalEnvelopeReplay.errors.join(" ")} manifest ${adaptiveManifestReplay.errors.join(" ")}`,
    );
  }
  const adaptiveReplay = replayStreamedRank19AdaptiveRunnerArtifact(adaptive, {
    oracle: loaded.oracle,
    generalizedCompression: loaded.generalizedCompression,
    h1Certificate: loaded.completion.certificate,
    cocycleBasis: loaded.completion.integralCocycleBasis,
  });
  const terminal =
    adaptive.report.status === "invariant-obstruction-cover" ||
    adaptive.report.status === "global-passing-witness";
  const sourceBindingsAgree =
    globalCatalogue.binding.source.degree === adaptive.report.source.degree &&
    globalCatalogue.binding.source.sourceHash ===
      adaptive.report.source.sourceHash &&
    globalCatalogue.binding.source.oracleStructureHash ===
      adaptive.report.source.oracleStructureHash &&
    globalCatalogue.binding.source.actionRowsCanonicalSha256 ===
      adaptive.report.source.actionRowsCanonicalSha256 &&
    globalCatalogue.binding.source.generalizedCompressionArchiveHash ===
      adaptive.report.source.generalizedCompressionArchiveHash &&
    globalCatalogue.binding.h1.preparationDigest ===
      loaded.h1Binding.preparationDigest &&
    adaptive.report.h1CertificateDigest ===
      loaded.completion.certificate.certificateDigest &&
    globalCatalogue.binding.h1.fullLatticeBasisDigest ===
      adaptive.report.source.latticeBasisDigest &&
    globalCatalogue.binding.h1.fullCocycleSectionDigest ===
      adaptive.report.source.cocycleSectionDigest &&
    globalCatalogue.binding.preflightStream.heightRule.heightRuleDigest ===
      adaptive.report.source.heightRuleDigest;

  const degree = loaded.oracle.degree;
  const preliminaryChecks = {
    h1ReportReplayedAndBound: h1ReportValid,
    globalCatalogueInternalReplayPassed: globalReplay.status === "passed",
    globalArchiveManifestValid: globalManifestValid,
    adaptiveArchiveIsBoundedGzip: adaptivePayload.encoding === "gzip-json",
    adaptiveTerminalEnvelopeValid:
      adaptiveTerminalEnvelopeReplay.status === "passed",
    adaptiveArchiveManifestValid: adaptiveManifestReplay.status === "passed",
    adaptiveTerminal: terminal,
    adaptiveArtifactAndAllFinalLinksReplayed:
      adaptiveReplay.status === "passed",
    sourceH1CompressionAndHeightBindingsAgree: sourceBindingsAgree,
    integralMainTermStrictlyDominatesTieOffset:
      4 * degree > degree - 1 && degree === 34_560,
  };
  if (!Object.values(preliminaryChecks).every(Boolean)) {
    throw new Error(
      `The rigorous rank-19 finalizer failed preliminary checks before global chunk regeneration: ${Object.entries(
        preliminaryChecks,
      )
        .filter(([, passed]) => !passed)
        .map(([name]) => name)
        .join(
          ", ",
        )}. H1 binding: ${trackedH1BindingError} Global replay: ${globalReplay.errors.join(" ")} Adaptive replay: ${adaptiveReplay.errors.join(" ")}`,
    );
  }

  const globalExactReplay =
    replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(
      globalCatalogue,
      {
        oracle: loaded.oracle,
        generalizedCompression: loaded.generalizedCompression,
        cocycleBasis: loaded.completion.integralCocycleBasis,
        h1Certificate: loaded.completion.certificate,
        onChunkReplayed(progress) {
          process.stderr.write(
            `[rank19-finalizer] exactly replayed global-normal chunk ${progress.chunkIndex + 1}/${progress.chunkCount} (q${progress.firstPoint}..q${progress.lastPointExclusive - 1})\n`,
          );
        },
      },
    );
  const checks = {
    ...preliminaryChecks,
    globalCatalogueReplayedAgainstExactInputs:
      globalExactReplay.status === "passed",
    archivedAndRuntimeH1MathematicalBindingsAgree:
      globalExactReplay.checks.freshMathematicalBindingMatches,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(
      `The rigorous rank-19 finalizer failed exact global-catalogue replay: ${globalExactReplay.errors.join(" ")}`,
    );
  }

  const result = loaded.completion.certificate.result;
  const conclusion =
    adaptive.report.status === "invariant-obstruction-cover"
      ? "all-nonzero-integral-characters-obstructed-for-this-track-b-height-complex"
      : "global-passing-primitive-integral-character-found";
  const claims = [
    `H^1(G;Z) is ${result.h1IsomorphicTo}; L_wall has rank ${result.wallSublatticeRank}, saturation index ${result.wallSublatticeIndexInSaturation}, and quotient ${result.quotientByWallLattice}.`,
    `The exact integral sign arrangement has ${globalCatalogue.normalCount} distinct primitive raw-difference hyperplanes from ${globalCatalogue.germOccurrenceCount} germ occurrences, including ${globalCatalogue.identicallyZeroGermCount} identically-zero germs handled by the point-order tie rule.`,
    ...(adaptive.report.status === "invariant-obstruction-cover"
      ? [
          "For both tie polarities, the replayed invariant cone cover certifies a directed-link obstruction for every nonzero primitive integral character, including every omitted zero-sign refinement.",
        ]
      : [
          "The displayed primitive integral character and its antipode pass the replayed directed-link test at every quotient point for the two tie polarities.",
        ]),
  ];
  const nonClaims = [
    "The central raw-difference arrangement is exact for integral characters; it is not the translated affine arrangement for arbitrary real weights.",
    "Invariant obstruction leaves are proof regions, not literal arrangement faces: one leaf may certify many zero-sign refinements, and no literal face enumeration or face count is claimed.",
    "A negative result is scoped to the retained full generalized-compression complex and this pulling-height/tie rule; it is not a nonfibering theorem for every subdivision or finite cover.",
  ];
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-rank19-rigorous-track-b-calculation" as const,
    status: "passed" as const,
    conclusion,
    h1: {
      path: portable(paths.h1),
      fileSha256: sha256(h1Bytes),
      reportDigest: h1Report.reportDigest,
      runtimeCompletionCertificateDigest:
        loaded.completion.certificate.certificateDigest,
      trackedReportCompletionCertificateDigest: h1Completion?.certificateDigest,
      runtimeMathematicalBindingDigest: runtimeH1MathematicalBindingDigest,
      trackedReportMathematicalBindingDigest:
        trackedH1MathematicalBindingDigest,
      result,
    },
    integralHeightArrangement: {
      archivePath: portable(paths.globalCatalogue),
      archiveSha256: sha256(globalPayload.container),
      archiveManifestPath: portable(paths.globalManifest),
      archiveManifestSha256: sha256(globalManifestBytes),
      archiveManifestDigest: (globalManifest as Record<string, unknown>)
        .manifestDigest,
      decodedSha256: sha256(globalPayload.decoded),
      artifactDigest: globalCatalogue.artifactDigest,
      bindingDigest: globalCatalogue.binding.bindingDigest,
      archivedCompletionCertificateDigest:
        globalCatalogue.binding.h1.certificateDigest,
      freshReplayCompletionCertificateDigest:
        globalExactReplay.freshCompletionCertificateDigest,
      mathematicalBindingDigest: globalExactReplay.mathematicalBindingDigest,
      normalCatalogueDigest: globalCatalogue.normalCatalogueDigest,
      chunkManifestDigest: globalCatalogue.chunkManifestDigest,
      degree: globalCatalogue.degree,
      rank: globalCatalogue.rank,
      germOccurrenceCount: globalCatalogue.germOccurrenceCount,
      identicallyZeroGermCount: globalCatalogue.identicallyZeroGermCount,
      normalCount: globalCatalogue.normalCount,
      exactIntegralSignLemma: {
        clearedDifferenceFormula:
          "4*degree*dot(rawDifferenceNormal,w)+sigma*(otherPoint-point)",
        minimumAbsoluteNonzeroMainTerm: 4 * degree,
        maximumAbsoluteTieOffset: degree - 1,
        consequence:
          "raw nonzero dot products determine the sign; raw zero dot products use sigma*sign(otherPoint-point); the cleared difference never vanishes",
      },
      archiveReplay: globalReplay,
      exactRegenerationReplay: globalExactReplay,
    },
    trackB: {
      archivePath: portable(paths.adaptive),
      archiveSha256: sha256(adaptivePayload.container),
      archiveByteLength: adaptivePayload.container.byteLength,
      archiveManifestPath: portable(paths.adaptiveManifest),
      archiveManifestSha256: sha256(adaptiveManifestBytes),
      archiveManifestDigest: (adaptiveManifest as Record<string, unknown>)
        .manifestDigest,
      decodedSha256: sha256(adaptivePayload.decoded),
      decodedByteLength: adaptivePayload.decoded.byteLength,
      artifactDigest: adaptive.artifactDigest,
      reportDigest: adaptive.report.reportDigest,
      completionCertificateDigest: adaptive.report.h1CertificateDigest,
      searchStatus: adaptive.report.status,
      selectedPointIds:
        adaptive.report.search.iterations.at(-1)?.testedPointIds ?? [],
      terminalEnvelopeReplay: adaptiveTerminalEnvelopeReplay,
      archiveManifestReplay: adaptiveManifestReplay,
      semanticReplay: adaptiveReplay,
    },
    checks,
    claims,
    nonClaims,
    calculationDigest: "",
  };
  return {
    ...withoutDigest,
    calculationDigest: canonicalSha256(withoutDigest),
  };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = resolve(args.output);
  const calculated = calculate(args);
  if (args.verifyOnly) {
    const stored = parseJson(
      boundedFile(outputPath, 16 * 1024 * 1024),
      outputPath,
    );
    if (canonicalSha256(stored) !== canonicalSha256(calculated)) {
      throw new Error(
        "The stored final calculation differs from fresh replay.",
      );
    }
    process.stdout.write(`${JSON.stringify(calculated, null, 2)}\n`);
    return;
  }
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to replace existing output ${outputPath}.`);
  }
  atomicWrite(
    outputPath,
    Buffer.from(`${JSON.stringify(calculated, null, 2)}\n`),
  );
  process.stdout.write(`${JSON.stringify(calculated, null, 2)}\n`);
}

main();
