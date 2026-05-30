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
  identityMatrix,
  multiplyMatrices,
  roundedMatrixKey,
  type Matrix,
} from "../coxeter/linearAlgebra";

interface InternalNode extends CayleyNode {
  matrix: Matrix;
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

  const reflections = buildSimpleReflectionMatrices(system.coxeterMatrix);
  const identity = identityMatrix(system.rank);
  const identityKey = roundedMatrixKey(identity, matrixKeyPrecision);
  const nodes: InternalNode[] = [
    {
      id: "e",
      word: [],
      length: 0,
      matrixKey: identityKey,
      matrix: identity,
    },
  ];
  const keyToNodeId = new Map<string, string>([[identityKey, "e"]]);
  const nodeById = new Map<string, InternalNode>([["e", nodes[0]]]);
  const edges = new Map<string, CayleyEdge>();
  let nodeCapHit = false;
  let edgeCapHit = false;

  for (let cursor = 0; cursor < nodes.length; cursor += 1) {
    const node = nodes[cursor];

    for (let generator = 0; generator < system.rank; generator += 1) {
      // The rest of the app uses right multiplication: w --s_i--> w s_i.
      // The stored word is only a preferred reduced representative.
      const nextMatrix = multiplyMatrices(node.matrix, reflections[generator]);
      const nextKey = roundedMatrixKey(nextMatrix, matrixKeyPrecision);
      let targetId = keyToNodeId.get(nextKey);

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
        const nextNode: InternalNode = {
          id: targetId,
          word,
          length: node.length + 1,
          matrixKey: nextKey,
          matrix: nextMatrix,
        };

        nodes.push(nextNode);
        keyToNodeId.set(nextKey, targetId);
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
