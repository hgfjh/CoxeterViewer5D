import { parseCoxeterSystemInput } from "../coxeter";
import type { QuotientComplex, QuotientEdge } from "../quotient/types";
import type { TorsionFreeActionCandidate } from "../torsionFree/types";
import type { CoxeterSystemInput } from "../types";

export type SchreierExponent = 1 | -1;

export interface SchreierLetter {
  generatorId: string;
  exponent: SchreierExponent;
}

export interface SchreierTransversalEntry {
  pointId: string;
  representativeWord: number[];
  parentPointId?: string;
  parentGenerator?: number;
  treeEdgeId?: string;
}

export interface SchreierTreeEdge {
  sourcePointId: string;
  targetPointId: string;
  generator: number;
  orientedEdgeId: string;
}

export interface SchreierGeneratorProvenance {
  orientedEdgeId: string;
  inverseOrientedEdgeId?: string;
  edgeSource: "quotient" | "finite-action";
  sourcePointId: string;
  targetPointId: string;
  coxeterGenerator: number;
  sourceRepresentativeWord: number[];
  targetRepresentativeWord: number[];
  /** The literal word t_q s_i t_{q.s_i}^{-1}. */
  rawSubgroupWord: number[];
  /** Only adjacent involution cancellations have been applied. */
  subgroupWord: number[];
}

export interface SchreierGenerator {
  id: string;
  index: number;
  provenance: SchreierGeneratorProvenance;
}

export interface SchreierEdgeAssignment {
  sourcePointId: string;
  targetPointId: string;
  coxeterGenerator: number;
  orientedEdgeId: string;
  treeEdge: boolean;
  letter?: SchreierLetter;
}

export type CoxeterRelatorSource =
  | {
      kind: "involution";
      generator: number;
    }
  | {
      kind: "finite-pair";
      generatorPair: [number, number];
      m: number;
    };

export interface CoxeterDefiningRelator {
  id: string;
  source: CoxeterRelatorSource;
  word: number[];
}

export interface SchreierRelatorEdgeStep {
  sourcePointId: string;
  targetPointId: string;
  coxeterGenerator: number;
  orientedEdgeId: string;
  treeEdge: boolean;
  letter?: SchreierLetter;
}

export interface SchreierRelatorRewrite {
  id: string;
  basePointId: string;
  definingRelatorId: string;
  source: CoxeterRelatorSource;
  coxeterWord: number[];
  edgePath: SchreierRelatorEdgeStep[];
  unreducedWord: SchreierLetter[];
  word: SchreierLetter[];
  isTrivial: boolean;
}

export interface SchreierPresentation {
  convention: "left-cosets-right-action";
  sourceSystemName: string;
  actionName: string;
  rootPointId: string;
  pointCount: number;
  edgeOrbitCount: number;
  graphRank: number;
  transversal: SchreierTransversalEntry[];
  spanningTreeEdges: SchreierTreeEdge[];
  generators: SchreierGenerator[];
  edgeAssignments: SchreierEdgeAssignment[];
  definingRelators: CoxeterDefiningRelator[];
  /** Every Coxeter relator rewritten at every action point, including empty words. */
  relatorRewrites: SchreierRelatorRewrite[];
  /** The nonempty freely reduced words used as presentation relators. */
  relators: SchreierRelatorRewrite[];
}

export interface SchreierPresentationOptions {
  rootPointId?: string;
}

interface ActionEdgeReference {
  id: string;
  inverseId?: string;
  source: "quotient" | "finite-action";
}

interface NormalizedRightAction {
  name: string;
  pointIds: string[];
  images: Array<Map<string, string>>;
  edgeByStep: Map<string, ActionEdgeReference>;
  suggestedRootPointId?: string;
}

interface MutableTransversalEntry {
  pointId: string;
  representativeWord: number[];
  parentPointId?: string;
  parentGenerator?: number;
  treeEdgeId?: string;
}

interface TransversalResult {
  entries: MutableTransversalEntry[];
  entryByPoint: Map<string, MutableTransversalEntry>;
  treeEdgeKeys: Set<string>;
  treeEdges: SchreierTreeEdge[];
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stepKey(pointId: string, generator: number): string {
  return JSON.stringify([pointId, generator]);
}

function edgeOrbitKey(
  sourcePointId: string,
  targetPointId: string,
  generator: number,
): string {
  const [left, right] =
    compareIds(sourcePointId, targetPointId) <= 0
      ? [sourcePointId, targetPointId]
      : [targetPointId, sourcePointId];
  return JSON.stringify([generator, left, right]);
}

function inverseCoxeterWord(word: readonly number[]): number[] {
  // Coxeter generators are involutions, so inversion only reverses the word.
  return [...word].reverse();
}

/** Cancel adjacent equal Coxeter generators using only s_i^2 = 1. */
export function freelyReduceCoxeterInvolutionWord(
  word: readonly number[],
): number[] {
  const reduced: number[] = [];
  for (const generator of word) {
    if (reduced.at(-1) === generator) {
      reduced.pop();
    } else {
      reduced.push(generator);
    }
  }
  return reduced;
}

/** Freely reduce a signed word in the Schreier generators. */
export function freelyReduceSchreierWord(
  word: readonly SchreierLetter[],
): SchreierLetter[] {
  const reduced: SchreierLetter[] = [];
  for (const letter of word) {
    const previous = reduced.at(-1);
    if (
      previous?.generatorId === letter.generatorId &&
      previous.exponent === -letter.exponent
    ) {
      reduced.pop();
    } else {
      reduced.push({ ...letter });
    }
  }
  return reduced;
}

/** Expand a Schreier word back to a word in the original Coxeter generators. */
export function expandSchreierWord(
  word: readonly SchreierLetter[],
  generators: readonly SchreierGenerator[],
): number[] {
  const generatorById = new Map(
    generators.map((generator) => [generator.id, generator]),
  );
  const expanded: number[] = [];
  for (const letter of word) {
    const generator = generatorById.get(letter.generatorId);
    if (generator === undefined) {
      throw new Error(`Unknown Schreier generator "${letter.generatorId}".`);
    }
    const subgroupWord = generator.provenance.subgroupWord;
    expanded.push(
      ...(letter.exponent === 1
        ? subgroupWord
        : inverseCoxeterWord(subgroupWord)),
    );
  }
  return freelyReduceCoxeterInvolutionWord(expanded);
}

function normalizeFiniteAction(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): NormalizedRightAction {
  if (!Number.isInteger(candidate.index) || candidate.index <= 0) {
    throw new Error("Finite right action index must be a positive integer.");
  }
  if (candidate.generatorImages.length !== system.rank) {
    throw new Error(
      `Finite right action has ${candidate.generatorImages.length} generator rows; expected ${system.rank}.`,
    );
  }

  const pointIds = Array.from(
    { length: candidate.index },
    (_unused, point) => `q${point}`,
  );
  const images = candidate.generatorImages.map((row, generator) => {
    if (row.length !== candidate.index) {
      throw new Error(
        `Finite right action generator ${generator} has ${row.length} images; expected ${candidate.index}.`,
      );
    }
    return new Map(
      row.map((target, point) => {
        if (
          !Number.isInteger(target) ||
          target < 0 ||
          target >= candidate.index
        ) {
          throw new Error(
            `Finite right action generator ${generator} has invalid image ${target} at point ${point}.`,
          );
        }
        return [pointIds[point], pointIds[target]];
      }),
    );
  });
  const edgeByStep = new Map<string, ActionEdgeReference>();
  for (let generator = 0; generator < system.rank; generator += 1) {
    for (const sourcePointId of pointIds) {
      const targetPointId = images[generator].get(sourcePointId)!;
      edgeByStep.set(stepKey(sourcePointId, generator), {
        id: `action:g${generator}:${sourcePointId}`,
        inverseId: `action:g${generator}:${targetPointId}`,
        source: "finite-action",
      });
    }
  }
  return {
    name: candidate.name ?? candidate.id,
    pointIds,
    images,
    edgeByStep,
    suggestedRootPointId: "q0",
  };
}

function rootSuggestedByQuotient(
  quotient: QuotientComplex,
): string | undefined {
  const emptyRepresentatives = quotient.vertices
    .filter((vertex) => vertex.representativeWord?.length === 0)
    .map((vertex) => vertex.id)
    .sort(compareIds);
  if (emptyRepresentatives.length > 0) return emptyRepresentatives[0];
  if (quotient.vertices.some((vertex) => vertex.id === "q0")) return "q0";
  return [...quotient.vertices.map((vertex) => vertex.id)].sort(compareIds)[0];
}

function matchingQuotientEdges(
  edges: readonly QuotientEdge[],
  sourcePointId: string,
  targetPointId: string,
  generator: number,
): QuotientEdge[] {
  return edges
    .filter(
      (edge) =>
        edge.source === sourcePointId &&
        edge.target === targetPointId &&
        edge.generator === generator,
    )
    .sort((left, right) => compareIds(left.id, right.id));
}

function normalizeQuotientAction(
  system: CoxeterSystemInput,
  quotient: QuotientComplex,
): NormalizedRightAction {
  const pointIds = quotient.vertices
    .map((vertex) => vertex.id)
    .sort(compareIds);
  if (pointIds.length === 0 || new Set(pointIds).size !== pointIds.length) {
    throw new Error(
      "Quotient action points must be nonempty and have unique ids.",
    );
  }
  if (quotient.permutationAction === undefined) {
    throw new Error(
      "QuotientComplex.permutationAction is required for a Schreier presentation.",
    );
  }
  const actionByGenerator = new Map(
    quotient.permutationAction.map((action) => [action.generator, action]),
  );
  if (actionByGenerator.size !== quotient.permutationAction.length) {
    throw new Error("Quotient permutationAction has duplicate generator rows.");
  }

  const images = Array.from({ length: system.rank }, (_unused, generator) => {
    const action = actionByGenerator.get(generator);
    if (action === undefined) {
      throw new Error(
        `Quotient permutationAction is missing generator ${generator}.`,
      );
    }
    return new Map(
      pointIds.map((pointId) => {
        const target = action.images[pointId];
        if (typeof target !== "string") {
          throw new Error(
            `Quotient generator ${generator} has no image for point "${pointId}".`,
          );
        }
        return [pointId, target];
      }),
    );
  });

  const edgeByStep = new Map<string, ActionEdgeReference>();
  for (let generator = 0; generator < system.rank; generator += 1) {
    for (const sourcePointId of pointIds) {
      const targetPointId = images[generator].get(sourcePointId)!;
      const matches = matchingQuotientEdges(
        quotient.edges,
        sourcePointId,
        targetPointId,
        generator,
      );
      if (matches.length === 0) {
        throw new Error(
          `No quotient edge records ${sourcePointId} --s${generator}--> ${targetPointId}.`,
        );
      }
      const edge = matches[0];
      edgeByStep.set(stepKey(sourcePointId, generator), {
        id: edge.id,
        inverseId: edge.inverseEdgeId,
        source: "quotient",
      });
    }
  }

  return {
    name: quotient.name,
    pointIds,
    images,
    edgeByStep,
    suggestedRootPointId: rootSuggestedByQuotient(quotient),
  };
}

function imageOf(
  action: NormalizedRightAction,
  pointId: string,
  generator: number,
): string {
  const target = action.images[generator]?.get(pointId);
  if (target === undefined) {
    throw new Error(
      `Right action is undefined at point "${pointId}" for generator ${generator}.`,
    );
  }
  return target;
}

function edgeReference(
  action: NormalizedRightAction,
  pointId: string,
  generator: number,
): ActionEdgeReference {
  const edge = action.edgeByStep.get(stepKey(pointId, generator));
  if (edge === undefined) {
    throw new Error(
      `Right action edge provenance is missing at point "${pointId}" for generator ${generator}.`,
    );
  }
  return edge;
}

function applyActionWord(
  action: NormalizedRightAction,
  startPointId: string,
  word: readonly number[],
): string {
  let current = startPointId;
  for (const generator of word) {
    current = imageOf(action, current, generator);
  }
  return current;
}

function definingRelators(
  system: CoxeterSystemInput,
): CoxeterDefiningRelator[] {
  const relators: CoxeterDefiningRelator[] = system.generators.map(
    (_generator, generator) => ({
      id: `involution:g${generator}`,
      source: { kind: "involution", generator },
      word: [generator, generator],
    }),
  );
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      const pair: [number, number] = [left, right];
      relators.push({
        id: `finite-pair:g${left}-g${right}:m${m}`,
        source: { kind: "finite-pair", generatorPair: pair, m },
        word: Array.from({ length: 2 * m }, (_unused, step) => pair[step % 2]),
      });
    }
  }
  return relators;
}

function validateRightAction(
  system: CoxeterSystemInput,
  action: NormalizedRightAction,
): void {
  if (action.images.length !== system.rank) {
    throw new Error(
      `Right action has ${action.images.length} generators; expected ${system.rank}.`,
    );
  }
  const points = new Set(action.pointIds);
  for (let generator = 0; generator < system.rank; generator += 1) {
    const targets = action.pointIds.map((pointId) =>
      imageOf(action, pointId, generator),
    );
    if (targets.some((target) => !points.has(target))) {
      throw new Error(
        `Right action generator ${generator} leaves the point set.`,
      );
    }
    if (new Set(targets).size !== action.pointIds.length) {
      throw new Error(`Right action generator ${generator} is not bijective.`);
    }
    for (const pointId of action.pointIds) {
      const image = imageOf(action, pointId, generator);
      if (imageOf(action, image, generator) !== pointId) {
        throw new Error(
          `Right action generator ${generator} is not involutive at point "${pointId}".`,
        );
      }
    }
  }

  for (const relator of definingRelators(system)) {
    for (const pointId of action.pointIds) {
      if (applyActionWord(action, pointId, relator.word) !== pointId) {
        throw new Error(
          `Right action violates ${relator.id} at point "${pointId}".`,
        );
      }
    }
  }
}

function chooseRootPointId(
  action: NormalizedRightAction,
  requestedRootPointId: string | undefined,
): string {
  const rootPointId =
    requestedRootPointId ??
    action.suggestedRootPointId ??
    [...action.pointIds].sort(compareIds)[0];
  if (!action.pointIds.includes(rootPointId)) {
    throw new Error(`Root point "${rootPointId}" is not in the right action.`);
  }
  return rootPointId;
}

function buildTransversal(
  system: CoxeterSystemInput,
  action: NormalizedRightAction,
  rootPointId: string,
): TransversalResult {
  const root: MutableTransversalEntry = {
    pointId: rootPointId,
    representativeWord: [],
  };
  const entries = [root];
  const entryByPoint = new Map([[rootPointId, root]]);
  const treeEdgeKeys = new Set<string>();
  const treeEdges: SchreierTreeEdge[] = [];

  for (let cursor = 0; cursor < entries.length; cursor += 1) {
    const entry = entries[cursor];
    for (let generator = 0; generator < system.rank; generator += 1) {
      const targetPointId = imageOf(action, entry.pointId, generator);
      if (entryByPoint.has(targetPointId)) continue;
      const edge = edgeReference(action, entry.pointId, generator);
      const targetEntry: MutableTransversalEntry = {
        pointId: targetPointId,
        representativeWord: [...entry.representativeWord, generator],
        parentPointId: entry.pointId,
        parentGenerator: generator,
        treeEdgeId: edge.id,
      };
      entries.push(targetEntry);
      entryByPoint.set(targetPointId, targetEntry);
      treeEdgeKeys.add(edgeOrbitKey(entry.pointId, targetPointId, generator));
      treeEdges.push({
        sourcePointId: entry.pointId,
        targetPointId,
        generator,
        orientedEdgeId: edge.id,
      });
    }
  }

  if (entries.length !== action.pointIds.length) {
    const unreachable = action.pointIds.filter(
      (pointId) => !entryByPoint.has(pointId),
    );
    throw new Error(
      `Right action is not transitive from "${rootPointId}"; unreachable points: ${unreachable.join(", ")}.`,
    );
  }
  return { entries, entryByPoint, treeEdgeKeys, treeEdges };
}

function buildGenerators(
  system: CoxeterSystemInput,
  action: NormalizedRightAction,
  transversal: TransversalResult,
): {
  generators: SchreierGenerator[];
  edgeAssignments: SchreierEdgeAssignment[];
  letterByStep: Map<string, SchreierLetter | undefined>;
  edgeOrbitCount: number;
} {
  const generators: SchreierGenerator[] = [];
  const letterByStep = new Map<string, SchreierLetter | undefined>();
  const assignedEdgeOrbits = new Set<string>();
  let edgeOrbitCount = 0;

  for (const sourceEntry of transversal.entries) {
    for (let generator = 0; generator < system.rank; generator += 1) {
      const targetPointId = imageOf(action, sourceEntry.pointId, generator);
      const orbitKey = edgeOrbitKey(
        sourceEntry.pointId,
        targetPointId,
        generator,
      );
      if (assignedEdgeOrbits.has(orbitKey)) continue;
      assignedEdgeOrbits.add(orbitKey);
      edgeOrbitCount += 1;

      if (transversal.treeEdgeKeys.has(orbitKey)) {
        letterByStep.set(stepKey(sourceEntry.pointId, generator), undefined);
        letterByStep.set(stepKey(targetPointId, generator), undefined);
        continue;
      }

      const targetEntry = transversal.entryByPoint.get(targetPointId)!;
      const edge = edgeReference(action, sourceEntry.pointId, generator);
      const rawSubgroupWord = [
        ...sourceEntry.representativeWord,
        generator,
        ...inverseCoxeterWord(targetEntry.representativeWord),
      ];
      const id = `h${generators.length}`;
      generators.push({
        id,
        index: generators.length,
        provenance: {
          orientedEdgeId: edge.id,
          ...(edge.inverseId === undefined
            ? {}
            : { inverseOrientedEdgeId: edge.inverseId }),
          edgeSource: edge.source,
          sourcePointId: sourceEntry.pointId,
          targetPointId,
          coxeterGenerator: generator,
          sourceRepresentativeWord: [...sourceEntry.representativeWord],
          targetRepresentativeWord: [...targetEntry.representativeWord],
          rawSubgroupWord,
          subgroupWord: freelyReduceCoxeterInvolutionWord(rawSubgroupWord),
        },
      });
      letterByStep.set(stepKey(sourceEntry.pointId, generator), {
        generatorId: id,
        exponent: 1,
      });
      // A fixed point is a quotient loop. Repeating s_i traverses the same
      // Schreier symbol, and the rewritten involution relator records h^2.
      if (targetPointId !== sourceEntry.pointId) {
        letterByStep.set(stepKey(targetPointId, generator), {
          generatorId: id,
          exponent: -1,
        });
      }
    }
  }

  const edgeAssignments: SchreierEdgeAssignment[] = [];
  for (const sourceEntry of transversal.entries) {
    for (let generator = 0; generator < system.rank; generator += 1) {
      const targetPointId = imageOf(action, sourceEntry.pointId, generator);
      const edge = edgeReference(action, sourceEntry.pointId, generator);
      const letter = letterByStep.get(stepKey(sourceEntry.pointId, generator));
      edgeAssignments.push({
        sourcePointId: sourceEntry.pointId,
        targetPointId,
        coxeterGenerator: generator,
        orientedEdgeId: edge.id,
        treeEdge: transversal.treeEdgeKeys.has(
          edgeOrbitKey(sourceEntry.pointId, targetPointId, generator),
        ),
        ...(letter === undefined ? {} : { letter: { ...letter } }),
      });
    }
  }
  return { generators, edgeAssignments, letterByStep, edgeOrbitCount };
}

function rewriteRelators(
  action: NormalizedRightAction,
  transversal: TransversalResult,
  relators: readonly CoxeterDefiningRelator[],
  letterByStep: ReadonlyMap<string, SchreierLetter | undefined>,
): SchreierRelatorRewrite[] {
  const rewrites: SchreierRelatorRewrite[] = [];
  for (const [baseIndex, baseEntry] of transversal.entries.entries()) {
    for (const relator of relators) {
      let currentPointId = baseEntry.pointId;
      const edgePath: SchreierRelatorEdgeStep[] = [];
      const unreducedWord: SchreierLetter[] = [];
      for (const coxeterGenerator of relator.word) {
        const targetPointId = imageOf(action, currentPointId, coxeterGenerator);
        const edge = edgeReference(action, currentPointId, coxeterGenerator);
        const letter = letterByStep.get(
          stepKey(currentPointId, coxeterGenerator),
        );
        if (letter !== undefined) unreducedWord.push({ ...letter });
        edgePath.push({
          sourcePointId: currentPointId,
          targetPointId,
          coxeterGenerator,
          orientedEdgeId: edge.id,
          treeEdge: letter === undefined,
          ...(letter === undefined ? {} : { letter: { ...letter } }),
        });
        currentPointId = targetPointId;
      }
      if (currentPointId !== baseEntry.pointId) {
        throw new Error(
          `Relator ${relator.id} does not close at point "${baseEntry.pointId}".`,
        );
      }
      const word = freelyReduceSchreierWord(unreducedWord);
      rewrites.push({
        id: `rewrite:${relator.id}:at:${baseIndex}`,
        basePointId: baseEntry.pointId,
        definingRelatorId: relator.id,
        source: relator.source,
        coxeterWord: [...relator.word],
        edgePath,
        unreducedWord,
        word,
        isTrivial: word.length === 0,
      });
    }
  }
  return rewrites;
}

function buildFromNormalizedAction(
  system: CoxeterSystemInput,
  action: NormalizedRightAction,
  options: SchreierPresentationOptions,
): SchreierPresentation {
  validateRightAction(system, action);
  const rootPointId = chooseRootPointId(action, options.rootPointId);
  const transversal = buildTransversal(system, action, rootPointId);
  const { generators, edgeAssignments, letterByStep, edgeOrbitCount } =
    buildGenerators(system, action, transversal);
  const sourceRelators = definingRelators(system);
  const relatorRewrites = rewriteRelators(
    action,
    transversal,
    sourceRelators,
    letterByStep,
  );

  return {
    convention: "left-cosets-right-action",
    sourceSystemName: system.name,
    actionName: action.name,
    rootPointId,
    pointCount: action.pointIds.length,
    edgeOrbitCount,
    graphRank: generators.length,
    transversal: transversal.entries.map((entry) => ({
      pointId: entry.pointId,
      representativeWord: [...entry.representativeWord],
      ...(entry.parentPointId === undefined
        ? {}
        : { parentPointId: entry.parentPointId }),
      ...(entry.parentGenerator === undefined
        ? {}
        : { parentGenerator: entry.parentGenerator }),
      ...(entry.treeEdgeId === undefined
        ? {}
        : { treeEdgeId: entry.treeEdgeId }),
    })),
    spanningTreeEdges: transversal.treeEdges,
    generators,
    edgeAssignments,
    definingRelators: sourceRelators,
    relatorRewrites,
    relators: relatorRewrites.filter((rewrite) => !rewrite.isTrivial),
  };
}

/**
 * Compute a deterministic Reidemeister-Schreier presentation for the point
 * stabilizer of q0 (or the requested root) in a finite transitive right action.
 */
export function buildSchreierPresentation(
  systemInput: unknown,
  actionCandidate: TorsionFreeActionCandidate,
  options: SchreierPresentationOptions = {},
): SchreierPresentation {
  const system = parseCoxeterSystemInput(systemInput);
  return buildFromNormalizedAction(
    system,
    normalizeFiniteAction(system, actionCandidate),
    options,
  );
}

/** Build the same presentation from the action and edge ids in a quotient artifact. */
export function buildSchreierPresentationFromQuotient(
  quotient: QuotientComplex,
  options: SchreierPresentationOptions = {},
): SchreierPresentation {
  if (quotient.sourceSystem === undefined) {
    throw new Error(
      "QuotientComplex.sourceSystem is required for a Schreier presentation.",
    );
  }
  const system = parseCoxeterSystemInput(quotient.sourceSystem);
  return buildFromNormalizedAction(
    system,
    normalizeQuotientAction(system, quotient),
    options,
  );
}
