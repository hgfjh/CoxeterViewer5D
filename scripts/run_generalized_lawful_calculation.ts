#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import {
  buildGeneralizedCompressionCertificate,
  type GeneralizedCompressionCertificate,
} from "../src/davis/generalizedCompression";
import {
  buildDirectCellwiseAffineCertificate,
  replayDirectCellwiseAffineCertificate,
  type DirectCellwiseAffineCertificate,
} from "../src/fibering/directCellwiseAffine";
import {
  buildGeneralizedLawfulCertificateFromStreamed,
  buildGeneralizedLawfulClosureAndAsphericityFromStreamed,
  computeGeneralizedLawfulDirectedLinkAtPointFromStreamed,
  type GeneralizedLawfulCertificate,
  type GeneralizedLawfulClosureAndAsphericityResult,
  type GeneralizedLawfulDirectedLinkPointResult,
} from "../src/fibering/generalizedLawfulCertificate";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedNativeVertexLinkPrefilterResult,
} from "../src/fibering/streamedLawfulDavis";
import {
  adaptExactPermutationCertificate,
  replayExactPermutationActionArtifact,
} from "../src/torsionFree/exactPermutationArtifact";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
} from "../src/torsionFree";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

interface Arguments {
  system: string;
  certificate: string;
  checksumManifest?: string;
  output?: string;
  character: number[];
  masks?: number[];
  calculateActualLinks: boolean;
  linkScan: "exhaustive" | "stop-on-first-failure";
  calculateDirectCellwise: boolean;
  directAffineScan: "exhaustive" | "stop-on-first-obstruction";
  directLinkScan: "exhaustive" | "stop-on-first-failure";
  replayDirectCellwise: boolean;
  generalizedCompressionInput?: string;
  generalizedCompressionOutput?: string;
  targetedPoints?: number[];
  targetedWitnesses?: Array<{ mask: number; point: number }>;
}

const MAX_SYSTEM_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_CERTIFICATE_BYTES = 128 * 1024 * 1024;
const MAX_DECOMPRESSED_CERTIFICATE_BYTES = 256 * 1024 * 1024;
const MAX_CHECKSUM_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_GENERALIZED_COMPRESSION_BYTES = 64 * 1024 * 1024;
const MAX_TARGETED_REPLAYS = 4096;

interface CompactDirectedLinkSummary {
  representation: string;
  scanMode: GeneralizedLawfulCertificate["directedLinks"]["scanMode"];
  scanOutcome: GeneralizedLawfulCertificate["directedLinks"]["scanOutcome"];
  checkedOriginalVertexCount: number;
  introducedVertexIds: string[];
  checks: GeneralizedLawfulCertificate["directedLinks"]["checks"];
  morseCondition: GeneralizedLawfulCertificate["directedLinks"]["morseCondition"];
  failurePointCounts: {
    ascendingEmpty: number;
    ascendingDisconnected: number;
    descendingEmpty: number;
    descendingDisconnected: number;
  };
  ascendingComponentHistogram: Record<string, number>;
  descendingComponentHistogram: Record<string, number>;
  linksDigest: string;
  witnesses: GeneralizedLawfulCertificate["directedLinks"]["witnesses"];
  nonClaims: string[];
}

interface CompactCandidateResult {
  mask: number;
  maskHex: string;
  candidateId: string;
  wallSigns: Record<string, 1 | -1>;
  artifactHash: string;
  status: GeneralizedLawfulCertificate["status"];
  sourceHash: string;
  retention: GeneralizedLawfulCertificate["retention"];
  subdivision: GeneralizedLawfulCertificate["subdivision"];
  height: GeneralizedLawfulCertificate["height"];
  directedLinks: CompactDirectedLinkSummary;
  asphericity: GeneralizedLawfulCertificate["asphericity"];
  errors: string[];
  nonClaims: string[];
}

interface CompactClosureAndAsphericityResult {
  mask: number;
  maskHex: string;
  candidateId: string;
  wallSigns: Record<string, 1 | -1>;
  sourceHash: string;
  resultHash: string;
  retention: GeneralizedLawfulClosureAndAsphericityResult["retention"];
  asphericity: GeneralizedLawfulClosureAndAsphericityResult["asphericity"];
}

interface CompactDirectCellwiseResult {
  mask: number;
  maskHex: string;
  candidateId: string;
  candidateIndex: number;
  wallSigns: Record<string, 1 | -1>;
  status: DirectCellwiseAffineCertificate["status"];
  conclusion: DirectCellwiseAffineCertificate["conclusion"];
  sourceHash: string;
  source: DirectCellwiseAffineCertificate["source"];
  artifactHash: string;
  subdivision: DirectCellwiseAffineCertificate["subdivision"];
  feasibility: DirectCellwiseAffineCertificate["feasibility"];
  directedLinks: {
    status: DirectCellwiseAffineCertificate["directedLinks"]["status"];
    method: DirectCellwiseAffineCertificate["directedLinks"]["method"];
    representation: DirectCellwiseAffineCertificate["directedLinks"]["representation"];
    scanMode: DirectCellwiseAffineCertificate["directedLinks"]["scanMode"];
    scanOutcome: DirectCellwiseAffineCertificate["directedLinks"]["scanOutcome"];
    sourceCellSetDigest: string;
    sourceFeasibilityDigest: string;
    checkedVertexCount: number;
    checks: DirectCellwiseAffineCertificate["directedLinks"]["checks"];
    morseCondition: DirectCellwiseAffineCertificate["directedLinks"]["morseCondition"];
    failurePointCounts: {
      ascendingEmpty: number;
      ascendingDisconnected: number;
      descendingEmpty: number;
      descendingDisconnected: number;
    };
    ascendingComponentHistogram: Record<string, number>;
    descendingComponentHistogram: Record<string, number>;
    linksDigest: string;
    witnesses: DirectCellwiseAffineCertificate["directedLinks"]["witnesses"];
    errors: string[];
    nonClaims: string[];
  };
  replay:
    | ReturnType<typeof replayDirectCellwiseAffineCertificate>
    | {
        status: "not-run";
        checks: null;
        rebuiltArtifactHash: null;
        errors: [];
      };
  errors: string[];
  nonClaims: string[];
}

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/run_generalized_lawful_calculation.ts \\",
  "    --system SYSTEM.json --certificate ACTION.json.gz \\",
  "    [--checksum-manifest SHA256SUMS.txt] [--output REPORT.json] \\",
  "    --character 1,1,1,1,1,1,1,1,0,0 [--masks survivors|0x186,0x18d] \\",
  "    [--actual-links true|false] [--link-scan exhaustive|stop-on-first-failure] \\",
  "    [--direct-cellwise true|false] \\",
  "    [--direct-affine-scan exhaustive|stop-on-first-obstruction] \\",
  "    [--direct-link-scan exhaustive|stop-on-first-failure] [--direct-replay true|false] \\",
  "    [--generalized-compression-input CERTIFICATE.json | --generalized-compression-output CERTIFICATE.json] \\",
  "    [--targeted-points 96,97] [--targeted-witnesses 0x186:97,0x279:96]",
].join("\n");

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(usage);
    }
    if (values.has(flag)) throw new Error(`Duplicate flag ${flag}.\n${usage}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--certificate",
    "--checksum-manifest",
    "--output",
    "--character",
    "--masks",
    "--actual-links",
    "--link-scan",
    "--direct-cellwise",
    "--direct-affine-scan",
    "--direct-link-scan",
    "--direct-replay",
    "--generalized-compression-input",
    "--generalized-compression-output",
    "--targeted-points",
    "--targeted-witnesses",
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown flag ${flag}.\n${usage}`);
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`Missing ${flag}.\n${usage}`);
    return value;
  };
  const character = required("--character")
    .split(",")
    .map((entry) => Number(entry.trim()));
  if (character.some((entry) => entry !== 0 && entry !== 1)) {
    throw new Error(
      "--character must be a comma-separated list of zeroes and ones.",
    );
  }
  const masksValue = values.get("--masks");
  let masks: number[] | undefined;
  if (masksValue !== undefined && masksValue !== "survivors") {
    masks = masksValue.split(",").map((entry) => {
      const value = Number(entry.trim());
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Invalid wall mask ${JSON.stringify(entry)}.`);
      }
      return value;
    });
  }
  const actualLinks = values.get("--actual-links") ?? "false";
  if (actualLinks !== "true" && actualLinks !== "false") {
    throw new Error('--actual-links must be "true" or "false".');
  }
  const linkScan = values.get("--link-scan") ?? "stop-on-first-failure";
  if (linkScan !== "exhaustive" && linkScan !== "stop-on-first-failure") {
    throw new Error(
      '--link-scan must be "exhaustive" or "stop-on-first-failure".',
    );
  }
  const directCellwise = values.get("--direct-cellwise") ?? "false";
  if (directCellwise !== "true" && directCellwise !== "false") {
    throw new Error('--direct-cellwise must be "true" or "false".');
  }
  const directAffineScan =
    values.get("--direct-affine-scan") ?? "stop-on-first-obstruction";
  if (
    directAffineScan !== "exhaustive" &&
    directAffineScan !== "stop-on-first-obstruction"
  ) {
    throw new Error(
      '--direct-affine-scan must be "exhaustive" or "stop-on-first-obstruction".',
    );
  }
  const directLinkScan =
    values.get("--direct-link-scan") ?? "stop-on-first-failure";
  if (
    directLinkScan !== "exhaustive" &&
    directLinkScan !== "stop-on-first-failure"
  ) {
    throw new Error(
      '--direct-link-scan must be "exhaustive" or "stop-on-first-failure".',
    );
  }
  const directReplay = values.get("--direct-replay") ?? "true";
  if (directReplay !== "true" && directReplay !== "false") {
    throw new Error('--direct-replay must be "true" or "false".');
  }
  const generalizedCompressionInput = values.get(
    "--generalized-compression-input",
  );
  const generalizedCompressionOutput = values.get(
    "--generalized-compression-output",
  );
  if (
    generalizedCompressionInput !== undefined &&
    generalizedCompressionOutput !== undefined
  ) {
    throw new Error(
      "Supply at most one of --generalized-compression-input and --generalized-compression-output.",
    );
  }
  const targetedPointsValue = values.get("--targeted-points");
  const targetedPoints = targetedPointsValue?.split(",").map((entry) => {
    const point = Number(entry.trim());
    if (!Number.isSafeInteger(point) || point < 0) {
      throw new Error(`Invalid targeted point ${JSON.stringify(entry)}.`);
    }
    return point;
  });
  const targetedWitnessesValue = values.get("--targeted-witnesses");
  const targetedWitnesses = targetedWitnessesValue?.split(",").map((entry) => {
    const [rawMask, rawPoint, extra] = entry.split(":");
    const mask = Number(rawMask);
    const point = Number(rawPoint);
    if (
      extra !== undefined ||
      !Number.isSafeInteger(mask) ||
      mask < 0 ||
      !Number.isSafeInteger(point) ||
      point < 0
    ) {
      throw new Error(
        `Invalid targeted witness ${JSON.stringify(entry)}; expected MASK:POINT.`,
      );
    }
    return { mask, point };
  });
  return {
    system: required("--system"),
    certificate: required("--certificate"),
    ...(values.get("--checksum-manifest") === undefined
      ? {}
      : { checksumManifest: values.get("--checksum-manifest") }),
    ...(values.get("--output") === undefined
      ? {}
      : { output: values.get("--output") }),
    character,
    ...(masks === undefined ? {} : { masks }),
    calculateActualLinks: actualLinks === "true",
    linkScan,
    calculateDirectCellwise: directCellwise === "true",
    directAffineScan,
    directLinkScan,
    replayDirectCellwise: directReplay === "true",
    ...(generalizedCompressionInput === undefined
      ? {}
      : { generalizedCompressionInput }),
    ...(generalizedCompressionOutput === undefined
      ? {}
      : { generalizedCompressionOutput }),
    ...(targetedPoints === undefined ? {} : { targetedPoints }),
    ...(targetedWitnesses === undefined ? {} : { targetedWitnesses }),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readBoundedFile(
  path: string,
  maximumBytes: number,
  label: string,
): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile())
    throw new Error(`${label} is not a regular file: ${path}.`);
  if (metadata.size > maximumBytes) {
    throw new Error(
      `${label} is ${metadata.size} bytes; the limit is ${maximumBytes} bytes.`,
    );
  }
  return readFileSync(path);
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decodeCertificate(
  bytes: Uint8Array,
  path: string,
): { bytes: Uint8Array; encoding: "gzip-json" | "json" } {
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (path.toLowerCase().endsWith(".gz") && !gzip) {
    throw new Error(`${path} has a .gz suffix but no gzip header.`);
  }
  if (!gzip) {
    if (bytes.byteLength > MAX_DECOMPRESSED_CERTIFICATE_BYTES) {
      throw new Error(
        `Decoded certificate is ${bytes.byteLength} bytes; the limit is ${MAX_DECOMPRESSED_CERTIFICATE_BYTES} bytes.`,
      );
    }
    return { bytes, encoding: "json" };
  }
  try {
    return {
      bytes: gunzipSync(bytes, {
        maxOutputLength: MAX_DECOMPRESSED_CERTIFICATE_BYTES,
      }),
      encoding: "gzip-json",
    };
  } catch (error) {
    throw new Error(
      `Could not decode the bounded gzip certificate ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function manifestDigest(manifestPath: string, artifactPath: string): string {
  const target = basename(artifactPath);
  const matches = readBoundedFile(
    manifestPath,
    MAX_CHECKSUM_MANIFEST_BYTES,
    "Checksum manifest",
  )
    .toString("utf8")
    .split(/\r?\n/u)
    .map((line) => /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .filter((match) => basename(match[2].replaceAll("\\", "/")) === target);
  if (matches.length !== 1) {
    throw new Error(
      `${manifestPath} must contain exactly one SHA-256 entry for ${target}.`,
    );
  }
  return matches[0][1].toLowerCase();
}

function increment(histogram: Record<string, number>, key: number): void {
  const label = String(key);
  histogram[label] = (histogram[label] ?? 0) + 1;
}

function compactCandidate(
  mask: number,
  wallSigns: Record<string, 1 | -1>,
  certificate: GeneralizedLawfulCertificate,
): CompactCandidateResult {
  const ascendingComponentHistogram: Record<string, number> = {};
  const descendingComponentHistogram: Record<string, number> = {};
  let ascendingEmpty = 0;
  let ascendingDisconnected = 0;
  let descendingEmpty = 0;
  let descendingDisconnected = 0;
  for (const summary of certificate.directedLinks.vertexSummaries) {
    increment(ascendingComponentHistogram, summary.ascendingComponentCount);
    increment(descendingComponentHistogram, summary.descendingComponentCount);
    if (!summary.ascendingNonempty) ascendingEmpty += 1;
    if (!summary.ascendingConnected) ascendingDisconnected += 1;
    if (!summary.descendingNonempty) descendingEmpty += 1;
    if (!summary.descendingConnected) descendingDisconnected += 1;
  }
  return {
    mask,
    maskHex: `0x${mask.toString(16)}`,
    candidateId: certificate.candidateId,
    wallSigns,
    artifactHash: certificate.artifactHash,
    status: certificate.status,
    sourceHash: certificate.sourceHash,
    retention: certificate.retention,
    subdivision: certificate.subdivision,
    height: certificate.height,
    directedLinks: {
      representation: certificate.directedLinks.representation,
      scanMode: certificate.directedLinks.scanMode,
      scanOutcome: certificate.directedLinks.scanOutcome,
      checkedOriginalVertexCount:
        certificate.directedLinks.checkedOriginalVertexCount,
      introducedVertexIds: [
        ...certificate.directedLinks.declaredIntroducedVertexIds,
      ],
      checks: certificate.directedLinks.checks,
      morseCondition: certificate.directedLinks.morseCondition,
      failurePointCounts: {
        ascendingEmpty,
        ascendingDisconnected,
        descendingEmpty,
        descendingDisconnected,
      },
      ascendingComponentHistogram,
      descendingComponentHistogram,
      linksDigest: certificate.directedLinks.linksDigest,
      witnesses: certificate.directedLinks.witnesses,
      nonClaims: certificate.directedLinks.nonClaims,
    },
    asphericity: certificate.asphericity,
    errors: certificate.errors,
    nonClaims: certificate.nonClaims,
  };
}

function compactDirectCellwiseCandidate(
  mask: number,
  wallSigns: Record<string, 1 | -1>,
  certificate: DirectCellwiseAffineCertificate,
  replay: ReturnType<typeof replayDirectCellwiseAffineCertificate> | null,
): CompactDirectCellwiseResult {
  const ascendingComponentHistogram: Record<string, number> = {};
  const descendingComponentHistogram: Record<string, number> = {};
  let ascendingEmpty = 0;
  let ascendingDisconnected = 0;
  let descendingEmpty = 0;
  let descendingDisconnected = 0;
  for (const summary of certificate.directedLinks.vertexSummaries) {
    increment(ascendingComponentHistogram, summary.ascendingComponentCount);
    increment(descendingComponentHistogram, summary.descendingComponentCount);
    if (!summary.ascendingNonempty) ascendingEmpty += 1;
    if (!summary.ascendingConnected) ascendingDisconnected += 1;
    if (!summary.descendingNonempty) descendingEmpty += 1;
    if (!summary.descendingConnected) descendingDisconnected += 1;
  }
  return {
    mask,
    maskHex: `0x${mask.toString(16)}`,
    candidateId: certificate.candidateId,
    candidateIndex: certificate.candidateIndex,
    wallSigns,
    status: certificate.status,
    conclusion: certificate.conclusion,
    sourceHash: certificate.sourceHash,
    source: certificate.source,
    artifactHash: certificate.artifactHash,
    subdivision: certificate.subdivision,
    feasibility: certificate.feasibility,
    directedLinks: {
      status: certificate.directedLinks.status,
      method: certificate.directedLinks.method,
      representation: certificate.directedLinks.representation,
      scanMode: certificate.directedLinks.scanMode,
      scanOutcome: certificate.directedLinks.scanOutcome,
      sourceCellSetDigest: certificate.directedLinks.sourceCellSetDigest,
      sourceFeasibilityDigest:
        certificate.directedLinks.sourceFeasibilityDigest,
      checkedVertexCount: certificate.directedLinks.checkedVertexCount,
      checks: certificate.directedLinks.checks,
      morseCondition: certificate.directedLinks.morseCondition,
      failurePointCounts: {
        ascendingEmpty,
        ascendingDisconnected,
        descendingEmpty,
        descendingDisconnected,
      },
      ascendingComponentHistogram,
      descendingComponentHistogram,
      linksDigest: certificate.directedLinks.linksDigest,
      witnesses: certificate.directedLinks.witnesses,
      errors: certificate.directedLinks.errors,
      nonClaims: certificate.directedLinks.nonClaims,
    },
    replay: replay ?? {
      status: "not-run",
      checks: null,
      rebuiltArtifactHash: null,
      errors: [],
    },
    errors: certificate.errors,
    nonClaims: certificate.nonClaims,
  };
}

function compactPrefilter(
  prefilter: StreamedNativeVertexLinkPrefilterResult,
): Omit<StreamedNativeVertexLinkPrefilterResult, "maskSummaries"> & {
  maskSummaryHash: string;
} {
  const { maskSummaries, ...rest } = prefilter;
  return { ...rest, maskSummaryHash: canonicalSha256(maskSummaries) };
}

function main(): void {
  const runStartedAt = performance.now();
  const args = parseArguments(process.argv.slice(2));
  for (const [label, path] of [
    ["Report output", args.output],
    ["Generalized-compression output", args.generalizedCompressionOutput],
  ] as const) {
    if (path !== undefined && existsSync(resolve(path))) {
      throw new Error(`${label} already exists: ${resolve(path)}`);
    }
  }
  const systemPath = resolve(args.system);
  const certificatePath = resolve(args.certificate);
  const systemBytes = readBoundedFile(
    systemPath,
    MAX_SYSTEM_BYTES,
    "Coxeter system",
  );
  const compressedCertificateBytes = readBoundedFile(
    certificatePath,
    MAX_COMPRESSED_CERTIFICATE_BYTES,
    "Exact permutation certificate",
  );
  const certificateDigest = sha256(compressedCertificateBytes);
  const expectedDigest =
    args.checksumManifest === undefined
      ? undefined
      : manifestDigest(resolve(args.checksumManifest), certificatePath);
  if (expectedDigest !== undefined && expectedDigest !== certificateDigest) {
    throw new Error(
      `Certificate SHA-256 mismatch: expected ${expectedDigest}, received ${certificateDigest}.`,
    );
  }

  const systemInput = parseJson(systemBytes, systemPath);
  const decodedCertificate = decodeCertificate(
    compressedCertificateBytes,
    certificatePath,
  );
  const sourceCertificate = parseJson(
    decodedCertificate.bytes,
    certificatePath,
  );
  const portable = (path: string): string =>
    relative(process.cwd(), path).replaceAll("\\", "/");
  const parentArtifact = adaptExactPermutationCertificate(
    systemInput,
    sourceCertificate,
    {
      candidateId: `exact-permutation-${certificateDigest.slice(0, 16)}`,
      candidateName: `Exact permutation action imported from ${basename(certificatePath)}`,
      callerAssertedProvenance: {
        sourceArtifact: {
          path: portable(certificatePath),
          sha256: certificateDigest,
          encoding: decodedCertificate.encoding,
        },
        sourceSystemFile: {
          path: portable(systemPath),
          sha256: sha256(systemBytes),
        },
        ...(expectedDigest === undefined
          ? {}
          : {
              checksum: {
                manifestPath: portable(resolve(args.checksumManifest!)),
                expectedSha256: expectedDigest,
                matched: true as const,
              },
            }),
      },
    },
  );
  const parentReplay = replayExactPermutationActionArtifact(parentArtifact);
  if (parentReplay.status !== "passed") {
    throw new Error("The parent exact-action replay did not pass.");
  }

  const lift = buildExactZ2CharacterLift(
    parentArtifact.system,
    parentArtifact.action,
    args.character,
    {
      candidateId: `z2-character-lift-${parentArtifact.actionCanonicalSha256.slice(0, 16)}-${canonicalSha256(args.character).slice(0, 8)}`,
      candidateName: `${parentArtifact.system.name} exact Z/2-character lift`,
    },
  );
  if (lift.certificate.status !== "accepted" || !lift.acceptedCandidate) {
    throw new Error("The exact Z/2-character lift was rejected.");
  }
  const plan = planSphericalSpecialSubgroups(parentArtifact.system);
  const derivedTorsion = certifyTorsionFreeAction(
    parentArtifact.system,
    lift.acceptedCandidate,
    plan,
  );
  if (derivedTorsion.status !== "passed") {
    throw new Error(
      "The derived action's spherical-action replay did not pass.",
    );
  }

  const oracle = buildStreamedLawfulDavisOracle({
    system: parentArtifact.system,
    generatorImages: lift.acceptedCandidate.generatorImages,
  });
  const prefilter = oracle.enumerateNativeVertexLinkPrefilter();
  const selectedMasks = args.masks ?? prefilter.survivorMasks;
  if (new Set(selectedMasks).size !== selectedMasks.length) {
    throw new Error("--masks must not contain duplicates.");
  }
  const byMask = new Map(
    prefilter.maskSummaries.map((summary) => [summary.mask, summary] as const),
  );
  const selected = selectedMasks.map((mask) => {
    const summary = byMask.get(mask);
    if (!summary)
      throw new Error(`Mask ${mask} is outside the canonical range.`);
    if (!summary.passed) {
      throw new Error(
        `Mask ${mask} did not pass the native Davis-link prefilter.`,
      );
    }
    return {
      id: summary.candidateId,
      wallSigns: summary.wallSigns,
    };
  });
  if (args.calculateActualLinks && selected.length !== 1) {
    throw new Error(
      "--actual-links true rebuilds the complete generalized certificate and therefore requires exactly one selected mask. Use targeted witnesses for a bounded multi-candidate rejection run.",
    );
  }
  const selectedIndexByMask = new Map(
    selectedMasks.map((mask, index) => [mask, index] as const),
  );
  for (const witness of args.targetedWitnesses ?? []) {
    if (!selectedIndexByMask.has(witness.mask)) {
      throw new Error(
        `Targeted witness mask 0x${witness.mask.toString(16)} is not selected.`,
      );
    }
  }
  const requestedTargetedReplays = new Map<
    string,
    { mask: number; point: number }
  >();
  for (const point of args.targetedPoints ?? []) {
    for (const mask of selectedMasks) {
      requestedTargetedReplays.set(`${mask}:${point}`, { mask, point });
    }
  }
  for (const witness of args.targetedWitnesses ?? []) {
    requestedTargetedReplays.set(`${witness.mask}:${witness.point}`, witness);
  }
  if (requestedTargetedReplays.size > MAX_TARGETED_REPLAYS) {
    throw new Error(
      `The run requests ${requestedTargetedReplays.size} targeted links; the limit is ${MAX_TARGETED_REPLAYS}.`,
    );
  }
  const evaluation = oracle.bindCoorientations(selected);

  let generalizedCompression: GeneralizedCompressionCertificate | undefined;
  let generalizedCompressionArtifactPath: string | null = null;
  const directCellwise: CompactDirectCellwiseResult[] = [];
  if (args.calculateDirectCellwise) {
    if (args.generalizedCompressionInput !== undefined) {
      const inputPath = resolve(args.generalizedCompressionInput);
      generalizedCompressionArtifactPath = portable(inputPath);
      generalizedCompression = parseJson(
        readBoundedFile(
          inputPath,
          MAX_GENERALIZED_COMPRESSION_BYTES,
          "Generalized-compression certificate",
        ),
        inputPath,
      ) as GeneralizedCompressionCertificate;
      process.stderr.write(
        `Loaded generalized compression ${generalizedCompression.archiveHash} from ${generalizedCompressionArtifactPath}.\n`,
      );
    } else {
      const compressionStartedAt = performance.now();
      process.stderr.write(
        "Building the all-ranks generalized-compression fiber certificate.\n",
      );
      generalizedCompression = buildGeneralizedCompressionCertificate(
        parentArtifact.system,
        {
          candidate: lift.acceptedCandidate,
          certificate: derivedTorsion,
        },
      );
      process.stderr.write(
        `Built generalized compression ${generalizedCompression.archiveHash} in ${((performance.now() - compressionStartedAt) / 1_000).toFixed(1)} s.\n`,
      );
      if (args.generalizedCompressionOutput !== undefined) {
        const outputPath = resolve(args.generalizedCompressionOutput);
        generalizedCompressionArtifactPath = portable(outputPath);
        writeFileSync(
          outputPath,
          `${JSON.stringify(generalizedCompression, null, 2)}\n`,
          { flag: "wx" },
        );
        process.stderr.write(
          `Wrote generalized compression to ${generalizedCompressionArtifactPath}.\n`,
        );
      }
    }
    for (
      let candidateIndex = 0;
      candidateIndex < selected.length;
      candidateIndex += 1
    ) {
      const candidateStartedAt = performance.now();
      const mask = selectedMasks[candidateIndex];
      const options = {
        oracle,
        evaluation,
        candidateIndex,
        generalizedCompression,
        affineScan: args.directAffineScan,
        linkScan: args.directLinkScan,
        maxAffineWitnesses: 8,
        maxLinkWitnesses: 8,
      } as const;
      const certificate = buildDirectCellwiseAffineCertificate(options);
      const replay = args.replayDirectCellwise
        ? replayDirectCellwiseAffineCertificate(options, certificate)
        : null;
      directCellwise.push(
        compactDirectCellwiseCandidate(
          mask,
          { ...selected[candidateIndex].wallSigns },
          certificate,
          replay,
        ),
      );
      process.stderr.write(
        `Completed direct cellwise candidate 0x${mask.toString(16)} (${candidateIndex + 1}/${selected.length}) in ${((performance.now() - candidateStartedAt) / 1_000).toFixed(1)} s.\n`,
      );
    }
  }

  const candidates: CompactCandidateResult[] = [];
  if (args.calculateActualLinks) {
    for (
      let candidateIndex = 0;
      candidateIndex < selected.length;
      candidateIndex += 1
    ) {
      const mask = selectedMasks[candidateIndex];
      const result = buildGeneralizedLawfulCertificateFromStreamed({
        oracle,
        evaluation,
        candidateIndex,
        calculationMode: "compact-connectivity",
        linkScan: args.linkScan,
      });
      candidates.push(
        compactCandidate(
          mask,
          { ...selected[candidateIndex].wallSigns },
          result,
        ),
      );
      process.stderr.write(
        `Completed generalized candidate 0x${mask.toString(16)} (${candidateIndex + 1}/${selected.length}).\n`,
      );
    }
  }
  const closureAndAsphericity: CompactClosureAndAsphericityResult[] = [];
  for (
    let candidateIndex = 0;
    candidateIndex < selected.length;
    candidateIndex += 1
  ) {
    const result = buildGeneralizedLawfulClosureAndAsphericityFromStreamed({
      oracle,
      evaluation,
      candidateIndex,
    });
    const mask = selectedMasks[candidateIndex];
    closureAndAsphericity.push({
      mask,
      maskHex: `0x${mask.toString(16)}`,
      candidateId: selected[candidateIndex].id,
      wallSigns: { ...selected[candidateIndex].wallSigns },
      sourceHash: result.sourceHash,
      resultHash: result.resultHash,
      retention: result.retention,
      asphericity: result.asphericity,
    });
  }
  const targetedLinks: Array<{
    mask: number;
    maskHex: string;
    candidateId: string;
    wallSigns: Record<string, 1 | -1>;
    sourceHash: string;
    replay: GeneralizedLawfulDirectedLinkPointResult;
  }> = [];
  for (const { mask, point } of [...requestedTargetedReplays.values()].sort(
    (left, right) => left.mask - right.mask || left.point - right.point,
  )) {
    const candidateIndex = selectedIndexByMask.get(mask);
    if (candidateIndex === undefined)
      throw new Error("Internal mask lookup failed.");
    const replay = computeGeneralizedLawfulDirectedLinkAtPointFromStreamed({
      oracle,
      evaluation,
      candidateIndex,
      point,
    });
    targetedLinks.push({
      mask,
      maskHex: `0x${mask.toString(16)}`,
      candidateId: selected[candidateIndex].id,
      wallSigns: { ...selected[candidateIndex].wallSigns },
      sourceHash: replay.sourceHash,
      replay,
    });
  }

  const reportWithoutHash = {
    schemaVersion: 1 as const,
    kind: "generalized-lawful-calculation" as const,
    status: "completed" as const,
    source: {
      systemPath: portable(systemPath),
      systemName: parentArtifact.system.name,
      systemFileSha256: sha256(systemBytes),
      systemCanonicalSha256: parentArtifact.systemCanonicalSha256,
      sourceCertificatePath: portable(certificatePath),
      sourceCertificateSha256: certificateDigest,
      sourceCertificateEncoding: decodedCertificate.encoding,
      checksumMatched: expectedDigest !== undefined,
      parentActionIndex: parentArtifact.action.index,
      parentActionArtifactSha256: parentArtifact.actionCanonicalSha256,
      parentReplayStatus: parentReplay.status,
    },
    derivedCover: {
      certificate: lift.certificate,
      index: lift.acceptedCandidate.index,
      torsionFreeReplayStatus: derivedTorsion.status,
      sphericalActionCheckCount: derivedTorsion.sphericalActions.length,
    },
    oracle: {
      degree: oracle.degree,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      structureHash: oracle.structureHash,
      cellCountByDimension: oracle.cellCountByDimension,
      cellCount: oracle.cellCount,
      walls: oracle.walls,
    },
    prefilter: compactPrefilter(prefilter),
    selectedMasks,
    generalizedCompression:
      generalizedCompression === undefined
        ? null
        : {
            status: generalizedCompression.status,
            method: generalizedCompression.method,
            artifactPath: generalizedCompressionArtifactPath,
            archiveHash: generalizedCompression.archiveHash,
            source: generalizedCompression.source,
            encoding: generalizedCompression.encoding,
            sphericalTypeCount: generalizedCompression.sphericalTypes.length,
            faceCompatibilityCount:
              generalizedCompression.faceCompatibility.length,
            cellCountByDimension: generalizedCompression.cellCountByDimension,
            rootedSourceCellCount: generalizedCompression.rootedSourceCellCount,
            compressedCellCount: generalizedCompression.compressedCellCount,
            rootedFaceRecordCount: generalizedCompression.rootedFaceRecordCount,
            strictFaceIncidenceCount:
              generalizedCompression.strictFaceIncidenceCount,
            immediateFaceIncidenceCount:
              generalizedCompression.immediateFaceIncidenceCount,
            checks: generalizedCompression.checks,
            rankAtMostTwoAgreement:
              generalizedCompression.rankAtMostTwoAgreement,
            rankAtMostTwoScope:
              generalizedCompression.rankAtMostTwoAgreement.scope,
            warnings: generalizedCompression.warnings,
          },
    directCellwiseCalculated: args.calculateDirectCellwise,
    directAffineScan: args.directAffineScan,
    directLinkScan: args.directLinkScan,
    directReplayRequested: args.replayDirectCellwise,
    directCellwise,
    actualLinksCalculated: args.calculateActualLinks,
    linkScan: args.linkScan,
    candidates,
    closureAndAsphericity,
    targetedLinks,
    claims: [
      args.calculateActualLinks
        ? "The finite quotient, wall system, selected sign map, retained cell set, affine rule, and directed-link connectivity calculation are reconstructed from exact permutation rows."
        : "The finite quotient, wall system, canonical candidate sign maps, coface-closed retained cell counts, and inherited-metric flag checks are reconstructed from exact permutation rows.",
      ...(args.calculateActualLinks || targetedLinks.length > 0
        ? [
            "The selected global pulling rule is vertex preserving. Every full or targeted pulled-link replay therefore declares an empty list of introduced subdivision vertices.",
          ]
        : []),
      ...(targetedLinks.length === 0
        ? []
        : [
            "Each targeted replay reconstructs the exact ascending and descending connectivity components at the named quotient vertex under the global pulling and perturbed integral height rules.",
          ]),
      ...(args.calculateDirectCellwise
        ? [
            "The generalized-compression rooted fibers and all spherical face maps are reconstructed from the exact action before the direct affine calculation.",
            "Direct ascending and descending links are unions of vertex-figure simplices from retained Coxeter cells; no pulling triangulation or height perturbation is used.",
          ]
        : []),
    ],
    nonClaims: [
      "A failed metric-flag certificate does not prove non-asphericity.",
      "Compact directed-link output records exhaustive aggregate vertex/component counts and bounded witness partitions. Its source-rooted digest can be replayed, but the report does not archive every per-vertex partition, graph edge, or higher link simplex.",
      "This calculation does not assert that the imported parent action has minimum index.",
      ...(args.calculateDirectCellwise
        ? [
            "Retained-component inverse zone-scale feasibility is a sufficient weighted Coxeter-zonotope model, not a decision procedure for every possible affine realization.",
            "Direct-link connectivity does not establish asphericity of the retained generalized lawful complex.",
            "This streamed run uses definition-level rank-at-most-two agreement; it does not materialize Hat X, Bar X, or the strict full-Davis face poset.",
          ]
        : []),
    ],
  };
  const report = {
    ...reportWithoutHash,
    reportSha256: canonicalSha256(reportWithoutHash),
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output === undefined) process.stdout.write(json);
  else {
    const outputPath = resolve(args.output);
    writeFileSync(outputPath, json, { flag: "wx" });
    process.stdout.write(
      `Wrote generalized lawful calculation ${report.reportSha256} to ${portable(outputPath)}.\n`,
    );
  }
  process.stderr.write(
    `Completed in ${((performance.now() - runStartedAt) / 1_000).toFixed(1)} s; peak RSS ${(process.resourceUsage().maxRSS / 1_024).toFixed(1)} MiB; final RSS ${(process.memoryUsage().rss / 2 ** 20).toFixed(1)} MiB.\n`,
  );
}

function pathKey(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathKey(fileURLToPath(import.meta.url)) === pathKey(invokedPath)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
