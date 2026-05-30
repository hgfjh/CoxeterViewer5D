import type { CayleyNode } from "../types";

export interface ShellLayoutOptions {
  shellSpacing?: number;
}

function wordKey(node: CayleyNode): string {
  return node.word.length === 0 ? "" : node.word.join(".");
}

function shellPoint(
  shell: number,
  index: number,
  count: number,
  shellSpacing: number,
): [number, number, number] {
  if (shell === 0) {
    return [0, 0, 0];
  }

  if (count === 1) {
    return [shell * shellSpacing, 0, 0];
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * index) / (count - 1);
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle + shell * 0.5;
  const radius = shell * shellSpacing;

  return [
    radius * Math.cos(theta) * radial,
    radius * y,
    radius * Math.sin(theta) * radial,
  ];
}

/**
 * Places nodes on deterministic word-length shells.
 *
 * This is a drawing convention for stable screenshots and tests. It does not
 * use Coxeter geometry, and it should not be interpreted as preserving metric
 * data from the Cayley graph or any reflection representation.
 */
export function assignShellLayout(
  nodes: CayleyNode[],
  options: ShellLayoutOptions = {},
): CayleyNode[] {
  const shellSpacing = options.shellSpacing ?? 1;
  const shells = new Map<number, CayleyNode[]>();

  for (const node of nodes) {
    const shell = shells.get(node.length) ?? [];
    shell.push(node);
    shells.set(node.length, shell);
  }

  const positions = new Map<string, [number, number, number]>();

  for (const [shell, shellNodes] of shells) {
    const sorted = [...shellNodes].sort((left, right) => {
      const byWord = wordKey(left).localeCompare(wordKey(right));
      return byWord === 0 ? left.id.localeCompare(right.id) : byWord;
    });

    sorted.forEach((node, index) => {
      positions.set(
        node.id,
        shellPoint(shell, index, sorted.length, shellSpacing),
      );
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? [0, 0, 0],
  }));
}
