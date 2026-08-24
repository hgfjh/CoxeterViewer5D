import type { DirectedMorseLink } from "../walls";
import type { VirtualAlgebraicFiberingCertificate } from "./certificate";
import type { DirectedMorseLinkCertificate } from "./plMorseHypotheses";

export interface VirtualFiberingValidationResult {
  valid: boolean;
  checks: {
    structure: boolean;
    cellularBoundarySums: boolean;
    schreierRelators: boolean;
    primitiveImage: boolean;
    linkConnectivityWitnesses: boolean;
    conclusionConsistency: boolean;
  };
  errors: string[];
}

/**
 * Recheck the arithmetic and finite graph witnesses in an exported virtual
 * fibering artifact. This validates the certificate's recorded evidence; it
 * does not independently rediscover the subgroup or invoke the cited theorem.
 */
export function validateVirtualAlgebraicFiberingCertificate(
  input: unknown,
): VirtualFiberingValidationResult {
  const errors: string[] = [];
  const checks = {
    structure: false,
    cellularBoundarySums: false,
    schreierRelators: false,
    primitiveImage: false,
    linkConnectivityWitnesses: false,
    conclusionConsistency: false,
  };

  if (!isRecord(input)) {
    return invalid(checks, ["Certificate must be a JSON object."]);
  }
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "virtual-algebraic-fibering-certificate" ||
    input.method !== "cooriented-walls-schreier-and-pl-morse"
  ) {
    return invalid(checks, [
      "Unsupported virtual-fibering certificate schema, kind, or method.",
    ]);
  }

  const certificate = input as unknown as VirtualAlgebraicFiberingCertificate;
  checks.structure = checkStructure(certificate, errors);
  checks.cellularBoundarySums = checkCellularBoundarySums(certificate, errors);
  checks.schreierRelators = checkSchreierRelators(certificate, errors);
  checks.primitiveImage = checkPrimitiveImage(certificate, errors);
  checks.linkConnectivityWitnesses = checkLinkWitnesses(certificate, errors);
  checks.conclusionConsistency = checkConclusionConsistency(
    certificate,
    errors,
  );

  return {
    valid: Object.values(checks).every(Boolean) && errors.length === 0,
    checks,
    errors: [...new Set(errors)].sort(compareIds),
  };
}

function checkStructure(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  const valid =
    Number.isSafeInteger(certificate.source?.subgroupIndex) &&
    certificate.source.subgroupIndex > 0 &&
    Array.isArray(certificate.wallHomomorphism?.cocycle?.edgeValues) &&
    Array.isArray(certificate.wallHomomorphism?.cocycle?.relationChecks) &&
    Array.isArray(
      certificate.primitiveHomomorphism?.presentation?.generators,
    ) &&
    Array.isArray(certificate.primitiveHomomorphism?.presentation?.relators) &&
    Array.isArray(certificate.plMorse?.checks) &&
    Array.isArray(certificate.plMorse?.linkCertificates) &&
    Array.isArray(certificate.morseLinks?.vertices);
  if (!valid)
    errors.push("The certificate is missing required finite evidence arrays.");
  return valid;
}

function checkCellularBoundarySums(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  let passed = true;
  for (const check of certificate.wallHomomorphism.cocycle.relationChecks) {
    let runningSum = 0;
    if (
      check.steps.length !== check.expectedBoundaryLength ||
      check.boundaryEdgeIds.length !== check.expectedBoundaryLength ||
      check.boundaryVertexIds.length !== check.expectedBoundaryLength
    ) {
      passed = false;
      errors.push(`${check.cellId}: incomplete compressed relation boundary.`);
    }
    for (const [index, step] of check.steps.entries()) {
      const contribution = step.traversal * step.storedEdgeValue;
      runningSum += contribution;
      if (
        !Number.isSafeInteger(step.storedEdgeValue) ||
        contribution !== step.signedContribution ||
        runningSum !== step.runningSum ||
        step.boundaryIndex !== index
      ) {
        passed = false;
        errors.push(
          `${check.cellId}: invalid cocycle arithmetic at boundary step ${index}.`,
        );
      }
    }
    if (
      runningSum !== check.boundarySum ||
      check.passed !== (runningSum === 0)
    ) {
      passed = false;
      errors.push(
        `${check.cellId}: recorded cellular boundary sum is inconsistent.`,
      );
    }
  }
  const allZero = certificate.wallHomomorphism.cocycle.relationChecks.every(
    (check) => check.boundarySum === 0 && check.passed,
  );
  if (
    certificate.wallHomomorphism.cocycle.checks.relationBoundarySumsZero !==
      allZero ||
    certificate.wallHomomorphism.cocycle.closed !==
      (allZero && certificate.wallHomomorphism.cocycle.failures.length === 0)
  ) {
    passed = false;
    errors.push("Cellular cocycle summary disagrees with its relation checks.");
  }
  return passed;
}

function checkSchreierRelators(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  const homomorphism = certificate.primitiveHomomorphism;
  const rawById = new Map(
    homomorphism.generatorValues.map((entry) => [
      entry.generatorId,
      entry.rawWallValue,
    ]),
  );
  const primitiveById = new Map(
    homomorphism.generatorValues.map((entry) => [
      entry.generatorId,
      entry.primitiveValue,
    ]),
  );
  const checkById = new Map(
    homomorphism.relatorChecks.map((check) => [check.relatorId, check]),
  );
  let passed =
    rawById.size === homomorphism.presentation.generators.length &&
    checkById.size === homomorphism.presentation.relators.length;
  for (const relator of homomorphism.presentation.relators) {
    const recorded = checkById.get(relator.id);
    const rawValue = evaluateWord(relator.word, rawById);
    const primitiveValue = evaluateWord(relator.word, primitiveById);
    if (
      !recorded ||
      recorded.rawValue !== rawValue ||
      recorded.primitiveValue !== primitiveValue ||
      recorded.passed !== (rawValue === 0 && primitiveValue === 0)
    ) {
      passed = false;
      errors.push(
        `${relator.id}: rewritten Schreier-relator evaluation is inconsistent.`,
      );
    }
  }
  const allZero = homomorphism.relatorChecks.every(
    (check) =>
      check.rawValue === 0 && check.primitiveValue === 0 && check.passed,
  );
  if (homomorphism.checks.everyRelatorMapsToZero !== allZero) {
    passed = false;
    errors.push("Schreier-relator summary disagrees with its evaluations.");
  }
  return passed;
}

function checkPrimitiveImage(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  const homomorphism = certificate.primitiveHomomorphism;
  const rawValues = homomorphism.generatorValues.map(
    (entry) => entry.rawWallValue,
  );
  const primitiveValues = homomorphism.generatorValues.map(
    (entry) => entry.primitiveValue,
  );
  const divisor = homomorphism.normalizationDivisor;
  const rawGcd = gcdAll(rawValues);
  if (divisor === null) {
    const validZeroOrUnavailable =
      rawGcd === 0 &&
      !homomorphism.primitiveImage &&
      !homomorphism.checks.normalizedImageIsZ &&
      homomorphism.normalizedBezoutIdentity === undefined &&
      primitiveValues.every((value) => value === 0);
    if (!validZeroOrUnavailable) {
      errors.push(
        "The unavailable/zero primitive image is internally inconsistent.",
      );
    }
    return validZeroOrUnavailable;
  }
  let passed =
    Number.isSafeInteger(divisor) &&
    divisor > 0 &&
    rawGcd === divisor &&
    gcdAll(primitiveValues) === 1 &&
    homomorphism.generatorValues.every(
      (entry) => entry.rawWallValue === divisor * entry.primitiveValue,
    );
  if (!passed) {
    errors.push(
      "Generator values do not certify the recorded primitive normalization.",
    );
  }
  const bezout = homomorphism.normalizedBezoutIdentity;
  const primitiveById = new Map(
    homomorphism.generatorValues.map((entry) => [
      entry.generatorId,
      entry.primitiveValue,
    ]),
  );
  const bezoutSum = bezout?.terms.reduce(
    (sum, term) =>
      sum +
      term.coefficient * (primitiveById.get(term.generatorId) ?? Number.NaN),
    0,
  );
  if (
    !bezout ||
    bezout.gcd !== 1 ||
    bezout.evaluatedSum !== 1 ||
    bezoutSum !== 1 ||
    !bezout.verified
  ) {
    passed = false;
    errors.push("The normalized Bezout identity does not evaluate to 1.");
  }
  if (
    homomorphism.primitiveImage !== passed ||
    homomorphism.checks.normalizedImageIsZ !== passed
  ) {
    errors.push(
      "Primitive-image summary disagrees with its gcd/Bezout evidence.",
    );
    return false;
  }
  return passed;
}

function checkLinkWitnesses(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  const linksByVertex = new Map(
    certificate.morseLinks.vertices.map((entry) => [entry.vertexId, entry]),
  );
  const certificatesByVertex = new Map(
    certificate.plMorse.linkCertificates.map((entry) => [
      entry.vertexId,
      entry,
    ]),
  );
  let passed = linksByVertex.size === certificatesByVertex.size;
  for (const [vertexId, links] of linksByVertex) {
    const witness = certificatesByVertex.get(vertexId);
    if (
      !witness ||
      !checkDirectedLinkWitness(links.ascending, witness.ascending) ||
      !checkDirectedLinkWitness(links.descending, witness.descending)
    ) {
      passed = false;
      errors.push(
        `${vertexId}: a directed-link connectivity witness is invalid.`,
      );
    }
  }
  return passed;
}

function checkDirectedLinkWitness(
  link: DirectedMorseLink,
  witness: DirectedMorseLinkCertificate,
): boolean {
  const vertexIds = link.vertices.map((vertex) => vertex.id).sort(compareIds);
  const cornerById = new Map(link.corners.map((corner) => [corner.id, corner]));
  if (
    !sameIds(vertexIds, witness.vertexIds) ||
    !sameIds([...cornerById.keys()], witness.cornerIds) ||
    witness.kind !== link.kind ||
    witness.nonempty !== link.nonempty ||
    witness.connected !== link.connected
  ) {
    return false;
  }
  const parent = new Map(vertexIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id);
    if (current === undefined) return "";
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  for (const cornerId of witness.spanningTreeCornerIds) {
    const corner = cornerById.get(cornerId);
    if (!corner) return false;
    const left = find(corner.firstLinkVertexId);
    const right = find(corner.secondLinkVertexId);
    if (!left || !right || left === right) return false;
    parent.set(right, left);
  }
  const componentCount = new Set(vertexIds.map(find)).size;
  const expectedTreeSize = Math.max(
    0,
    vertexIds.length - link.components.length,
  );
  return (
    witness.spanningTreeVerified &&
    witness.spanningTreeCornerIds.length === expectedTreeSize &&
    componentCount === link.components.length &&
    sameComponents(link.components, witness.components)
  );
}

function checkConclusionConsistency(
  certificate: VirtualAlgebraicFiberingCertificate,
  errors: string[],
): boolean {
  const failedIds = certificate.plMorse.checks
    .filter((check) => check.status === "failed")
    .map((check) => check.id)
    .sort(compareIds);
  const missingIds = certificate.plMorse.checks
    .filter((check) => check.status === "missing-evidence")
    .map((check) => check.id)
    .sort(compareIds);
  const plStatus =
    failedIds.length > 0
      ? "failed"
      : missingIds.length > 0
        ? "incomplete"
        : "passed";
  const explicit =
    certificate.primitiveHomomorphism.status === "passed" &&
    certificate.primitiveHomomorphism.primitiveImage;
  const fibering =
    explicit &&
    certificate.plMorse.conclusion.virtualAlgebraicFibrationCertified;
  const valid =
    sameIds(failedIds, certificate.plMorse.failedCheckIds) &&
    sameIds(missingIds, certificate.plMorse.missingEvidenceCheckIds) &&
    certificate.plMorse.status === plStatus &&
    certificate.status === plStatus &&
    certificate.result.explicitEpimorphismToZ === explicit &&
    certificate.result.finitelyGeneratedKernel === fibering &&
    certificate.result.virtualAlgebraicFibration === fibering;
  if (!valid)
    errors.push("Conclusion flags do not follow from the recorded checks.");
  return valid;
}

function evaluateWord(
  word: Array<{ generatorId: string; exponent: 1 | -1 }>,
  values: ReadonlyMap<string, number>,
): number {
  return word.reduce(
    (sum, letter) =>
      sum + letter.exponent * (values.get(letter.generatorId) ?? Number.NaN),
    0,
  );
}

function gcdAll(values: number[]): number {
  let divisor = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return -1;
    let left = Math.abs(divisor);
    let right = Math.abs(value);
    while (right !== 0) [left, right] = [right, left % right];
    divisor = left;
  }
  return divisor;
}

function sameIds(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort(compareIds);
  const sortedRight = [...right].sort(compareIds);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((id, index) => id === sortedRight[index])
  );
}

function sameComponents(left: string[][], right: string[][]): boolean {
  const normalize = (components: string[][]) =>
    components
      .map((component) => [...component].sort(compareIds).join("\u0000"))
      .sort(compareIds);
  return sameIds(normalize(left), normalize(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  checks: VirtualFiberingValidationResult["checks"],
  errors: string[],
): VirtualFiberingValidationResult {
  return { valid: false, checks, errors };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
