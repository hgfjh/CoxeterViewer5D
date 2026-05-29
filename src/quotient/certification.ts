import { enumerateSphericalSubsets } from "../davis";
import type { CoxeterMatrixEntry } from "../types";
import type {
  QuotientComplex,
  QuotientEdge,
  QuotientPermutationAction,
  QuotientTwoCell,
  SchreierCertificate,
  TorsionFreeCertificate,
} from "./types";
import { validateQuotientComplex } from "./validation";

type ActionMap = Map<number, QuotientPermutationAction>;

interface PermutationWord {
  images: number[];
  word: number[];
}

function generatorRank(complex: QuotientComplex): number {
  return (
    complex.sourceSystem?.rank ??
    complex.generatorRank ??
    Math.max(-1, ...complex.edges.map((edge) => edge.generator)) + 1
  );
}

function vertexIndex(complex: QuotientComplex): Map<string, number> {
  return new Map(complex.vertices.map((vertex, index) => [vertex.id, index]));
}

function buildActions(complex: QuotientComplex, errors: string[]): ActionMap {
  const rank = generatorRank(complex);
  const vertexIds = complex.vertices.map((vertex) => vertex.id);
  const actions = new Map<number, QuotientPermutationAction>();

  for (const action of complex.permutationAction ?? []) {
    actions.set(action.generator, action);
  }

  for (let generator = 0; generator < rank; generator += 1) {
    if (actions.has(generator)) {
      continue;
    }

    const images: Record<string, string> = {};
    for (const vertexId of vertexIds) {
      const outgoing = complex.edges.filter(
        (edge) => edge.source === vertexId && edge.generator === generator,
      );
      if (outgoing.length !== 1) {
        errors.push(
          `Cannot derive generator ${generator} action at "${vertexId}"; expected one outgoing edge and found ${outgoing.length}.`,
        );
        continue;
      }
      images[vertexId] = outgoing[0].target;
    }

    actions.set(generator, { generator, images });
  }

  return actions;
}

function actionImage(
  action: QuotientPermutationAction,
  vertexId: string,
): string | undefined {
  return action.images[vertexId];
}

function isBijection(
  action: QuotientPermutationAction,
  vertexIds: string[],
): boolean {
  const seen = new Set<string>();
  for (const vertexId of vertexIds) {
    const image = actionImage(action, vertexId);
    if (image === undefined || !vertexIds.includes(image)) {
      return false;
    }
    seen.add(image);
  }
  return seen.size === vertexIds.length;
}

function relationImage(
  start: string,
  left: QuotientPermutationAction,
  right: QuotientPermutationAction,
  m: number,
): string | undefined {
  let current: string | undefined = start;
  for (let i = 0; i < m; i += 1) {
    current = current === undefined ? undefined : left.images[current];
    current = current === undefined ? undefined : right.images[current];
  }
  return current;
}

function sortedPair(pair: [number, number]): [number, number] {
  return pair[0] < pair[1] ? pair : [pair[1], pair[0]];
}

function canonicalCycleKey(pair: [number, number], vertices: string[]): string {
  const candidates: string[] = [];
  const cycles = [vertices, [...vertices].reverse()];

  for (const cycle of cycles) {
    for (let shift = 0; shift < cycle.length; shift += 1) {
      candidates.push(
        cycle.slice(shift).concat(cycle.slice(0, shift)).join(">"),
      );
    }
  }

  candidates.sort();
  const [i, j] = sortedPair(pair);
  return `${i},${j}:${candidates[0] ?? ""}`;
}

function boundaryFromOrbit(
  start: string,
  first: QuotientPermutationAction,
  second: QuotientPermutationAction,
  m: number,
): string[] {
  const boundary = [start];
  let current: string | undefined = start;

  for (let step = 0; step < 2 * m - 1; step += 1) {
    const action = step % 2 === 0 ? first : second;
    current = current === undefined ? undefined : action.images[current];
    if (current === undefined) {
      break;
    }
    boundary.push(current);
  }

  return boundary;
}

function finiteSourceEntries(
  complex: QuotientComplex,
): Array<{ pair: [number, number]; m: number }> {
  const system = complex.sourceSystem;
  if (system === undefined) {
    return [];
  }

  const entries: Array<{ pair: [number, number]; m: number }> = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const entry: CoxeterMatrixEntry = system.coxeterMatrix[i][j];
      if (entry !== "inf") {
        entries.push({ pair: [i, j], m: entry });
      }
    }
  }
  return entries;
}

function cellKey(cell: QuotientTwoCell): string {
  return canonicalCycleKey(cell.generatorPair, cell.boundaryVertexIds);
}

function edgeKey(edge: QuotientEdge): string {
  return `${edge.generator}:${edge.source}->${edge.target}`;
}

export function certifyQuotientAction(
  complex: QuotientComplex,
  options: { checkedAt?: string } = {},
): SchreierCertificate {
  const validation = validateQuotientComplex(complex);
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const rank = generatorRank(complex);
  const vertexIds = complex.vertices.map((vertex) => vertex.id);
  const actions = buildActions(complex, errors);
  const edgeKeys = new Set(complex.edges.map(edgeKey));

  const checks: SchreierCertificate["checks"] = {
    generatorRegularity: true,
    bijectiveActions: true,
    involutiveGenerators: true,
    edgeCompatibility: true,
    coxeterRelations: true,
    rankTwoCellCoverage: true,
    duplicateRankTwoCells: true,
  };

  for (let generator = 0; generator < rank; generator += 1) {
    const action = actions.get(generator);
    if (action === undefined) {
      checks.generatorRegularity = false;
      continue;
    }

    if (!isBijection(action, vertexIds)) {
      checks.bijectiveActions = false;
      errors.push(`generator ${generator} action is not a bijection.`);
    }

    for (const vertexId of vertexIds) {
      const image = action.images[vertexId];
      const twice = image === undefined ? undefined : action.images[image];
      if (twice !== vertexId) {
        checks.involutiveGenerators = false;
        errors.push(
          `generator ${generator} action is not involutive at "${vertexId}".`,
        );
        break;
      }

      if (!edgeKeys.has(`${generator}:${vertexId}->${image}`)) {
        checks.edgeCompatibility = false;
        errors.push(
          `generator ${generator} action ${vertexId}->${image} has no directed quotient edge.`,
        );
      }
    }
  }

  if (complex.sourceSystem === undefined) {
    warnings.push(
      "No source Coxeter system is present; finite relation and rank-two orbit checks are structural only.",
    );
  }

  for (const {
    pair: [i, j],
    m,
  } of finiteSourceEntries(complex)) {
    const left = actions.get(i);
    const right = actions.get(j);
    if (left === undefined || right === undefined) {
      checks.coxeterRelations = false;
      errors.push(`missing permutation action for finite pair (${i}, ${j}).`);
      continue;
    }

    for (const vertexId of vertexIds) {
      if (relationImage(vertexId, left, right, m) !== vertexId) {
        checks.coxeterRelations = false;
        errors.push(
          `finite relation (${i}, ${j}, m=${m}) fails at ${vertexId}.`,
        );
        break;
      }
    }
  }

  const cellKeys = new Map<string, string[]>();
  for (const cell of complex.twoCells) {
    const key = cellKey(cell);
    cellKeys.set(key, [...(cellKeys.get(key) ?? []), cell.id]);
  }

  for (const [key, ids] of cellKeys) {
    if (ids.length > 1) {
      checks.duplicateRankTwoCells = false;
      errors.push(
        `duplicate quotient rank-two cell boundary ${key}: ${ids.join(", ")}.`,
      );
    }
  }

  const rankTwoOrbits: SchreierCertificate["rankTwoOrbits"] = [];
  const seenOrbitKeys = new Set<string>();
  for (const { pair, m } of finiteSourceEntries(complex)) {
    const first = actions.get(pair[0]);
    const second = actions.get(pair[1]);
    if (first === undefined || second === undefined) {
      continue;
    }

    for (const vertexId of vertexIds) {
      const boundary = boundaryFromOrbit(vertexId, first, second, m);
      if (boundary.length !== 2 * m) {
        checks.rankTwoCellCoverage = false;
        errors.push(
          `rank-two orbit (${pair.join(",")}) at ${vertexId} is incomplete.`,
        );
        continue;
      }

      const key = canonicalCycleKey(pair, boundary);
      if (seenOrbitKeys.has(key)) {
        continue;
      }
      seenOrbitKeys.add(key);
      const matchedCellIds = cellKeys.get(key) ?? [];
      if (matchedCellIds.length === 0) {
        checks.rankTwoCellCoverage = false;
        errors.push(`rank-two orbit ${key} has no quotient two-cell.`);
      }
      rankTwoOrbits.push({
        generatorPair: sortedPair(pair),
        m,
        orbitKey: key,
        boundaryVertexIds: boundary,
        matchedCellIds,
      });
    }
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    method: "in-repo-permutation-action",
    checkedAt: options.checkedAt,
    generatorRank: rank,
    vertexCount: complex.vertices.length,
    checks,
    rankTwoOrbits,
    errors,
    warnings,
  };
}

function identityPermutation(size: number): number[] {
  return Array.from({ length: size }, (_, index) => index);
}

function permutationKey(images: number[]): string {
  return images.join(",");
}

function composePermutation(left: number[], right: number[]): number[] {
  return left.map((image) => right[image]);
}

function actionPermutation(
  action: QuotientPermutationAction,
  vertices: string[],
  indexByVertex: Map<string, number>,
): number[] | undefined {
  const images: number[] = [];
  for (const vertexId of vertices) {
    const image = action.images[vertexId];
    const index = image === undefined ? undefined : indexByVertex.get(image);
    if (index === undefined) {
      return undefined;
    }
    images.push(index);
  }
  return images;
}

function enumeratePermutationSubgroup(
  generators: number[],
  actions: ActionMap,
  vertices: string[],
  indexByVertex: Map<string, number>,
  cap: number,
): { elements: PermutationWord[]; complete: boolean } {
  const generatorPermutations = generators
    .map((generator) => {
      const action = actions.get(generator);
      const images =
        action === undefined
          ? undefined
          : actionPermutation(action, vertices, indexByVertex);
      return images === undefined ? undefined : { generator, images };
    })
    .filter((entry): entry is { generator: number; images: number[] } =>
      Boolean(entry),
    );

  const identity = identityPermutation(vertices.length);
  const elements: PermutationWord[] = [{ images: identity, word: [] }];
  const seen = new Set([permutationKey(identity)]);

  for (let cursor = 0; cursor < elements.length; cursor += 1) {
    const current = elements[cursor];
    for (const generator of generatorPermutations) {
      const images = composePermutation(current.images, generator.images);
      const key = permutationKey(images);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      elements.push({
        images,
        word: [...current.word, generator.generator],
      });
      if (elements.length > cap) {
        return { elements, complete: false };
      }
    }
  }

  return { elements, complete: true };
}

export function certifyVisibleTorsionFree(
  complex: QuotientComplex,
  options: { checkedAt?: string; subgroupOrderCap?: number } = {},
): TorsionFreeCertificate {
  const errors: string[] = [];
  const warnings: string[] = [];
  const limitations = [
    "This in-repo certificate checks stabilizers of visible cosets under enumerated spherical special subgroups.",
    "It is a quotient-action guard, not a replacement for an external torsion-free proof.",
  ];
  const checkedSphericalSubsets: TorsionFreeCertificate["checkedSphericalSubsets"] =
    [];
  const witnesses: TorsionFreeCertificate["witnesses"] = [];

  if (complex.sourceSystem === undefined) {
    return {
      status: "skipped",
      method: "visible-spherical-stabilizer",
      checkedAt: options.checkedAt,
      checkedSphericalSubsets,
      witnesses,
      limitations,
      errors,
      warnings: [
        "No source Coxeter system is present, so spherical stabilizer checks were skipped.",
      ],
    };
  }

  const validation = validateQuotientComplex(complex);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);
  const actionErrors: string[] = [];
  const actions = buildActions(complex, actionErrors);
  errors.push(...actionErrors);

  if (errors.length > 0) {
    return {
      status: "failed",
      method: "visible-spherical-stabilizer",
      checkedAt: options.checkedAt,
      checkedSphericalSubsets,
      witnesses,
      limitations,
      errors,
      warnings,
    };
  }

  const vertices = complex.vertices.map((vertex) => vertex.id);
  const indexByVertex = vertexIndex(complex);
  const cap = options.subgroupOrderCap ?? 100_000;
  const spherical = enumerateSphericalSubsets(complex.sourceSystem, {
    maxSubgroupOrder: cap,
  });
  warnings.push(...spherical.warnings);

  let incomplete = false;
  for (const subset of spherical.subsets) {
    const subgroup = enumeratePermutationSubgroup(
      subset.generators,
      actions,
      vertices,
      indexByVertex,
      cap,
    );

    checkedSphericalSubsets.push({
      id: subset.id,
      generators: subset.generators,
      subgroupOrder: subset.subgroupOrder,
      enumeratedElements: subgroup.elements.length,
    });

    if (!subgroup.complete) {
      incomplete = true;
      warnings.push(
        `Spherical subset ${subset.id} exceeded the ${cap} element cap.`,
      );
      continue;
    }

    if (
      subset.subgroupOrder !== undefined &&
      subgroup.elements.length !== subset.subgroupOrder
    ) {
      incomplete = true;
      warnings.push(
        `Spherical subset ${subset.id} action has ${subgroup.elements.length} elements, expected ${subset.subgroupOrder}.`,
      );
      const witnessWord = subset.generators.slice(0, 1);
      const witnessAction =
        witnessWord[0] === undefined ? undefined : actions.get(witnessWord[0]);
      const fixedVertex = witnessAction
        ? vertices.find((vertex) => witnessAction.images[vertex] === vertex)
        : undefined;
      if (fixedVertex !== undefined) {
        witnesses.push({
          vertexId: fixedVertex,
          sphericalSubsetId: subset.id,
          generators: subset.generators,
          word: witnessWord,
        });
      }
    }

    for (const element of subgroup.elements) {
      if (element.word.length === 0) {
        continue;
      }

      element.images.forEach((image, vertexIndexValue) => {
        if (image === vertexIndexValue) {
          witnesses.push({
            vertexId: vertices[vertexIndexValue],
            sphericalSubsetId: subset.id,
            generators: subset.generators,
            word: element.word,
          });
        }
      });
    }
  }

  return {
    status: witnesses.length > 0 ? "failed" : incomplete ? "skipped" : "passed",
    method: "visible-spherical-stabilizer",
    checkedAt: options.checkedAt,
    checkedSphericalSubsets,
    witnesses,
    limitations,
    errors:
      witnesses.length > 0
        ? [
            "A nonidentity element of a visible spherical special subgroup fixes a quotient vertex.",
          ]
        : [],
    warnings,
  };
}
