import { assignShellLayout, generateCayleyBall } from "../cayley";
import {
  computeRankTwoDavisCells,
  deriveVisibleHigherDavisCells,
  enumerateSphericalSubsets,
} from "../davis";
import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";

export interface GenerationPipelineResult {
  ball: GeneratedCayleyBall;
  warnings: string[];
}

/**
 * Browser-side generation pipeline for the viewer.
 *
 * It combines approximate Cayley-ball enumeration, exact-in-ball rank-two
 * Davis cells, numerical spherical-subset checks, and deterministic shell
 * layout. External Sage/GAP fixtures bypass this path through generated JSON.
 */
export function generateViewerBall(
  system: CoxeterSystemInput,
  options: CayleyGenerationOptions,
): GenerationPipelineResult {
  const generatedBall = generateCayleyBall(system, options);
  const { cells, warnings } = computeRankTwoDavisCells(generatedBall, system);
  const sphericalSubsets = enumerateSphericalSubsets(system);
  const higher = deriveVisibleHigherDavisCells(
    { ...generatedBall, twoCells: cells },
    sphericalSubsets.subsets,
  );
  const ball: GeneratedCayleyBall = {
    ...generatedBall,
    nodes: assignShellLayout(generatedBall.nodes, { shellSpacing: 1.25 }),
    twoCells: cells,
    higherCells: higher.higherCells,
    metadata: {
      ...generatedBall.metadata,
      warnings: [
        ...generatedBall.metadata.warnings,
        ...warnings,
        ...sphericalSubsets.warnings,
        ...higher.warnings,
      ],
    },
  };

  return { ball, warnings: [...warnings, ...higher.warnings] };
}
