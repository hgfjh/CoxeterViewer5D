import { parseCoxeterSystemInput } from "../coxeter";
import type { CoxeterSystemInput } from "../types";

import A2 from "../examples/A2.json";
import A3 from "../examples/A3.json";
import compact3TetrahedronC44 from "../examples/compact_3_tetrahedron_c44_2233.json";
import compact5CubeGamma1 from "../examples/compact_5_cube_gamma1.json";
import compact5PrismH5P722 from "../examples/compact_5_prism_h5_p7_22.json";
import compact5PolytopeP1DoubleMakarov from "../examples/compact_5_polytope_p1_double_makarov.json";
import compact5PrismMakarov from "../examples/compact_5_prism_makarov.json";
import compact5PrismMakarovP2 from "../examples/compact_5_prism_makarov_p2.json";
import hyperbolicToyRank2 from "../examples/hyperbolic_toy_rank2.json";
import I2_5 from "../examples/I2_5.json";
import idealHyperbolic3CubeM3 from "../examples/ideal_hyperbolic_3_cube_m3.json";
import universalRank3 from "../examples/universal_rank3.json";
import q35G12221H3Unfolding from "../examples/q35_g12221_h3_unfolding.json";
import q55IcosahedralTruncation from "../examples/q55_icosahedral_truncation.json";

export interface ExampleRecord {
  id: string;
  label: string;
  system: CoxeterSystemInput;
  role:
    | "teaching"
    | "finite"
    | "compact"
    | "catalogue"
    | "nine-facet-catalogue"
    | "stress";
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
    id: "compact_3_tetrahedron_c44_2233",
    label: "Compact tetrahedron C(4,4;2,2;3,3) (PSL(2,7) cover)",
    system: parseCoxeterSystemInput(compact3TetrahedronC44),
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
    label: "Compact 5-prism P0 — paired primary",
    system: parseCoxeterSystemInput(compact5PrismMakarov),
    role: "compact",
  },
  {
    id: "compact_5_polytope_p1_double_makarov",
    label: "Compact 5-polytope P1 — paired primary",
    system: parseCoxeterSystemInput(compact5PolytopeP1DoubleMakarov),
    role: "compact",
  },
  {
    id: "compact_5_prism_makarov_p2",
    label: "Compact 5-prism P2 — coarse experiment",
    system: parseCoxeterSystemInput(compact5PrismMakarovP2),
    role: "compact",
  },
  {
    id: "compact_5_prism_h5_p7_22",
    label: "Compact 5-prism H5-P7-22 — cover studied, no wall fibering",
    system: parseCoxeterSystemInput(compact5PrismH5P722),
    role: "compact",
  },
  {
    id: "compact_5_cube_gamma1",
    label: "Compact 5-cube Gamma1",
    system: parseCoxeterSystemInput(compact5CubeGamma1),
    role: "compact",
  },
  // The H3 x A1 and H3 unfoldings of Tumarkin's G12221: nearly right-angled,
  // with the smallest vertex-group LCM (1920) of any bundled compact 5-polytope.
  {
    id: "q55_icosahedral_truncation",
    label: "Q55 (G12221 H3xA1 unfolding) — preferred fibering target",
    system: parseCoxeterSystemInput(q55IcosahedralTruncation),
    role: "compact",
  },
  {
    id: "q35_g12221_h3_unfolding",
    label: "Q35 (G12221 H3 unfolding)",
    system: parseCoxeterSystemInput(q35G12221H3Unfolding),
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
    const label = catalogueNumber
      ? `Eight-facet G11411 #${catalogueNumber}${
          catalogueNumber === "06" || catalogueNumber === "15"
            ? " — bounded comparison pair"
            : ""
        }`
      : "Eight-facet G12221 — catalogued/deferred";
    return {
      id,
      label,
      system,
      role: "catalogue" as const,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

// The 51 compact nine-facet 5-polytopes of Ma--Zheng, written and certified by
// scripts/certify_compact_5d_catalogue.py.  Filenames carry the published label:
// mazheng_5d_9facet_p319_10.json is P_{319,10}.
const nineFacetModules = import.meta.glob(
  "../examples/mazheng_5d_9facet_*.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

const nineFacetExamples: ExampleRecord[] = Object.entries(nineFacetModules)
  .map(([path, input]) => {
    const id =
      path
        .split("/")
        .at(-1)
        ?.replace(/\.json$/u, "") ?? path;
    const [, type, index] = /_p(\d+)(?:_(\d+))?$/u.exec(id) ?? [];
    return {
      id,
      label: `Nine-facet P${type}${index ? ` #${Number(index)}` : ""}`,
      system: parseCoxeterSystemInput(input),
      role: "nine-facet-catalogue" as const,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

export const bundledExamples: ExampleRecord[] = [
  ...primaryExamples,
  ...eightFacetExamples,
  ...nineFacetExamples,
];

export function bundledExampleById(id: string): ExampleRecord {
  return (
    bundledExamples.find((example) => example.id === id) ?? bundledExamples[0]
  );
}
