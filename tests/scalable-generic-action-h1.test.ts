import { beforeAll, describe, expect, it } from "vitest";

import jnw from "../public/examples/jnw_cube_graph.json";
import {
  buildGenericActionH1Certificate,
  type GenericActionH1BuildResult,
} from "../src/fibering/genericActionH1";
import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  type GenericSparseIntegerMatrix,
} from "../src/fibering/genericSparseModularRank";
import {
  prepareGenericStreamedH1,
  type GenericStreamedH1Preparation,
} from "../src/fibering/genericStreamedH1Preparation";
import { buildJnwCubePositiveControlCertificate } from "../src/fibering/jnwCubePositiveControl";
import {
  buildScalableGenericActionH1,
  computeScalableGenericActionH1CertificateDigest,
  computeScalableGenericActionH1IntegralKernelWitnessDigest,
  replayScalableGenericActionH1,
  scalableGenericActionH1SourceBindings,
  sealScalableGenericActionH1IntegralKernelWitness,
  type ScalableGenericActionH1BuildInput,
  type ScalableGenericActionH1Certificate,
} from "../src/fibering/scalableGenericActionH1";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
} from "../src/fibering/streamedLawfulDavis";

function materializeBoundary(
  preparation: ReturnType<typeof prepareGenericStreamedH1>,
): GenericSparseIntegerMatrix {
  const rows: GenericSparseIntegerMatrix["rows"] = [];
  preparation.forEachBoundaryRow((row) => {
    rows.push({ row: row.row, entries: row.entries });
  });
  return {
    schemaVersion: 1,
    rowCount: preparation.certificate.boundary.rowCount,
    columnCount: preparation.certificate.boundary.columnCount,
    rows,
  };
}

describe("end-to-end scalable generic action H1 adapter", () => {
  let buildInput: ScalableGenericActionH1BuildInput;
  let dense: GenericActionH1BuildResult;

  beforeAll(() => {
    const positiveControl = buildJnwCubePositiveControlCertificate(jnw);
    const accepted = positiveControl.finiteAction;
    dense = buildGenericActionH1Certificate(jnw, accepted);
    expect(dense.certificate.status).toBe("passed");
    const oracle = buildStreamedLawfulDavisOracle({
      system: jnw,
      generatorImages: accepted.candidate.generatorImages,
    });
    const preparation = prepareGenericStreamedH1(oracle);
    const rankRequest = buildGenericSparseModularRankWorkerRequest({
      matrix: materializeBoundary(preparation),
      sourceBindings: scalableGenericActionH1SourceBindings(
        preparation,
        accepted,
      ),
      modulusPrime: 65_521,
    });
    const modularRankCertificate = certifyGenericSparseModularRank(rankRequest);
    const denseH1 = dense.certificate.h1;
    if (denseH1 === undefined) {
      throw new Error("The dense JNW fixture omitted its H1 basis.");
    }
    const integralKernelWitness =
      sealScalableGenericActionH1IntegralKernelWitness({
        preparation,
        modularRankCertificate,
        basis: denseH1.basis,
        integralLeftInverseRows: denseH1.leftInverseRows,
      });
    buildInput = {
      oracle,
      accepted,
      preparation,
      modularRankCertificate,
      integralKernelWitness,
    };
  });

  it("certifies JNW H1, wall saturation, and a Track-B cocycle section", () => {
    const result = buildScalableGenericActionH1(buildInput);
    const denseH1 = dense.certificate.h1;
    const denseWalls = dense.certificate.walls;
    expect(result.certificate.status).toBe("passed");
    expect(
      buildInput.preparation.certificate.export.linboxSparseRow
        .genericSparseMatrixDigest,
    ).toBe(buildInput.modularRankCertificate.source.matrixDigest);
    expect(result.certificate.errors).toEqual([]);
    expect(result.certificate.h1).toMatchObject({
      rank: denseH1?.rank,
      relationRank: denseH1?.relationRank,
      isomorphicTo: denseH1?.isomorphicTo,
      wallRank: denseWalls?.wallRank,
      wallIndexInSaturation: denseWalls?.wallIndexInSaturation,
      wallSaturationEqualsFullH1: denseWalls?.saturationEqualsFullH1,
    });
    expect(result.certificate.completion?.walls).toMatchObject({
      smithInvariantFactors: denseWalls?.smithInvariantFactors,
      quotientByWallLattice: denseWalls?.quotientByWallLattice,
    });
    expect(Object.values(result.certificate.checks).every(Boolean)).toBe(true);
    expect(result.integralCocycleBasis?.coordinateIds).toEqual(
      dense.integralCocycleBasis?.coordinateIds,
    );
    expect(result.integralCocycleBasis).not.toBeNull();
    for (let point = 0; point < buildInput.oracle.degree; point += 1) {
      for (
        let generator = 0;
        generator < buildInput.oracle.generatorCount;
        generator += 1
      ) {
        expect(
          result.integralCocycleBasis?.edgeCoordinatePairs(point, generator),
        ).toEqual(
          dense.integralCocycleBasis?.edgeCoordinatePairs(point, generator),
        );
      }
    }
  });

  it("replays preparation, modular rank, primitive completion, and storage exactly", () => {
    const certificate = buildScalableGenericActionH1(buildInput).certificate;
    const replay = replayScalableGenericActionH1(buildInput, certificate);
    expect(replay.status).toBe("passed");
    expect(Object.values(replay.checks).every(Boolean)).toBe(true);
    expect(replay.rebuiltCertificateDigest).toBe(certificate.certificateDigest);
  });

  it("records modular replay resource exhaustion as replayable incomplete", () => {
    const boundedInput: ScalableGenericActionH1BuildInput = {
      ...buildInput,
      rankReplayBudgets: { maxRows: 0 },
    };
    const certificate = buildScalableGenericActionH1(boundedInput).certificate;
    expect(certificate.status).toBe("incomplete");
    expect(certificate.modularRank.status).toBe("incomplete");
    expect(certificate.stopReason).toMatch(/resource|row count|bound/i);
    expect(certificate.errors).toEqual([]);
    expect(
      replayScalableGenericActionH1(
        { ...boundedInput, rankReplayBudgets: undefined },
        certificate,
      ).status,
    ).toBe("passed");
  });

  it("propagates completion resource exhaustion as replayable incomplete", () => {
    const boundedInput: ScalableGenericActionH1BuildInput = {
      ...buildInput,
      completionBudgets: { maxModularWorkingNonzeros: 0 },
    };
    const certificate = buildScalableGenericActionH1(boundedInput).certificate;
    expect(certificate.status).toBe("incomplete");
    expect(certificate.modularRank.status).toBe("passed");
    expect(certificate.completion?.status).toBe("incomplete");
    expect(certificate.stopReason).toMatch(/working nonzeros|resource|bound/i);
    expect(certificate.errors).toEqual([]);
    expect(
      replayScalableGenericActionH1(boundedInput, certificate).status,
    ).toBe("passed");
  });

  it("reconstructs matrix providers from the oracle instead of trusting runtime methods", () => {
    const forgedPreparation: GenericStreamedH1Preparation = {
      ...buildInput.preparation,
      forEachBoundaryRow(visitor): void {
        buildInput.preparation.forEachBoundaryRow((row) => {
          const changed = structuredClone(row);
          if (changed.row === 0 && changed.entries.length > 0) {
            changed.entries[0][1] = (
              BigInt(changed.entries[0][1]) + 1n
            ).toString();
          }
          visitor(changed);
        });
      },
    };
    const canonical = buildScalableGenericActionH1(buildInput);
    const rebuilt = buildScalableGenericActionH1({
      ...buildInput,
      preparation: forgedPreparation,
    });
    expect(rebuilt.certificate.status).toBe("passed");
    expect(rebuilt.certificate.certificateDigest).toBe(
      canonical.certificate.certificateDigest,
    );
  });

  it("reconstructs rank-two and wall methods from the accepted action", () => {
    const forgedOracle: StreamedLawfulDavisOracle = {
      ...buildInput.oracle,
      forEachRankTwoCell(): never {
        throw new Error("forged rank-two stream was called");
      },
      wallBinding(): never {
        throw new Error("forged wall binding was called");
      },
    };
    const canonical = buildScalableGenericActionH1(buildInput);
    const rebuilt = buildScalableGenericActionH1({
      ...buildInput,
      oracle: forgedOracle,
    });
    expect(rebuilt.certificate.status).toBe("passed");
    expect(
      rebuilt.certificate.checks.suppliedOracleStructureMatchesCanonical,
    ).toBe(true);
    expect(rebuilt.certificate.certificateDigest).toBe(
      canonical.certificate.certificateDigest,
    );
    expect(rebuilt.integralCocycleBasis?.edgeCoordinatePairs(0, 0)).toEqual(
      canonical.integralCocycleBasis?.edgeCoordinatePairs(0, 0),
    );
    expect(
      replayScalableGenericActionH1(
        { ...buildInput, oracle: forgedOracle },
        rebuilt.certificate,
      ).status,
    ).toBe("passed");
  });

  it("rejects a genuinely different action oracle with valid internal structure", () => {
    const degree = buildInput.accepted.candidate.index;
    const relabel = Array.from({ length: degree }, (_unused, point) => point);
    [relabel[0], relabel[1]] = [relabel[1], relabel[0]];
    const relabeledRows = buildInput.accepted.candidate.generatorImages.map(
      (row) =>
        Array.from(
          { length: degree },
          (_unused, point) => relabel[row[relabel[point]]],
        ),
    );
    const mismatchedOracle = buildStreamedLawfulDavisOracle({
      system: buildInput.oracle.system,
      generatorImages: relabeledRows,
    });
    expect(mismatchedOracle.actionRowsCanonicalSha256).not.toBe(
      buildInput.oracle.actionRowsCanonicalSha256,
    );
    const mismatchedInput = { ...buildInput, oracle: mismatchedOracle };
    const certificate =
      buildScalableGenericActionH1(mismatchedInput).certificate;
    expect(certificate.status).toBe("failed");
    expect(certificate.checks.actionRowsMatchOracle).toBe(false);
    expect(certificate.checks.suppliedOracleStructureMatchesCanonical).toBe(
      false,
    );
    expect(
      replayScalableGenericActionH1(mismatchedInput, certificate).status,
    ).toBe("passed");
  });

  it("rejects a forged torsion-free certificate and mismatched nonfree action rows", () => {
    const forgedCertificate = structuredClone(buildInput.accepted);
    forgedCertificate.certificate.warnings.push("forged provenance");
    const certificateFailure = buildScalableGenericActionH1({
      ...buildInput,
      accepted: forgedCertificate,
    }).certificate;
    expect(certificateFailure.status).toBe("failed");
    expect(certificateFailure.checks.actionRowsMatchOracle).toBe(true);
    expect(
      certificateFailure.checks.suppliedTorsionFreeCertificateBoundToAction,
    ).toBe(false);
    expect(certificateFailure.checks.independentTorsionFreeReplayPassed).toBe(
      true,
    );
    expect(
      replayScalableGenericActionH1(
        { ...buildInput, accepted: forgedCertificate },
        certificateFailure,
      ).status,
    ).toBe("passed");

    const nonfreeRows = structuredClone(buildInput.accepted);
    nonfreeRows.candidate.generatorImages =
      nonfreeRows.candidate.generatorImages.map(() =>
        Array.from(
          { length: nonfreeRows.candidate.index },
          (_unused, point) => point,
        ),
      );
    const actionFailure = buildScalableGenericActionH1({
      ...buildInput,
      accepted: nonfreeRows,
    }).certificate;
    expect(actionFailure.status).toBe("failed");
    expect(actionFailure.checks.actionRowsMatchOracle).toBe(false);
    expect(actionFailure.checks.independentTorsionFreeReplayPassed).toBe(false);
  });

  it("rejects resealed kernel/source and stored-certificate forgeries", () => {
    const changedKernel = structuredClone(buildInput.integralKernelWitness);
    const firstEntry = changedKernel.basis[0]?.entries[0];
    if (firstEntry === undefined) throw new Error("Missing JNW basis entry.");
    firstEntry[1] = (BigInt(firstEntry[1]) + 1n).toString();
    changedKernel.witnessDigest =
      computeScalableGenericActionH1IntegralKernelWitnessDigest(changedKernel);
    expect(
      buildScalableGenericActionH1({
        ...buildInput,
        integralKernelWitness: changedKernel,
      }).certificate.status,
    ).toBe("failed");

    const changedSource = structuredClone(buildInput.integralKernelWitness);
    changedSource.source.preparationDigest = "0".repeat(64);
    changedSource.witnessDigest =
      computeScalableGenericActionH1IntegralKernelWitnessDigest(changedSource);
    const sourceFailure = buildScalableGenericActionH1({
      ...buildInput,
      integralKernelWitness: changedSource,
    }).certificate;
    expect(sourceFailure.status).toBe("failed");
    expect(sourceFailure.checks.integralKernelSourceBound).toBe(false);
    expect(sourceFailure.completion).toBeUndefined();
    expect(
      replayScalableGenericActionH1(
        { ...buildInput, integralKernelWitness: changedSource },
        sourceFailure,
      ).status,
    ).toBe("passed");

    const stored = structuredClone(
      buildScalableGenericActionH1(buildInput).certificate,
    ) as ScalableGenericActionH1Certificate;
    if (stored.h1 === undefined) throw new Error("Missing stored H1 result.");
    stored.h1.rank += 1;
    stored.certificateDigest =
      computeScalableGenericActionH1CertificateDigest(stored);
    const replay = replayScalableGenericActionH1(buildInput, stored);
    expect(replay.status).toBe("failed");
    expect(replay.checks.storedCertificateDigestValid).toBe(true);
    expect(replay.checks.exactRebuildMatches).toBe(false);
  });
});
