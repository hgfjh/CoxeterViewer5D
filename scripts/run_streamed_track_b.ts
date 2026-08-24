#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";

import type { GeneralizedCompressionCertificate } from "../src/davis/generalizedCompression";
import {
  buildStreamedTrackBCertificate,
  replayStreamedTrackBBatchScan,
  replayStreamedTrackBCertificate,
  scanStreamedTrackBCandidatesPointMajor,
  type StreamedTrackBCertificate,
} from "../src/fibering/streamedTrackB";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedWallSignCandidate,
} from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
} from "../src/torsionFree";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";
import {
  adaptExactPermutationCertificate,
  replayExactPermutationActionArtifact,
} from "../src/torsionFree/exactPermutationArtifact";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

interface Arguments {
  system: string;
  certificate: string;
  checksumManifest?: string;
  generalizedCompression: string;
  output?: string;
  character: number[];
  masks: "all" | number[];
  linkScan: "exhaustive" | "stop-on-first-failure";
  replay: boolean;
}

const MAX_SYSTEM_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_CERTIFICATE_BYTES = 128 * 1024 * 1024;
const MAX_DECOMPRESSED_CERTIFICATE_BYTES = 256 * 1024 * 1024;
const MAX_CHECKSUM_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_GENERALIZED_COMPRESSION_BYTES = 64 * 1024 * 1024;

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/run_streamed_track_b.ts \\",
  "    --system SYSTEM.json --certificate ACTION.json.gz \\",
  "    --generalized-compression GENERALIZED_COMPRESSION.json \\",
  "    --character 1,1,1,1,1,1,1,1,0,0 \\",
  "    [--checksum-manifest SHA256SUMS.txt] [--output REPORT.json] \\",
  "    [--masks all|0x186,0x196] \\",
  "    [--link-scan exhaustive|stop-on-first-failure] \\",
  "    [--replay true|false]",
].join("\n");

function parseBoolean(value: string, flag: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} must be "true" or "false".`);
}

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
    "--generalized-compression",
    "--output",
    "--character",
    "--masks",
    "--link-scan",
    "--replay",
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
  const rawMasks = values.get("--masks") ?? "all";
  const masks =
    rawMasks === "all"
      ? ("all" as const)
      : rawMasks.split(",").map((entry) => {
          const mask = Number(entry.trim());
          if (!Number.isSafeInteger(mask) || mask < 0) {
            throw new Error(`Invalid wall mask ${JSON.stringify(entry)}.`);
          }
          return mask;
        });
  if (masks !== "all" && new Set(masks).size !== masks.length) {
    throw new Error("--masks must not contain duplicates.");
  }
  const linkScan = values.get("--link-scan") ?? "stop-on-first-failure";
  if (linkScan !== "exhaustive" && linkScan !== "stop-on-first-failure") {
    throw new Error(
      '--link-scan must be "exhaustive" or "stop-on-first-failure".',
    );
  }
  return {
    system: required("--system"),
    certificate: required("--certificate"),
    generalizedCompression: required("--generalized-compression"),
    character,
    masks,
    linkScan,
    replay: parseBoolean(values.get("--replay") ?? "true", "--replay"),
    ...(values.get("--checksum-manifest") === undefined
      ? {}
      : { checksumManifest: values.get("--checksum-manifest") }),
    ...(values.get("--output") === undefined
      ? {}
      : { output: values.get("--output") }),
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
  if (!metadata.isFile()) {
    throw new Error(`${label} is not a regular file: ${path}.`);
  }
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

function decodeCertificate(bytes: Uint8Array, path: string): Uint8Array {
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (path.toLowerCase().endsWith(".gz") && !gzip) {
    throw new Error(`${path} has a .gz suffix but no gzip header.`);
  }
  if (!gzip) return bytes;
  try {
    return gunzipSync(bytes, {
      maxOutputLength: MAX_DECOMPRESSED_CERTIFICATE_BYTES,
    });
  } catch (error) {
    throw new Error(
      `Could not decode ${path}: ${error instanceof Error ? error.message : String(error)}`,
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

function maskCandidate(
  mask: number,
  orderedWallIds: readonly string[],
): StreamedWallSignCandidate {
  const maximum = 2 ** orderedWallIds.length;
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= maximum) {
    throw new Error(`Wall mask ${mask} is outside 0..${maximum - 1}.`);
  }
  return {
    id: `track-b-wall-mask-0x${mask.toString(16)}`,
    wallSigns: Object.fromEntries(
      orderedWallIds.map((wallId, index) => [
        wallId,
        (mask & (2 ** index)) === 0 ? 1 : -1,
      ]),
    ),
  } as StreamedWallSignCandidate;
}

function complementRepresentatives(wallCount: number): number[] {
  if (wallCount < 1 || wallCount > 20) {
    throw new Error(
      `The exact Track B runner supports 1..20 walls; received ${wallCount}.`,
    );
  }
  // The candidate-odd perturbation makes mask and its full complement exact
  // ascending/descending reversals. Fixing canonical wall zero positive is
  // therefore a genuine quotient by global reversal.
  return Array.from({ length: 2 ** wallCount }, (_unused, mask) => mask).filter(
    (mask) => (mask & 1) === 0,
  );
}

function main(): void {
  const startedAt = performance.now();
  let stageStartedAt = startedAt;
  const finishStage = (label: string): void => {
    const now = performance.now();
    process.stderr.write(
      `[track-b timing] ${label}: ${((now - stageStartedAt) / 1_000).toFixed(1)} s (total ${((now - startedAt) / 1_000).toFixed(1)} s)\n`,
    );
    stageStartedAt = now;
  };
  const args = parseArguments(process.argv.slice(2));
  if (args.output !== undefined && existsSync(resolve(args.output))) {
    throw new Error(`Report output already exists: ${resolve(args.output)}.`);
  }
  const systemPath = resolve(args.system);
  const certificatePath = resolve(args.certificate);
  const compressionPath = resolve(args.generalizedCompression);
  const portable = (path: string): string =>
    relative(process.cwd(), path).replaceAll("\\", "/");

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
  const sourceCertificateSha256 = sha256(compressedCertificateBytes);
  const expectedDigest =
    args.checksumManifest === undefined
      ? undefined
      : manifestDigest(resolve(args.checksumManifest), certificatePath);
  if (
    expectedDigest !== undefined &&
    expectedDigest !== sourceCertificateSha256
  ) {
    throw new Error(
      `Certificate SHA-256 mismatch: expected ${expectedDigest}, received ${sourceCertificateSha256}.`,
    );
  }
  const parent = adaptExactPermutationCertificate(
    parseJson(systemBytes, systemPath),
    parseJson(
      decodeCertificate(compressedCertificateBytes, certificatePath),
      certificatePath,
    ),
    {
      candidateId: `exact-permutation-${sourceCertificateSha256.slice(0, 16)}`,
      candidateName: `Exact permutation action imported from ${basename(certificatePath)}`,
      callerAssertedProvenance: {
        sourceArtifact: {
          path: portable(certificatePath),
          sha256: sourceCertificateSha256,
          encoding:
            compressedCertificateBytes[0] === 0x1f &&
            compressedCertificateBytes[1] === 0x8b
              ? "gzip-json"
              : "json",
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
  finishStage("load and adapt exact parent action");
  const parentReplay = replayExactPermutationActionArtifact(parent);
  if (parentReplay.status !== "passed") {
    throw new Error("The parent exact-action replay did not pass.");
  }
  finishStage("replay exact parent action");
  const lift = buildExactZ2CharacterLift(
    parent.system,
    parent.action,
    args.character,
    {
      candidateId: `z2-character-lift-${parent.actionCanonicalSha256.slice(0, 16)}-${canonicalSha256(args.character).slice(0, 8)}`,
      candidateName: `${parent.system.name} exact Z/2-character lift`,
    },
  );
  if (lift.certificate.status !== "accepted" || !lift.acceptedCandidate) {
    throw new Error("The exact Z/2-character lift was rejected.");
  }
  finishStage("build exact Z/2 lift");
  const sphericalPlan = planSphericalSpecialSubgroups(parent.system);
  const torsion = certifyTorsionFreeAction(
    parent.system,
    lift.acceptedCandidate,
    sphericalPlan,
  );
  if (torsion.status !== "passed") {
    throw new Error("The derived action's spherical-action replay failed.");
  }
  finishStage("replay torsion-free spherical actions");
  const oracle = buildStreamedLawfulDavisOracle({
    system: parent.system,
    generatorImages: lift.acceptedCandidate.generatorImages,
  });
  if (!oracle.walls.twoSided) {
    throw new Error("Track B requires every quotient wall to be two-sided.");
  }
  finishStage("build streamed Davis oracle and walls");
  const compression = parseJson(
    readBoundedFile(
      compressionPath,
      MAX_GENERALIZED_COMPRESSION_BYTES,
      "Generalized-compression certificate",
    ),
    compressionPath,
  ) as GeneralizedCompressionCertificate;
  finishStage("load generalized-compression certificate");
  const orderedWallIds = oracle.walls.walls.map((wall) => wall.id);
  const representativeMasks = complementRepresentatives(orderedWallIds.length);
  const selectedMasks = args.masks === "all" ? representativeMasks : args.masks;
  for (const mask of selectedMasks) {
    if (!representativeMasks.includes(mask)) {
      throw new Error(
        `Mask 0x${mask.toString(16)} is not the canonical global-reversal representative (wall zero must have sign +1).`,
      );
    }
  }
  const candidates = selectedMasks.map((mask) =>
    maskCandidate(mask, orderedWallIds),
  );
  const batchProgressStartedAt = performance.now();
  const batchOptions = {
    oracle,
    candidates,
    generalizedCompression: compression,
    offsetPolarities: [-1, 1] as const,
    maxWitnesses: 2,
    onProgress: (event: { stage: string; [key: string]: unknown }) => {
      process.stderr.write(
        `Track B ${event.stage} at ${((performance.now() - batchProgressStartedAt) / 1_000).toFixed(1)} s${
          event.point === undefined ? "" : ` (q${String(event.point)})`
        }${
          event.activeClassCount === undefined
            ? ""
            : `; ${String(event.activeClassCount)} active classes`
        }.\n`,
      );
    },
  };
  const batchStartedAt = performance.now();
  const batch = scanStreamedTrackBCandidatesPointMajor(batchOptions);
  process.stderr.write(
    `Screened ${batch.classCount} Track B height classes through ${batch.checkedPointTemplateCount} point templates in ${((performance.now() - batchStartedAt) / 1_000).toFixed(1)} s; ${batch.survivorIndices.length} survived.\n`,
  );
  finishStage("screen Track B height classes");
  const batchReplay = args.replay
    ? replayStreamedTrackBBatchScan(batchOptions, batch)
    : ({ status: "not-run" } as const);
  finishStage(
    args.replay ? "replay Track B batch" : "skip Track B batch replay",
  );

  // A batch survivor has passed every quotient vertex, but promotion still
  // rebuilds the complete character, pulling, height, and link artifact from
  // the action rows. Batch rejection witnesses need no such promotion: one
  // disconnected directed link already disproves the universal link gate.
  const promotedSurvivors: Array<{
    mask: number;
    maskHex: string;
    offsetPolarity: 1 | -1;
    certificate: StreamedTrackBCertificate;
    replay: ReturnType<typeof replayStreamedTrackBCertificate>;
  }> = [];
  for (const survivor of batch.survivorIndices) {
    const mask = selectedMasks[survivor.candidateIndex];
    const options = {
      oracle,
      candidate: candidates[survivor.candidateIndex],
      generalizedCompression: compression,
      offsetPolarity: survivor.offsetPolarity,
      linkScan: "exhaustive" as const,
      maxLinkWitnesses: 8,
    };
    const certificate = buildStreamedTrackBCertificate(options);
    const replay = replayStreamedTrackBCertificate(options, certificate);
    promotedSurvivors.push({
      mask,
      maskHex: `0x${mask.toString(16)}`,
      offsetPolarity: survivor.offsetPolarity,
      certificate,
      replay,
    });
  }
  finishStage("promote surviving classes");

  const exhaustive =
    selectedMasks.length === representativeMasks.length &&
    batch.status === "completed" &&
    Object.values(batch.checks).every(Boolean) &&
    batch.summaries.length === 2 * representativeMasks.length &&
    batch.survivorIndices.length === 0 &&
    (!args.replay || batchReplay.status === "passed");
  const certifiedPass = promotedSurvivors.find(
    (entry) =>
      entry.certificate.status === "passed" && entry.replay.status === "passed",
  );
  const reportWithoutHash = {
    schemaVersion: 1 as const,
    kind: "streamed-full-k-track-b-search" as const,
    status:
      certifiedPass !== undefined
        ? ("found" as const)
        : exhaustive
          ? ("not-found-for-this-pulling-height-family" as const)
          : ("incomplete" as const),
    method:
      "all-cells-global-pulling-candidate-odd-height-exact-links" as const,
    source: {
      systemPath: portable(systemPath),
      systemFileSha256: sha256(systemBytes),
      systemCanonicalSha256: parent.systemCanonicalSha256,
      sourceCertificatePath: portable(certificatePath),
      sourceCertificateSha256,
      checksumMatched: expectedDigest !== undefined,
      parentActionIndex: parent.action.index,
      parentActionCanonicalSha256: parent.actionCanonicalSha256,
      parentReplayStatus: parentReplay.status,
      generalizedCompressionPath: portable(compressionPath),
      generalizedCompressionArchiveHash: compression.archiveHash,
    },
    derivedCover: {
      index: lift.acceptedCandidate.index,
      liftCertificate: lift.certificate,
      torsionFreeReplayStatus: torsion.status,
      sphericalActionCheckCount: torsion.sphericalActions.length,
    },
    oracle: {
      structureHash: oracle.structureHash,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      degree: oracle.degree,
      wallCount: orderedWallIds.length,
      orderedWallIds,
      allWallsTwoSided: oracle.walls.twoSided,
      cellCount: oracle.cellCount,
      cellCountByDimension: oracle.cellCountByDimension,
    },
    signSearch: {
      fullMaskCount: 2 ** orderedWallIds.length,
      complementRepresentativeCount: representativeMasks.length,
      offsetPolaritiesPerRepresentative: 2,
      heightClassCount: 2 ** orderedWallIds.length,
      complementRule:
        "bit-zero-positive; each representative uses both anchor-relative perturbation polarities; F(-c)=-F(c)",
      selectedMasks,
      evaluatedHeightClassCount: batch.classCount,
      exhaustive,
      passedMask:
        certifiedPass === undefined
          ? null
          : {
              mask: certifiedPass.mask,
              offsetPolarity: certifiedPass.offsetPolarity,
            },
      linkScan: args.linkScan,
      replayRequested: args.replay,
    },
    batch,
    batchReplay,
    promotedSurvivors,
    nonClaims: [
      "A not-found result concerns this exact global pulling subdivision and candidate-odd rank perturbation; it is not a proof that the group has no algebraic fibration.",
      "Connectivity of ascending and descending links certifies finite generation of the character kernel. It does not certify finite presentation, which requires the stronger simply-connected-link gate.",
      "The compact search rows retain aggregate link data and bounded counterexamples, not every link edge or higher simplex.",
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
    process.stderr.write(
      `Wrote Track B report ${report.reportSha256} to ${portable(outputPath)}.\n`,
    );
  }
  finishStage("hash and write report");
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  const memory = process.memoryUsage();
  process.stderr.write(
    `Track B run completed in ${elapsedSeconds.toFixed(1)} s; peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(1)} MiB; final RSS ${(memory.rss / 2 ** 20).toFixed(1)} MiB.\n`,
  );
}

main();
