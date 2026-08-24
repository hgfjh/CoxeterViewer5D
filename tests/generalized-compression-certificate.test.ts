import { describe, expect, it } from "vitest";

import { buildCoverCompression } from "../src/compression";
import {
  buildGeneralizedCompressionCertificate,
  computeGeneralizedCompressionArchiveHash,
  materializeGeneralizedCompressionFaceCompatibility,
  materializeGeneralizedCompressionFibers,
  verifyGeneralizedCompressionCertificate,
} from "../src/davis/generalizedCompression";
import A3 from "../src/examples/A3.json";
import I2_5 from "../src/examples/I2_5.json";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const A3_SYSTEM = A3 as CoxeterSystemInput;
const I2_5_SYSTEM = I2_5 as CoxeterSystemInput;

function permutations(values: number[]): number[][] {
  if (values.length === 0) {
    return [[]];
  }
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2, 3]);
  const indexByKey = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  const adjacentTranspositions = [
    [1, 0, 2, 3],
    [0, 2, 1, 3],
    [0, 1, 3, 2],
  ];
  return {
    id: "a3-regular-generalized-compression-test",
    index: elements.length,
    generatorImages: adjacentTranspositions.map((generator) =>
      elements.map((element) => {
        const image = indexByKey.get(
          generator.map((point) => element[point]).join(","),
        );
        if (image === undefined) {
          throw new Error("The regular S4 action fixture is incomplete.");
        }
        return image;
      }),
    ),
    backend: "test-exact",
  };
}

function i2RegularAction(m = 5): TorsionFreeActionCandidate {
  const index = 2 * m;
  const encode = (rotation: number, reflected: number): number =>
    2 * ((rotation + m) % m) + reflected;
  return {
    id: `i2-${m}-regular-generalized-compression-test`,
    index,
    generatorImages: [
      Array.from({ length: index }, (_unused, point) =>
        encode(Math.floor(point / 2), 1 - (point % 2)),
      ),
      Array.from({ length: index }, (_unused, point) => {
        const rotation = Math.floor(point / 2);
        return point % 2 === 0
          ? encode(rotation - 1, 1)
          : encode(rotation + 1, 0);
      }),
    ],
    pointLabels: Array.from({ length: index }, (_unused, point) => `q${point}`),
    backend: "test-exact",
  };
}

function certify(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function restrictedOrbits(
  candidate: TorsionFreeActionCandidate,
  generators: readonly number[],
): number[][] {
  if (generators.length === 0) {
    return Array.from({ length: candidate.index }, (_unused, point) => [point]);
  }
  const seen = new Uint8Array(candidate.index);
  const orbits: number[][] = [];
  for (let start = 0; start < candidate.index; start += 1) {
    if (seen[start] === 1) continue;
    const orbit = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < orbit.length; cursor += 1) {
      for (const generator of generators) {
        const image = candidate.generatorImages[generator][orbit[cursor]];
        if (seen[image] === 0) {
          seen[image] = 1;
          orbit.push(image);
        }
      }
    }
    orbit.sort((left, right) => left - right);
    orbits.push(orbit);
  }
  return orbits.sort((left, right) => left[0] - right[0]);
}

function containedFaceOrbits(
  candidate: TorsionFreeActionCandidate,
  faceGenerators: readonly number[],
  cofacePoints: readonly number[],
): number[][] {
  const allowed = new Set(cofacePoints);
  return restrictedOrbits(candidate, faceGenerators).filter((orbit) =>
    orbit.every((point) => allowed.has(point)),
  );
}

describe("generalized compression certificate", () => {
  it("exhausts every rooted A3 cell and every U<T face coset", () => {
    const accepted = certify(A3_SYSTEM, a3RegularAction());
    const certificate = buildGeneralizedCompressionCertificate(
      A3_SYSTEM,
      accepted,
    );

    expect(certificate.sphericalTypes).toHaveLength(8);
    expect(certificate.faceCompatibility).toHaveLength(19);
    expect(certificate.rootedSourceCellCount).toBe(8 * 24);
    expect(certificate.compressedCellCount).toBe(75);
    expect(certificate.cellCountByDimension).toEqual({
      "0": 24,
      "1": 36,
      "2": 14,
      "3": 1,
    });

    for (const type of certificate.sphericalTypes) {
      expect(type.rootedSourceCellCount).toBe(24);
      expect(type.compressedCellCount).toBe(24 / type.subgroupOrder);
      expect(type.expectedFiberCardinality).toBe(type.subgroupOrder);

      const materialized = materializeGeneralizedCompressionFibers(
        A3_SYSTEM,
        accepted,
        type.sphericalSubsetId,
        { maxRootedSourceCells: 24 },
      );
      const expected = restrictedOrbits(
        accepted.candidate,
        type.generators,
      ).map((actionPoints) => ({
        representativePoint: actionPoints[0],
        actionPoints,
      }));
      expect(materialized).toEqual(expected);
      expect(materialized).toHaveLength(type.compressedCellCount);
      expect(
        materialized.every(
          (fiber) =>
            fiber.actionPoints.length === type.subgroupOrder &&
            fiber.representativePoint === fiber.actionPoints[0],
        ),
      ).toBe(true);
      const roots = materialized
        .flatMap((fiber) => fiber.actionPoints)
        .sort((left, right) => left - right);
      expect(roots).toEqual(
        Array.from({ length: 24 }, (_unused, point) => point),
      );
    }

    const typeByIndex = new Map(
      certificate.sphericalTypes.map((type) => [type.typeIndex, type]),
    );
    for (const relation of certificate.faceCompatibility) {
      const faceType = typeByIndex.get(relation.faceTypeIndex)!;
      const cofaceType = typeByIndex.get(relation.cofaceTypeIndex)!;
      const cofaceFibers = materializeGeneralizedCompressionFibers(
        A3_SYSTEM,
        accepted,
        cofaceType.sphericalSubsetId,
        { maxRootedSourceCells: 24 },
      );
      const expectedFacesPerCoface =
        cofaceType.subgroupOrder / faceType.subgroupOrder;

      expect(relation.expectedFacesPerCoface).toBe(expectedFacesPerCoface);
      expect(relation.rootedFaceRecordCount).toBe(24);
      expect(relation.compressedFaceIncidenceCount).toBe(
        cofaceFibers.length * expectedFacesPerCoface,
      );
      for (const coface of cofaceFibers) {
        const faces = containedFaceOrbits(
          accepted.candidate,
          faceType.generators,
          coface.actionPoints,
        );
        expect(faces).toHaveLength(expectedFacesPerCoface);
        expect(faces.flat().sort((left, right) => left - right)).toEqual(
          coface.actionPoints,
        );
      }
    }

    const emptyType = certificate.sphericalTypes.find(
      (type) => type.dimension === 0,
    )!;
    const topType = certificate.sphericalTypes.find(
      (type) => type.dimension === 3,
    )!;
    const materializedFaceMap =
      materializeGeneralizedCompressionFaceCompatibility(
        A3_SYSTEM,
        accepted,
        emptyType.sphericalSubsetId,
        topType.sphericalSubsetId,
        { maxRecords: 24 },
      );
    expect(materializedFaceMap.rootedRecords).toHaveLength(24);
    expect(materializedFaceMap.compressedIncidences).toHaveLength(24);
    expect(
      materializedFaceMap.rootedRecords.every(
        (record) =>
          record.faceRepresentativePoint === record.actionPoint &&
          record.cofaceRepresentativePoint === 0,
      ),
    ).toBe(true);

    expect(
      verifyGeneralizedCompressionCertificate(A3_SYSTEM, accepted, certificate),
    ).toMatchObject({ valid: true, errors: [] });
  });

  it("uses a compact streamed face transcript instead of materialized rooted-cell and strict-incidence objects", () => {
    const accepted = certify(A3_SYSTEM, a3RegularAction());
    const certificate = buildGeneralizedCompressionCertificate(
      A3_SYSTEM,
      accepted,
      {
        rootHashChunkSize: 5,
        fiberHashChunkSize: 2,
        faceHashChunkSize: 3,
      },
    );
    const json = JSON.stringify(certificate);

    expect(certificate.encoding).toMatchObject({
      rootHashChunkSize: 5,
      fiberHashChunkSize: 2,
      faceHashChunkSize: 3,
      strictFaceIncidencesMaterialized: false,
      rootedSourceCellObjectsMaterialized: false,
    });
    for (const type of certificate.sphericalTypes) {
      expect(type.rootImageChunkHashes).toHaveLength(Math.ceil(24 / 5));
      expect(type.fiberChunkHashes).toHaveLength(
        Math.ceil(type.compressedCellCount / 2),
      );
      expect(
        type.rootImageChunkHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)),
      ).toBe(true);
      expect(
        type.fiberChunkHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)),
      ).toBe(true);
    }
    for (const relation of certificate.faceCompatibility) {
      expect(relation.rootedTranscriptEncoding).toBe(
        "factorized-root-image-pair",
      );
      expect(relation.rootedTranscriptFactorHashes).toHaveLength(2);
      expect(relation.rootedTranscriptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(relation.compressedTranscriptChunkHashes).toHaveLength(
        Math.ceil(relation.compressedFaceIncidenceCount / 3),
      );
    }
    expect(json).not.toContain('"rootedCells"');
    expect(json).not.toContain('"fibers"');
    expect(json).not.toContain('"actionPoints"');
    expect(json).not.toContain('"representativeByPoint"');
    expect(json).not.toContain('"faceIncidences"');
    expect(json).not.toContain('"properFaceCellIds"');
    expect(json).not.toContain('"rootedSourceCellId"');
    expect(() =>
      materializeGeneralizedCompressionFibers(A3_SYSTEM, accepted, "T:0,1,2", {
        maxRootedSourceCells: 23,
      }),
    ).toThrow(/exceeds its bound/i);
  });

  it("rejects source, fiber, and face commitment tampering after rehashing", () => {
    const accepted = certify(A3_SYSTEM, a3RegularAction());
    const certificate = buildGeneralizedCompressionCertificate(
      A3_SYSTEM,
      accepted,
      {
        rootHashChunkSize: 5,
        fiberHashChunkSize: 2,
        faceHashChunkSize: 3,
      },
    );
    const mutations: Array<(artifact: typeof certificate) => void> = [
      (artifact) => {
        artifact.source.actionRowsCanonicalSha256 = "0".repeat(64);
      },
      (artifact) => {
        artifact.sphericalTypes[0].rootImageChunkHashes[0] = "1".repeat(64);
      },
      (artifact) => {
        artifact.sphericalTypes.at(-1)!.fiberChunkHashes[0] = "2".repeat(64);
      },
      (artifact) => {
        artifact.sphericalTypes.at(-1)!.compressedCellCount -= 1;
      },
      (artifact) => {
        artifact.faceCompatibility[0].rootedTranscriptFactorHashes[0] =
          "3".repeat(64);
      },
      (artifact) => {
        artifact.faceCompatibility.at(-1)!.compressedTranscriptChunkHashes[0] =
          "4".repeat(64);
      },
      (artifact) => {
        artifact.faceCompatibility.at(-1)!.compressedFaceIncidenceCount -= 1;
      },
    ];

    for (const mutate of mutations) {
      const broken = structuredClone(certificate);
      mutate(broken);
      // A malicious producer can update the outer hash. Replay must still
      // reject data that does not reconstruct from the certified action.
      broken.archiveHash = computeGeneralizedCompressionArchiveHash(broken);
      expect(
        verifyGeneralizedCompressionCertificate(A3_SYSTEM, accepted, broken)
          .valid,
      ).toBe(false);
    }

    const staleArchive = structuredClone(certificate);
    staleArchive.archiveHash = "5".repeat(64);
    expect(
      verifyGeneralizedCompressionCertificate(A3_SYSTEM, accepted, staleArchive)
        .valid,
    ).toBe(false);
  });

  it("records omission of the materialized rank-at-most-two bridge as not checked", () => {
    const accepted = certify(A3_SYSTEM, a3RegularAction());
    const certificate = buildGeneralizedCompressionCertificate(
      A3_SYSTEM,
      accepted,
    );

    expect(certificate.rankAtMostTwoAgreement).toMatchObject({
      status: "passed",
      scope: "definition-level",
      method: "action-rooted-truncation",
      checks: { materializedCompressionSupplied: false },
    });
    expect(certificate.checks).toMatchObject({
      rankAtMostTwoDefinitionAgreementPassed: true,
      materializedRankAtMostTwoBridgePassed: false,
    });
    expect(
      "vertexFibersAgree" in certificate.rankAtMostTwoAgreement.checks,
    ).toBe(false);
    expect(
      "signedAttachingMapsAgree" in certificate.rankAtMostTwoAgreement.checks,
    ).toBe(false);
  });

  it("binds the rank-at-most-two bridge to endpoints, fibers, and signed attaching maps", () => {
    const accepted = certify(I2_5_SYSTEM, i2RegularAction());
    const quotient = acceptedActionToQuotientComplex(I2_5_SYSTEM, accepted);
    const coverCompression = buildCoverCompression(quotient);
    const sourceQuotientVertexIds = quotient.vertices.map(
      (vertex) => vertex.id,
    );
    const certificate = buildGeneralizedCompressionCertificate(
      I2_5_SYSTEM,
      accepted,
      { sourceQuotientVertexIds, coverCompression },
    );

    expect(certificate.rankAtMostTwoAgreement).toMatchObject({
      status: "passed",
      scope: "materialized-artifact",
      method: "action-rooted-and-materialized-hat-x-to-bar-x",
      counts: { vertices: 10, geometricEdges: 10, rankTwoCells: 1 },
      checks: {
        materializedCompressionSupplied: true,
        sourcePointBindingBijective: true,
        vertexFibersAgree: true,
        directedEdgeAndBigonFibersAgree: true,
        relationFibersAgree: true,
        signedAttachingMapsAgree: true,
        rankAtMostTwoIncidencesAgreeBothWays: true,
      },
    });
    expect(certificate.checks.materializedRankAtMostTwoBridgePassed).toBe(true);
    expect(certificate.rankAtMostTwoAgreement.sourcePointBindingSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(certificate.rankAtMostTwoAgreement.edgeEndpointFiberSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      certificate.rankAtMostTwoAgreement.relationFiberBoundarySha256,
    ).toMatch(/^[0-9a-f]{64}$/);
    expect(certificate.rankAtMostTwoAgreement.incidenceSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(certificate.rankAtMostTwoAgreement.transcriptSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression },
      ),
    ).toMatchObject({ valid: true, errors: [] });
  });

  it("rejects tampered rank-at-most-two bridge data and bound ordinary compressions", () => {
    const accepted = certify(I2_5_SYSTEM, i2RegularAction());
    const quotient = acceptedActionToQuotientComplex(I2_5_SYSTEM, accepted);
    const coverCompression = buildCoverCompression(quotient);
    const sourceQuotientVertexIds = quotient.vertices.map(
      (vertex) => vertex.id,
    );
    const options = { sourceQuotientVertexIds, coverCompression };
    const certificate = buildGeneralizedCompressionCertificate(
      I2_5_SYSTEM,
      accepted,
      options,
    );

    for (const field of [
      "sourcePointBindingSha256",
      "edgeEndpointFiberSha256",
      "relationFiberBoundarySha256",
      "incidenceSha256",
      "transcriptSha256",
    ] as const) {
      const broken = structuredClone(certificate);
      broken.rankAtMostTwoAgreement[field] = "6".repeat(64);
      broken.archiveHash = computeGeneralizedCompressionArchiveHash(broken);
      expect(
        verifyGeneralizedCompressionCertificate(
          I2_5_SYSTEM,
          accepted,
          broken,
          options,
        ).valid,
      ).toBe(false);
    }

    const reorderedIds = [...sourceQuotientVertexIds];
    [reorderedIds[0], reorderedIds[1]] = [reorderedIds[1], reorderedIds[0]];
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds: reorderedIds, coverCompression },
      ).valid,
    ).toBe(false);
    const duplicatedIds = [...sourceQuotientVertexIds];
    duplicatedIds[1] = duplicatedIds[0];
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds: duplicatedIds, coverCompression },
      ).valid,
    ).toBe(false);

    const wrongVertexImage = structuredClone(coverCompression);
    const firstHatVertexId = Object.keys(
      wrongVertexImage.compressionMap.vertexImages,
    )[0];
    const currentBarVertexId =
      wrongVertexImage.compressionMap.vertexImages[firstHatVertexId];
    wrongVertexImage.compressionMap.vertexImages[firstHatVertexId] =
      wrongVertexImage.barX.vertices.find(
        (vertex) => vertex.id !== currentBarVertexId,
      )!.id;
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: wrongVertexImage },
      ).valid,
    ).toBe(false);

    const wrongDirectedEdgeImage = structuredClone(coverCompression);
    const firstHatEdgeId = Object.keys(
      wrongDirectedEdgeImage.compressionMap.directedEdgeImages,
    )[0];
    const currentBarEdgeId =
      wrongDirectedEdgeImage.compressionMap.directedEdgeImages[firstHatEdgeId];
    wrongDirectedEdgeImage.compressionMap.directedEdgeImages[firstHatEdgeId] =
      wrongDirectedEdgeImage.barX.geometricEdges.find(
        (edge) => edge.id !== currentBarEdgeId,
      )!.id;
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        {
          sourceQuotientVertexIds,
          coverCompression: wrongDirectedEdgeImage,
        },
      ).valid,
    ).toBe(false);

    const wrongEndpoint = structuredClone(coverCompression);
    wrongEndpoint.barX.geometricEdges[0].targetVertexId =
      wrongEndpoint.barX.geometricEdges[1].targetVertexId;
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: wrongEndpoint },
      ).valid,
    ).toBe(false);

    const missingFiberSource = structuredClone(coverCompression);
    missingFiberSource.compressionMap.relationFibers[0].hatRelationCellIds.pop();
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: missingFiberSource },
      ).valid,
    ).toBe(false);

    const extraEdgeFiber = structuredClone(coverCompression);
    extraEdgeFiber.compressionMap.edgeFibers.push({
      ...structuredClone(extraEdgeFiber.compressionMap.edgeFibers[0]),
      barEdgeId: "bar:bogus-edge",
    });
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: extraEdgeFiber },
      ).valid,
    ).toBe(false);

    const extraRelationFiber = structuredClone(coverCompression);
    extraRelationFiber.compressionMap.relationFibers.push({
      ...structuredClone(extraRelationFiber.compressionMap.relationFibers[0]),
      barRelationCellId: "bar:bogus-relation",
    });
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: extraRelationFiber },
      ).valid,
    ).toBe(false);

    const wrongRelationImage = structuredClone(coverCompression);
    const firstHatRelationId = Object.keys(
      wrongRelationImage.compressionMap.liftedRelationCellImages,
    )[0];
    wrongRelationImage.compressionMap.liftedRelationCellImages[
      firstHatRelationId
    ] = "not-a-bar-relation";
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: wrongRelationImage },
      ).valid,
    ).toBe(false);

    const wrongBoundary = structuredClone(coverCompression);
    wrongBoundary.barX.relationCells[0].boundaryOccurrences[0].traversal *= -1;
    expect(
      verifyGeneralizedCompressionCertificate(
        I2_5_SYSTEM,
        accepted,
        certificate,
        { sourceQuotientVertexIds, coverCompression: wrongBoundary },
      ).valid,
    ).toBe(false);

    const mapMutations: Array<(copy: typeof coverCompression) => void> = [
      (copy) => {
        const [hatVertexId] = Object.keys(copy.compressionMap.vertexImages);
        copy.compressionMap.vertexImages[hatVertexId] = "bar:missing";
      },
      (copy) => {
        const [hatEdgeId] = Object.keys(copy.compressionMap.directedEdgeImages);
        copy.compressionMap.directedEdgeImages[hatEdgeId] = "bar:missing";
      },
      (copy) => {
        const [hatBigonId] = Object.keys(
          copy.compressionMap.generatorBigonImages,
        );
        copy.compressionMap.generatorBigonImages[hatBigonId] = "bar:missing";
      },
      (copy) => {
        const [hatRelationId] = Object.keys(
          copy.compressionMap.liftedRelationCellImages,
        );
        copy.compressionMap.liftedRelationCellImages[hatRelationId] =
          "bar:missing";
      },
    ];
    for (const mutate of mapMutations) {
      const copy = structuredClone(coverCompression);
      mutate(copy);
      expect(
        verifyGeneralizedCompressionCertificate(
          I2_5_SYSTEM,
          accepted,
          certificate,
          { sourceQuotientVertexIds, coverCompression: copy },
        ).valid,
      ).toBe(false);
    }
  });

  it("refuses to construct fibers from a nonfree spherical action", () => {
    const candidate: TorsionFreeActionCandidate = {
      id: "nonfree-one-point-action",
      index: 1,
      generatorImages: [[0], [0]],
      backend: "test-exact",
    };
    const certificate = certifyTorsionFreeAction(
      I2_5_SYSTEM,
      candidate,
      planSphericalSpecialSubgroups(I2_5_SYSTEM),
    );
    expect(certificate.status).toBe("failed");
    expect(() =>
      buildGeneralizedCompressionCertificate(I2_5_SYSTEM, {
        candidate,
        certificate,
      }),
    ).toThrow(/passed|free|torsion/i);
  });
});
