import type {
  CoxeterMatrixEntry,
  CoxeterSystemInput,
  DataStatus,
  ExactReal,
  GeometricEntry,
  HyperbolicProjection,
  CertificateSummary,
  CertificateScope,
  SourceRef,
} from "../types";
import {
  evaluatePolynomial,
  finiteCoxeterGramValue,
  geometricGramEntryValue,
} from "./gram";

export interface CoxeterValidationResult {
  ok: boolean;
  value?: CoxeterSystemInput;
  errors: string[];
}

export class CoxeterValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Invalid Coxeter system input:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    this.name = "CoxeterValidationError";
    this.errors = errors;
  }
}

const projections = new Set<HyperbolicProjection>([
  "klein-pca",
  "poincare-pca",
  "klein-axes",
  "poincare-axes",
]);
const dataStatuses = new Set<DataStatus>([
  "toy",
  "placeholder",
  "verified-source",
  "certified",
]);
const certificateStatuses = new Set<CertificateSummary["status"]>([
  "not-certified",
  "passed",
  "failed",
  "skipped",
]);
const certificateScopes = new Set<CertificateScope>([
  "source-transcription",
  "gram-signature",
  "geometry",
  "geometry-intervals",
  "geometry-interval-coordinates",
  "geometry-interval-reflections",
  "projection-bounds",
  "coxiter-diagram",
  "generated-ball",
  "backend-parity",
  "quotient-action",
  "torsion-free",
  "morse-cocycle",
  "local-link-homology",
  "davis-incidence",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function entryLabel(entry: unknown): string {
  return typeof entry === "string" ? JSON.stringify(entry) : String(entry);
}

function isMatrixEntry(value: unknown): value is CoxeterMatrixEntry {
  return value === "inf" || isFiniteNumber(value);
}

function entriesEqual(
  left: CoxeterMatrixEntry,
  right: CoxeterMatrixEntry,
): boolean {
  return left === right;
}

function validateGeometricEntry(
  value: unknown,
  path: string,
  errors: string[],
  sourceRefIds: Set<string>,
): value is GeometricEntry {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object with a geometric Gram entry kind.`);
    return false;
  }

  if (
    value.sourceRefId !== undefined &&
    (typeof value.sourceRefId !== "string" ||
      !sourceRefIds.has(value.sourceRefId))
  ) {
    errors.push(`${path}.sourceRefId must refer to a declared sourceRefs id.`);
  }

  if (value.exact !== undefined) {
    validateExactReal(value.exact, `${path}.exact`, errors);
  }

  switch (value.kind) {
    case "coxeter":
      if (!isInteger(value.m) || value.m < 2) {
        errors.push(`${path}.m must be an integer >= 2.`);
        return false;
      }
      return true;
    case "right":
      return true;
    case "dotted":
      if (!isFiniteNumber(value.coshDistance) || value.coshDistance < 1) {
        errors.push(`${path}.coshDistance must be a finite number >= 1.`);
        return false;
      }
      return true;
    case "numericGram":
      if (!isFiniteNumber(value.value)) {
        errors.push(`${path}.value must be a finite number.`);
        return false;
      }
      return true;
    default:
      errors.push(
        `${path}.kind must be "coxeter", "right", "dotted", or "numericGram".`,
      );
      return false;
  }
}

function validateGeometry(
  value: unknown,
  rank: number,
  coxeterMatrix: CoxeterMatrixEntry[][] | undefined,
  sourceRefIds: Set<string>,
  errors: string[],
): value is CoxeterSystemInput["geometry"] {
  if (!isRecord(value)) {
    errors.push("geometry must be an object when provided.");
    return false;
  }

  if (value.model !== "hyperboloid") {
    errors.push('geometry.model must be "hyperboloid".');
  }

  if (!isInteger(value.dimension) || value.dimension < 1) {
    errors.push("geometry.dimension must be a positive integer.");
  }

  const dimension = isInteger(value.dimension) ? value.dimension : undefined;
  const vectorSize = dimension === undefined ? undefined : dimension + 1;

  if (
    value.projection !== undefined &&
    !projections.has(value.projection as HyperbolicProjection)
  ) {
    errors.push(
      'geometry.projection must be one of "klein-pca", "poincare-pca", "klein-axes", or "poincare-axes".',
    );
  }

  if (value.source !== undefined && typeof value.source !== "string") {
    errors.push("geometry.source must be a string when provided.");
  }

  if (value.normalGram !== undefined) {
    if (!Array.isArray(value.normalGram) || value.normalGram.length !== rank) {
      errors.push(
        `geometry.normalGram must be a ${rank} by ${rank} matrix when provided.`,
      );
    } else {
      value.normalGram.forEach((row, i) => {
        if (!Array.isArray(row) || row.length !== rank) {
          errors.push(
            `geometry.normalGram[${i}] must contain ${rank} entries.`,
          );
          return;
        }

        row.forEach((entry, j) => {
          validateGeometricEntry(
            entry,
            `geometry.normalGram[${i}][${j}]`,
            errors,
            sourceRefIds,
          );
        });
      });
      validateNormalGramAgainstCoxeterMatrix(
        value.normalGram,
        coxeterMatrix,
        errors,
      );
    }
  }

  if (value.normalCoordinates !== undefined) {
    if (
      !Array.isArray(value.normalCoordinates) ||
      value.normalCoordinates.length !== rank
    ) {
      errors.push(
        `geometry.normalCoordinates must have one row per generator (${rank}) when provided.`,
      );
    } else if (vectorSize !== undefined) {
      value.normalCoordinates.forEach((row, i) => {
        if (!Array.isArray(row) || row.length !== vectorSize) {
          errors.push(
            `geometry.normalCoordinates[${i}] must contain ${vectorSize} Lorentz coordinates.`,
          );
          return;
        }

        row.forEach((coordinate, j) => {
          if (!isFiniteNumber(coordinate)) {
            errors.push(
              `geometry.normalCoordinates[${i}][${j}] must be a finite number.`,
            );
          }
        });
      });
    }
  }

  if (value.basepoint !== undefined) {
    if (!Array.isArray(value.basepoint)) {
      errors.push("geometry.basepoint must be an array when provided.");
    } else if (
      vectorSize !== undefined &&
      value.basepoint.length !== vectorSize
    ) {
      errors.push(
        `geometry.basepoint must contain ${vectorSize} Lorentz coordinates.`,
      );
    } else {
      value.basepoint.forEach((coordinate, j) => {
        if (!isFiniteNumber(coordinate)) {
          errors.push(`geometry.basepoint[${j}] must be a finite number.`);
        }
      });
    }
  }

  if (value.certifiedModel !== undefined) {
    validateCertifiedGeometryModel(
      value.certifiedModel,
      "geometry.certifiedModel",
      errors,
      sourceRefIds,
    );
  }

  return errors.length === 0;
}

function validateSourceRefs(
  value: unknown,
  errors: string[],
): { refs: SourceRef[]; ids: Set<string> } {
  const refs: SourceRef[] = [];
  const ids = new Set<string>();

  if (value === undefined) {
    return { refs, ids };
  }

  if (!Array.isArray(value)) {
    errors.push("sourceRefs must be an array when provided.");
    return { refs, ids };
  }

  value.forEach((entry, index) => {
    const path = `sourceRefs[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      errors.push(`${path}.id must be a non-empty string.`);
    } else if (ids.has(entry.id)) {
      errors.push(`sourceRefs contains duplicate id "${entry.id}".`);
    } else {
      ids.add(entry.id);
    }

    if (
      typeof entry.citation !== "string" ||
      entry.citation.trim().length === 0
    ) {
      errors.push(`${path}.citation must be a non-empty string.`);
    }

    for (const optional of ["url", "locator", "notes"] as const) {
      if (
        entry[optional] !== undefined &&
        typeof entry[optional] !== "string"
      ) {
        errors.push(`${path}.${optional} must be a string when provided.`);
      }
    }

    refs.push(entry as unknown as SourceRef);
  });

  return { refs, ids };
}

function validateExactReal(
  value: unknown,
  path: string,
  errors: string[],
): value is ExactReal {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (value.kind !== "algebraic-real") {
    errors.push(`${path}.kind must be "algebraic-real".`);
  }

  if (!isFiniteNumber(value.decimal)) {
    errors.push(`${path}.decimal must be a finite number.`);
  }

  if (
    !Array.isArray(value.minimalPolynomial) ||
    value.minimalPolynomial.length < 2 ||
    !value.minimalPolynomial.every(isFiniteNumber)
  ) {
    errors.push(
      `${path}.minimalPolynomial must contain finite coefficients in descending degree order.`,
    );
  }

  if (
    !Array.isArray(value.isolatingInterval) ||
    value.isolatingInterval.length !== 2 ||
    !value.isolatingInterval.every(isFiniteNumber)
  ) {
    errors.push(`${path}.isolatingInterval must contain two finite numbers.`);
  } else if (value.isolatingInterval[0] >= value.isolatingInterval[1]) {
    errors.push(`${path}.isolatingInterval must be ordered [low, high].`);
  } else if (
    isFiniteNumber(value.decimal) &&
    (value.decimal < value.isolatingInterval[0] ||
      value.decimal > value.isolatingInterval[1])
  ) {
    errors.push(`${path}.decimal must lie inside isolatingInterval.`);
  }

  if (
    Array.isArray(value.minimalPolynomial) &&
    value.minimalPolynomial.every(isFiniteNumber) &&
    isFiniteNumber(value.decimal) &&
    scaledPolynomialResidual(value.minimalPolynomial, value.decimal) > 1e-12
  ) {
    errors.push(
      `${path}.decimal is not a root of minimalPolynomial within scaled tolerance 1e-12.`,
    );
  }

  return errors.length === 0;
}

function scaledPolynomialResidual(coefficients: number[], x: number): number {
  const degree = Math.max(0, coefficients.length - 1);
  const base = Math.max(1, Math.abs(x));
  const scale = coefficients.reduce(
    (total, coefficient, index) =>
      total + Math.abs(coefficient) * base ** (degree - index),
    0,
  );

  // High-degree algebraic dotted weights can have large coefficients. The raw
  // polynomial value at a rounded decimal cache is therefore a poor error
  // measure; this scaled residual checks the cache relative to the polynomial's
  // evaluated size.
  return Math.abs(evaluatePolynomial(coefficients, x)) / Math.max(1, scale);
}

function validateCertificateSummary(
  value: unknown,
  path: string,
  errors: string[],
  sourceRefIds: Set<string>,
): value is CertificateSummary {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (
    typeof value.status !== "string" ||
    !certificateStatuses.has(value.status as CertificateSummary["status"])
  ) {
    errors.push(`${path}.status must be a supported certificate status.`);
  }

  if (typeof value.backend !== "string" || value.backend.trim().length === 0) {
    errors.push(`${path}.backend must be a non-empty string.`);
  }

  for (const optional of [
    "backendVersion",
    "command",
    "checkedAt",
    "inputHash",
    "outputHash",
  ] as const) {
    if (value[optional] !== undefined && typeof value[optional] !== "string") {
      errors.push(`${path}.${optional} must be a string when provided.`);
    }
  }

  if (value.sourceRefIds !== undefined) {
    if (!Array.isArray(value.sourceRefIds)) {
      errors.push(`${path}.sourceRefIds must be an array of strings.`);
    } else {
      value.sourceRefIds.forEach((sourceRefId, index) => {
        if (typeof sourceRefId !== "string" || !sourceRefIds.has(sourceRefId)) {
          errors.push(
            `${path}.sourceRefIds[${index}] must refer to a declared sourceRefs id.`,
          );
        }
      });
    }
  }

  if (value.scopes !== undefined) {
    if (!Array.isArray(value.scopes)) {
      errors.push(`${path}.scopes must be an array of certificate scopes.`);
    } else {
      value.scopes.forEach((scope, index) => {
        if (
          typeof scope !== "string" ||
          !certificateScopes.has(scope as CertificateScope)
        ) {
          errors.push(`${path}.scopes[${index}] is not a supported scope.`);
        }
      });
    }
  }

  if (value.warnings !== undefined && !isStringArray(value.warnings)) {
    errors.push(`${path}.warnings must be an array of strings when provided.`);
  }

  return errors.length === 0;
}

function validateIntervalReal(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an interval-real object.`);
    return;
  }
  if (value.kind !== "interval-real") {
    errors.push(`${path}.kind must be "interval-real".`);
  }
  if (!isFiniteNumber(value.lower) || !isFiniteNumber(value.upper)) {
    errors.push(`${path}.lower and ${path}.upper must be finite numbers.`);
  } else if (value.lower > value.upper) {
    errors.push(`${path}.lower must be <= ${path}.upper.`);
  }
  if (value.decimal !== undefined && !isFiniteNumber(value.decimal)) {
    errors.push(`${path}.decimal must be finite when provided.`);
  }
  if (value.exact !== undefined) {
    validateExactReal(value.exact, `${path}.exact`, errors);
  }
}

function validateIntervalVector(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of interval values.`);
    return;
  }
  value.forEach((entry, index) =>
    validateIntervalReal(entry, `${path}[${index}]`, errors),
  );
}

function validateIntervalMatrix(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of interval rows.`);
    return;
  }
  value.forEach((row, index) =>
    validateIntervalVector(row, `${path}[${index}]`, errors),
  );
}

function validateCertifiedGeometryModel(
  value: unknown,
  path: string,
  errors: string[],
  sourceRefIds: Set<string>,
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return;
  }
  if (!certificateStatuses.has(value.status as CertificateSummary["status"])) {
    errors.push(`${path}.status must be a supported certificate status.`);
  }
  if (value.coordinateSystem !== "hyperboloid") {
    errors.push(`${path}.coordinateSystem must be "hyperboloid".`);
  }
  if (
    value.coordinateType !== "interval-certified-numeric" &&
    value.coordinateType !== "exact-algebraic"
  ) {
    errors.push(
      `${path}.coordinateType must be "interval-certified-numeric" or "exact-algebraic".`,
    );
  }
  if (value.normalCoordinates !== undefined) {
    validateIntervalMatrix(
      value.normalCoordinates,
      `${path}.normalCoordinates`,
      errors,
    );
  }
  if (value.basepoint !== undefined) {
    validateIntervalVector(value.basepoint, `${path}.basepoint`, errors);
  }
  if (value.reflectionMatrices !== undefined) {
    if (!Array.isArray(value.reflectionMatrices)) {
      errors.push(`${path}.reflectionMatrices must be an array.`);
    } else {
      value.reflectionMatrices.forEach((matrix, index) =>
        validateIntervalMatrix(
          matrix,
          `${path}.reflectionMatrices[${index}]`,
          errors,
        ),
      );
    }
  }
  for (const key of [
    "lorentzPreservationResidual",
    "reflectionInvolutionResidual",
  ] as const) {
    if (value[key] !== undefined) {
      validateIntervalReal(value[key], `${path}.${key}`, errors);
    }
  }
  if (value.chamberInequalityBounds !== undefined) {
    validateIntervalVector(
      value.chamberInequalityBounds,
      `${path}.chamberInequalityBounds`,
      errors,
    );
  }
  if (value.certificate === undefined) {
    errors.push(`${path}.certificate is required.`);
  } else {
    validateCertificateSummary(
      value.certificate,
      `${path}.certificate`,
      errors,
      sourceRefIds,
    );
  }
  if (value.warnings !== undefined && !isStringArray(value.warnings)) {
    errors.push(`${path}.warnings must be an array of strings.`);
  }
}

function validateNormalGramAgainstCoxeterMatrix(
  normalGram: unknown,
  coxeterMatrix: CoxeterMatrixEntry[][] | undefined,
  errors: string[],
) {
  if (!Array.isArray(normalGram)) {
    return;
  }

  const tolerance = 1e-8;
  for (let i = 0; i < normalGram.length; i += 1) {
    const row = normalGram[i];
    if (!Array.isArray(row)) {
      continue;
    }

    for (let j = 0; j < row.length; j += 1) {
      const entry = row[j];
      if (!isRecord(entry) || typeof entry.kind !== "string") {
        continue;
      }

      if (i === j) {
        const value = geometricGramEntryValue(entry as GeometricEntry);
        if (Math.abs(value - 1) > tolerance) {
          errors.push(`geometry.normalGram[${i}][${j}] must have value 1.`);
        }
        continue;
      }

      const mirror = normalGram[j]?.[i];
      if (isRecord(mirror)) {
        const left = geometricGramEntryValue(entry as GeometricEntry);
        const right = geometricGramEntryValue(mirror as GeometricEntry);
        if (Math.abs(left - right) > tolerance) {
          errors.push(
            `geometry.normalGram must be symmetric: values [${i}][${j}] and [${j}][${i}] differ.`,
          );
        }
      }

      const coxeterEntry = coxeterMatrix?.[i]?.[j];
      if (coxeterEntry === undefined || i > j) {
        continue;
      }

      if (coxeterEntry === "inf") {
        if (
          entry.kind !== "dotted" &&
          !(
            entry.kind === "numericGram" &&
            geometricGramEntryValue(entry as GeometricEntry) <= -1 + tolerance
          )
        ) {
          errors.push(
            `geometry.normalGram[${i}][${j}] must be dotted or numeric <= -1 for infinite Coxeter entry.`,
          );
        }
      } else {
        const expected = finiteCoxeterGramValue(coxeterEntry);
        const actual = geometricGramEntryValue(entry as GeometricEntry);
        if (Math.abs(actual - expected) > tolerance) {
          errors.push(
            `geometry.normalGram[${i}][${j}] value ${actual} does not match Coxeter entry m=${coxeterEntry}.`,
          );
        }
      }
    }
  }
}

export function validateCoxeterSystemInput(
  input: unknown,
): CoxeterValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Input must be a JSON object."],
    };
  }

  if (input.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (
    input.dataStatus !== undefined &&
    (typeof input.dataStatus !== "string" ||
      !dataStatuses.has(input.dataStatus as DataStatus))
  ) {
    errors.push(
      'dataStatus must be one of "toy", "placeholder", "verified-source", or "certified".',
    );
  }

  const { refs: sourceRefs, ids: sourceRefIds } = validateSourceRefs(
    input.sourceRefs,
    errors,
  );

  if (
    (input.dataStatus === "verified-source" ||
      input.dataStatus === "certified") &&
    sourceRefs.length === 0
  ) {
    errors.push(`${input.dataStatus} examples must declare sourceRefs.`);
  }

  if (input.certificate !== undefined) {
    validateCertificateSummary(
      input.certificate,
      "certificate",
      errors,
      sourceRefIds,
    );
  }

  if (
    input.dataStatus === "certified" &&
    (!isRecord(input.certificate) || input.certificate.status !== "passed")
  ) {
    errors.push('dataStatus "certified" requires certificate.status "passed".');
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    errors.push("name must be a non-empty string.");
  }

  if (
    input.description !== undefined &&
    typeof input.description !== "string"
  ) {
    errors.push("description must be a string when provided.");
  }

  if (!isInteger(input.rank) || input.rank < 1) {
    errors.push("rank must be a positive integer.");
  }

  const rank =
    isInteger(input.rank) && input.rank >= 1 ? input.rank : undefined;

  if (!Array.isArray(input.generators)) {
    errors.push("generators must be an array.");
  } else {
    if (rank !== undefined && input.generators.length !== rank) {
      errors.push(`generators must contain exactly rank entries (${rank}).`);
    }

    const generatorIds = new Set<string>();
    input.generators.forEach((generator, i) => {
      if (!isRecord(generator)) {
        errors.push(`generators[${i}] must be an object.`);
        return;
      }

      if (
        typeof generator.id !== "string" ||
        generator.id.trim().length === 0
      ) {
        errors.push(`generators[${i}].id must be a non-empty string.`);
      } else if (generatorIds.has(generator.id)) {
        errors.push(`generators contains duplicate id "${generator.id}".`);
      } else {
        generatorIds.add(generator.id);
      }

      if (
        typeof generator.label !== "string" ||
        generator.label.trim().length === 0
      ) {
        errors.push(`generators[${i}].label must be a non-empty string.`);
      }

      if (
        generator.colorHint !== undefined &&
        typeof generator.colorHint !== "string"
      ) {
        errors.push(
          `generators[${i}].colorHint must be a string when provided.`,
        );
      }
    });
  }

  if (!Array.isArray(input.coxeterMatrix)) {
    errors.push("coxeterMatrix must be an array of rows.");
  } else if (rank !== undefined) {
    if (input.coxeterMatrix.length !== rank) {
      errors.push(`coxeterMatrix must have ${rank} rows.`);
    }

    input.coxeterMatrix.forEach((row, i) => {
      if (!Array.isArray(row)) {
        errors.push(`coxeterMatrix[${i}] must be an array.`);
        return;
      }

      if (row.length !== rank) {
        errors.push(`coxeterMatrix[${i}] must contain ${rank} entries.`);
      }

      row.forEach((entry, j) => {
        if (!isMatrixEntry(entry)) {
          errors.push(
            `coxeterMatrix[${i}][${j}] must be a finite number or "inf"; got ${entryLabel(entry)}.`,
          );
          return;
        }

        if (i === j) {
          if (entry !== 1) {
            errors.push(`coxeterMatrix[${i}][${j}] must be 1 on the diagonal.`);
          }
          return;
        }

        if (entry === "inf") {
          return;
        }

        if (!Number.isInteger(entry) || entry < 2) {
          errors.push(
            `coxeterMatrix[${i}][${j}] must be an integer >= 2 or "inf".`,
          );
        }
      });
    });

    for (let i = 0; i < input.coxeterMatrix.length; i += 1) {
      const row = input.coxeterMatrix[i];
      if (!Array.isArray(row)) {
        continue;
      }

      for (let j = i + 1; j < row.length; j += 1) {
        const left = row[j];
        const mirrorRow = input.coxeterMatrix[j];
        const right = Array.isArray(mirrorRow) ? mirrorRow[i] : undefined;

        if (
          isMatrixEntry(left) &&
          isMatrixEntry(right) &&
          !entriesEqual(left, right)
        ) {
          errors.push(
            `coxeterMatrix must be symmetric: entry [${i}][${j}] is ${entryLabel(
              left,
            )}, but [${j}][${i}] is ${entryLabel(right)}.`,
          );
        }
      }
    }
  }

  if (input.notes !== undefined && !isStringArray(input.notes)) {
    errors.push("notes must be an array of strings when provided.");
  }

  if (input.warnings !== undefined && !isStringArray(input.warnings)) {
    errors.push("warnings must be an array of strings when provided.");
  }

  const coxeterMatrix =
    Array.isArray(input.coxeterMatrix) &&
    input.coxeterMatrix.every((row) => Array.isArray(row))
      ? (input.coxeterMatrix as CoxeterMatrixEntry[][])
      : undefined;

  if (input.geometry !== undefined && rank !== undefined) {
    validateGeometry(input.geometry, rank, coxeterMatrix, sourceRefIds, errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: input as unknown as CoxeterSystemInput,
    errors: [],
  };
}

export function parseCoxeterSystemInput(input: unknown): CoxeterSystemInput {
  const result = validateCoxeterSystemInput(input);

  if (!result.ok || result.value === undefined) {
    throw new CoxeterValidationError(result.errors);
  }

  return result.value;
}
