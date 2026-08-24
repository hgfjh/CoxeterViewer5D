#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  completeStreamedH1Lattice,
  parseStreamedH1IntegralCoreBasis,
} from "../src/fibering/streamedH1Completion";
import { parseStreamedH1ModularCoreTranscript } from "../src/fibering/streamedH1ModularTranscript";
import {
  prepareStreamedH1Lattice,
  type StreamedH1LatticePreparation,
} from "../src/fibering/streamedH1Lattice";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
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

const MAX_SYSTEM_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_ACTION_BYTES = 128 * 1024 * 1024;
const MAX_DECOMPRESSED_ACTION_BYTES = 256 * 1024 * 1024;
const MAX_CORE_BYTES = 32 * 1024 * 1024;
const MAX_BASIS_BYTES = 64 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_NULLSPACE_DRIVER_SHA256 =
  "35ff7082e4df8e9ce8d421fc6d0f494b8496568a15ba51f50db01cf34c198740";

interface ModularArtifactArgument {
  prime: number;
  path: string;
  expectedSha256: string;
}

interface Arguments {
  system: string;
  certificate: string;
  expectedCertificateSha256: string;
  character: number[];
  coreMatrix: string;
  expectedCoreSha256: string;
  coreBasis: string;
  expectedCoreBasisSha256: string;
  modularArtifacts: ModularArtifactArgument[];
  output: string;
}

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/run_streamed_h1_lattice.ts \\",
  "    --system SYSTEM.json --certificate ACTION.json.gz \\",
  "    --expected-certificate-sha256 SHA256 \\",
  "    --character 1,1,1,1,1,1,1,1,0,0 \\",
  "    --core-matrix CORE.linbox --expected-core-sha256 SHA256 \\",
  "    --core-basis BASIS.txt --expected-core-basis-sha256 SHA256 \\",
  "    --modular-basis PRIME,PATH,SHA256 \\",
  "    --modular-basis PRIME,PATH,SHA256 --output REPORT.json",
].join("\n");

function requireSha256(value: string, flag: string): string {
  const normalized = value.toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${flag} must be a 64-digit SHA-256 digest.`);
  }
  return normalized;
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const values = new Map<string, string>();
  const modularArtifacts: ModularArtifactArgument[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error(usage);
    if (flag === "--modular-basis") {
      const pieces = value.split(",");
      if (pieces.length !== 3) {
        throw new Error("--modular-basis must be PRIME,PATH,SHA256.");
      }
      const prime = Number(pieces[0]);
      if (!Number.isSafeInteger(prime) || prime < 2) {
        throw new Error(`Invalid modular prime ${pieces[0]}.`);
      }
      modularArtifacts.push({
        prime,
        path: pieces[1],
        expectedSha256: requireSha256(pieces[2], "--modular-basis SHA256"),
      });
      continue;
    }
    if (values.has(flag)) throw new Error(`Duplicate flag ${flag}.\n${usage}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--certificate",
    "--expected-certificate-sha256",
    "--character",
    "--core-matrix",
    "--expected-core-sha256",
    "--core-basis",
    "--expected-core-basis-sha256",
    "--output",
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
    .map((entry) => Number(entry));
  if (character.some((value) => value !== 0 && value !== 1)) {
    throw new Error("--character must contain only zeroes and ones.");
  }
  if (modularArtifacts.length < 2) {
    throw new Error("At least two --modular-basis artifacts are required.");
  }
  if (
    new Set(modularArtifacts.map((artifact) => artifact.prime)).size !==
    modularArtifacts.length
  ) {
    throw new Error("--modular-basis primes must be pairwise distinct.");
  }
  return {
    system: required("--system"),
    certificate: required("--certificate"),
    expectedCertificateSha256: requireSha256(
      required("--expected-certificate-sha256"),
      "--expected-certificate-sha256",
    ),
    character,
    coreMatrix: required("--core-matrix"),
    expectedCoreSha256: requireSha256(
      required("--expected-core-sha256"),
      "--expected-core-sha256",
    ),
    coreBasis: required("--core-basis"),
    expectedCoreBasisSha256: requireSha256(
      required("--expected-core-basis-sha256"),
      "--expected-core-basis-sha256",
    ),
    modularArtifacts,
    output: required("--output"),
  };
}

function readBoundedFile(path: string, maximum: number, label: string): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file.`);
  if (metadata.size > maximum) {
    throw new Error(`${label} exceeds the ${maximum}-byte limit.`);
  }
  return readFileSync(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function checkedBytes(
  path: string,
  maximum: number,
  expectedSha256: string,
  label: string,
): Buffer {
  const bytes = readBoundedFile(path, maximum, label);
  const actual = sha256(bytes);
  if (actual !== expectedSha256) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expectedSha256}, received ${actual}.`,
    );
  }
  return bytes;
}

interface CheckedArtifactPayload {
  artifactBytes: Buffer;
  payloadBytes: Buffer;
  encoding: "identity" | "gzip";
  artifactSha256: string;
  payloadSha256: string;
}

function checkedArtifactPayload(
  path: string,
  maximumArtifactBytes: number,
  maximumPayloadBytes: number,
  expectedArtifactSha256: string,
  label: string,
): CheckedArtifactPayload {
  const artifactBytes = checkedBytes(
    path,
    maximumArtifactBytes,
    expectedArtifactSha256,
    label,
  );
  const gzip = artifactBytes[0] === 0x1f && artifactBytes[1] === 0x8b;
  let payloadBytes = artifactBytes;
  if (gzip) {
    try {
      payloadBytes = gunzipSync(artifactBytes, {
        maxOutputLength: maximumPayloadBytes,
      });
    } catch (error) {
      throw new Error(
        `${label} could not be decoded within ${maximumPayloadBytes} bytes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (payloadBytes.length > maximumPayloadBytes) {
    throw new Error(`${label} payload exceeds ${maximumPayloadBytes} bytes.`);
  }
  return {
    artifactBytes,
    payloadBytes,
    encoding: gzip ? "gzip" : "identity",
    artifactSha256: expectedArtifactSha256,
    payloadSha256: sha256(payloadBytes),
  };
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decodeAction(bytes: Uint8Array, path: string): Uint8Array {
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzip) return bytes;
  try {
    return gunzipSync(bytes, {
      maxOutputLength: MAX_DECOMPRESSED_ACTION_BYTES,
    });
  } catch (error) {
    throw new Error(
      `Could not decode ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function verifyCanonicalCoreMatrix(
  bytes: Uint8Array,
  preparation: StreamedH1LatticePreparation,
): void {
  const lines = Buffer.from(bytes).toString("ascii").trim().split(/\r?\n/u);
  const peel = preparation.certificate.peel;
  if (lines[0] !== `${peel.nonpivotRowCount} ${peel.unresolvedColumnCount} S`) {
    throw new Error("Raw core matrix header does not match the preparation.");
  }
  let coreRow = 0;
  preparation.forEachCoreRow((row) => {
    const expected = [
      String(row.entries.length),
      ...row.entries.flatMap(([column, coefficient]) => [
        String(column),
        String(coefficient),
      ]),
    ].join(" ");
    if (lines[coreRow + 1] !== expected) {
      throw new Error(`Raw core matrix differs at canonical row ${coreRow}.`);
    }
    coreRow += 1;
  });
  if (coreRow !== peel.nonpivotRowCount || lines.length !== coreRow + 1) {
    throw new Error(
      "Raw core matrix row count does not match the preparation.",
    );
  }
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = resolve(args.output);
  const portable = (path: string): string =>
    relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
  const systemPath = resolve(args.system);
  const certificatePath = resolve(args.certificate);
  const systemBytes = readBoundedFile(systemPath, MAX_SYSTEM_BYTES, "System");
  const certificateBytes = checkedBytes(
    certificatePath,
    MAX_COMPRESSED_ACTION_BYTES,
    args.expectedCertificateSha256,
    "Exact action certificate",
  );
  const parent = adaptExactPermutationCertificate(
    parseJson(systemBytes, systemPath),
    parseJson(decodeAction(certificateBytes, certificatePath), certificatePath),
    {
      candidateId: `h1-parent-${args.expectedCertificateSha256.slice(0, 16)}`,
      candidateName: `H1 parent from ${basename(certificatePath)}`,
      callerAssertedProvenance: {
        sourceArtifact: {
          path: portable(certificatePath),
          sha256: args.expectedCertificateSha256,
          encoding:
            certificateBytes[0] === 0x1f && certificateBytes[1] === 0x8b
              ? "gzip-json"
              : "json",
        },
        sourceSystemFile: {
          path: portable(systemPath),
          sha256: sha256(systemBytes),
        },
      },
    },
  );
  const parentReplay = replayExactPermutationActionArtifact(parent);
  if (parentReplay.status !== "passed") {
    throw new Error("Exact parent-action replay failed.");
  }
  const lift = buildExactZ2CharacterLift(
    parent.system,
    parent.action,
    args.character,
    { candidateId: "compact-5-cube-index34560-h1-lift" },
  );
  if (!lift.acceptedCandidate || lift.certificate.status !== "accepted") {
    throw new Error("Exact Z/2 character lift failed.");
  }
  const torsion = certifyTorsionFreeAction(
    parent.system,
    lift.acceptedCandidate,
    planSphericalSpecialSubgroups(parent.system),
  );
  if (torsion.status !== "passed") {
    throw new Error("Derived action failed the torsion-free replay.");
  }
  const oracle = buildStreamedLawfulDavisOracle({
    system: parent.system,
    generatorImages: lift.acceptedCandidate.generatorImages,
  });
  const preparation = prepareStreamedH1Lattice(oracle);

  const corePath = resolve(args.coreMatrix);
  const coreArtifact = checkedArtifactPayload(
    corePath,
    MAX_CORE_BYTES,
    MAX_CORE_BYTES,
    args.expectedCoreSha256,
    "Raw core matrix",
  );
  verifyCanonicalCoreMatrix(coreArtifact.payloadBytes, preparation);

  const coreBasisPath = resolve(args.coreBasis);
  const coreBasisArtifact = checkedArtifactPayload(
    coreBasisPath,
    MAX_BASIS_BYTES,
    MAX_BASIS_BYTES,
    args.expectedCoreBasisSha256,
    "Integral core basis",
  );
  const coreBasis = parseStreamedH1IntegralCoreBasis(
    coreBasisArtifact.payloadBytes.toString("ascii"),
    {
      sourceArtifactSha256: coreBasisArtifact.payloadSha256,
      expectedCoreColumnCount:
        preparation.certificate.peel.unresolvedColumnCount,
      expectedCoreRowCount: preparation.certificate.peel.nonpivotRowCount,
    },
  );

  const driverPath = resolve("scripts/streamed_h1_core_nullspace.cpp");
  const driverBytes = readBoundedFile(
    driverPath,
    1024 * 1024,
    "Nullspace driver source",
  );
  const driverSha256 = sha256(driverBytes);
  if (driverSha256 !== EXPECTED_NULLSPACE_DRIVER_SHA256) {
    throw new Error(
      `Nullspace driver SHA-256 changed: expected ${EXPECTED_NULLSPACE_DRIVER_SHA256}, received ${driverSha256}.`,
    );
  }
  const modularMetadata = args.modularArtifacts.map((artifact) => {
    const path = resolve(artifact.path);
    const checked = checkedArtifactPayload(
      path,
      MAX_BASIS_BYTES,
      MAX_BASIS_BYTES,
      artifact.expectedSha256,
      `Modular basis p=${artifact.prime}`,
    );
    const parsed = parseStreamedH1ModularCoreTranscript(
      checked.payloadBytes.toString("ascii"),
      {
        sourceArtifactSha256: checked.payloadSha256,
        modulusPrime: artifact.prime,
        preparation,
        integralCoreBasis: coreBasis,
        backend: "LinBox/Givaro",
        backendVersion: "1.7.0-4/4.2.0",
        algorithm:
          "GaussDomain::InPlaceLinearPivoting + GaussDomain::nullspacebasis",
      },
    );
    return {
      prime: artifact.prime,
      path: portable(path),
      encoding: checked.encoding,
      artifactSha256: checked.artifactSha256,
      payloadSha256: checked.payloadSha256,
      artifactByteCount: checked.artifactBytes.length,
      payloadByteCount: checked.payloadBytes.length,
      rawBasisNonzeroCount: parsed.rawBasisNonzeroCount,
      normalizedComparisonEntryCount: parsed.normalizedComparisonEntryCount,
      witness: parsed.witness,
    };
  });
  const completion = completeStreamedH1Lattice({
    oracle,
    preparation,
    coreBasis,
    modularRankWitnesses: modularMetadata.map((entry) => entry.witness),
  });
  if (completion.certificate.status !== "passed") {
    throw new Error(
      `Complete H^1 certification failed: ${completion.certificate.errors.join(" ")}`,
    );
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-streamed-h1-report" as const,
    status: "passed" as const,
    source: {
      system: { path: portable(systemPath), sha256: sha256(systemBytes) },
      parentAction: {
        path: portable(certificatePath),
        sha256: args.expectedCertificateSha256,
      },
      character: [...args.character],
      characterDigest: canonicalSha256(args.character),
      parentActionRowsCanonicalSha256: parent.actionCanonicalSha256,
      derivedActionRowsCanonicalSha256:
        lift.certificate.derivedAction.rowsCanonicalSha256,
      oracleStructureHash: oracle.structureHash,
    },
    externalArtifacts: {
      rawCoreMatrix: {
        path: portable(corePath),
        encoding: coreArtifact.encoding,
        artifactSha256: coreArtifact.artifactSha256,
        payloadSha256: coreArtifact.payloadSha256,
        artifactByteCount: coreArtifact.artifactBytes.length,
        payloadByteCount: coreArtifact.payloadBytes.length,
        canonicalMatrixDigest: preparation.certificate.peel.coreMatrixDigest,
      },
      integralCoreBasis: {
        path: portable(coreBasisPath),
        encoding: coreBasisArtifact.encoding,
        artifactSha256: coreBasisArtifact.artifactSha256,
        payloadSha256: coreBasisArtifact.payloadSha256,
        artifactByteCount: coreBasisArtifact.artifactBytes.length,
        payloadByteCount: coreBasisArtifact.payloadBytes.length,
        sparseBasisDigest: coreBasis.certificate.sparseBasisDigest,
      },
      modularRankTranscripts: modularMetadata,
      nullspaceDriver: {
        path: portable(driverPath),
        sha256: driverSha256,
        algorithm:
          "GaussDomain::InPlaceLinearPivoting + GaussDomain::nullspacebasis",
      },
    },
    sourceReplays: {
      parentAction: parentReplay.status,
      z2Lift: lift.certificate.status,
      torsionFreeAction: torsion.status,
    },
    preparation: preparation.certificate,
    completion: completion.certificate,
  };
  const report = {
    ...withoutDigest,
    reportDigest: canonicalSha256(withoutDigest),
  };
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  let outputDisposition: "created" | "verified-existing" = "created";
  if (existsSync(outputPath)) {
    const existing = readBoundedFile(
      outputPath,
      16 * 1024 * 1024,
      "Existing H1 report",
    ).toString("utf8");
    if (existing !== serializedReport) {
      throw new Error(
        `Existing output ${outputPath} differs from the replayed report; refusing to overwrite it.`,
      );
    }
    outputDisposition = "verified-existing";
  } else {
    writeFileSync(outputPath, serializedReport, {
      encoding: "utf8",
      flag: "wx",
    });
  }
  process.stdout.write(
    `${JSON.stringify({
      status: report.status,
      h1: report.completion.result.h1IsomorphicTo,
      quotientByWallLattice: report.completion.result.quotientByWallLattice,
      fullLatticeBasisDigest: report.completion.fullLatticeBasisDigest,
      fullCocycleSectionDigest: report.completion.fullCocycleSectionDigest,
      certificateDigest: report.completion.certificateDigest,
      reportDigest: report.reportDigest,
      output: portable(outputPath),
      outputDisposition,
    })}\n`,
  );
}

main();
