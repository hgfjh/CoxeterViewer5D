import { parseCoxeterSystemInput } from "../coxeter";
import {
  certifyQuotientAction,
  type QuotientComplex,
  type QuotientEdge,
  type QuotientTwoCell,
} from "../quotient";
import { torsionFreeActionFingerprint } from "./certification";
import type {
  AcceptedActionQuotientOptions,
  TorsionFreeCandidateResult,
} from "./types";

function vertexId(point: number): string {
  return `q${point}`;
}

function edgeId(generator: number, sourcePoint: number): string {
  return `edge:g${generator}:${vertexId(sourcePoint)}`;
}

function relationBoundary(
  generatorImages: number[][],
  start: number,
  pair: [number, number],
  m: number,
): { points: number[]; edgeIds: string[] } {
  const points: number[] = [];
  const edgeIds: string[] = [];
  let current = start;
  for (let step = 0; step < 2 * m; step += 1) {
    const generator = pair[step % 2];
    points.push(current);
    edgeIds.push(edgeId(generator, current));
    current = generatorImages[generator][current];
  }
  if (current !== start) {
    throw new Error(
      `Accepted action relation (${pair.join(",")}, m=${m}) does not close at point ${start}.`,
    );
  }
  return { points, edgeIds };
}

function buildRankTwoCells(
  system: ReturnType<typeof parseCoxeterSystemInput>,
  accepted: TorsionFreeCandidateResult,
): QuotientTwoCell[] {
  const cells: QuotientTwoCell[] = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") {
        continue;
      }
      const visited = new Set<number>();
      for (let point = 0; point < accepted.candidate.index; point += 1) {
        if (visited.has(point)) {
          continue;
        }
        const pair: [number, number] = [left, right];
        const boundary = relationBoundary(
          accepted.candidate.generatorImages,
          point,
          pair,
          m,
        );
        const distinctPoints = new Set(boundary.points);
        if (distinctPoints.size !== 2 * m) {
          throw new Error(
            `Passed torsion-free action produced a nonfree ${2 * m}-step boundary for pair (${left},${right}).`,
          );
        }
        for (const boundaryPoint of distinctPoints) {
          visited.add(boundaryPoint);
        }
        cells.push({
          id: `cell:g${left}-g${right}:orbit:${point}`,
          generatorPair: pair,
          m,
          boundaryVertexIds: boundary.points.map(vertexId),
          boundaryEdgeIds: boundary.edgeIds,
        });
      }
    }
  }
  return cells;
}

/**
 * Converts a passed finite-action certificate into the project quotient schema.
 * Relation cells are exact action orbits; no drawing coordinates are introduced.
 */
export function acceptedActionToQuotientComplex(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  options: AcceptedActionQuotientOptions = {},
): QuotientComplex {
  const system = parseCoxeterSystemInput(input);
  const { candidate, certificate } = accepted;
  if (certificate.status !== "passed") {
    throw new Error(
      `Candidate ${candidate.id} cannot be converted because its torsion-free certificate is ${certificate.status}.`,
    );
  }
  if (
    certificate.candidateId !== candidate.id ||
    certificate.candidateIndex !== candidate.index ||
    certificate.actionFingerprint !==
      torsionFreeActionFingerprint(system, candidate)
  ) {
    throw new Error(
      "Torsion-free certificate does not match the supplied action.",
    );
  }

  const vertices = Array.from(
    { length: candidate.index },
    (_unused, point) => ({
      id: vertexId(point),
      label: candidate.pointLabels?.[point] ?? vertexId(point),
      representativeWord: candidate.representativeWords?.[point],
    }),
  );
  const edges: QuotientEdge[] = [];
  for (let generator = 0; generator < system.rank; generator += 1) {
    for (let point = 0; point < candidate.index; point += 1) {
      const target = candidate.generatorImages[generator][point];
      edges.push({
        id: edgeId(generator, point),
        source: vertexId(point),
        target: vertexId(target),
        generator,
        inverseEdgeId: edgeId(generator, target),
        label: system.generators[generator].label,
      });
    }
  }

  const certificateSummary = {
    status: "passed" as const,
    backend: "in-repo-tits-action",
    backendVersion: "1",
    scopes: ["quotient-action" as const, "torsion-free" as const],
    checkedAt: options.checkedAt,
    inputHash: certificate.actionFingerprint,
    diagnostics: { torsionFreeActionCertificate: certificate },
    warnings: [
      "The certificate proves the point stabilizer of this supplied transitive action is torsion-free; it does not claim the action has minimum possible index.",
    ],
  };
  const quotient: QuotientComplex = {
    schemaVersion: 1,
    name:
      options.name ??
      `${system.name} torsion-free cover (${candidate.index} sheets)`,
    sourceSystem: system,
    generatorRank: system.rank,
    vertices,
    edges,
    permutationAction: candidate.generatorImages.map((images, generator) => ({
      generator,
      images: Object.fromEntries(
        images.map((image, point) => [vertexId(point), vertexId(image)]),
      ),
    })),
    twoCells: buildRankTwoCells(system, accepted),
    subgroup: {
      name: options.subgroupName ?? candidate.name ?? `Stab(${vertexId(0)})`,
      index: candidate.index,
      source:
        candidate.source ?? candidate.backend ?? "finite permutation action",
      manifoldClaimed: false,
      certificate: certificateSummary,
      notes: [
        "This subgroup is the stabilizer of q0 in the supplied transitive right action.",
        ...(candidate.notes ?? []),
      ],
    },
    verifier: certificateSummary,
    torsionFreeCertificate: {
      status: "passed",
      method: "visible-spherical-stabilizer",
      checkedAt: options.checkedAt,
      checkedSphericalSubsets: certificate.sphericalActions.map((check) => ({
        id: check.sphericalSubsetId,
        generators: check.generators,
        ...(check.expectedOrder.safeInteger === undefined
          ? {}
          : { subgroupOrder: check.expectedOrder.safeInteger }),
        enumeratedElements: check.enumeratedImageElements,
      })),
      witnesses: [],
      limitations: [
        "The in-repo certificate is exact for the supplied finite action and complete spherical plan.",
        "Independent backend verification may still be attached for reproducibility.",
      ],
      errors: [],
      warnings: certificate.warnings,
    },
    warnings: [
      "This quotient records exact finite-action incidence; any later 3D placement is a drawing convention.",
    ],
  };

  const schreierCertificate = certifyQuotientAction(quotient, {
    checkedAt: options.checkedAt,
  });
  if (schreierCertificate.status !== "passed") {
    throw new Error(
      `Generated quotient failed its action/cell certificate: ${schreierCertificate.errors.join(" ")}`,
    );
  }
  return { ...quotient, schreierCertificate };
}
