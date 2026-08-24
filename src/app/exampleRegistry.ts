import { parseCoxeterSystemInput } from "../coxeter";
import type { CoxeterSystemInput } from "../types";

import A2 from "../examples/A2.json";
import A3 from "../examples/A3.json";
import compact5CubeGamma1 from "../examples/compact_5_cube_gamma1.json";
import compact5PolytopeP1DoubleMakarov from "../examples/compact_5_polytope_p1_double_makarov.json";
import compact5PrismMakarov from "../examples/compact_5_prism_makarov.json";
import compact5PrismMakarovP2 from "../examples/compact_5_prism_makarov_p2.json";
import hyperbolicToyRank2 from "../examples/hyperbolic_toy_rank2.json";
import I2_5 from "../examples/I2_5.json";
import idealHyperbolic3CubeM3 from "../examples/ideal_hyperbolic_3_cube_m3.json";
import universalRank3 from "../examples/universal_rank3.json";

export interface ExampleRecord {
  id: string;
  label: string;
  system: CoxeterSystemInput;
  role: "teaching" | "finite" | "compact" | "catalogue" | "stress";
}

const primaryExamples: ExampleRecord[] = [
  {
    id: "I2_5",
    label: "I2(5) wall demo",
    system: parseCoxeterSystemInput(I2_5),
    role: "teaching",
  },
  {
    id: "A2",
    label: "A2",
    system: parseCoxeterSystemInput(A2),
    role: "finite",
  },
  {
    id: "A3",
    label: "A3",
    system: parseCoxeterSystemInput(A3),
    role: "finite",
  },
  {
    id: "hyperbolic_toy_rank2",
    label: "Hyperbolic toy rank 2",
    system: parseCoxeterSystemInput(hyperbolicToyRank2),
    role: "teaching",
  },
  {
    id: "ideal_hyperbolic_3_cube_m3",
    label: "Ideal 3-cube, all m=3 (S4 cover)",
    system: parseCoxeterSystemInput(idealHyperbolic3CubeM3),
    role: "teaching",
  },
  {
    id: "universal_rank3",
    label: "Universal rank 3",
    system: parseCoxeterSystemInput(universalRank3),
    role: "stress",
  },
  {
    id: "compact_5_prism_makarov",
    label: "Compact 5-prism P0",
    system: parseCoxeterSystemInput(compact5PrismMakarov),
    role: "compact",
  },
  {
    id: "compact_5_polytope_p1_double_makarov",
    label: "Compact 5-polytope P1",
    system: parseCoxeterSystemInput(compact5PolytopeP1DoubleMakarov),
    role: "compact",
  },
  {
    id: "compact_5_prism_makarov_p2",
    label: "Compact 5-prism P2",
    system: parseCoxeterSystemInput(compact5PrismMakarovP2),
    role: "compact",
  },
  {
    id: "compact_5_cube_gamma1",
    label: "Compact 5-cube Gamma1",
    system: parseCoxeterSystemInput(compact5CubeGamma1),
    role: "compact",
  },
];

// Catalogue JSON is kept in its own Vite chunk. Generating these records from
// filenames prevents the certified family from drifting out of the picker as
// cases are added or renamed.
const eightFacetModules = import.meta.glob(
  "../examples/tumarkin_5d_8facet_*.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

const eightFacetExamples: ExampleRecord[] = Object.entries(eightFacetModules)
  .map(([path, input]) => {
    const id =
      path
        .split("/")
        .at(-1)
        ?.replace(/\.json$/u, "") ?? path;
    const system = parseCoxeterSystemInput(input);
    const catalogueNumber = /g11411_(\d+)$/u.exec(id)?.[1];
    return {
      id,
      label: catalogueNumber
        ? `Eight-facet G11411 #${catalogueNumber}`
        : "Eight-facet G12221 (unique)",
      system,
      role: "catalogue" as const,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

export const bundledExamples: ExampleRecord[] = [
  ...primaryExamples,
  ...eightFacetExamples,
];

export function bundledExampleById(id: string): ExampleRecord {
  return (
    bundledExamples.find((example) => example.id === id) ?? bundledExamples[0]
  );
}
