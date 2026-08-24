import type {
  QuotientComplex,
  QuotientEdge,
  QuotientManifoldStatus,
  QuotientPermutationAction,
  QuotientTwoCell,
  QuotientValidationResult,
  QuotientVertex,
} from "./types";
import { validateCoxeterSystemInput } from "../coxeter";
import type { CertificateSummary, CoxeterSystemInput } from "../types";
import { validateQuotientGameData } from "../game";

export type QuotientValidationPhase =
  | "root"
  | "vertices"
  | "edges"
  | "edge-pairing"
  | "generator-regularity"
  | "permutation-action"
  | "two-cells"
  | "cell-boundaries"
  | "cell-relations"
  | "metadata"
  | "complete";

export interface QuotientValidationProgress {
  phase: QuotientValidationPhase;
  completed: number;
  total: number;
  phaseProgress: number;
  overallProgress: number;
}

export interface ProgressiveQuotientValidationOptions {
  /** Maximum scalar checks performed before yielding to the event loop. */
  chunkSize?: number;
  onProgress?: (progress: QuotientValidationProgress) => void;
  signal?: AbortSignal;
  /** Worker callers can provide logical cancellation without constructing a signal. */
  isCancelled?: () => boolean;
  /** Tests and non-browser hosts may replace the default macrotask yield. */
  yieldControl?: () => Promise<void>;
}

export class QuotientValidationCancelledError extends Error {
  constructor() {
    super("Quotient validation was cancelled.");
    this.name = "QuotientValidationCancelledError";
  }
}

export class QuotientValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Invalid quotient complex:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    this.name = "QuotientValidationError";
    this.errors = errors;
  }
}

interface OutgoingEdgeBucket {
  count: number;
  firstTarget: string;
  additionalTargets?: Set<string>;
}

type OutgoingEdgeIndex = Map<string, Map<number, OutgoingEdgeBucket>>;

const progressiveValidationPhases: QuotientValidationPhase[] = [
  "root",
  "vertices",
  "edges",
  "edge-pairing",
  "generator-regularity",
  "permutation-action",
  "two-cells",
  "cell-boundaries",
  "cell-relations",
  "metadata",
  "complete",
];

function buildOutgoingEdgeIndex(edges: QuotientEdge[]): OutgoingEdgeIndex {
  const index: OutgoingEdgeIndex = new Map();

  for (const edge of edges) {
    let byGenerator = index.get(edge.source);
    if (byGenerator === undefined) {
      byGenerator = new Map();
      index.set(edge.source, byGenerator);
    }

    let bucket = byGenerator.get(edge.generator);
    if (bucket === undefined) {
      bucket = { count: 0, firstTarget: edge.target };
      byGenerator.set(edge.generator, bucket);
    } else if (edge.target !== bucket.firstTarget) {
      bucket.additionalTargets ??= new Set();
      bucket.additionalTargets.add(edge.target);
    }

    bucket.count += 1;
  }

  return index;
}

function outgoingEdgeBucket(
  index: OutgoingEdgeIndex,
  vertexId: string,
  generator: number,
): OutgoingEdgeBucket | undefined {
  return index.get(vertexId)?.get(generator);
}

function outgoingEdgeTargets(
  index: OutgoingEdgeIndex,
  vertexId: string,
  generator: number,
  targetId: string,
): boolean {
  const bucket = outgoingEdgeBucket(index, vertexId, generator);
  return (
    bucket !== undefined &&
    (bucket.firstTarget === targetId ||
      bucket.additionalTargets?.has(targetId) === true)
  );
}

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class ProgressiveValidationController {
  readonly chunkSize: number;
  private readonly options: ProgressiveQuotientValidationOptions;

  constructor(options: ProgressiveQuotientValidationOptions) {
    this.options = options;
    this.chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 1_000));
  }

  assertActive(): void {
    if (this.options.signal?.aborted || this.options.isCancelled?.()) {
      throw new QuotientValidationCancelledError();
    }
  }

  report(
    phase: QuotientValidationPhase,
    completed: number,
    total: number,
  ): void {
    const safeTotal = Math.max(0, total);
    const phaseProgress =
      safeTotal === 0 ? 1 : Math.min(1, Math.max(0, completed / safeTotal));
    const phaseIndex = progressiveValidationPhases.indexOf(phase);
    this.options.onProgress?.({
      phase,
      completed: Math.min(Math.max(0, completed), safeTotal),
      total: safeTotal,
      phaseProgress,
      overallProgress: Math.min(
        1,
        (phaseIndex + phaseProgress) / progressiveValidationPhases.length,
      ),
    });
  }

  async yield(
    phase: QuotientValidationPhase,
    completed: number,
    total: number,
  ) {
    this.report(phase, completed, total);
    await (this.options.yieldControl ?? defaultYieldControl)();
    this.assertActive();
  }

  async forEach(
    phase: QuotientValidationPhase,
    total: number,
    visit: (index: number) => void,
  ): Promise<void> {
    this.assertActive();
    this.report(phase, 0, total);

    for (let start = 0; start < total; start += this.chunkSize) {
      const end = Math.min(total, start + this.chunkSize);
      for (let index = start; index < end; index += 1) {
        visit(index);
      }
      if (end < total) {
        await this.yield(phase, end, total);
      }
    }

    this.assertActive();
    this.report(phase, total, total);
  }
}

class ProgressivePhaseCursor {
  private completed = 0;
  private nextYield: number;

  constructor(
    private readonly controller: ProgressiveValidationController,
    private readonly phase: QuotientValidationPhase,
    private readonly total: number,
  ) {
    this.nextYield = controller.chunkSize;
    controller.report(phase, 0, total);
  }

  step(amount = 1): boolean {
    this.completed += amount;
    return this.completed >= this.nextYield;
  }

  async cooperate(): Promise<void> {
    await this.controller.yield(this.phase, this.completed, this.total);
    this.nextYield = this.completed + this.controller.chunkSize;
  }

  finish(): void {
    this.controller.assertActive();
    this.controller.report(this.phase, this.total, this.total);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

const certificateStatuses = new Set<CertificateSummary["status"]>([
  "not-certified",
  "passed",
  "failed",
  "skipped",
]);

function validateWord(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of generator indices.`);
    return;
  }

  value.forEach((generator, i) => {
    if (!isInteger(generator) || generator < 0) {
      errors.push(`${path}[${i}] must be a non-negative integer.`);
    }
  });
}

function validateCertificateSummary(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return;
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
}

function validateSourceSystem(
  value: unknown,
  errors: string[],
): CoxeterSystemInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = validateCoxeterSystemInput(value);
  if (!result.ok || result.value === undefined) {
    result.errors.forEach((error) => errors.push(`sourceSystem.${error}`));
    return undefined;
  }

  return result.value;
}

function validateVertex(
  value: unknown,
  index: number,
  errors: string[],
): value is QuotientVertex {
  const path = `vertices[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  if (value.label !== undefined && typeof value.label !== "string") {
    errors.push(`${path}.label must be a string when provided.`);
  }

  if (value.representativeWord !== undefined) {
    validateWord(
      value.representativeWord,
      `${path}.representativeWord`,
      errors,
    );
  }

  if (
    value.sourceNodeIds !== undefined &&
    !isStringArray(value.sourceNodeIds)
  ) {
    errors.push(`${path}.sourceNodeIds must be an array of strings.`);
  }

  return errors.length === 0;
}

function validateEdgeShape(
  value: unknown,
  index: number,
  vertexIds: Set<string>,
  errors: string[],
): value is QuotientEdge {
  const path = `edges[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  for (const endpoint of ["source", "target"] as const) {
    if (typeof value[endpoint] !== "string") {
      errors.push(`${path}.${endpoint} must be a vertex id string.`);
    } else if (!vertexIds.has(value[endpoint])) {
      errors.push(
        `${path}.${endpoint} refers to unknown vertex "${value[endpoint]}".`,
      );
    }
  }

  if (!isInteger(value.generator) || value.generator < 0) {
    errors.push(`${path}.generator must be a non-negative integer.`);
  }

  if (
    typeof value.inverseEdgeId !== "string" ||
    value.inverseEdgeId.trim().length === 0
  ) {
    errors.push(
      `${path}.inverseEdgeId is required because Coxeter generators are involutions.`,
    );
  }

  if (value.label !== undefined && typeof value.label !== "string") {
    errors.push(`${path}.label must be a string when provided.`);
  }

  if (
    value.sourceEdgeIds !== undefined &&
    !isStringArray(value.sourceEdgeIds)
  ) {
    errors.push(`${path}.sourceEdgeIds must be an array of strings.`);
  }

  return errors.length === 0;
}

function validateCellShape(
  value: unknown,
  index: number,
  vertexIds: Set<string>,
  errors: string[],
): value is QuotientTwoCell {
  const path = `twoCells[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  if (!Array.isArray(value.generatorPair) || value.generatorPair.length !== 2) {
    errors.push(`${path}.generatorPair must contain two generator indices.`);
  } else {
    value.generatorPair.forEach((generator, i) => {
      if (!isInteger(generator) || generator < 0) {
        errors.push(`${path}.generatorPair[${i}] must be non-negative.`);
      }
    });

    if (value.generatorPair[0] === value.generatorPair[1]) {
      errors.push(`${path}.generatorPair must use two distinct generators.`);
    }
  }

  if (!isInteger(value.m) || value.m < 2) {
    errors.push(`${path}.m must be an integer >= 2.`);
  }

  if (!Array.isArray(value.boundaryVertexIds)) {
    errors.push(`${path}.boundaryVertexIds must be an array of vertex ids.`);
  } else {
    if (isInteger(value.m) && value.boundaryVertexIds.length !== 2 * value.m) {
      errors.push(`${path}.boundaryVertexIds must have length 2*m.`);
    }

    value.boundaryVertexIds.forEach((vertexId, i) => {
      if (typeof vertexId !== "string" || !vertexIds.has(vertexId)) {
        errors.push(
          `${path}.boundaryVertexIds[${i}] refers to an unknown vertex.`,
        );
      }
    });
  }

  if (
    value.boundaryEdgeIds !== undefined &&
    !isStringArray(value.boundaryEdgeIds)
  ) {
    errors.push(`${path}.boundaryEdgeIds must be an array of strings.`);
  }

  if (
    value.sourceCellIds !== undefined &&
    !isStringArray(value.sourceCellIds)
  ) {
    errors.push(`${path}.sourceCellIds must be an array of strings.`);
  }

  return errors.length === 0;
}

function addDuplicateIdErrors(
  values: Array<{ id: string }>,
  path: string,
  errors: string[],
) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.id)) {
      errors.push(`${path} contains duplicate id "${value.id}".`);
    }
    seen.add(value.id);
  }
}

function validateInvolutionPairing(
  edges: QuotientEdge[],
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  for (const edge of edges) {
    validateInvolutionPairingEdge(edge, edgeById, errors);
  }
}

function validateInvolutionPairingEdge(
  edge: QuotientEdge,
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  const inverse = edgeById.get(edge.inverseEdgeId);

  if (inverse === undefined) {
    errors.push(`edges["${edge.id}"].inverseEdgeId refers to unknown edge.`);
    return;
  }

  if (inverse.inverseEdgeId !== edge.id) {
    errors.push(
      `edges["${edge.id}"] and edges["${inverse.id}"] must point back to each other as inverses.`,
    );
  }

  if (inverse.generator !== edge.generator) {
    errors.push(
      `edges["${edge.id}"] inverse must use the same generator label.`,
    );
  }

  if (inverse.source !== edge.target || inverse.target !== edge.source) {
    errors.push(`edges["${edge.id}"] inverse must reverse source and target.`);
  }
}

function edgeConnects(
  edge: QuotientEdge,
  source: string,
  target: string,
): boolean {
  return (
    (edge.source === source && edge.target === target) ||
    (edge.source === target && edge.target === source)
  );
}

function validateCellEdges(
  cells: QuotientTwoCell[],
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  for (const cell of cells) {
    validateCellEdgeBoundary(cell, edgeById, errors);
  }
}

function validateCellEdgeBoundary(
  cell: QuotientTwoCell,
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  if (cell.boundaryEdgeIds === undefined) {
    return;
  }

  if (cell.boundaryEdgeIds.length !== cell.boundaryVertexIds.length) {
    errors.push(
      `twoCells["${cell.id}"].boundaryEdgeIds must match boundary length.`,
    );
    return;
  }

  cell.boundaryEdgeIds.forEach((edgeId, i) => {
    const edge = edgeById.get(edgeId);

    if (edge === undefined) {
      errors.push(`twoCells["${cell.id}"].boundaryEdgeIds[${i}] is unknown.`);
      return;
    }

    const source = cell.boundaryVertexIds[i];
    const target =
      cell.boundaryVertexIds[(i + 1) % cell.boundaryVertexIds.length];

    if (!edgeConnects(edge, source, target)) {
      errors.push(
        `twoCells["${cell.id}"].boundaryEdgeIds[${i}] does not connect its adjacent boundary vertices.`,
      );
    }
  });
}

function validatePermutationAction(
  value: unknown,
  vertices: QuotientVertex[],
  vertexIds: Set<string>,
  outgoingEdges: OutgoingEdgeIndex,
  generatorRank: number | undefined,
  sourceSystem: CoxeterSystemInput | undefined,
  errors: string[],
  warnings: string[],
): value is QuotientPermutationAction[] | undefined {
  if (value === undefined) {
    return true;
  }

  if (!Array.isArray(value)) {
    errors.push("permutationAction must be an array when provided.");
    return false;
  }

  const actionsByGenerator = new Map<number, QuotientPermutationAction>();
  value.forEach((action, index) => {
    const path = `permutationAction[${index}]`;
    if (!isRecord(action)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    if (
      !isInteger(action.generator) ||
      action.generator < 0 ||
      (generatorRank !== undefined && action.generator >= generatorRank)
    ) {
      errors.push(`${path}.generator must be a valid generator index.`);
    } else if (actionsByGenerator.has(action.generator)) {
      errors.push(
        `permutationAction contains duplicate generator ${action.generator}.`,
      );
    }

    if (!isRecord(action.images)) {
      errors.push(`${path}.images must be an object keyed by vertex id.`);
      return;
    }

    const imageCounts = new Map<string, number>();
    for (const vertexId of vertexIds) {
      const image = action.images[vertexId];
      if (typeof image !== "string" || !vertexIds.has(image)) {
        errors.push(`${path}.images["${vertexId}"] must be a known vertex id.`);
      } else {
        imageCounts.set(image, (imageCounts.get(image) ?? 0) + 1);
      }
    }

    for (const key of Object.keys(action.images)) {
      if (!vertexIds.has(key)) {
        errors.push(`${path}.images has unknown vertex key "${key}".`);
      }
    }

    for (const vertexId of vertexIds) {
      if ((imageCounts.get(vertexId) ?? 0) !== 1) {
        errors.push(`${path}.images must be a permutation of the vertices.`);
        break;
      }
    }

    if (
      isInteger(action.generator) &&
      action.generator >= 0 &&
      (generatorRank === undefined || action.generator < generatorRank) &&
      !actionsByGenerator.has(action.generator)
    ) {
      actionsByGenerator.set(action.generator, {
        generator: action.generator,
        images: action.images as Record<string, string>,
      });
    }
  });

  if (actionsByGenerator.size > 0 && generatorRank !== undefined) {
    for (let generator = 0; generator < generatorRank; generator += 1) {
      if (!actionsByGenerator.has(generator)) {
        errors.push(
          `permutationAction must include generator ${generator} when any action data is provided.`,
        );
      }
    }
  }

  validatePermutationInvolutions(actionsByGenerator, vertices, errors);
  validatePermutationMatchesEdges(
    actionsByGenerator,
    vertices,
    outgoingEdges,
    errors,
  );
  validatePermutationCoxeterRelations(
    actionsByGenerator,
    vertices,
    sourceSystem,
    errors,
    warnings,
  );

  return errors.length === 0;
}

function estimatePermutationActionWork(
  value: unknown,
  vertexCount: number,
  generatorRank: number | undefined,
  sourceSystem: CoxeterSystemInput | undefined,
): number {
  if (!Array.isArray(value)) {
    return 1;
  }

  let work = value.length;
  for (const action of value) {
    if (isRecord(action) && isRecord(action.images)) {
      work += 2 * vertexCount + Object.keys(action.images).length;
    }
  }

  work += generatorRank ?? 0;
  work += 2 * value.length * vertexCount;

  if (sourceSystem !== undefined) {
    for (let i = 0; i < sourceSystem.rank; i += 1) {
      for (let j = i + 1; j < sourceSystem.rank; j += 1) {
        if (sourceSystem.coxeterMatrix[i][j] !== "inf") {
          work += vertexCount + 1;
        }
      }
    }
  }

  return Math.max(1, work);
}

async function validatePermutationActionProgressive(
  value: unknown,
  vertices: QuotientVertex[],
  vertexIds: Set<string>,
  outgoingEdges: OutgoingEdgeIndex,
  generatorRank: number | undefined,
  sourceSystem: CoxeterSystemInput | undefined,
  errors: string[],
  warnings: string[],
  controller: ProgressiveValidationController,
): Promise<void> {
  const cursor = new ProgressivePhaseCursor(
    controller,
    "permutation-action",
    estimatePermutationActionWork(
      value,
      vertices.length,
      generatorRank,
      sourceSystem,
    ),
  );

  if (!Array.isArray(value)) {
    if (value !== undefined) {
      errors.push("permutationAction must be an array when provided.");
    }
    cursor.finish();
    return;
  }

  const vertexIdList = [...vertexIds];
  const actionsByGenerator = new Map<number, QuotientPermutationAction>();

  for (let index = 0; index < value.length; index += 1) {
    const action = value[index];
    const path = `permutationAction[${index}]`;
    if (cursor.step()) {
      await cursor.cooperate();
    }

    if (!isRecord(action)) {
      errors.push(`${path} must be an object.`);
      continue;
    }

    if (
      !isInteger(action.generator) ||
      action.generator < 0 ||
      (generatorRank !== undefined && action.generator >= generatorRank)
    ) {
      errors.push(`${path}.generator must be a valid generator index.`);
    } else if (actionsByGenerator.has(action.generator)) {
      errors.push(
        `permutationAction contains duplicate generator ${action.generator}.`,
      );
    }

    if (!isRecord(action.images)) {
      errors.push(`${path}.images must be an object keyed by vertex id.`);
      continue;
    }

    const imageCounts = new Map<string, number>();
    for (const vertexId of vertexIdList) {
      const image = action.images[vertexId];
      if (typeof image !== "string" || !vertexIds.has(image)) {
        errors.push(`${path}.images["${vertexId}"] must be a known vertex id.`);
      } else {
        imageCounts.set(image, (imageCounts.get(image) ?? 0) + 1);
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }

    for (const key of Object.keys(action.images)) {
      if (!vertexIds.has(key)) {
        errors.push(`${path}.images has unknown vertex key "${key}".`);
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }

    for (const vertexId of vertexIdList) {
      if ((imageCounts.get(vertexId) ?? 0) !== 1) {
        errors.push(`${path}.images must be a permutation of the vertices.`);
        break;
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }

    if (
      isInteger(action.generator) &&
      action.generator >= 0 &&
      (generatorRank === undefined || action.generator < generatorRank) &&
      !actionsByGenerator.has(action.generator)
    ) {
      actionsByGenerator.set(action.generator, {
        generator: action.generator,
        images: action.images as Record<string, string>,
      });
    }
  }

  if (actionsByGenerator.size > 0 && generatorRank !== undefined) {
    for (let generator = 0; generator < generatorRank; generator += 1) {
      if (!actionsByGenerator.has(generator)) {
        errors.push(
          `permutationAction must include generator ${generator} when any action data is provided.`,
        );
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }
  }

  for (const [generator, action] of actionsByGenerator) {
    for (const vertex of vertices) {
      const once = action.images[vertex.id];
      const twice = once === undefined ? undefined : action.images[once];
      if (twice !== vertex.id) {
        errors.push(
          `permutationAction generator ${generator} must be an involution at vertex "${vertex.id}".`,
        );
        break;
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }
  }

  for (const [generator, action] of actionsByGenerator) {
    for (const vertex of vertices) {
      const target = action.images[vertex.id];
      if (typeof target === "string") {
        const matchingEdge = outgoingEdgeTargets(
          outgoingEdges,
          vertex.id,
          generator,
          target,
        );
        if (!matchingEdge) {
          errors.push(
            `permutationAction generator ${generator} sends "${vertex.id}" to "${target}", but no matching directed quotient edge exists.`,
          );
        }
      }
      if (cursor.step()) {
        await cursor.cooperate();
      }
    }
  }

  if (sourceSystem !== undefined && actionsByGenerator.size > 0) {
    for (let i = 0; i < sourceSystem.rank; i += 1) {
      for (let j = i + 1; j < sourceSystem.rank; j += 1) {
        const entry = sourceSystem.coxeterMatrix[i][j];
        if (entry === "inf") {
          continue;
        }

        const left = actionsByGenerator.get(i);
        const right = actionsByGenerator.get(j);
        if (left === undefined || right === undefined) {
          warnings.push(
            `Permutation relation check skipped for generator pair (${i}, ${j}) because an action is missing.`,
          );
          if (cursor.step()) {
            await cursor.cooperate();
          }
          continue;
        }

        for (const vertex of vertices) {
          const image = applyAlternatingProduct(vertex.id, left, right, entry);
          if (image !== vertex.id) {
            errors.push(
              `permutationAction violates (s${i}s${j})^${entry}=1 at vertex "${vertex.id}".`,
            );
            break;
          }
          if (cursor.step()) {
            await cursor.cooperate();
          }
        }
      }
    }
  }

  cursor.finish();
}

function validatePermutationInvolutions(
  actionsByGenerator: Map<number, QuotientPermutationAction>,
  vertices: QuotientVertex[],
  errors: string[],
) {
  for (const [generator, action] of actionsByGenerator) {
    for (const vertex of vertices) {
      const once = action.images[vertex.id];
      const twice = once === undefined ? undefined : action.images[once];
      if (twice !== vertex.id) {
        errors.push(
          `permutationAction generator ${generator} must be an involution at vertex "${vertex.id}".`,
        );
        break;
      }
    }
  }
}

function validatePermutationMatchesEdges(
  actionsByGenerator: Map<number, QuotientPermutationAction>,
  vertices: QuotientVertex[],
  outgoingEdges: OutgoingEdgeIndex,
  errors: string[],
) {
  for (const [generator, action] of actionsByGenerator) {
    for (const vertex of vertices) {
      const target = action.images[vertex.id];
      if (typeof target !== "string") {
        continue;
      }

      const matchingEdge = outgoingEdgeTargets(
        outgoingEdges,
        vertex.id,
        generator,
        target,
      );
      if (!matchingEdge) {
        errors.push(
          `permutationAction generator ${generator} sends "${vertex.id}" to "${target}", but no matching directed quotient edge exists.`,
        );
      }
    }
  }
}

function validatePermutationCoxeterRelations(
  actionsByGenerator: Map<number, QuotientPermutationAction>,
  vertices: QuotientVertex[],
  sourceSystem: CoxeterSystemInput | undefined,
  errors: string[],
  warnings: string[],
) {
  if (sourceSystem === undefined || actionsByGenerator.size === 0) {
    return;
  }

  for (let i = 0; i < sourceSystem.rank; i += 1) {
    for (let j = i + 1; j < sourceSystem.rank; j += 1) {
      const entry = sourceSystem.coxeterMatrix[i][j];
      if (entry === "inf") {
        continue;
      }

      const left = actionsByGenerator.get(i);
      const right = actionsByGenerator.get(j);
      if (left === undefined || right === undefined) {
        warnings.push(
          `Permutation relation check skipped for generator pair (${i}, ${j}) because an action is missing.`,
        );
        continue;
      }

      for (const vertex of vertices) {
        const image = applyAlternatingProduct(vertex.id, left, right, entry);
        if (image !== vertex.id) {
          errors.push(
            `permutationAction violates (s${i}s${j})^${entry}=1 at vertex "${vertex.id}".`,
          );
          break;
        }
      }
    }
  }
}

function applyAlternatingProduct(
  start: string,
  left: QuotientPermutationAction,
  right: QuotientPermutationAction,
  repetitions: number,
): string | undefined {
  let current: string | undefined = start;
  for (let step = 0; step < repetitions; step += 1) {
    current = current === undefined ? undefined : left.images[current];
    current = current === undefined ? undefined : right.images[current];
  }
  return current;
}

function validateGeneratorRegularity(
  vertices: QuotientVertex[],
  outgoingEdges: OutgoingEdgeIndex,
  generatorRank: number | undefined,
  errors: string[],
) {
  if (generatorRank === undefined) {
    return;
  }

  for (const vertex of vertices) {
    for (let generator = 0; generator < generatorRank; generator += 1) {
      const outgoingCount =
        outgoingEdgeBucket(outgoingEdges, vertex.id, generator)?.count ?? 0;
      if (outgoingCount !== 1) {
        errors.push(
          `vertex "${vertex.id}" must have exactly one outgoing edge for generator ${generator}; found ${outgoingCount}.`,
        );
      }
    }
  }
}

function validateEdgesAgainstGeneratorRank(
  edges: QuotientEdge[],
  generatorRank: number | undefined,
  errors: string[],
) {
  if (generatorRank === undefined) {
    return;
  }

  for (const edge of edges) {
    if (edge.generator >= generatorRank) {
      errors.push(
        `edges["${edge.id}"].generator is outside the quotient generator rank.`,
      );
    }
  }
}

function validateCellsAgainstSourceSystem(
  cells: QuotientTwoCell[],
  sourceSystem: CoxeterSystemInput | undefined,
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  if (sourceSystem === undefined) {
    return;
  }

  for (const cell of cells) {
    validateCellAgainstSourceSystem(cell, sourceSystem, edgeById, errors);
  }
}

function validateCellAgainstSourceSystem(
  cell: QuotientTwoCell,
  sourceSystem: CoxeterSystemInput,
  edgeById: Map<string, QuotientEdge>,
  errors: string[],
) {
  const [i, j] = cell.generatorPair;
  const sourceEntry = sourceSystem.coxeterMatrix[i]?.[j];
  if (sourceEntry === undefined) {
    errors.push(
      `twoCells["${cell.id}"].generatorPair is outside sourceSystem rank.`,
    );
  } else if (sourceEntry === "inf") {
    errors.push(
      `twoCells["${cell.id}"] cannot close a rank-two cell for infinite source Coxeter entry.`,
    );
  } else if (cell.m !== sourceEntry) {
    errors.push(
      `twoCells["${cell.id}"].m must match source Coxeter entry ${sourceEntry}.`,
    );
  }

  if (cell.boundaryEdgeIds === undefined) {
    return;
  }

  const starts: Array<0 | 1> = [0, 1];
  const alternates = starts.some((start) =>
    cell.boundaryEdgeIds!.every((edgeId, index) => {
      const edge = edgeById.get(edgeId);
      return edge?.generator === cell.generatorPair[(index + start) % 2];
    }),
  );

  if (!alternates) {
    errors.push(
      `twoCells["${cell.id}"].boundaryEdgeIds must alternate the generatorPair.`,
    );
  }
}

function validateSubgroupMetadata(
  value: unknown,
  quotientVertexCount: number,
  errors: string[],
  warnings: string[],
) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push("subgroup must be an object when provided.");
    return;
  }

  if (value.name !== undefined && typeof value.name !== "string") {
    errors.push("subgroup.name must be a string when provided.");
  }

  if (
    value.index !== undefined &&
    (!isInteger(value.index) || value.index < 1)
  ) {
    errors.push("subgroup.index must be a positive integer when provided.");
  } else if (
    isInteger(value.index) &&
    quotientVertexCount > 0 &&
    value.index !== quotientVertexCount
  ) {
    errors.push(
      `subgroup.index must match quotient vertex count (${quotientVertexCount}).`,
    );
  }

  if (value.generators !== undefined) {
    if (!Array.isArray(value.generators)) {
      errors.push("subgroup.generators must be an array of words.");
    } else {
      value.generators.forEach((word, i) =>
        validateWord(word, `subgroup.generators[${i}]`, errors),
      );
    }
  }

  if (value.source !== undefined && typeof value.source !== "string") {
    errors.push("subgroup.source must be a string when provided.");
  }

  if (value.notes !== undefined && !isStringArray(value.notes)) {
    errors.push("subgroup.notes must be an array of strings.");
  }

  validateCertificateSummary(value.certificate, "subgroup.certificate", errors);

  const verification = value.torsionFreeVerification;
  if (verification !== undefined) {
    if (!isRecord(verification)) {
      errors.push("subgroup.torsionFreeVerification must be an object.");
    } else {
      if (verification.verified !== true) {
        errors.push("subgroup.torsionFreeVerification.verified must be true.");
      }

      if (
        verification.method !== "external-sage" &&
        verification.method !== "external-gap-kbmag" &&
        verification.method !== "published-reference"
      ) {
        errors.push(
          'subgroup.torsionFreeVerification.method must be "external-sage", "external-gap-kbmag", or "published-reference".',
        );
      }

      if (
        typeof verification.source !== "string" ||
        verification.source.trim().length === 0
      ) {
        errors.push("subgroup.torsionFreeVerification.source is required.");
      }
    }
  }

  if (value.manifoldClaimed === true && !isRecord(verification)) {
    errors.push(
      "subgroup.manifoldClaimed requires torsionFreeVerification metadata.",
    );
  } else if (value.manifoldClaimed !== true) {
    warnings.push(
      "No torsion-free verification was supplied; describe this as a quotient complex, not a manifold.",
    );
  }
}

function validateBooleanChecks(
  value: unknown,
  path: string,
  requiredKeys: string[],
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  for (const key of requiredKeys) {
    if (typeof value[key] !== "boolean") {
      errors.push(`${path}.${key} must be a boolean.`);
    }
  }
}

function validateSchreierCertificate(value: unknown, errors: string[]) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push("schreierCertificate must be an object when provided.");
    return;
  }

  if (
    value.status !== "passed" &&
    value.status !== "failed" &&
    value.status !== "skipped"
  ) {
    errors.push(
      'schreierCertificate.status must be "passed", "failed", or "skipped".',
    );
  }

  if (
    value.method !== "in-repo-permutation-action" &&
    value.method !== "external-sage" &&
    value.method !== "external-gap-kbmag"
  ) {
    errors.push("schreierCertificate.method is not supported.");
  }

  if (!isInteger(value.generatorRank) || value.generatorRank < 1) {
    errors.push("schreierCertificate.generatorRank must be positive.");
  }

  if (!isInteger(value.vertexCount) || value.vertexCount < 0) {
    errors.push("schreierCertificate.vertexCount must be non-negative.");
  }

  validateBooleanChecks(
    value.checks,
    "schreierCertificate.checks",
    [
      "generatorRegularity",
      "bijectiveActions",
      "involutiveGenerators",
      "edgeCompatibility",
      "coxeterRelations",
      "rankTwoCellCoverage",
      "duplicateRankTwoCells",
    ],
    errors,
  );

  if (!Array.isArray(value.rankTwoOrbits)) {
    errors.push("schreierCertificate.rankTwoOrbits must be an array.");
  }

  if (!isStringArray(value.errors)) {
    errors.push("schreierCertificate.errors must be an array of strings.");
  }

  if (!isStringArray(value.warnings)) {
    errors.push("schreierCertificate.warnings must be an array of strings.");
  }
}

function validateTorsionFreeCertificate(value: unknown, errors: string[]) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push("torsionFreeCertificate must be an object when provided.");
    return;
  }

  if (
    value.status !== "passed" &&
    value.status !== "failed" &&
    value.status !== "skipped"
  ) {
    errors.push(
      'torsionFreeCertificate.status must be "passed", "failed", or "skipped".',
    );
  }

  if (
    value.method !== "visible-spherical-stabilizer" &&
    value.method !== "external-sage" &&
    value.method !== "external-gap-kbmag" &&
    value.method !== "published-reference"
  ) {
    errors.push("torsionFreeCertificate.method is not supported.");
  }

  if (!Array.isArray(value.checkedSphericalSubsets)) {
    errors.push(
      "torsionFreeCertificate.checkedSphericalSubsets must be an array.",
    );
  }

  if (!Array.isArray(value.witnesses)) {
    errors.push("torsionFreeCertificate.witnesses must be an array.");
  }

  if (!isStringArray(value.limitations)) {
    errors.push(
      "torsionFreeCertificate.limitations must be an array of strings.",
    );
  }

  if (!isStringArray(value.errors)) {
    errors.push("torsionFreeCertificate.errors must be an array of strings.");
  }

  if (!isStringArray(value.warnings)) {
    errors.push("torsionFreeCertificate.warnings must be an array of strings.");
  }
}

function validateCoverProjection(
  value: unknown,
  vertices: QuotientVertex[],
  edges: QuotientEdge[],
  twoCells: QuotientTwoCell[],
  errors: string[],
) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push("coverProjection must be an object when provided.");
    return;
  }
  if (value.kind !== "jnw-move-kernel") {
    errors.push('coverProjection.kind must be "jnw-move-kernel".');
  }
  if (
    typeof value.baseComplexName !== "string" ||
    value.baseComplexName.trim().length === 0
  ) {
    errors.push("coverProjection.baseComplexName must be a non-empty string.");
  }
  if (!isInteger(value.deckGroupOrder) || value.deckGroupOrder < 1) {
    errors.push("coverProjection.deckGroupOrder must be a positive integer.");
  }
  if (!isStringArray(value.fundamentalDomainCopyIds)) {
    errors.push(
      "coverProjection.fundamentalDomainCopyIds must be an array of strings.",
    );
  } else {
    const copyIds = value.fundamentalDomainCopyIds;
    const vertexIds = new Set(vertices.map((vertex) => vertex.id));
    if (new Set(copyIds).size !== copyIds.length) {
      errors.push(
        "coverProjection.fundamentalDomainCopyIds must not contain duplicates.",
      );
    }
    if (
      copyIds.length !== vertices.length ||
      copyIds.some((id) => !vertexIds.has(id))
    ) {
      errors.push(
        "coverProjection.fundamentalDomainCopyIds must match the quotient state vertices.",
      );
    }
    if (
      isInteger(value.deckGroupOrder) &&
      value.deckGroupOrder !== copyIds.length
    ) {
      errors.push(
        "coverProjection.deckGroupOrder must match the number of fundamental-domain copies.",
      );
    }
  }

  const vertexImages = validateCoverImageMap(
    value.vertexImages,
    "coverProjection.vertexImages",
    vertices.map((vertex) => vertex.id),
    errors,
  );
  const edgeImages = validateCoverImageMap(
    value.edgeImages,
    "coverProjection.edgeImages",
    edges.map((edge) => edge.id),
    errors,
  );
  const twoCellImages = validateCoverImageMap(
    value.twoCellImages,
    "coverProjection.twoCellImages",
    twoCells.map((cell) => cell.id),
    errors,
  );

  if (
    value.status !== "in-repo-checked" &&
    value.status !== "failed" &&
    value.status !== "incomplete"
  ) {
    errors.push(
      'coverProjection.status must be "in-repo-checked", "failed", or "incomplete".',
    );
  }
  validateBooleanChecks(
    value.checks,
    "coverProjection.checks",
    [
      "totalGeneratorAction",
      "involutiveGeneratorAction",
      "relationBoundariesClose",
      "projectionPreservesLabels",
    ],
    errors,
  );
  const projectionChecks = isRecord(value.checks) ? value.checks : undefined;
  if (
    value.status === "in-repo-checked" &&
    projectionChecks &&
    [
      "totalGeneratorAction",
      "involutiveGeneratorAction",
      "relationBoundariesClose",
      "projectionPreservesLabels",
    ].some((key) => projectionChecks[key] !== true)
  ) {
    errors.push(
      "coverProjection.status cannot be in-repo-checked when a required check failed.",
    );
  }
  if (!isStringArray(value.warnings)) {
    errors.push("coverProjection.warnings must be an array of strings.");
  }

  if (
    projectionChecks?.projectionPreservesLabels === true &&
    !coverImagesPreserveCellTypes(
      vertices,
      edges,
      twoCells,
      vertexImages,
      edgeImages,
      twoCellImages,
    )
  ) {
    errors.push(
      "coverProjection declares label preservation, but equal generator/cell types have different base images.",
    );
  }
}

function validateCoverImageMap(
  value: unknown,
  path: string,
  expectedIds: string[],
  errors: string[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(value)) {
    errors.push(`${path} must be an object keyed by quotient cell id.`);
    return result;
  }
  const expected = new Set(expectedIds);
  for (const id of expectedIds) {
    const image = value[id];
    if (typeof image !== "string" || image.trim().length === 0) {
      errors.push(`${path}["${id}"] must be a non-empty base-cell id.`);
    } else {
      result.set(id, image);
    }
  }
  for (const id of Object.keys(value)) {
    if (!expected.has(id)) {
      errors.push(`${path} has unknown quotient cell key "${id}".`);
    }
  }
  return result;
}

function coverImagesPreserveCellTypes(
  vertices: QuotientVertex[],
  edges: QuotientEdge[],
  twoCells: QuotientTwoCell[],
  vertexImages: Map<string, string>,
  edgeImages: Map<string, string>,
  twoCellImages: Map<string, string>,
): boolean {
  const vertexImageSet = new Set(
    vertices.map((vertex) => vertexImages.get(vertex.id)),
  );
  if (vertexImageSet.size > 1 || vertexImageSet.has(undefined)) {
    return false;
  }
  const edgeImagesByGenerator = new Map<number, Set<string | undefined>>();
  for (const edge of edges) {
    const images = edgeImagesByGenerator.get(edge.generator) ?? new Set();
    images.add(edgeImages.get(edge.id));
    edgeImagesByGenerator.set(edge.generator, images);
  }
  if (
    [...edgeImagesByGenerator.values()].some(
      (images) => images.size !== 1 || images.has(undefined),
    )
  ) {
    return false;
  }
  const cellImagesByType = new Map<string, Set<string | undefined>>();
  for (const cell of twoCells) {
    const type = `${cell.generatorPair[0]}-${cell.generatorPair[1]}:${cell.m}`;
    const images = cellImagesByType.get(type) ?? new Set();
    images.add(twoCellImages.get(cell.id));
    cellImagesByType.set(type, images);
  }
  return [...cellImagesByType.values()].every(
    (images) => images.size === 1 && !images.has(undefined),
  );
}

export function validateQuotientComplex(
  input: unknown,
): QuotientValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Quotient complex must be a JSON object."],
      warnings,
    };
  }

  if (input.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    errors.push("name must be a non-empty string.");
  }

  const sourceSystem = validateSourceSystem(input.sourceSystem, errors);
  if (
    input.generatorRank !== undefined &&
    (!isInteger(input.generatorRank) || input.generatorRank < 1)
  ) {
    errors.push("generatorRank must be a positive integer when provided.");
  } else if (
    sourceSystem !== undefined &&
    isInteger(input.generatorRank) &&
    input.generatorRank !== sourceSystem.rank
  ) {
    errors.push(
      "generatorRank must match sourceSystem.rank when both are supplied.",
    );
  }
  const generatorRank =
    sourceSystem?.rank ??
    (isInteger(input.generatorRank) && input.generatorRank >= 1
      ? input.generatorRank
      : undefined);

  const vertices: QuotientVertex[] = [];
  if (!Array.isArray(input.vertices)) {
    errors.push("vertices must be an array.");
  } else {
    input.vertices.forEach((vertex, i) => {
      if (validateVertex(vertex, i, errors)) {
        vertices.push(vertex);
      }
    });
    addDuplicateIdErrors(vertices, "vertices", errors);
  }

  const vertexIds = new Set(vertices.map((vertex) => vertex.id));
  const edges: QuotientEdge[] = [];
  if (!Array.isArray(input.edges)) {
    errors.push("edges must be an array.");
  } else {
    input.edges.forEach((edge, i) => {
      if (validateEdgeShape(edge, i, vertexIds, errors)) {
        edges.push(edge);
      }
    });
    addDuplicateIdErrors(edges, "edges", errors);
  }

  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const outgoingEdges = buildOutgoingEdgeIndex(edges);
  validateInvolutionPairing(edges, edgeById, errors);
  validateEdgesAgainstGeneratorRank(edges, generatorRank, errors);
  validateGeneratorRegularity(vertices, outgoingEdges, generatorRank, errors);
  validatePermutationAction(
    input.permutationAction,
    vertices,
    vertexIds,
    outgoingEdges,
    generatorRank,
    sourceSystem,
    errors,
    warnings,
  );

  const twoCells: QuotientTwoCell[] = [];
  if (!Array.isArray(input.twoCells)) {
    errors.push("twoCells must be an array.");
  } else {
    input.twoCells.forEach((cell, i) => {
      if (validateCellShape(cell, i, vertexIds, errors)) {
        twoCells.push(cell);
      }
    });
    addDuplicateIdErrors(twoCells, "twoCells", errors);
  }

  validateCellEdges(twoCells, edgeById, errors);
  validateCellsAgainstSourceSystem(twoCells, sourceSystem, edgeById, errors);
  validateSubgroupMetadata(input.subgroup, vertices.length, errors, warnings);
  const gameValidation = validateQuotientGameData(
    input.game,
    edges,
    generatorRank,
  );
  errors.push(...gameValidation.errors);
  warnings.push(...gameValidation.warnings);
  validateCertificateSummary(input.verifier, "verifier", errors);
  validateSchreierCertificate(input.schreierCertificate, errors);
  validateTorsionFreeCertificate(input.torsionFreeCertificate, errors);
  validateCoverProjection(
    input.coverProjection,
    vertices,
    edges,
    twoCells,
    errors,
  );

  if (input.warnings !== undefined && !isStringArray(input.warnings)) {
    errors.push("warnings must be an array of strings when provided.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    value: input as unknown as QuotientComplex,
    errors: [],
    warnings,
  };
}

/**
 * Validate a quotient without monopolizing the caller's event loop.
 *
 * This follows the synchronous validator's check and error ordering exactly.
 * Large vertex, edge, action, and cell scans yield after `chunkSize` scalar
 * checks, which lets a worker publish progress and observe cancellation.
 */
export async function validateQuotientComplexProgressive(
  input: unknown,
  options: ProgressiveQuotientValidationOptions = {},
): Promise<QuotientValidationResult> {
  const controller = new ProgressiveValidationController(options);
  const errors: string[] = [];
  const warnings: string[] = [];

  controller.report("root", 0, 1);
  controller.assertActive();
  if (!isRecord(input)) {
    const result = {
      ok: false,
      errors: ["Quotient complex must be a JSON object."],
      warnings,
    };
    await controller.yield("root", 1, 1);
    controller.report("complete", 1, 1);
    return result;
  }

  if (input.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    errors.push("name must be a non-empty string.");
  }

  const sourceSystem = validateSourceSystem(input.sourceSystem, errors);
  if (
    input.generatorRank !== undefined &&
    (!isInteger(input.generatorRank) || input.generatorRank < 1)
  ) {
    errors.push("generatorRank must be a positive integer when provided.");
  } else if (
    sourceSystem !== undefined &&
    isInteger(input.generatorRank) &&
    input.generatorRank !== sourceSystem.rank
  ) {
    errors.push(
      "generatorRank must match sourceSystem.rank when both are supplied.",
    );
  }
  const generatorRank =
    sourceSystem?.rank ??
    (isInteger(input.generatorRank) && input.generatorRank >= 1
      ? input.generatorRank
      : undefined);
  await controller.yield("root", 1, 1);

  const vertices: QuotientVertex[] = [];
  if (!Array.isArray(input.vertices)) {
    errors.push("vertices must be an array.");
    controller.report("vertices", 0, 0);
  } else {
    const inputVertices = input.vertices;
    const seenVertexIds = new Set<string>();
    const duplicateVertexErrors: string[] = [];
    await controller.forEach("vertices", inputVertices.length, (index) => {
      const vertex = inputVertices[index];
      if (validateVertex(vertex, index, errors)) {
        vertices.push(vertex);
        if (seenVertexIds.has(vertex.id)) {
          duplicateVertexErrors.push(
            `vertices contains duplicate id "${vertex.id}".`,
          );
        }
        seenVertexIds.add(vertex.id);
      }
    });
    errors.push(...duplicateVertexErrors);
  }

  const vertexIds = new Set(vertices.map((vertex) => vertex.id));
  const edges: QuotientEdge[] = [];
  if (!Array.isArray(input.edges)) {
    errors.push("edges must be an array.");
    controller.report("edges", 0, 0);
  } else {
    const inputEdges = input.edges;
    const seenEdgeIds = new Set<string>();
    const duplicateEdgeErrors: string[] = [];
    await controller.forEach("edges", inputEdges.length, (index) => {
      const edge = inputEdges[index];
      if (validateEdgeShape(edge, index, vertexIds, errors)) {
        edges.push(edge);
        if (seenEdgeIds.has(edge.id)) {
          duplicateEdgeErrors.push(`edges contains duplicate id "${edge.id}".`);
        }
        seenEdgeIds.add(edge.id);
      }
    });
    errors.push(...duplicateEdgeErrors);
  }

  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const outgoingEdges = buildOutgoingEdgeIndex(edges);
  const edgeRankErrors: string[] = [];
  await controller.forEach("edge-pairing", edges.length, (index) => {
    const edge = edges[index];
    validateInvolutionPairingEdge(edge, edgeById, errors);
    if (generatorRank !== undefined && edge.generator >= generatorRank) {
      edgeRankErrors.push(
        `edges["${edge.id}"].generator is outside the quotient generator rank.`,
      );
    }
  });
  errors.push(...edgeRankErrors);

  const regularityWork =
    generatorRank === undefined ? 0 : vertices.length * generatorRank;
  await controller.forEach("generator-regularity", regularityWork, (index) => {
    if (generatorRank === undefined) {
      return;
    }
    const vertex = vertices[Math.floor(index / generatorRank)];
    const generator = index % generatorRank;
    const outgoingCount =
      outgoingEdgeBucket(outgoingEdges, vertex.id, generator)?.count ?? 0;
    if (outgoingCount !== 1) {
      errors.push(
        `vertex "${vertex.id}" must have exactly one outgoing edge for generator ${generator}; found ${outgoingCount}.`,
      );
    }
  });

  await validatePermutationActionProgressive(
    input.permutationAction,
    vertices,
    vertexIds,
    outgoingEdges,
    generatorRank,
    sourceSystem,
    errors,
    warnings,
    controller,
  );

  const twoCells: QuotientTwoCell[] = [];
  if (!Array.isArray(input.twoCells)) {
    errors.push("twoCells must be an array.");
    controller.report("two-cells", 0, 0);
  } else {
    const inputTwoCells = input.twoCells;
    const seenCellIds = new Set<string>();
    const duplicateCellErrors: string[] = [];
    await controller.forEach("two-cells", inputTwoCells.length, (index) => {
      const cell = inputTwoCells[index];
      if (validateCellShape(cell, index, vertexIds, errors)) {
        twoCells.push(cell);
        if (seenCellIds.has(cell.id)) {
          duplicateCellErrors.push(
            `twoCells contains duplicate id "${cell.id}".`,
          );
        }
        seenCellIds.add(cell.id);
      }
    });
    errors.push(...duplicateCellErrors);
  }

  await controller.forEach("cell-boundaries", twoCells.length, (index) => {
    validateCellEdgeBoundary(twoCells[index], edgeById, errors);
  });
  await controller.forEach("cell-relations", twoCells.length, (index) => {
    if (sourceSystem !== undefined) {
      validateCellAgainstSourceSystem(
        twoCells[index],
        sourceSystem,
        edgeById,
        errors,
      );
    }
  });

  controller.report("metadata", 0, 1);
  validateSubgroupMetadata(input.subgroup, vertices.length, errors, warnings);
  const gameValidation = validateQuotientGameData(
    input.game,
    edges,
    generatorRank,
  );
  errors.push(...gameValidation.errors);
  warnings.push(...gameValidation.warnings);
  validateCertificateSummary(input.verifier, "verifier", errors);
  validateSchreierCertificate(input.schreierCertificate, errors);
  validateTorsionFreeCertificate(input.torsionFreeCertificate, errors);
  validateCoverProjection(
    input.coverProjection,
    vertices,
    edges,
    twoCells,
    errors,
  );

  if (input.warnings !== undefined && !isStringArray(input.warnings)) {
    errors.push("warnings must be an array of strings when provided.");
  }
  await controller.yield("metadata", 1, 1);

  const result: QuotientValidationResult =
    errors.length > 0
      ? { ok: false, errors, warnings }
      : {
          ok: true,
          value: input as unknown as QuotientComplex,
          errors: [],
          warnings,
        };
  controller.report("complete", 1, 1);
  return result;
}

export function parseQuotientComplex(input: unknown): QuotientComplex {
  const result = validateQuotientComplex(input);

  if (!result.ok || result.value === undefined) {
    throw new QuotientValidationError(result.errors);
  }

  return result.value;
}

/** Validate and return a quotient while retaining cooperative progress hooks. */
export async function parseQuotientComplexProgressive(
  input: unknown,
  options: ProgressiveQuotientValidationOptions = {},
): Promise<QuotientComplex> {
  const result = await validateQuotientComplexProgressive(input, options);

  if (!result.ok || result.value === undefined) {
    throw new QuotientValidationError(result.errors);
  }

  return result.value;
}

export function quotientManifoldStatus(
  complex: QuotientComplex,
): QuotientManifoldStatus {
  const verification = complex.subgroup?.torsionFreeVerification;
  const certificate = complex.torsionFreeCertificate;

  // Torsion-freeness is necessary for the intended manifold quotients, but it
  // does not turn an arbitrary quotient cell complex into a manifold. The
  // producer must opt into that stronger claim as well as supplying evidence.
  if (complex.subgroup?.manifoldClaimed !== true) {
    return {
      canUseManifoldLanguage: false,
      label: "quotient complex",
      reason:
        "The subgroup is not marked with a manifold claim; torsion-free evidence alone certifies only the cover action.",
    };
  }

  if (verification?.verified === true) {
    return {
      canUseManifoldLanguage: true,
      label: "torsion-free quotient manifold",
      reason: `Torsion-free verification is recorded from ${verification.source}.`,
    };
  }

  if (
    certificate?.status === "passed" &&
    (certificate.method === "external-sage" ||
      certificate.method === "external-gap-kbmag" ||
      certificate.method === "published-reference")
  ) {
    return {
      canUseManifoldLanguage: true,
      label: "torsion-free quotient manifold",
      reason: `Torsion-free certificate passed by ${certificate.method}.`,
    };
  }

  return {
    canUseManifoldLanguage: false,
    label: "quotient complex",
    reason:
      "No torsion-free verification metadata is present, so manifold language is disabled.",
  };
}
