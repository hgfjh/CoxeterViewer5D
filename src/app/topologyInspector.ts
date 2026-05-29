import type {
  CoxeterSystemInput,
  DavisHigherCell,
  DavisTwoCell,
} from "../types";
import type { DavisCellProxy } from "../davis";
import type { QuotientComplex, QuotientTwoCell } from "../quotient";
import type { YGammaCellRecord } from "./yGammaAtlas";

export type TopologyInspectorLayer =
  | "Davis"
  | "Y_Gamma"
  | "quotient"
  | "geometric projection";

export type TopologyInspectorStatus =
  | "certified"
  | "exact incidence"
  | "visual proxy"
  | "projection"
  | "uncertified";

export type TopologyInspectorSubject =
  | { kind: "node"; id: string; word: number[]; length: number }
  | { kind: "rank-two-cell"; cell: DavisTwoCell }
  | { kind: "higher-cell"; cell: DavisHigherCell }
  | { kind: "higher-proxy"; proxy: DavisCellProxy }
  | { kind: "ygamma-cell"; cell: YGammaCellRecord }
  | { kind: "quotient-cell"; quotient: QuotientComplex; cell: QuotientTwoCell }
  | { kind: "local-link"; nodeId: string; sphericalSubsetCount: number }
  | {
      kind: "game-assignment";
      quotient: QuotientComplex;
      selectedVertexId?: string;
    };

export interface TopologyExplanation {
  title: string;
  layer: TopologyInspectorLayer;
  status: TopologyInspectorStatus;
  summary: string;
  rows: Array<{ label: string; value: string }>;
  boundaryWord?: string[];
  badges: string[];
}

export function buildTopologyExplanation(input: {
  system: CoxeterSystemInput;
  subject: TopologyInspectorSubject | undefined;
  geometricProjectionActive?: boolean;
  geometryIntervalCertified?: boolean;
}): TopologyExplanation {
  const { system, subject } = input;
  if (!subject) {
    return {
      title: "No selection",
      layer: input.geometricProjectionActive ? "geometric projection" : "Davis",
      status: input.geometricProjectionActive
        ? "projection"
        : statusForSystem(system),
      summary:
        "Select a chamber, relation cell, or quotient object to inspect its topology.",
      rows: [],
      badges: statusBadges(system, input),
    };
  }

  if (subject.kind === "rank-two-cell") {
    const { cell } = subject;
    const labels = generatorLabels(system, cell.generatorPair);
    const boundaryWord = alternatingWord(labels, cell.boundaryNodeIds.length);
    return {
      title: `Rank-two relation ${labels.join("-")}`,
      layer: input.geometricProjectionActive ? "geometric projection" : "Davis",
      status: input.geometricProjectionActive
        ? "projection"
        : "exact incidence",
      summary: `Since m=${cell.m}, this Davis relation cell is a ${cell.boundaryNodeIds.length}-gon with alternating ${labels.join("/")} edges.`,
      rows: [
        { label: "Cell id", value: cell.id },
        { label: "Finite subset", value: `{${labels.join(", ")}}` },
        { label: "Relation", value: `(${labels[0]} ${labels[1]})^${cell.m}=1` },
        {
          label: "Boundary length",
          value: String(cell.boundaryNodeIds.length),
        },
        { label: "Boundary nodes", value: cell.boundaryNodeIds.join(" -> ") },
      ],
      boundaryWord,
      badges: ["rank-two exact", ...statusBadges(system, input)],
    };
  }

  if (subject.kind === "ygamma-cell") {
    const cell = subject.cell;
    return {
      title: cell.label,
      layer: "Y_Gamma",
      status: "exact incidence",
      summary: cell.description,
      rows: [
        { label: "Cell id", value: cell.id },
        { label: "Rank", value: String(cell.rank) },
        { label: "Dimension", value: String(cell.dimension) },
        {
          label: "Generators",
          value: cell.generatorLabels.join(", ") || "base vertex",
        },
        {
          label: "Boundary length",
          value: String(cell.boundaryLength ?? cell.attachingWord.length),
        },
      ],
      boundaryWord: cell.attachingWord,
      badges: ["Y_Gamma", "fundamental-domain cell"],
    };
  }

  if (subject.kind === "quotient-cell") {
    const { cell, quotient } = subject;
    const labels = generatorLabels(
      quotient.sourceSystem ?? system,
      cell.generatorPair,
    );
    return {
      title: `Quotient cell ${cell.id}`,
      layer: "quotient",
      status:
        quotient.schreierCertificate?.status === "passed"
          ? "certified"
          : "uncertified",
      summary: `A quotient rank-two cell for ${labels.join("-")} with m=${cell.m}.`,
      rows: [
        { label: "Pair", value: labels.join(", ") },
        {
          label: "Boundary vertices",
          value: cell.boundaryVertexIds.join(" -> "),
        },
        {
          label: "Boundary edges",
          value: cell.boundaryEdgeIds?.join(" -> ") ?? "not recorded",
        },
        {
          label: "Schreier certificate",
          value: quotient.schreierCertificate?.status ?? "not supplied",
        },
      ],
      boundaryWord: alternatingWord(labels, cell.boundaryVertexIds.length),
      badges: [
        "quotient",
        quotient.schreierCertificate?.status ?? "uncertified",
      ],
    };
  }

  if (subject.kind === "higher-cell") {
    const labels = subject.cell.generators.map(
      (generator) => system.generators[generator]?.label ?? `s${generator}`,
    );
    return {
      title: subject.cell.id,
      layer: "Davis",
      status:
        subject.cell.rendering?.proxy === true
          ? "visual proxy"
          : "exact incidence",
      summary: `A rank-${subject.cell.rank} spherical Davis cell record for {${labels.join(", ")}}.`,
      rows: [
        { label: "Subset", value: subject.cell.sphericalSubsetId },
        { label: "Generators", value: labels.join(", ") },
        {
          label: "Expected subgroup order",
          value: String(
            subject.cell.coset?.expectedSubgroupOrder ?? "not recorded",
          ),
        },
        {
          label: "Visible coset size",
          value: String(
            subject.cell.coset?.nodeCount ?? subject.cell.nodeIds.length,
          ),
        },
      ],
      badges: [
        subject.cell.rendering?.proxy === true
          ? "visual proxy"
          : "exact incidence",
      ],
    };
  }

  if (subject.kind === "higher-proxy") {
    const labels = subject.proxy.generators.map(
      (generator) => system.generators[generator]?.label ?? `s${generator}`,
    );
    return {
      title: subject.proxy.id,
      layer: "Davis",
      status: "visual proxy",
      summary: `A visual proxy hull for the spherical subset {${labels.join(", ")}}; incidence may be exact, but the drawn hull is not geometry.`,
      rows: [
        { label: "Subset", value: subject.proxy.sphericalSubsetId },
        { label: "Generators", value: labels.join(", ") },
        {
          label: "Boundary nodes",
          value: String(subject.proxy.nodeIds.length),
        },
      ],
      badges: ["visual proxy"],
    };
  }

  if (subject.kind === "local-link") {
    return {
      title: `Local link at ${subject.nodeId}`,
      layer: "Davis",
      status: "exact incidence",
      summary:
        "The local link records the spherical subsets visible at the selected chamber.",
      rows: [
        { label: "Selected chamber", value: subject.nodeId },
        {
          label: "Spherical subsets",
          value: String(subject.sphericalSubsetCount),
        },
        { label: "Generator vertices", value: String(system.rank) },
      ],
      badges: ["local link", "spherical subsets"],
    };
  }

  if (subject.kind === "game-assignment") {
    return {
      title: "Quotient/game diagnostics",
      layer: "quotient",
      status:
        subject.quotient.schreierCertificate?.status === "passed"
          ? "certified"
          : "uncertified",
      summary:
        "Integer edge labels are checked on quotient rank-two boundaries and classified around the selected vertex.",
      rows: [
        { label: "Selected vertex", value: subject.selectedVertexId ?? "none" },
        {
          label: "Assignments",
          value: String(subject.quotient.game?.assignments.length ?? 0),
        },
        {
          label: "Cocycles",
          value: String(subject.quotient.game?.cocycles?.length ?? 0),
        },
        {
          label: "Torsion-free",
          value:
            subject.quotient.torsionFreeCertificate?.status ?? "not supplied",
        },
      ],
      badges: ["quotient", "PL Morse helper"],
    };
  }

  return {
    title: subject.id,
    layer: input.geometricProjectionActive ? "geometric projection" : "Davis",
    status: input.geometricProjectionActive
      ? "projection"
      : statusForSystem(system),
    summary: `Chamber word length ${subject.length}.`,
    rows: [
      { label: "Node id", value: subject.id },
      {
        label: "Word",
        value: subject.word.length === 0 ? "identity" : subject.word.join(" "),
      },
      { label: "Length", value: String(subject.length) },
    ],
    badges: statusBadges(system, input),
  };
}

function statusForSystem(system: CoxeterSystemInput): TopologyInspectorStatus {
  return system.dataStatus === "certified" ? "certified" : "uncertified";
}

function statusBadges(
  system: CoxeterSystemInput,
  input: {
    geometricProjectionActive?: boolean;
    geometryIntervalCertified?: boolean;
  },
): string[] {
  const badges = [system.dataStatus ?? "uncertified"];
  if (input.geometryIntervalCertified) {
    badges.push("interval geometry");
  }
  if (input.geometricProjectionActive) {
    badges.push("projection");
  }
  return badges;
}

function generatorLabels(
  system: CoxeterSystemInput,
  pair: [number, number],
): [string, string] {
  return [
    system.generators[pair[0]]?.label ?? `s${pair[0]}`,
    system.generators[pair[1]]?.label ?? `s${pair[1]}`,
  ];
}

function alternatingWord(labels: [string, string], length: number): string[] {
  return Array.from({ length }, (_, index) => labels[index % 2]);
}
