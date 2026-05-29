import type { CayleyBallBackend } from "../types";
import { computeRankTwoDavisCells } from "../davis";
import { generateCayleyBall } from "./generate";

export const browserApproxBackend: CayleyBallBackend = {
  name: "browserApproxBackend",
  async generate(input, radius, options = {}) {
    const ball = generateCayleyBall(input, {
      ...options,
      radius,
    });
    const { cells, warnings } = computeRankTwoDavisCells(ball, input);

    return {
      ...ball,
      twoCells: cells,
      metadata: {
        ...ball.metadata,
        warnings: [...ball.metadata.warnings, ...warnings],
      },
    };
  },
};
