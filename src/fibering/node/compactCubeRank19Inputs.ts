import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import type { GeneralizedCompressionCertificate } from "../../davis/generalizedCompression";
import { buildExactZ2CharacterLift } from "../../torsionFree/derivedCharacterLift";
import { adaptExactPermutationCertificate } from "../../torsionFree/exactPermutationArtifact";
import {
  completeStreamedH1Lattice,
  parseStreamedH1IntegralCoreBasis,
} from "../streamedH1Completion";
import { prepareStreamedH1Lattice } from "../streamedH1Lattice";
import { parseStreamedH1ModularCoreTranscript } from "../streamedH1ModularTranscript";
import { buildStreamedLawfulDavisOracle } from "../streamedLawfulDavis";
import { bindStreamedFullH1Lattice } from "../streamedRank19TrackB";

export interface CompactCubeRank19InputPaths {
  system: string;
  certificate: string;
  generalizedCompression: string;
  coreBasis: string;
  modularTranscript30011: string;
  modularTranscript32749: string;
}

export interface LoadedCompactCubeRank19Inputs {
  paths: Record<keyof CompactCubeRank19InputPaths, string>;
  oracle: ReturnType<typeof buildStreamedLawfulDavisOracle>;
  generalizedCompression: GeneralizedCompressionCertificate;
  completion: ReturnType<typeof completeStreamedH1Lattice>;
  h1Binding: ReturnType<typeof bindStreamedFullH1Lattice>;
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${path} is not a regular file within ${maximumBytes} bytes.`,
    );
  }
  return readFileSync(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Strictly replay all tracked inputs needed by either rank-19 Track-B runner. */
export function loadCompactCubeRank19Inputs(
  supplied: CompactCubeRank19InputPaths,
  onStage?: (stage: string) => void,
): LoadedCompactCubeRank19Inputs {
  const paths = Object.fromEntries(
    Object.entries(supplied).map(([name, path]) => [name, resolve(path)]),
  ) as Record<keyof CompactCubeRank19InputPaths, string>;
  const portable = (path: string): string =>
    relative(process.cwd(), path).replaceAll("\\", "/");
  const systemBytes = boundedFile(paths.system, 16 * 1024 * 1024);
  const compressedAction = boundedFile(paths.certificate, 128 * 1024 * 1024);
  const actionBytes =
    compressedAction[0] === 0x1f && compressedAction[1] === 0x8b
      ? gunzipSync(compressedAction, { maxOutputLength: 256 * 1024 * 1024 })
      : compressedAction;
  const parent = adaptExactPermutationCertificate(
    parseJson(systemBytes, paths.system),
    parseJson(actionBytes, paths.certificate),
    {
      candidateId: "rank19-adaptive-track-b-parent",
      candidateName: "Rank-19 adaptive Track-B parent action",
      callerAssertedProvenance: {
        sourceArtifact: {
          path: portable(paths.certificate),
          sha256: sha256(compressedAction),
          encoding: compressedAction === actionBytes ? "json" : "gzip-json",
        },
        sourceSystemFile: {
          path: portable(paths.system),
          sha256: sha256(systemBytes),
        },
      },
    },
  );
  const lift = buildExactZ2CharacterLift(
    parent.system,
    parent.action,
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    {
      candidateId: "rank19-adaptive-track-b-z2-lift",
      candidateName: "Rank-19 adaptive Track-B exact Z/2 lift",
    },
  );
  if (!lift.acceptedCandidate) {
    throw new Error("The exact rank-19 Z/2 lift was rejected.");
  }
  const oracle = buildStreamedLawfulDavisOracle({
    system: parent.system,
    generatorImages: lift.acceptedCandidate.generatorImages,
  });
  const generalizedCompression = parseJson(
    boundedFile(paths.generalizedCompression, 64 * 1024 * 1024),
    paths.generalizedCompression,
  ) as GeneralizedCompressionCertificate;
  onStage?.("load exact action, lift, oracle, and generalized compression");

  const preparation = prepareStreamedH1Lattice(oracle);
  const storedCoreBasisBytes = boundedFile(paths.coreBasis, 64 * 1024 * 1024);
  const coreBasisContainerSha256 = sha256(storedCoreBasisBytes);
  if (
    coreBasisContainerSha256 !==
    "1c30dcb941d8e723c4032aadd591fb3efe19e5b20b33d30223075a8b2892f1ad"
  ) {
    throw new Error(
      `Integral core-basis container SHA-256 is ${coreBasisContainerSha256}; expected the tracked rank-19 artifact.`,
    );
  }
  const coreBasisBytes =
    storedCoreBasisBytes[0] === 0x1f && storedCoreBasisBytes[1] === 0x8b
      ? gunzipSync(storedCoreBasisBytes, {
          maxOutputLength: 64 * 1024 * 1024,
        })
      : storedCoreBasisBytes;
  const coreBasisContentSha256 = sha256(coreBasisBytes);
  if (
    coreBasisContentSha256 !==
    "b81fbf5d0f387ce62ccffe8d3698a7f6fad4f16a36698b7dd0cbc2c883c7f370"
  ) {
    throw new Error(
      `Integral core-basis content SHA-256 is ${coreBasisContentSha256}; expected the tracked rank-19 payload.`,
    );
  }
  const coreBasis = parseStreamedH1IntegralCoreBasis(
    coreBasisBytes.toString("utf8"),
    {
      sourceArtifactSha256: coreBasisContentSha256,
      expectedCoreColumnCount:
        preparation.certificate.peel.unresolvedColumnCount,
      expectedCoreRowCount: preparation.certificate.peel.nonpivotRowCount,
    },
  );
  const parseModularTranscript = (
    path: string,
    modulusPrime: number,
    expectedContainerSha256: string,
    expectedContentSha256: string,
  ) => {
    const stored = boundedFile(path, 64 * 1024 * 1024);
    const containerSha256 = sha256(stored);
    if (containerSha256 !== expectedContainerSha256) {
      throw new Error(
        `Modular transcript ${path} has container SHA-256 ${containerSha256}; expected ${expectedContainerSha256}.`,
      );
    }
    const decoded =
      stored[0] === 0x1f && stored[1] === 0x8b
        ? gunzipSync(stored, { maxOutputLength: 64 * 1024 * 1024 })
        : stored;
    const contentSha256 = sha256(decoded);
    if (contentSha256 !== expectedContentSha256) {
      throw new Error(
        `Modular transcript ${path} has content SHA-256 ${contentSha256}; expected ${expectedContentSha256}.`,
      );
    }
    return parseStreamedH1ModularCoreTranscript(decoded.toString("utf8"), {
      sourceArtifactSha256: expectedContentSha256,
      modulusPrime,
      preparation,
      integralCoreBasis: coreBasis,
      backend: "LinBox/Givaro",
      backendVersion: "1.7.0-4/4.2.0",
      algorithm: "GaussDomain::InPlaceLinearPivoting",
    });
  };
  const modular30011 = parseModularTranscript(
    paths.modularTranscript30011,
    30_011,
    "a08e6af7e33ac4353020af8a2a8ab5ada6bc01c3bf7e4a136703f62b650b923d",
    "e1ee69886d250aff960f527c16396ddbb6a6d2cad0397c40bad750913b5f960c",
  );
  const modular32749 = parseModularTranscript(
    paths.modularTranscript32749,
    32_749,
    "326864ee604bccbe131928726d046ddd00cdb5d5201089b11786cdb541853451",
    "aa11a098739ebfa20eb0743d6cfa56ecc52169a3000bfe641fecfd962b7b8006",
  );
  const completion = completeStreamedH1Lattice({
    oracle,
    preparation,
    coreBasis,
    modularRankWitnesses: [modular30011.witness, modular32749.witness],
  });
  if (completion.certificate.status !== "passed") {
    const failedChecks = Object.entries(completion.certificate.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(
      `The complete H^1 replay failed checks ${failedChecks.join(", ")}: ${completion.certificate.errors.join(" ")}`,
    );
  }
  const h1Binding = bindStreamedFullH1Lattice(completion.certificate);
  onStage?.("replay and bind the complete integral H^1 lattice");
  return {
    paths,
    oracle,
    generalizedCompression,
    completion,
    h1Binding,
  };
}
