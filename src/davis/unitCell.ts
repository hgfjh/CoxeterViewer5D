import {
  approximateCoxeterGramMatrix,
  buildSimpleReflectionMatrices,
} from "../coxeter";
import type { Matrix } from "../coxeter/linearAlgebra";
import type { BarXCompressedComplex } from "../compression/types";
import { buildHyperbolicReflectionData } from "../geometry/geometricMode";
import type { CoxeterSystemInput } from "../types";

/**
 * A fundamental domain ("unit cell") for a torsion-free subgroup H of a
 * Coxeter group W, read off from the finite action of W on the cosets H\W.
 *
 * Conventions follow the Cayley graph: chambers are elements w of W, edges
 * are w -- w s (right multiplication), and the point of a chamber is
 * p0 . w, where p0 is the coset H itself. bar X = H\Sigma has one vertex per
 * point, so the chambers over a point form one H-orbit in the Davis complex.
 *
 * The unit cell D is one chamber per point, chosen Dirichlet-style: a
 * best-first search over the Cayley graph from e, in order of the distance
 * from the basepoint chamber x0 to w x0, accepts a chamber as the
 * representative of its point the first time that point is reached. Only
 * neighbours of accepted chambers are candidates, so D stays a connected
 * union of chambers and the accepting edges form a spanning tree of the
 * Schreier (coset) graph. (Breadth-first search in generator order is kept as
 * an option for comparison.) Every chamber adjacent to D but outside
 * it is a ghost: it is H-equivalent to the representative of its point. Each
 * bar X edge whose lift leaves D appears twice, as two stubs that H glues
 * together, exactly like the side pairings of a polygon.
 */
export interface UnitCell {
  /** The bar X vertex whose coset is H (the representative word is e). */
  basepointId: string;
  index: number;
  chambers: UnitCellChamber[];
  edges: UnitCellEdge[];
  stubs: UnitCellStub[];
  gluingPairs: UnitCellGluingPair[];
  cells: UnitCellCellLift[];
  copies: UnitCellCopy[];
  /** Number of copies h D that were available before the cap. */
  copyCandidateCount: number;
  /** How `UnitCellChamber.distance` was measured. */
  distanceKind: UnitCellDistanceKind;
  representatives: UnitCellRepresentativeRule;
  warnings: string[];
}

/**
 * - `hyperbolic`: d(x0, w x0) in H^n, from the Lorentzian reflection data.
 * - `tits-euclidean`: |w x0 - x0| for the invariant form of a finite group.
 * - `word-length`: length of the freely reduced word (an upper bound on the
 *   true length), for an infinite group without a geometry block.
 */
export type UnitCellDistanceKind =
  | "hyperbolic"
  | "tits-euclidean"
  | "word-length";

export type UnitCellRepresentativeRule = "dirichlet" | "bfs";

export type UnitCellChamberRole = "representative" | "ghost" | "copy";

export interface UnitCellChamber {
  /** The bar X vertex id for representatives, `uc:c<n>` otherwise. */
  id: string;
  /** A word for the chamber, freely reduced (s s = 1 cancelled). */
  word: number[];
  /** The bar X vertex (coset H w) this chamber lies over. */
  pointId: string;
  role: UnitCellChamberRole;
  /** Distance from the basepoint chamber; see `UnitCell.distanceKind`. */
  distance: number;
}

/**
 * - `tree`: an edge of the search's spanning tree of the Schreier graph.
 * - `internal`: a bar X edge outside the tree whose lift still joins two
 *   chambers of D (its Schreier generator is trivial in W).
 * - `stub`: a lift leaving D; it ends at a ghost.
 * - `outside`: an edge between two ghosts, drawn because a relation cell
 *   lift runs through it.
 * - `copy`: an edge of a neighbouring copy h D.
 */
export type UnitCellEdgeRole =
  | "tree"
  | "internal"
  | "stub"
  | "outside"
  | "copy";

export interface UnitCellEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
  role: UnitCellEdgeRole;
  /** The bar X edge this lift covers. */
  barEdgeId?: string;
  stubId?: string;
}

export interface UnitCellStub {
  id: string;
  barEdgeId: string;
  generator: number;
  /** The representative chamber the stub leaves from. */
  fromChamberId: string;
  /** The ghost chamber the stub runs to. */
  ghostChamberId: string;
  /** "a", "b", ..., "a1", ...; the partner carries the same tag, primed. */
  tag: string;
  primed: boolean;
  partnerStubId: string;
  pairIndex: number;
}

export interface UnitCellGluingPair {
  tag: string;
  barEdgeId: string;
  generator: number;
  stubIds: [string, string];
}

export interface UnitCellCellLift {
  /** The bar X relation cell id, so selection is shared with bar X. */
  id: string;
  generatorPair: [number, number];
  m: number;
  /** Chambers in boundary order, starting at the representative of the cell's first bar X vertex. */
  boundaryChamberIds: string[];
  /** The generator crossed after each boundary chamber. */
  boundaryWord: number[];
  /** Boundary chambers outside D (ghosts). */
  outsideChamberIds: string[];
}

export interface UnitCellCopy {
  id: string;
  /** A word for h in H with h D the copy; h = ghost . u^-1. */
  elementWord: number[];
  /** The stub whose ghost lies in this copy. */
  viaStubId: string;
  chamberIds: string[];
}

export interface UnitCellOptions {
  /**
   * Upper bound on chambers in neighbouring copies (default 2400). The number
   * of copies is floor(bound / index), at most `maxCopies`.
   */
  maxCopyChambers?: number;
  maxCopies?: number;
  /** Bar X vertex to use as the coset H. Defaults to `basepointId` below. */
  basepointId?: string;
  /** Default "dirichlet"; "bfs" takes the first word in generator order. */
  representatives?: UnitCellRepresentativeRule;
}

/**
 * Relative tolerance for deciding that two words name the same element of W.
 * The words are compared through their matrices in the Tits representation,
 * which is faithful, in floating point: an approximation, though a safe one
 * for the short words used here (entries stay far below 1e6).
 */
const SAME_ELEMENT_TOLERANCE = 1e-7;

const DEFAULT_MAX_COPY_CHAMBERS = 2_400;
const DEFAULT_MAX_COPIES = 24;

/**
 * Tag letters. "e" is left out: it names the identity chamber, and a stub
 * tagged "e" next to the vertex labelled e read as the same thing.
 */
const TAG_LETTERS = "abcdfghijklmnopqrstuvwxyz";

/** Gluing tags: a..z (no e), then a1..z1, a2..z2, ... */
export function gluingTag(index: number): string {
  const letter = TAG_LETTERS[index % TAG_LETTERS.length];
  const round = Math.floor(index / TAG_LETTERS.length);
  return round === 0 ? letter : `${letter}${round}`;
}

/** The tag as drawn on a stub: the second occurrence carries a prime. */
export function stubTagLabel(stub: Pick<UnitCellStub, "tag" | "primed">) {
  return stub.primed ? `${stub.tag}′` : stub.tag;
}

export function freelyReduceInvolutionWord(word: readonly number[]): number[] {
  const reduced: number[] = [];
  for (const generator of word) {
    if (reduced.at(-1) === generator) reduced.pop();
    else reduced.push(generator);
  }
  return reduced;
}

/** Inverse of a word in involutions: the letters reversed. */
function inverseWord(word: readonly number[]): number[] {
  return [...word].reverse();
}

/**
 * The bar X vertex taken as the coset H: the cover's vertex whose
 * representative word is empty when the cover records one, otherwise the
 * first vertex. Any choice gives a conjugate of H and the same quotient.
 */
export function unitCellBasepointId(
  barX: BarXCompressedComplex,
  representativeWords?: ReadonlyMap<string, readonly number[] | undefined>,
): string {
  const identity = barX.vertices.find(
    (vertex) => representativeWords?.get(vertex.id)?.length === 0,
  );
  return identity?.id ?? barX.vertices[0].id;
}

/**
 * Build the unit cell of bar X = H\Sigma.
 *
 * `representativeWords` (bar X vertex id -> word) is only used to find the
 * coset H; the representatives themselves come from the search below.
 */
export function buildUnitCell(
  barX: BarXCompressedComplex,
  representativeWords?: ReadonlyMap<string, readonly number[] | undefined>,
  options: UnitCellOptions = {},
): UnitCell {
  const system = barX.sourceSystem;
  const rank = system.rank;
  const warnings: string[] = [];
  if (barX.vertices.length === 0) {
    throw new Error("bar X has no vertices, so there is no unit cell.");
  }

  // The finite right action p -> p s, read off the bar X edges. A torsion-free
  // H acts freely, so no generator fixes a point (no loops).
  const action = Array.from({ length: rank }, () => new Map<string, string>());
  const barEdgeByEnd = new Map<string, string>();
  for (const edge of barX.geometricEdges) {
    action[edge.generator].set(edge.sourceVertexId, edge.targetVertexId);
    action[edge.generator].set(edge.targetVertexId, edge.sourceVertexId);
    barEdgeByEnd.set(`${edge.generator}|${edge.sourceVertexId}`, edge.id);
    barEdgeByEnd.set(`${edge.generator}|${edge.targetVertexId}`, edge.id);
  }
  const act = (pointId: string, generator: number): string => {
    const image = action[generator].get(pointId);
    if (image === undefined) {
      throw new Error(
        `bar X has no ${system.generators[generator]?.label ?? generator}-edge at ${pointId}.`,
      );
    }
    return image;
  };
  const basepointId =
    options.basepointId ?? unitCellBasepointId(barX, representativeWords);

  const distanceOf = chamberDistanceFunction(system);
  const rule = options.representatives ?? "dirichlet";
  const repWord = new Map<string, number[]>([[basepointId, []]]);
  const treeBarEdgeIds = new Set<string>();
  const order = [basepointId];
  // The edge that first reaches a point is a tree edge.
  const accept = (point: string, parent: string, generator: number) => {
    repWord.set(
      point,
      freelyReduceInvolutionWord([...repWord.get(parent)!, generator]),
    );
    treeBarEdgeIds.add(barEdgeByEnd.get(`${generator}|${parent}`)!);
    order.push(point);
  };
  if (rule === "bfs") {
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const point = order[cursor];
      for (let generator = 0; generator < rank; generator += 1) {
        const image = act(point, generator);
        if (!repWord.has(image)) accept(image, point, generator);
      }
    }
  } else {
    // Prim-like growth: the nearest chamber adjacent to D whose point is new
    // joins D. Ties go to the shorter word, then the lexicographically
    // smaller one, so the result is deterministic.
    const frontier = new MinHeap<FrontierEntry>(compareFrontier);
    const pushNeighbours = (point: string) => {
      const word = repWord.get(point)!;
      for (let generator = 0; generator < rank; generator += 1) {
        const image = act(point, generator);
        if (repWord.has(image)) continue;
        const next = freelyReduceInvolutionWord([...word, generator]);
        frontier.push({
          point: image,
          parent: point,
          generator,
          word: next,
          distanceKey: Math.round(distanceOf.distance(next) * 1e9),
        });
      }
    };
    pushNeighbours(basepointId);
    for (let entry = frontier.pop(); entry; entry = frontier.pop()) {
      if (repWord.has(entry.point)) continue;
      accept(entry.point, entry.parent, entry.generator);
      pushNeighbours(entry.point);
    }
  }
  if (order.length !== barX.vertices.length) {
    warnings.push(
      `The generators reach ${order.length} of ${barX.vertices.length} bar X vertices from ${basepointId}; the unit cell covers only that component.`,
    );
  }

  // Element identification. Chambers over one point differ by elements of
  // H, so a candidate only needs comparing with the chambers already found
  // over the same point (an exact bucketing), and then by matrix.
  const reflections = buildSimpleReflectionMatrices(system.coxeterMatrix);
  const matrixCache = new Map<string, Matrix>();
  const wordMatrix = (word: readonly number[]): Matrix => {
    const key = word.join(".");
    const cached = matrixCache.get(key);
    if (cached) return cached;
    const matrix =
      word.length === 0
        ? identity(rank)
        : multiply(wordMatrix(word.slice(0, -1)), reflections[word.at(-1)!]);
    matrixCache.set(key, matrix);
    return matrix;
  };

  const chambers: UnitCellChamber[] = [];
  const chamberById = new Map<string, UnitCellChamber>();
  const chambersByPoint = new Map<string, UnitCellChamber[]>();
  const addChamber = (chamber: UnitCellChamber) => {
    chambers.push(chamber);
    chamberById.set(chamber.id, chamber);
    const bucket = chambersByPoint.get(chamber.pointId) ?? [];
    bucket.push(chamber);
    chambersByPoint.set(chamber.pointId, bucket);
    return chamber;
  };
  for (const point of order) {
    addChamber({
      id: point,
      word: repWord.get(point)!,
      pointId: point,
      role: "representative",
      distance: distanceOf.distance(repWord.get(point)!),
    });
  }
  const findChamber = (
    pointId: string,
    word: readonly number[],
  ): UnitCellChamber | undefined => {
    const matrix = wordMatrix(word);
    return chambersByPoint
      .get(pointId)
      ?.find((chamber) => sameMatrix(wordMatrix(chamber.word), matrix));
  };
  let nextChamberIndex = 0;
  const chamberAt = (
    pointId: string,
    rawWord: readonly number[],
    role: Exclude<UnitCellChamberRole, "representative">,
  ): UnitCellChamber => {
    const word = freelyReduceInvolutionWord(rawWord);
    return (
      findChamber(pointId, word) ??
      addChamber({
        id: `uc:c${nextChamberIndex++}`,
        word,
        pointId,
        role,
        distance: distanceOf.distance(word),
      })
    );
  };

  const edges: UnitCellEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (edge: UnitCellEdge) => {
    const [left, right] = [edge.source, edge.target].sort();
    const key = `${left}|${right}|${edge.generator}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    edges.push(edge);
    return true;
  };

  // Edges leaving each representative: inside D, or a stub to a ghost.
  const stubs: UnitCellStub[] = [];
  const gluingPairs: UnitCellGluingPair[] = [];
  const stubsByBarEdge = new Map<string, UnitCellStub[]>();
  for (const point of order) {
    const from = chamberById.get(point)!;
    for (let generator = 0; generator < rank; generator += 1) {
      const image = act(point, generator);
      const barEdgeId = barEdgeByEnd.get(`${generator}|${point}`)!;
      const neighbourWord = [...from.word, generator];
      const target = chamberById.get(image);
      if (
        target &&
        sameMatrix(wordMatrix(target.word), wordMatrix(neighbourWord))
      ) {
        addEdge({
          id: `uc:e:${barEdgeId}`,
          source: from.id,
          target: target.id,
          generator,
          role: treeBarEdgeIds.has(barEdgeId) ? "tree" : "internal",
          barEdgeId,
        });
        continue;
      }
      const ghost = chamberAt(image, neighbourWord, "ghost");
      const existing = stubsByBarEdge.get(barEdgeId) ?? [];
      const pairIndex =
        existing.length > 0 ? existing[0].pairIndex : gluingPairs.length;
      const stub: UnitCellStub = {
        id: `uc:s:${barEdgeId}:${existing.length}`,
        barEdgeId,
        generator,
        fromChamberId: from.id,
        ghostChamberId: ghost.id,
        tag: gluingTag(pairIndex),
        primed: existing.length > 0,
        partnerStubId: "",
        pairIndex,
      };
      if (existing.length === 0) {
        gluingPairs.push({
          tag: stub.tag,
          barEdgeId,
          generator,
          stubIds: [stub.id, stub.id],
        });
      } else {
        gluingPairs[pairIndex].stubIds[1] = stub.id;
      }
      existing.push(stub);
      stubsByBarEdge.set(barEdgeId, existing);
      stubs.push(stub);
      addEdge({
        id: stub.id,
        source: from.id,
        target: ghost.id,
        generator,
        role: "stub",
        barEdgeId,
        stubId: stub.id,
      });
    }
  }
  for (const pair of gluingPairs) {
    const [first, second] = pair.stubIds;
    const firstStub = stubs.find((stub) => stub.id === first)!;
    const secondStub = stubs.find((stub) => stub.id === second)!;
    firstStub.partnerStubId = second;
    secondStub.partnerStubId = first;
  }

  // Each bar X relation cell is drawn once: its lift starting at the
  // representative of its first boundary vertex.
  const cells: UnitCellCellLift[] = barX.relationCells.map((cell) => {
    const start = cell.boundaryOccurrences[0].sourceVertexId;
    let word = repWord.get(start);
    if (word === undefined) {
      throw new Error(`Relation cell ${cell.id} is outside the unit cell.`);
    }
    let chamber = chamberById.get(start)!;
    const boundaryChamberIds: string[] = [];
    const boundaryWord: number[] = [];
    for (const occurrence of cell.boundaryOccurrences) {
      if (chamber.pointId !== occurrence.sourceVertexId) {
        throw new Error(
          `The lift of ${cell.id} left its boundary at ${occurrence.sourceVertexId}.`,
        );
      }
      boundaryChamberIds.push(chamber.id);
      boundaryWord.push(occurrence.generator);
      const nextWord = freelyReduceInvolutionWord([
        ...word,
        occurrence.generator,
      ]);
      const next = chamberAt(occurrence.targetVertexId, nextWord, "ghost");
      if (chamber.role !== "representative" && next.role !== "representative") {
        addEdge({
          id: `uc:o:${chamber.id}:${next.id}:${occurrence.generator}`,
          source: chamber.id,
          target: next.id,
          generator: occurrence.generator,
          role: "outside",
          barEdgeId: occurrence.edgeId,
        });
      }
      word = next.word;
      chamber = next;
    }
    if (chamber.id !== boundaryChamberIds[0]) {
      throw new Error(`The lift of ${cell.id} does not close up.`);
    }
    return {
      id: cell.id,
      generatorPair: cell.generatorPair,
      m: cell.m,
      boundaryChamberIds,
      boundaryWord,
      outsideChamberIds: boundaryChamberIds.filter(
        (id) => chamberById.get(id)!.role !== "representative",
      ),
    };
  });

  // Neighbouring copies h D, one per distinct h = ghost . u^-1 (u the
  // representative of the ghost's point), nearest ghosts first. The two stubs
  // of a gluing pair give h and h^-1.
  const index = order.length;
  const maxCopies = Math.min(
    options.maxCopies ?? DEFAULT_MAX_COPIES,
    Math.floor((options.maxCopyChambers ?? DEFAULT_MAX_COPY_CHAMBERS) / index),
  );
  const candidates: Array<{ stub: UnitCellStub; word: number[] }> = [];
  for (const stub of [...stubs].sort(
    (left, right) =>
      chamberById.get(left.ghostChamberId)!.word.length -
        chamberById.get(right.ghostChamberId)!.word.length ||
      left.pairIndex - right.pairIndex ||
      Number(left.primed) - Number(right.primed),
  )) {
    const ghost = chamberById.get(stub.ghostChamberId)!;
    const word = freelyReduceInvolutionWord([
      ...ghost.word,
      ...inverseWord(repWord.get(ghost.pointId)!),
    ]);
    const matrix = wordMatrix(word);
    if (
      candidates.some((candidate) =>
        sameMatrix(wordMatrix(candidate.word), matrix),
      )
    ) {
      continue;
    }
    candidates.push({ stub, word });
  }
  const copies: UnitCellCopy[] = candidates
    .slice(0, Math.max(0, maxCopies))
    .map(({ stub, word }, copyIndex) => {
      const chamberIds = order.map(
        (point) =>
          chamberAt(point, [...word, ...repWord.get(point)!], "copy").id,
      );
      const copyOf = new Map(order.map((point, k) => [point, chamberIds[k]]));
      for (const edge of edges) {
        if (edge.role !== "tree" && edge.role !== "internal") continue;
        addEdge({
          id: `uc:k${copyIndex}:${edge.barEdgeId}`,
          source: copyOf.get(edge.source)!,
          target: copyOf.get(edge.target)!,
          generator: edge.generator,
          role: "copy",
          barEdgeId: edge.barEdgeId,
        });
      }
      return {
        id: `uc:copy${copyIndex}`,
        elementWord: word,
        viaStubId: stub.id,
        chamberIds,
      };
    });

  return {
    basepointId,
    index,
    chambers,
    edges,
    stubs,
    gluingPairs,
    cells,
    copies,
    copyCandidateCount: candidates.length,
    distanceKind: distanceOf.kind,
    representatives: rule,
    warnings,
  };
}

/** The point p0 . w of a word, for tests and diagnostics. */
export function unitCellPointOfWord(
  barX: BarXCompressedComplex,
  basepointId: string,
  word: readonly number[],
): string {
  let point = basepointId;
  for (const generator of word) {
    const edge = barX.geometricEdges.find(
      (candidate) =>
        candidate.generator === generator &&
        (candidate.sourceVertexId === point ||
          candidate.targetVertexId === point),
    );
    if (!edge)
      throw new Error(`No edge for generator ${generator} at ${point}.`);
    point =
      edge.sourceVertexId === point ? edge.targetVertexId : edge.sourceVertexId;
  }
  return point;
}

function identity(size: number): Matrix {
  return Array.from({ length: size }, (_unused, i) =>
    Array.from({ length: size }, (_unused2, j) => (i === j ? 1 : 0)),
  );
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const size = left.length;
  const product = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i += 1) {
    for (let k = 0; k < size; k += 1) {
      const value = left[i][k];
      if (value === 0) continue;
      for (let j = 0; j < size; j += 1) product[i][j] += value * right[k][j];
    }
  }
  return product;
}

function sameMatrix(left: Matrix, right: Matrix): boolean {
  let scale = 1;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < left.length; j += 1) {
      scale = Math.max(scale, Math.abs(left[i][j]));
      difference = Math.max(difference, Math.abs(left[i][j] - right[i][j]));
    }
  }
  return difference <= SAME_ELEMENT_TOLERANCE * scale;
}

interface FrontierEntry {
  point: string;
  parent: string;
  generator: number;
  word: number[];
  /** Distance rounded to 1e-9, so equal distances tie exactly. */
  distanceKey: number;
}

function compareFrontier(left: FrontierEntry, right: FrontierEntry): number {
  if (left.distanceKey !== right.distanceKey) {
    return left.distanceKey - right.distanceKey;
  }
  if (left.word.length !== right.word.length) {
    return left.word.length - right.word.length;
  }
  for (let k = 0; k < left.word.length; k += 1) {
    if (left.word[k] !== right.word[k]) return left.word[k] - right.word[k];
  }
  return 0;
}

class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (left: T, right: T) => number;

  constructor(compare: (left: T, right: T) => number) {
    this.compare = compare;
  }

  push(item: T) {
    const items = this.items;
    items.push(item);
    let child = items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.compare(items[child], items[parent]) >= 0) break;
      [items[child], items[parent]] = [items[parent], items[child]];
      child = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let parent = 0;
      for (;;) {
        const left = 2 * parent + 1;
        const right = left + 1;
        let smallest = parent;
        if (
          left < items.length &&
          this.compare(items[left], items[smallest]) < 0
        ) {
          smallest = left;
        }
        if (
          right < items.length &&
          this.compare(items[right], items[smallest]) < 0
        ) {
          smallest = right;
        }
        if (smallest === parent) break;
        [items[smallest], items[parent]] = [items[parent], items[smallest]];
        parent = smallest;
      }
    }
    return top;
  }
}

/**
 * Distance from the basepoint chamber x0 to w x0, the quantity a Dirichlet
 * domain minimises. Hyperbolic systems use cosh d = -<x0, w x0>_J; finite
 * groups use the Euclidean distance for the invariant Tits form, with x0 the
 * sum of the fundamental weights (as in the orbit layout); anything else
 * falls back to word length.
 */
export function chamberDistanceFunction(system: CoxeterSystemInput): {
  kind: UnitCellDistanceKind;
  distance: (word: readonly number[]) => number;
} {
  const hyperbolic = system.geometry
    ? buildHyperbolicReflectionData(system)
    : undefined;
  if (hyperbolic?.ok && hyperbolic.data) {
    const { basepoint, reflectionMatrices } = hyperbolic.data;
    const transform = cachedWordMatrices(reflectionMatrices, basepoint.length);
    return {
      kind: "hyperbolic",
      distance: (word) => {
        const image = applyMatrix(transform(word), basepoint);
        let coshDistance = basepoint[0] * image[0];
        for (let k = 1; k < image.length; k += 1) {
          coshDistance -= basepoint[k] * image[k];
        }
        return Math.acosh(Math.max(1, coshDistance));
      },
    };
  }
  const gram = approximateCoxeterGramMatrix(system.coxeterMatrix);
  const basepoint = solvePositiveDefinite(gram, Array(gram.length).fill(1));
  if (basepoint) {
    const transform = cachedWordMatrices(
      buildSimpleReflectionMatrices(system.coxeterMatrix),
      gram.length,
    );
    return {
      kind: "tits-euclidean",
      distance: (word) => {
        const image = applyMatrix(transform(word), basepoint);
        const delta = image.map((value, k) => value - basepoint[k]);
        let squared = 0;
        for (let i = 0; i < delta.length; i += 1) {
          for (let j = 0; j < delta.length; j += 1) {
            squared += delta[i] * gram[i][j] * delta[j];
          }
        }
        return Math.sqrt(Math.max(0, squared));
      },
    };
  }
  return {
    kind: "word-length",
    distance: (word) => freelyReduceInvolutionWord(word).length,
  };
}

function cachedWordMatrices(generators: Matrix[], size: number) {
  const cache = new Map<string, Matrix>([["", identity(size)]]);
  const wordMatrix = (word: readonly number[]): Matrix => {
    const key = word.join(".");
    const cached = cache.get(key);
    if (cached) return cached;
    // Right multiplication, as for Cayley edges: rho(w s) = rho(w) rho(s).
    const matrix = multiply(
      wordMatrix(word.slice(0, -1)),
      generators[word.at(-1)!],
    );
    cache.set(key, matrix);
    return matrix;
  };
  return wordMatrix;
}

function applyMatrix(matrix: Matrix, vector: readonly number[]): number[] {
  return matrix.map((row) =>
    row.reduce((total, value, k) => total + value * vector[k], 0),
  );
}

/** Solves B x = b by Cholesky; undefined when B is not positive definite. */
function solvePositiveDefinite(
  matrix: Matrix,
  rhs: readonly number[],
): number[] | undefined {
  const size = matrix.length;
  const lower: Matrix = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k += 1) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        // Same floor as the orbit layout: separates finite (positive
        // definite) from affine (semidefinite) Tits forms in floating point.
        if (sum <= 1e-10) return undefined;
        lower[i][i] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / lower[j][j];
      }
    }
  }
  const y = Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    let sum = rhs[i];
    for (let k = 0; k < i; k += 1) sum -= lower[i][k] * y[k];
    y[i] = sum / lower[i][i];
  }
  const x = Array(size).fill(0);
  for (let i = size - 1; i >= 0; i -= 1) {
    let sum = y[i];
    for (let k = i + 1; k < size; k += 1) sum -= lower[k][i] * x[k];
    x[i] = sum / lower[i][i];
  }
  return x;
}

export interface UnitCellMetrics {
  gluingPairs: number;
  internalNonTreeEdges: number;
  cellsInside: number;
  cellsCrossing: number;
  /** Largest distance from e over the chambers of D. */
  maxRepresentativeDistance: number;
  boundaryGhosts: number;
  /**
   * Convexity proxy: the fraction of ghosts at the end of a stub that are
   * farther from e than every representative adjacent to them. A domain that
   * grows outward scores near 1; one that folds back on itself scores lower.
   */
  outwardGhostFraction: number;
  /**
   * The Dirichlet property: the fraction of ghosts that are no closer to e
   * than the representative of their own point (1 for a Dirichlet domain).
   */
  ghostsNotCloserThanRepresentative: number;
}

export function unitCellMetrics(unit: UnitCell): UnitCellMetrics {
  const chamberById = new Map(unit.chambers.map((c) => [c.id, c]));
  const farthestAdjacent = new Map<string, number>();
  for (const stub of unit.stubs) {
    const from = chamberById.get(stub.fromChamberId)!.distance;
    farthestAdjacent.set(
      stub.ghostChamberId,
      Math.max(farthestAdjacent.get(stub.ghostChamberId) ?? -Infinity, from),
    );
  }
  let outward = 0;
  for (const [ghostId, farthestRep] of farthestAdjacent) {
    if (chamberById.get(ghostId)!.distance > farthestRep + 1e-9) outward += 1;
  }
  const representatives = unit.chambers.filter(
    (c) => c.role === "representative",
  );
  const ghosts = unit.chambers.filter((c) => c.role === "ghost");
  const notCloser = ghosts.filter(
    (ghost) =>
      ghost.distance >= chamberById.get(ghost.pointId)!.distance - 1e-9,
  ).length;
  return {
    gluingPairs: unit.gluingPairs.length,
    internalNonTreeEdges: unit.edges.filter((e) => e.role === "internal")
      .length,
    cellsInside: unit.cells.filter((c) => c.outsideChamberIds.length === 0)
      .length,
    cellsCrossing: unit.cells.filter((c) => c.outsideChamberIds.length > 0)
      .length,
    maxRepresentativeDistance: Math.max(
      ...representatives.map((c) => c.distance),
    ),
    boundaryGhosts: farthestAdjacent.size,
    outwardGhostFraction:
      farthestAdjacent.size === 0 ? 1 : outward / farthestAdjacent.size,
    ghostsNotCloserThanRepresentative:
      ghosts.length === 0 ? 1 : notCloser / ghosts.length,
  };
}
