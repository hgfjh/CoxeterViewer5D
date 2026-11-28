import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  torsionFreeActionFingerprint,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;

export interface OrbifoldIntegralCharacter {
  id: string;
  /** `edgeIncrements[g][q]` is the height change along q --s_g--> q s_g. */
  edgeIncrements: string[][];
  sourceCertificateDigest: string;
}

/**
 * Link evidence for a torsionful quotient must retain the local development.
 * A link obtained after identifying germs by a cell stabilizer is only a
 * quotient-link diagnostic and is deliberately rejected below.
 */
export interface OrbifoldDevelopmentLinkEvidence {
  sourceCertificateDigest: string;
  characterCocycleDigest: string;
  localModel: "rooted-development-stars" | "folded-quotient-links";
  completeVertexOrbitCensus: boolean;
  stabilizerResolved: boolean;
  incidencesComputedBeforeQuotientFolding: boolean;
  allAscendingNonempty: boolean;
  allDescendingNonempty: boolean;
  allAscendingConnected: boolean;
  allDescendingConnected: boolean;
  finiteHeightBandPi1Surjection: boolean;
}

export interface OrbifoldIntersectionPromotionInput {
  system: CoxeterSystemInput;
  /** The possibly torsionful finite action W/K on which H^1 was computed. */
  orbifoldAction: TorsionFreeActionCandidate;
  character: OrbifoldIntegralCharacter;
  /** A separately certified torsion-free action W/H. */
  torsionFreeCoverAction: TorsionFreeActionCandidate;
  torsionFreeCoverCertificate: TorsionFreeActionCertificate;
  developmentLinks?: OrbifoldDevelopmentLinkEvidence;
}

export interface OrbifoldFiniteActionStructureCertificate {
  actionDigest: string;
  actionFingerprint: string;
  degree: number;
  checks: {
    shape: boolean;
    transitive: boolean;
    involutiveGenerators: boolean;
    coxeterRelations: boolean;
  };
  errors: string[];
}

export interface DiagonalIntersectionAction {
  candidate: TorsionFreeActionCandidate;
  /** Projection W/(K intersection H) -> W/K. */
  toOrbifoldPoint: number[];
  /** Projection W/(K intersection H) -> W/H. */
  toTorsionFreeCoverPoint: number[];
  degreeOverOrbifoldSubgroup: number;
  degreeOverTorsionFreeCoverSubgroup: number;
  projectionDigest: string;
}

export interface OrbifoldIntersectionPromotionCertificate {
  schemaVersion: 1;
  kind: "orbifold-intersection-promotion-certificate";
  status: "passed" | "not-established" | "failed";
  method: "diagonal-coset-action-and-development-link-guard";
  source: {
    systemDigest: string;
    orbifoldActionDigest: string;
    torsionFreeCoverActionDigest: string;
    suppliedTorsionFreeCertificateDigest: string;
    sourceCharacterCertificateDigest: string;
  };
  orbifoldAction: OrbifoldFiniteActionStructureCertificate;
  torsionFreeCoverAction: OrbifoldFiniteActionStructureCertificate;
  intersection?: {
    candidateId: string;
    indexInAmbientCoxeterGroup: number;
    indexInOrbifoldSubgroup: number;
    indexInTorsionFreeCoverSubgroup: number;
    actionFingerprint: string;
    actionRowsDigest: string;
    projectionDigest: string;
    torsionFreeCertificateDigest: string;
  };
  character: {
    id: string;
    sourceCocycleDigest?: string;
    sourceImageDivisor?: string;
    restrictedImageDivisor?: string;
    normalizationMethod?: "integral-vertex-coboundary-then-divide";
    normalizationPotentialDigest?: string;
    adjustedLiftedCocycleDigest?: string;
    normalizedLiftedCocycleDigest?: string;
  };
  developmentLinks: {
    supplied: boolean;
    accepted: boolean;
    localModel?: OrbifoldDevelopmentLinkEvidence["localModel"];
    sourceCertificateDigest?: string;
    rejectionReasons: string[];
  };
  promotion: {
    status: "eligible-for-torsion-free-track-replay" | "not-established";
    targetSubgroup: "K-intersection-H";
    normalizedRestrictedCharacterPrimitive: boolean;
    ordinaryTorsionFreeTrackReplayRequired: true;
  };
  checks: {
    orbifoldFiniteActionValid: boolean;
    torsionFreeCoverFiniteActionValid: boolean;
    suppliedTorsionFreeCertificateBoundToCoverAction: boolean;
    torsionFreeCoverIndependentlyReplayed: boolean;
    diagonalIntersectionConstructed: boolean;
    intersectionProjectsToBothActions: boolean;
    intersectionTorsionFreeIndependentlyReplayed: boolean;
    sourceCocycleIntegralAntisymmetricAndClosed: boolean;
    sourceCharacterPrimitive: boolean;
    restrictionImageNonzero: boolean;
    restrictionDivisorDividesCoverDegree: boolean;
    normalizedRestrictionIntegralAndPrimitive: boolean;
    rootedDevelopmentLinksAccepted: boolean;
    quotientLinksNotUsed: boolean;
  };
  claims: string[];
  nonClaims: string[];
  errors: string[];
  warnings: string[];
  certificateDigest: string;
}

/** Runtime data used only after every arithmetic promotion check passes. */
export interface OrbifoldIntersectionPromotionRuntime {
  certificate: OrbifoldIntersectionPromotionCertificate;
  diagonal: DiagonalIntersectionAction;
  acceptedIntersection: {
    candidate: TorsionFreeActionCandidate;
    certificate: TorsionFreeActionCertificate;
  };
  normalizedCharacter: OrbifoldIntegralCharacter;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function actionRowsDigest(candidate: TorsionFreeActionCandidate): string {
  return canonicalSha256({
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  });
}

export function certifyOrbifoldFiniteActionStructure(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): OrbifoldFiniteActionStructureCertificate {
  const errors: string[] = [];
  let shape =
    Number.isSafeInteger(candidate.index) &&
    candidate.index > 0 &&
    candidate.generatorImages.length === system.rank;
  if (!shape) errors.push("The action has the wrong rank or degree.");

  if (shape) {
    for (let generator = 0; generator < system.rank; generator += 1) {
      const row = candidate.generatorImages[generator];
      const rowValid =
        row.length === candidate.index &&
        row.every(
          (image) =>
            Number.isSafeInteger(image) &&
            image >= 0 &&
            image < candidate.index,
        ) &&
        new Set(row).size === candidate.index;
      if (!rowValid) {
        shape = false;
        errors.push(
          `Generator ${generator} is not a permutation of the action points.`,
        );
      }
    }
  }

  let transitive = false;
  let involutiveGenerators = false;
  let coxeterRelations = false;
  if (shape) {
    const seen = new Set<number>([0]);
    const queue = [0];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      for (const row of candidate.generatorImages) {
        const image = row[point];
        if (!seen.has(image)) {
          seen.add(image);
          queue.push(image);
        }
      }
    }
    transitive = seen.size === candidate.index;
    if (!transitive) errors.push("The finite action is not transitive.");

    involutiveGenerators = candidate.generatorImages.every((row) =>
      row.every((image, point) => row[image] === point),
    );
    if (!involutiveGenerators) {
      errors.push("At least one Coxeter generator is not involutive.");
    }

    coxeterRelations = true;
    for (let left = 0; left < system.rank; left += 1) {
      for (let right = left + 1; right < system.rank; right += 1) {
        const order = system.coxeterMatrix[left][right];
        if (order === "inf") continue;
        for (let start = 0; start < candidate.index; start += 1) {
          let point = start;
          for (let repeat = 0; repeat < order; repeat += 1) {
            point = candidate.generatorImages[left][point];
            point = candidate.generatorImages[right][point];
          }
          if (point !== start) {
            coxeterRelations = false;
            errors.push(
              `The (${left},${right}) Coxeter relation fails at point ${start}.`,
            );
            break;
          }
        }
      }
    }
  }

  return {
    actionDigest: actionRowsDigest(candidate),
    actionFingerprint: torsionFreeActionFingerprint(system, candidate),
    degree: candidate.index,
    checks: { shape, transitive, involutiveGenerators, coxeterRelations },
    errors: [...new Set(errors)].sort(),
  };
}

function structurePassed(
  certificate: OrbifoldFiniteActionStructureCertificate,
): boolean {
  return Object.values(certificate.checks).every(Boolean);
}

/**
 * The diagonal orbit of (K,H) in W/K x W/H is W/(K intersection H).
 * Only that orbit is materialized; unrelated product-action components are not.
 */
export function buildDiagonalIntersectionAction(
  system: CoxeterSystemInput,
  orbifoldAction: TorsionFreeActionCandidate,
  torsionFreeCoverAction: TorsionFreeActionCandidate,
): DiagonalIntersectionAction {
  const leftCheck = certifyOrbifoldFiniteActionStructure(
    system,
    orbifoldAction,
  );
  const rightCheck = certifyOrbifoldFiniteActionStructure(
    system,
    torsionFreeCoverAction,
  );
  if (!structurePassed(leftCheck) || !structurePassed(rightCheck)) {
    throw new Error(
      "Both source actions must be valid transitive Coxeter actions.",
    );
  }

  const pairs: Array<[number, number]> = [[0, 0]];
  const indexByPair = new Map<string, number>([["0,0", 0]]);
  const rows = Array.from({ length: system.rank }, () => [] as number[]);
  for (let point = 0; point < pairs.length; point += 1) {
    const [leftPoint, rightPoint] = pairs[point];
    for (let generator = 0; generator < system.rank; generator += 1) {
      const target: [number, number] = [
        orbifoldAction.generatorImages[generator][leftPoint],
        torsionFreeCoverAction.generatorImages[generator][rightPoint],
      ];
      const key = `${target[0]},${target[1]}`;
      let targetIndex = indexByPair.get(key);
      if (targetIndex === undefined) {
        targetIndex = pairs.length;
        pairs.push(target);
        indexByPair.set(key, targetIndex);
      }
      rows[generator][point] = targetIndex;
    }
  }

  const degree = pairs.length;
  if (
    degree % orbifoldAction.index !== 0 ||
    degree % torsionFreeCoverAction.index !== 0
  ) {
    throw new Error(
      "A diagonal-orbit degree is not divisible by a source degree.",
    );
  }
  const toOrbifoldPoint = pairs.map(([point]) => point);
  const toTorsionFreeCoverPoint = pairs.map(([, point]) => point);
  if (
    new Set(toOrbifoldPoint).size !== orbifoldAction.index ||
    new Set(toTorsionFreeCoverPoint).size !== torsionFreeCoverAction.index
  ) {
    throw new Error("A diagonal-orbit projection is not surjective.");
  }

  const candidate: TorsionFreeActionCandidate = {
    id: `${orbifoldAction.id}-intersection-${torsionFreeCoverAction.id}`,
    name: `Diagonal intersection of ${orbifoldAction.id} and ${torsionFreeCoverAction.id}`,
    index: degree,
    generatorImages: rows,
    backend: "exact-diagonal-coset-action",
    notes: ["This is the orbit of the two distinguished cosets in W/K x W/H."],
  };
  const projectionDigest = canonicalSha256({
    toOrbifoldPoint,
    toTorsionFreeCoverPoint,
  });
  return {
    candidate,
    toOrbifoldPoint,
    toTorsionFreeCoverPoint,
    degreeOverOrbifoldSubgroup: degree / orbifoldAction.index,
    degreeOverTorsionFreeCoverSubgroup: degree / torsionFreeCoverAction.index,
    projectionDigest,
  };
}

function parseCocycleTable(
  candidate: TorsionFreeActionCandidate,
  input: string[][],
  errors: string[],
): bigint[][] | null {
  if (input.length !== candidate.generatorImages.length) {
    errors.push("The cocycle table has the wrong generator count.");
    return null;
  }
  const parsed: bigint[][] = [];
  for (let generator = 0; generator < input.length; generator += 1) {
    if (input[generator].length !== candidate.index) {
      errors.push(`Cocycle row ${generator} has the wrong point count.`);
      return null;
    }
    const row: bigint[] = [];
    for (const value of input[generator]) {
      if (!INTEGER_PATTERN.test(value)) {
        errors.push(
          `Cocycle entry ${JSON.stringify(value)} is not a canonical integer.`,
        );
        return null;
      }
      row.push(BigInt(value));
    }
    parsed.push(row);
  }
  return parsed;
}

function cocycleClosed(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  table: bigint[][],
  errors: string[],
): boolean {
  let passed = true;
  for (let generator = 0; generator < system.rank; generator += 1) {
    for (let point = 0; point < candidate.index; point += 1) {
      const target = candidate.generatorImages[generator][point];
      if (table[generator][point] + table[generator][target] !== 0n) {
        passed = false;
        errors.push(
          `Cocycle antisymmetry fails on generator ${generator} at point ${point}.`,
        );
      }
    }
  }
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const order = system.coxeterMatrix[left][right];
      if (order === "inf") continue;
      for (let start = 0; start < candidate.index; start += 1) {
        let point = start;
        let sum = 0n;
        for (let repeat = 0; repeat < order; repeat += 1) {
          sum += table[left][point];
          point = candidate.generatorImages[left][point];
          sum += table[right][point];
          point = candidate.generatorImages[right][point];
        }
        if (point !== start || sum !== 0n) {
          passed = false;
          errors.push(
            `Cocycle closure fails on the (${left},${right}) cell rooted at point ${start}.`,
          );
        }
      }
    }
  }
  return passed;
}

/** GCD of periods on a spanning-tree presentation of the action graph. */
function cocycleImageData(
  candidate: TorsionFreeActionCandidate,
  table: bigint[][],
): { divisor: bigint; treePotentials: bigint[] } {
  const potentials: Array<bigint | undefined> = Array(candidate.index).fill(
    undefined,
  );
  potentials[0] = 0n;
  const queue = [0];
  let divisor = 0n;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    const sourcePotential = potentials[point]!;
    for (let generator = 0; generator < table.length; generator += 1) {
      const target = candidate.generatorImages[generator][point];
      const targetPotential = sourcePotential + table[generator][point];
      if (potentials[target] === undefined) {
        potentials[target] = targetPotential;
        queue.push(target);
      } else {
        divisor = gcd(divisor, targetPotential - potentials[target]!);
      }
    }
  }
  return {
    divisor: divisor < 0n ? -divisor : divisor,
    treePotentials: potentials.map((value) => value!),
  };
}

function cocycleImageDivisor(
  candidate: TorsionFreeActionCandidate,
  table: bigint[][],
): bigint {
  return cocycleImageData(candidate, table).divisor;
}

function stringTable(table: readonly (readonly bigint[])[]): string[][] {
  return table.map((row) => row.map((value) => value.toString()));
}

function developmentLinkDecision(
  evidence: OrbifoldDevelopmentLinkEvidence | undefined,
  cocycleDigest: string | undefined,
): {
  accepted: boolean;
  rejectionReasons: string[];
} {
  if (!evidence) {
    return {
      accepted: false,
      rejectionReasons: ["No development-link evidence was supplied."],
    };
  }
  const rejectionReasons: string[] = [];
  if (evidence.localModel !== "rooted-development-stars") {
    rejectionReasons.push(
      "Folded quotient links do not determine links in the local development.",
    );
  }
  if (!evidence.stabilizerResolved) {
    rejectionReasons.push(
      "Cell-stabilizer orbits of link germs were not resolved.",
    );
  }
  if (!evidence.incidencesComputedBeforeQuotientFolding) {
    rejectionReasons.push(
      "Link incidences were computed only after quotient folding.",
    );
  }
  if (!evidence.completeVertexOrbitCensus) {
    rejectionReasons.push("The rooted vertex-orbit census is incomplete.");
  }
  if (evidence.characterCocycleDigest !== cocycleDigest) {
    rejectionReasons.push(
      "The link evidence is not bound to the source cocycle.",
    );
  }
  if (
    !evidence.allAscendingNonempty ||
    !evidence.allDescendingNonempty ||
    !evidence.allAscendingConnected ||
    !evidence.allDescendingConnected
  ) {
    rejectionReasons.push(
      "At least one rooted ascending or descending link fails.",
    );
  }
  if (!evidence.finiteHeightBandPi1Surjection) {
    rejectionReasons.push(
      "The finite-height-band pi_1-surjection gate is absent.",
    );
  }
  return { accepted: rejectionReasons.length === 0, rejectionReasons };
}

function sealCertificate(
  payload: Omit<OrbifoldIntersectionPromotionCertificate, "certificateDigest">,
): OrbifoldIntersectionPromotionCertificate {
  return { ...payload, certificateDigest: canonicalSha256(payload) };
}

/**
 * Promote a character found on a torsionful finite-index subgroup K to the
 * explicit torsion-free subgroup K intersection H. The arithmetic promotion is
 * exact. Morse data is accepted only when its germs and incidences were
 * computed in rooted local developments before quotient folding.
 */
export function buildOrbifoldIntersectionPromotionCertificate(
  input: OrbifoldIntersectionPromotionInput,
): OrbifoldIntersectionPromotionCertificate {
  const errors: string[] = [];
  const warnings: string[] = [];
  const orbifoldStructure = certifyOrbifoldFiniteActionStructure(
    input.system,
    input.orbifoldAction,
  );
  const coverStructure = certifyOrbifoldFiniteActionStructure(
    input.system,
    input.torsionFreeCoverAction,
  );
  errors.push(...orbifoldStructure.errors, ...coverStructure.errors);

  const checks: OrbifoldIntersectionPromotionCertificate["checks"] = {
    orbifoldFiniteActionValid: structurePassed(orbifoldStructure),
    torsionFreeCoverFiniteActionValid: structurePassed(coverStructure),
    suppliedTorsionFreeCertificateBoundToCoverAction: false,
    torsionFreeCoverIndependentlyReplayed: false,
    diagonalIntersectionConstructed: false,
    intersectionProjectsToBothActions: false,
    intersectionTorsionFreeIndependentlyReplayed: false,
    sourceCocycleIntegralAntisymmetricAndClosed: false,
    sourceCharacterPrimitive: false,
    restrictionImageNonzero: false,
    restrictionDivisorDividesCoverDegree: false,
    normalizedRestrictionIntegralAndPrimitive: false,
    rootedDevelopmentLinksAccepted: false,
    quotientLinksNotUsed: true,
  };

  const plan = planSphericalSpecialSubgroups(input.system);
  const replayedCover = certifyTorsionFreeAction(
    input.system,
    input.torsionFreeCoverAction,
    plan,
  );
  checks.suppliedTorsionFreeCertificateBoundToCoverAction =
    input.torsionFreeCoverCertificate.status === "passed" &&
    input.torsionFreeCoverCertificate.actionFingerprint ===
      torsionFreeActionFingerprint(
        input.system,
        input.torsionFreeCoverAction,
      ) &&
    input.torsionFreeCoverCertificate.candidateIndex ===
      input.torsionFreeCoverAction.index;
  checks.torsionFreeCoverIndependentlyReplayed =
    replayedCover.status === "passed";
  if (!checks.suppliedTorsionFreeCertificateBoundToCoverAction) {
    errors.push("The supplied torsion-free certificate is not bound to W/H.");
  }
  if (!checks.torsionFreeCoverIndependentlyReplayed) {
    errors.push("The torsion-free cover action did not replay independently.");
  }

  let diagonal: DiagonalIntersectionAction | undefined;
  let intersectionCertificate: TorsionFreeActionCertificate | undefined;
  if (
    checks.orbifoldFiniteActionValid &&
    checks.torsionFreeCoverFiniteActionValid
  ) {
    try {
      diagonal = buildDiagonalIntersectionAction(
        input.system,
        input.orbifoldAction,
        input.torsionFreeCoverAction,
      );
      checks.diagonalIntersectionConstructed = true;
      checks.intersectionProjectsToBothActions =
        new Set(diagonal.toOrbifoldPoint).size === input.orbifoldAction.index &&
        new Set(diagonal.toTorsionFreeCoverPoint).size ===
          input.torsionFreeCoverAction.index;
      intersectionCertificate = certifyTorsionFreeAction(
        input.system,
        diagonal.candidate,
        plan,
      );
      checks.intersectionTorsionFreeIndependentlyReplayed =
        intersectionCertificate.status === "passed";
      if (!checks.intersectionTorsionFreeIndependentlyReplayed) {
        errors.push(
          "The diagonal intersection action did not replay as torsion-free.",
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const characterErrors: string[] = [];
  const sourceTable = parseCocycleTable(
    input.orbifoldAction,
    input.character.edgeIncrements,
    characterErrors,
  );
  let sourceCocycleDigest: string | undefined;
  let sourceImageDivisor: bigint | undefined;
  let restrictedImageDivisor: bigint | undefined;
  let normalizationPotentialDigest: string | undefined;
  let adjustedLiftedCocycleDigest: string | undefined;
  let normalizedLiftedCocycleDigest: string | undefined;
  if (sourceTable) {
    checks.sourceCocycleIntegralAntisymmetricAndClosed = cocycleClosed(
      input.system,
      input.orbifoldAction,
      sourceTable,
      characterErrors,
    );
    sourceCocycleDigest = canonicalSha256({
      actionRowsDigest: orbifoldStructure.actionDigest,
      edgeIncrements: stringTable(sourceTable),
    });
    sourceImageDivisor = cocycleImageDivisor(input.orbifoldAction, sourceTable);
    checks.sourceCharacterPrimitive = sourceImageDivisor === 1n;

    if (diagonal) {
      const lifted = sourceTable.map((row) =>
        diagonal!.toOrbifoldPoint.map((point) => row[point]),
      );
      const restrictionImage = cocycleImageData(diagonal.candidate, lifted);
      restrictedImageDivisor = restrictionImage.divisor;
      checks.restrictionImageNonzero = restrictedImageDivisor > 0n;
      checks.restrictionDivisorDividesCoverDegree =
        restrictedImageDivisor > 0n &&
        BigInt(diagonal.degreeOverOrbifoldSubgroup) % restrictedImageDivisor ===
          0n;
      if (restrictedImageDivisor > 0n) {
        // Period divisibility does not imply pointwise edge divisibility.
        // Gauge first by the integral potential obtained from a spanning tree:
        // c'(u,v)=c(u,v)+f(u)-f(v). Every c' edge is then a loop period,
        // hence is divisible by d=image(c). Only c'/d is the normalized lift.
        const adjusted = lifted.map((row, generator) =>
          row.map((value, source) => {
            const target =
              diagonal!.candidate.generatorImages[generator][source];
            return (
              value +
              restrictionImage.treePotentials[source] -
              restrictionImage.treePotentials[target]
            );
          }),
        );
        const allDivisible = adjusted.every((row) =>
          row.every((value) => value % restrictedImageDivisor! === 0n),
        );
        const normalized = adjusted.map((row) =>
          row.map((value) => value / restrictedImageDivisor!),
        );
        const normalizedErrors: string[] = [];
        const normalizedClosed = cocycleClosed(
          input.system,
          diagonal.candidate,
          normalized,
          normalizedErrors,
        );
        errors.push(...normalizedErrors);
        checks.normalizedRestrictionIntegralAndPrimitive =
          allDivisible &&
          normalizedClosed &&
          cocycleImageDivisor(diagonal.candidate, normalized) === 1n;
        normalizationPotentialDigest = canonicalSha256({
          intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
          treePotentials: restrictionImage.treePotentials.map((value) =>
            value.toString(),
          ),
        });
        adjustedLiftedCocycleDigest = canonicalSha256({
          intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
          normalizationPotentialDigest,
          edgeIncrements: stringTable(adjusted),
        });
        normalizedLiftedCocycleDigest = canonicalSha256({
          intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
          normalizationMethod: "integral-vertex-coboundary-then-divide",
          normalizationPotentialDigest,
          adjustedLiftedCocycleDigest,
          divisor: restrictedImageDivisor.toString(),
          edgeIncrements: stringTable(normalized),
        });
      }
    }
  }
  errors.push(...characterErrors);
  if (!checks.sourceCharacterPrimitive) {
    errors.push(
      "The source cocycle does not define a primitive epimorphism K -> Z.",
    );
  }
  if (diagonal && !checks.normalizedRestrictionIntegralAndPrimitive) {
    errors.push(
      "The restricted character could not be normalized to a primitive integral character.",
    );
  }

  const linkDecision = developmentLinkDecision(
    input.developmentLinks,
    sourceCocycleDigest,
  );
  checks.rootedDevelopmentLinksAccepted = linkDecision.accepted;
  checks.quotientLinksNotUsed =
    input.developmentLinks?.localModel !== "folded-quotient-links";
  if (!checks.quotientLinksNotUsed) {
    warnings.push(
      "Folded quotient-link data was retained only as a rejected diagnostic.",
    );
  }

  const arithmeticChecks = [
    checks.orbifoldFiniteActionValid,
    checks.torsionFreeCoverFiniteActionValid,
    checks.suppliedTorsionFreeCertificateBoundToCoverAction,
    checks.torsionFreeCoverIndependentlyReplayed,
    checks.diagonalIntersectionConstructed,
    checks.intersectionProjectsToBothActions,
    checks.intersectionTorsionFreeIndependentlyReplayed,
    checks.sourceCocycleIntegralAntisymmetricAndClosed,
    checks.sourceCharacterPrimitive,
    checks.restrictionImageNonzero,
    checks.restrictionDivisorDividesCoverDegree,
    checks.normalizedRestrictionIntegralAndPrimitive,
  ];
  const arithmeticPassed = arithmeticChecks.every(Boolean);
  const eligible = arithmeticPassed && checks.rootedDevelopmentLinksAccepted;
  const status: OrbifoldIntersectionPromotionCertificate["status"] = eligible
    ? "passed"
    : arithmeticPassed
      ? "not-established"
      : "failed";

  return sealCertificate({
    schemaVersion: 1,
    kind: "orbifold-intersection-promotion-certificate",
    status,
    method: "diagonal-coset-action-and-development-link-guard",
    source: {
      systemDigest: canonicalSha256(input.system),
      orbifoldActionDigest: orbifoldStructure.actionDigest,
      torsionFreeCoverActionDigest: coverStructure.actionDigest,
      suppliedTorsionFreeCertificateDigest: canonicalSha256(
        input.torsionFreeCoverCertificate,
      ),
      sourceCharacterCertificateDigest: input.character.sourceCertificateDigest,
    },
    orbifoldAction: orbifoldStructure,
    torsionFreeCoverAction: coverStructure,
    ...(diagonal && intersectionCertificate
      ? {
          intersection: {
            candidateId: diagonal.candidate.id,
            indexInAmbientCoxeterGroup: diagonal.candidate.index,
            indexInOrbifoldSubgroup: diagonal.degreeOverOrbifoldSubgroup,
            indexInTorsionFreeCoverSubgroup:
              diagonal.degreeOverTorsionFreeCoverSubgroup,
            actionFingerprint: torsionFreeActionFingerprint(
              input.system,
              diagonal.candidate,
            ),
            actionRowsDigest: actionRowsDigest(diagonal.candidate),
            projectionDigest: diagonal.projectionDigest,
            torsionFreeCertificateDigest: canonicalSha256(
              intersectionCertificate,
            ),
          },
        }
      : {}),
    character: {
      id: input.character.id,
      ...(sourceCocycleDigest ? { sourceCocycleDigest } : {}),
      ...(sourceImageDivisor === undefined
        ? {}
        : { sourceImageDivisor: sourceImageDivisor.toString() }),
      ...(restrictedImageDivisor === undefined
        ? {}
        : { restrictedImageDivisor: restrictedImageDivisor.toString() }),
      ...(normalizationPotentialDigest
        ? {
            normalizationMethod:
              "integral-vertex-coboundary-then-divide" as const,
            normalizationPotentialDigest,
          }
        : {}),
      ...(adjustedLiftedCocycleDigest ? { adjustedLiftedCocycleDigest } : {}),
      ...(normalizedLiftedCocycleDigest
        ? { normalizedLiftedCocycleDigest }
        : {}),
    },
    developmentLinks: {
      supplied: input.developmentLinks !== undefined,
      accepted: linkDecision.accepted,
      ...(input.developmentLinks
        ? {
            localModel: input.developmentLinks.localModel,
            sourceCertificateDigest:
              input.developmentLinks.sourceCertificateDigest,
          }
        : {}),
      rejectionReasons: linkDecision.rejectionReasons,
    },
    promotion: {
      status: eligible
        ? "eligible-for-torsion-free-track-replay"
        : "not-established",
      targetSubgroup: "K-intersection-H",
      normalizedRestrictedCharacterPrimitive:
        checks.normalizedRestrictionIntegralAndPrimitive,
      ordinaryTorsionFreeTrackReplayRequired: true,
    },
    checks,
    claims: arithmeticPassed
      ? [
          "The diagonal action represents the finite-index subgroup K intersection H.",
          "K intersection H is torsion-free.",
          "The normalized restriction is a primitive integral character on K intersection H.",
          ...(eligible
            ? [
                "The supplied Morse metadata uses stabilizer-resolved rooted development links and is eligible for ordinary torsion-free Track A/B replay.",
              ]
            : []),
        ]
      : [],
    nonClaims: [
      "A folded quotient link is not accepted as a link in the local development.",
      "This adapter does not independently replay the supplied development-link certificate.",
      "Eligibility is not itself an algebraic- or smooth-fibering theorem; the ordinary torsion-free Track A/B replay remains required.",
    ],
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
  });
}

/**
 * Reconstruct the explicit torsion-free action and normalized edge cocycle
 * committed by the promotion certificate. This is intentionally separate from
 * the serialized certificate: downstream Track A/B code receives no callback
 * or mutable table unless every arithmetic digest has replayed.
 */
export function buildOrbifoldIntersectionPromotionRuntime(
  input: OrbifoldIntersectionPromotionInput,
): OrbifoldIntersectionPromotionRuntime {
  const certificate = buildOrbifoldIntersectionPromotionCertificate(input);
  const arithmeticPassed = [
    certificate.checks.orbifoldFiniteActionValid,
    certificate.checks.torsionFreeCoverFiniteActionValid,
    certificate.checks.suppliedTorsionFreeCertificateBoundToCoverAction,
    certificate.checks.torsionFreeCoverIndependentlyReplayed,
    certificate.checks.diagonalIntersectionConstructed,
    certificate.checks.intersectionProjectsToBothActions,
    certificate.checks.intersectionTorsionFreeIndependentlyReplayed,
    certificate.checks.sourceCocycleIntegralAntisymmetricAndClosed,
    certificate.checks.sourceCharacterPrimitive,
    certificate.checks.restrictionImageNonzero,
    certificate.checks.restrictionDivisorDividesCoverDegree,
    certificate.checks.normalizedRestrictionIntegralAndPrimitive,
  ].every(Boolean);
  if (!arithmeticPassed || certificate.intersection === undefined) {
    throw new Error(
      certificate.errors.join(" ") ||
        "The orbifold character did not pass exact intersection promotion.",
    );
  }

  const diagonal = buildDiagonalIntersectionAction(
    input.system,
    input.orbifoldAction,
    input.torsionFreeCoverAction,
  );
  const plan = planSphericalSpecialSubgroups(input.system);
  const intersectionCertificate = certifyTorsionFreeAction(
    input.system,
    diagonal.candidate,
    plan,
  );
  if (intersectionCertificate.status !== "passed") {
    throw new Error(
      "The promoted intersection action no longer replays torsion-free.",
    );
  }

  const parseErrors: string[] = [];
  const sourceTable = parseCocycleTable(
    input.orbifoldAction,
    input.character.edgeIncrements,
    parseErrors,
  );
  if (!sourceTable || parseErrors.length > 0) {
    throw new Error(parseErrors.join(" ") || "The source cocycle is invalid.");
  }
  const lifted = sourceTable.map((row) =>
    diagonal.toOrbifoldPoint.map((point) => row[point]),
  );
  const restrictionImage = cocycleImageData(diagonal.candidate, lifted);
  if (restrictionImage.divisor <= 0n) {
    throw new Error("The restricted character has zero image.");
  }
  const adjusted = lifted.map((row, generator) =>
    row.map((value, source) => {
      const target = diagonal.candidate.generatorImages[generator][source];
      return (
        value +
        restrictionImage.treePotentials[source] -
        restrictionImage.treePotentials[target]
      );
    }),
  );
  if (
    adjusted.some((row) =>
      row.some((value) => value % restrictionImage.divisor !== 0n),
    )
  ) {
    throw new Error(
      "The adjusted restriction is not divisible by its image divisor.",
    );
  }
  const normalized = adjusted.map((row) =>
    row.map((value) => value / restrictionImage.divisor),
  );
  const runtimeDigest = canonicalSha256({
    intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
    normalizationMethod: "integral-vertex-coboundary-then-divide",
    normalizationPotentialDigest: canonicalSha256({
      intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
      treePotentials: restrictionImage.treePotentials.map((value) =>
        value.toString(),
      ),
    }),
    adjustedLiftedCocycleDigest: canonicalSha256({
      intersectionActionRowsDigest: actionRowsDigest(diagonal.candidate),
      normalizationPotentialDigest:
        certificate.character.normalizationPotentialDigest,
      edgeIncrements: stringTable(adjusted),
    }),
    divisor: restrictionImage.divisor.toString(),
    edgeIncrements: stringTable(normalized),
  });
  if (runtimeDigest !== certificate.character.normalizedLiftedCocycleDigest) {
    throw new Error(
      "The runtime normalized cocycle does not match its certificate.",
    );
  }

  return {
    certificate,
    diagonal,
    acceptedIntersection: {
      candidate: diagonal.candidate,
      certificate: intersectionCertificate,
    },
    normalizedCharacter: {
      id: `normalized-restriction:${input.character.id}`,
      edgeIncrements: stringTable(normalized),
      sourceCertificateDigest: runtimeDigest,
    },
  };
}
