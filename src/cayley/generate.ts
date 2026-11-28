import type {
  CayleyEdge,
  CayleyGenerationOptions,
  CayleyNode,
  GeneratedCayleyBall,
} from "../types";
import {
  buildSimpleReflectionMatrices,
  parseCoxeterSystemInput,
} from "../coxeter";
import {
  multiplyPackedMatrices,
  roundedMatrixKey,
  roundPackedMatrix,
  sameRoundedEntries,
  unpackMatrix,
} from "../coxeter/linearAlgebra";

interface InternalNode extends CayleyNode {
  /** Row-major rank x rank matrix of the group element. */
  matrix: Float64Array;
  /** Entries rounded to integers at the key precision (dedupe identity). */
  rounded: Float64Array;
}

const defaultOptions = {
  maxRadius: 8,
  maxNodes: 5000,
  maxEdges: 20000,
  matrixKeyPrecision: 10,
};

function normalizeRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return 0;
  }

  return Math.max(0, Math.trunc(radius));
}

function nodeIdFromWord(word: number[]): string {
  return word.length === 0 ? "e" : `w:${word.join(".")}`;
}

function edgeKey(source: string, target: string, generator: number): string {
  const [left, right] = source < target ? [source, target] : [target, source];
  return `e:${left}:${right}:s${generator}`;
}

function hasInfiniteEntry(matrix: Array<Array<number | "inf">>): boolean {
  return matrix.some((row) => row.some((entry) => entry === "inf"));
}

/**
 * Enumerates a finite right Cayley ball with the browser approximation backend.
 *
 * Nodes are deduplicated by rounded matrices in the standard reflection
 * representation. That is good enough for interactive drawings and small
 * fixtures, but it is not an exact word problem solver. The returned metadata
 * names the rounded key precision so exported graphs carry the approximation
 * with them.
 */
export function generateCayleyBall(
  input: unknown,
  options: CayleyGenerationOptions,
): GeneratedCayleyBall {
  const system = parseCoxeterSystemInput(input);
  const maxRadius = options.maxRadius ?? defaultOptions.maxRadius;
  const maxNodes = options.maxNodes ?? defaultOptions.maxNodes;
  const maxEdges = options.maxEdges ?? defaultOptions.maxEdges;
  const matrixKeyPrecision =
    options.matrixKeyPrecision ?? defaultOptions.matrixKeyPrecision;
  const requestedRadius = normalizeRadius(options.radius);
  const radius = Math.min(requestedRadius, maxRadius);
  const warnings: string[] = [
    `Approximate backend: nodes are deduplicated by rounded reflection matrices at ${matrixKeyPrecision} decimal places.`,
  ];

  if (requestedRadius > maxRadius) {
    warnings.push(
      `Requested radius ${requestedRadius} was capped at ${maxRadius}.`,
    );
  }

  if (hasInfiniteEntry(system.coxeterMatrix)) {
    warnings.push(
      "Infinite Coxeter entries use the named Tits value -1 in this approximate matrix model.",
    );
  }

  const size = system.rank;
  const reflections = buildSimpleReflectionMatrices(system.coxeterMatrix).map(
    (matrix) => Float64Array.from(matrix.flat()),
  );
  const identity = new Float64Array(size * size);
  for (let index = 0; index < size; index += 1)
    identity[index * size + index] = 1;
  const scale = 10 ** matrixKeyPrecision;
  const identityRounded = roundPackedMatrix(identity, scale);
  const identityKey = roundedMatrixKey(
    unpackMatrix(identity, size),
    matrixKeyPrecision,
  );
  const nodes: InternalNode[] = [
    {
      id: "e",
      word: [],
      length: 0,
      matrixKey: identityKey,
      matrix: identity,
      rounded: identityRounded.rounded,
    },
  ];
  // Probing a candidate costs one hash lookup and a 49-number compare instead
  // of formatting 49 decimals; only new nodes get their string key.
  const nodesByHash = new Map<number, InternalNode[]>([
    [identityRounded.hash, [nodes[0]]],
  ]);
  // Matrices with huge entries use the decimal string as their identity.
  const keyToNodeId = new Map<string, string>();
  if (!identityRounded.exact) keyToNodeId.set(identityKey, "e");
  const nodeById = new Map<string, InternalNode>([["e", nodes[0]]]);
  const edges = new Map<string, CayleyEdge>();
  let nodeCapHit = false;
  let edgeCapHit = false;

  for (let cursor = 0; cursor < nodes.length; cursor += 1) {
    const node = nodes[cursor];

    for (let generator = 0; generator < system.rank; generator += 1) {
      // The rest of the app uses right multiplication: w --s_i--> w s_i.
      // The stored word is only a preferred reduced representative.
      const nextMatrix = multiplyPackedMatrices(
        node.matrix,
        reflections[generator],
        size,
      );
      const probe = roundPackedMatrix(nextMatrix, scale);
      let nextKey: string | undefined;
      let targetId: string | undefined;
      if (probe.exact) {
        targetId = nodesByHash
          .get(probe.hash)
          ?.find((candidate) =>
            sameRoundedEntries(candidate.rounded, probe.rounded),
          )?.id;
      } else {
        nextKey = roundedMatrixKey(
          unpackMatrix(nextMatrix, size),
          matrixKeyPrecision,
        );
        targetId = keyToNodeId.get(nextKey);
      }

      if (targetId === undefined) {
        if (node.length >= radius) {
          continue;
        }

        if (nodes.length >= maxNodes) {
          nodeCapHit = true;
          continue;
        }

        const word = [...node.word, generator];
        targetId = nodeIdFromWord(word);
        nextKey ??= roundedMatrixKey(
          unpackMatrix(nextMatrix, size),
          matrixKeyPrecision,
        );
        const nextNode: InternalNode = {
          id: targetId,
          word,
          length: node.length + 1,
          matrixKey: nextKey,
          matrix: nextMatrix,
          rounded: probe.rounded,
        };

        nodes.push(nextNode);
        if (probe.exact) {
          const bucket = nodesByHash.get(probe.hash);
          if (bucket) bucket.push(nextNode);
          else nodesByHash.set(probe.hash, [nextNode]);
        } else {
          keyToNodeId.set(nextKey, targetId);
        }
        nodeById.set(targetId, nextNode);
      }

      if (!nodeById.has(targetId)) {
        continue;
      }

      const id = edgeKey(node.id, targetId, generator);
      if (!edges.has(id)) {
        if (edges.size >= maxEdges) {
          edgeCapHit = true;
          continue;
        }

        edges.set(id, {
          id,
          source: node.id,
          target: targetId,
          generator,
        });
      }
    }
  }

  if (nodeCapHit) {
    warnings.push(
      `Node cap ${maxNodes} was reached before the radius-${radius} ball completed.`,
    );
  }

  if (edgeCapHit) {
    warnings.push(
      `Edge cap ${maxEdges} was reached before all visible edges were recorded.`,
    );
  }

  return {
    systemName: system.name,
    rank: system.rank,
    nodes: nodes.map((node) => ({
      id: node.id,
      word: node.word,
      length: node.length,
      matrixKey: node.matrixKey,
      position: node.position,
      hyperbolicPoint: node.hyperbolicPoint,
    })),
    edges: [...edges.values()],
    twoCells: [],
    metadata: {
      radius,
      requestedRadius,
      generatorConvention: "right-multiplication",
      deduplication: "rounded-matrix",
      matrixKeyPrecision,
      caps: {
        maxRadius,
        maxNodes,
        maxEdges,
      },
      completeness:
        nodeCapHit || edgeCapHit || requestedRadius > maxRadius
          ? "truncated"
          : "complete",
      capStatus: {
        hitNodeCap: nodeCapHit,
        hitEdgeCap: edgeCapHit,
        hitRadiusCap: requestedRadius > maxRadius,
      },
      createdAt: options.createdAt ?? new Date().toISOString(),
      warnings,
    },
  };
}
