import type { CoverCompressionResult } from "../compression/types";
import {
  buildUnitCell,
  stubTagLabel,
  type UnitCell,
  type UnitCellChamber,
  type UnitCellStub,
} from "../davis/unitCell";
import { computeOrbitLayout, type OrbitLayoutKind } from "../geometry";
import { jacobiEigenDecomposition } from "../geometry/symmetricEigen";
import type {
  SceneCell,
  SceneEdge,
  SceneGenerator,
  SceneNode,
} from "../render/SceneView";
import type { CayleyEdge, CayleyNode } from "../types";
import type { InspectorSummary } from "./ResearchInspector";

/**
 * Colours for gluing tags. They mark which two stubs H identifies, so they
 * avoid the generator hues (edges keep their generator colour) and the amber
 * of the selection; the letter tag is the primary cue and the colour only
 * helps pair stubs at a glance.
 */
export const GLUING_TAG_PALETTE = {
  light: ["#be185d", "#78350f", "#4d7c0f", "#475569", "#831843"],
  // Same hues lifted for the dark canvas, so marker dots stay visible.
  dark: ["#f472b6", "#d6a571", "#a3cf5a", "#cbd5e1", "#fda4af"],
} as const;

/** The selection amber of the renderer (scenePalette selectionColor). */
const ECHO_COLOR = { light: "#d97706", dark: "#fbbf24" } as const;

/** Where along a stub (from the domain chamber) its tag marker sits. */
const TAG_MARKER_FRACTION = 0.72;

export const UNIT_CELL_VIEW_DESCRIPTION =
  "Fundamental domain of H: one chamber per coset, the one nearest the base chamber e (a Dirichlet-type domain grown outward from e). Positions are the reflection orbit (a drawing of the universal cover); gluings are exact.";

/**
 * Selection-free part of the unit-cell view: the combinatorial unit cell and
 * orbit positions for every chamber it mentions (domain, ghosts, cell lifts
 * and neighbouring copies).
 */
export interface UnitCellBase {
  unitCell?: UnitCell;
  /** Set when the view cannot be drawn (no bounded orbit layout). */
  unavailableReason?: string;
  positions: Map<string, [number, number, number]>;
  labelByPoint: Map<string, string>;
  chamberById: Map<string, UnitCellChamber>;
  stubById: Map<string, UnitCellStub>;
  generators: SceneGenerator[];
  layoutKind?: OrbitLayoutKind;
  layoutCaveat?: string;
  /** Default camera: an oblique three-quarter view framing D only. */
  camera?: {
    target: [number, number, number];
    offset: [number, number, number];
  };
  warnings: string[];
}

export function unitCellRepresentativeWords(
  cover: CoverCompressionResult,
): Map<string, readonly number[] | undefined> {
  const hatById = new Map(
    cover.hatX.vertices.map((vertex) => [vertex.id, vertex]),
  );
  return new Map(
    cover.barX.vertices.map((vertex) => [
      vertex.id,
      hatById.get(vertex.sourceHatVertexId)?.representativeWord,
    ]),
  );
}

const baseCache = new WeakMap<CoverCompressionResult, UnitCellBase>();

/** buildUnitCellBase, memoised per cover so switching views is instant. */
export function cachedUnitCellBase(cover: CoverCompressionResult) {
  let base = baseCache.get(cover);
  if (!base) {
    base = buildUnitCellBase(cover);
    baseCache.set(cover, base);
  }
  return base;
}

export function buildUnitCellBase(cover: CoverCompressionResult): UnitCellBase {
  const system = cover.barX.sourceSystem;
  const generators = system.generators.map((generator) => ({
    label: generator.label,
    colorHint: generator.colorHint,
  }));
  const labelByPoint = new Map(
    cover.barX.vertices.map((vertex) => [vertex.id, vertex.label ?? vertex.id]),
  );
  let unitCell: UnitCell;
  try {
    unitCell = buildUnitCell(cover.barX, unitCellRepresentativeWords(cover));
  } catch (error) {
    const reason = `The unit cell could not be built from this cover: ${error instanceof Error ? error.message : String(error)}`;
    return {
      unavailableReason: reason,
      positions: new Map(),
      labelByPoint,
      chamberById: new Map(),
      stubById: new Map(),
      generators,
      warnings: [reason],
    };
  }
  const chamberById = new Map(
    unitCell.chambers.map((chamber) => [chamber.id, chamber]),
  );
  const stubById = new Map(unitCell.stubs.map((stub) => [stub.id, stub]));

  // Positions are computed for every chamber at once, copies included, so
  // toggling the copies never moves the unit cell.
  const nodes: CayleyNode[] = unitCell.chambers.map((chamber) => ({
    id: chamber.id,
    word: chamber.word,
    length: chamber.word.length,
  }));
  const edges: CayleyEdge[] = unitCell.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    generator: edge.generator,
  }));
  const layout = computeOrbitLayout(system, nodes, edges);
  if (layout.positions === undefined) {
    return {
      unitCell,
      unavailableReason: `The unit cell needs a reflection orbit to draw the universal cover. ${layout.warnings.join(" ")}`,
      positions: new Map(),
      labelByPoint,
      chamberById,
      stubById,
      generators,
      layoutKind: layout.kind,
      layoutCaveat: layout.caveat,
      warnings: [...unitCell.warnings, ...layout.warnings],
    };
  }

  // computeOrbitLayout scales the farthest chamber (often a copy) to a fixed
  // radius. Rescale so the unit cell and its ghosts fill the frame the way a
  // Cayley ball of the same depth would; copies then extend beyond it.
  const rawPositions = layout.positions;
  let coreRadius = 0;
  let depth = 0;
  for (const chamber of unitCell.chambers) {
    if (chamber.role === "copy") continue;
    const point = rawPositions.get(chamber.id)!;
    coreRadius = Math.max(coreRadius, Math.hypot(...point));
    if (chamber.role === "representative") {
      depth = Math.max(depth, chamber.word.length);
    }
  }
  const scale = coreRadius > 0 ? (1.25 * (depth + 1)) / coreRadius : 1;
  const positions = new Map<string, [number, number, number]>();
  for (const [id, point] of rawPositions) {
    positions.set(id, [point[0] * scale, point[1] * scale, point[2] * scale]);
  }

  return {
    unitCell,
    positions,
    labelByPoint,
    chamberById,
    stubById,
    generators,
    layoutKind: layout.kind,
    layoutCaveat: layout.caveat,
    camera: obliqueCamera(
      unitCell.chambers
        .filter((chamber) => chamber.role === "representative")
        .map((chamber) => positions.get(chamber.id)!),
    ),
    warnings: [
      ...unitCell.warnings,
      ...layout.warnings,
      UNIT_CELL_IDENTIFICATION_NOTE,
    ],
  };
}

/** The one floating-point step in the unit cell; see SAME_ELEMENT_TOLERANCE. */
export const UNIT_CELL_IDENTIFICATION_NOTE =
  "Unit cell: two words are taken to be the same chamber when their matrices in the (faithful) Tits representation agree to relative precision 1e-7. This floating-point test only decides which drawn chambers coincide; the gluings come from the exact finite action.";

/**
 * A three-quarter view of D: principal axes a1 >= a2 >= a3 of the domain's
 * chambers, viewed from a direction about 50 degrees off the thinnest axis
 * a3, so the domain is neither seen edge-on nor straight down its flattest
 * direction. The distance fits D's radius in the 55 degree field of view.
 */
export function obliqueCamera(points: Array<[number, number, number]>): {
  target: [number, number, number];
  offset: [number, number, number];
} {
  const n = Math.max(1, points.length);
  const centre = [0, 1, 2].map(
    (k) => points.reduce((total, point) => total + point[k], 0) / n,
  ) as [number, number, number];
  const covariance = [0, 1, 2].map((i) =>
    [0, 1, 2].map(
      (j) =>
        points.reduce(
          (total, point) =>
            total + (point[i] - centre[i]) * (point[j] - centre[j]),
          0,
        ) / n,
    ),
  );
  const axes = jacobiEigenDecomposition(covariance)
    .sort((left, right) => right.value - left.value)
    .map((pair) => pair.vector);
  // Fix eigenvector signs so the view does not flip between equal inputs;
  // the camera sits on the +z side of the thinnest axis.
  const signed = axes.map((axis, index) => {
    const reference = index === 2 ? axis[2] : axis[0] + axis[1] + axis[2];
    return reference < 0 ? axis.map((value) => -value) : axis;
  });
  const direction = [0, 1, 2].map(
    (k) => 0.4 * signed[0][k] + 0.55 * signed[1][k] + 0.75 * signed[2][k],
  );
  const length = Math.hypot(...direction) || 1;
  const radius = Math.max(
    1,
    ...points.map((point) =>
      Math.hypot(
        point[0] - centre[0],
        point[1] - centre[1],
        point[2] - centre[2],
      ),
    ),
  );
  const distance = 3.1 * radius;
  return {
    target: centre,
    offset: direction.map((value) => (value / length) * distance) as [
      number,
      number,
      number,
    ],
  };
}

export interface UnitCellSceneOptions {
  showCopies: boolean;
  colorScheme?: "light" | "dark";
  selectedNodeId?: string;
  selectedEdgeId?: string;
  selectedCellId?: string;
}

export interface UnitCellScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  warnings: string[];
}

export function unitCellTagNodeId(stubId: string): string {
  return `uc:tag:${stubId}`;
}

/** The stub picked by a click on the stub itself or on its tag marker. */
export function selectedUnitCellStub(
  base: UnitCellBase,
  selection: Pick<UnitCellSceneOptions, "selectedNodeId" | "selectedEdgeId">,
): UnitCellStub | undefined {
  if (selection.selectedEdgeId) {
    const stub = base.stubById.get(selection.selectedEdgeId);
    if (stub) return stub;
  }
  if (selection.selectedNodeId?.startsWith("uc:tag:")) {
    return base.stubById.get(selection.selectedNodeId.slice("uc:tag:".length));
  }
  return undefined;
}

export function buildUnitCellScene(
  base: UnitCellBase,
  options: UnitCellSceneOptions,
): UnitCellScene {
  const unitCell = base.unitCell;
  if (!unitCell || base.unavailableReason) {
    return {
      nodes: [],
      edges: [],
      cells: [],
      generators: base.generators,
      warnings: base.unavailableReason ? [base.unavailableReason] : [],
    };
  }
  const scheme = options.colorScheme ?? "light";
  const tagPalette = GLUING_TAG_PALETTE[scheme];
  const selectedChamber = options.selectedNodeId
    ? base.chamberById.get(options.selectedNodeId)
    : undefined;
  const selectedPoint = selectedChamber?.pointId;
  const selectedStub = selectedUnitCellStub(base, options);
  const highlightedStubIds = new Set(
    selectedStub ? [selectedStub.id, selectedStub.partnerStubId] : [],
  );
  // The ghosts at the ends of a selected gluing pair say what each stub is
  // glued to.
  const pinnedGhostIds = new Set(
    [...highlightedStubIds].map((id) => base.stubById.get(id)!.ghostChamberId),
  );
  // Selecting a domain chamber pins the tags of the stubs leaving it and of
  // their partners: where each of its edges is glued.
  const pinnedTagStubIds = new Set(highlightedStubIds);
  if (selectedChamber?.role === "representative") {
    for (const stub of unitCell.stubs) {
      if (stub.fromChamberId !== selectedChamber.id) continue;
      pinnedTagStubIds.add(stub.id);
      pinnedTagStubIds.add(stub.partnerStubId);
    }
  }

  const nodes: SceneNode[] = [];
  for (const chamber of unitCell.chambers) {
    const position = base.positions.get(chamber.id);
    const label = base.labelByPoint.get(chamber.pointId) ?? chamber.pointId;
    const length = chamber.word.length;
    if (chamber.role === "representative") {
      nodes.push({
        id: chamber.id,
        label,
        compactLabel: label,
        length,
        position,
        // Domain labels are pinned: they are what the ghosts and tags refer
        // to. The renderer drops the pin when too many are pinned (C44).
        alwaysLabel: true,
        labelPriority: 4_000 - length,
      });
    } else if (chamber.role === "ghost") {
      // A ghost of the selected point is lifted out of the muted style so the
      // reader sees every place the same bar X vertex appears.
      const echo = chamber.pointId === selectedPoint;
      nodes.push({
        id: chamber.id,
        label: `≡ ${label}`,
        compactLabel: `≡ ${label}`,
        length,
        position,
        ghost: !echo,
        // Echoes take the selection amber: they are the selected bar X vertex.
        labelTone: echo ? "accent" : "muted",
        alwaysLabel: echo || pinnedGhostIds.has(chamber.id) || undefined,
        colorHint: echo ? ECHO_COLOR[scheme] : undefined,
        nodeScale: echo ? 1.1 : 0.85,
        labelScale: echo ? 1 : 0.85,
        labelPriority: 1_000 - length,
      });
    } else if (options.showCopies) {
      nodes.push({
        id: chamber.id,
        length,
        position,
        ghost: true,
        drawingOnly: true,
        nodeScale: 0.5,
      });
    }
  }

  for (const stub of unitCell.stubs) {
    const from = base.positions.get(stub.fromChamberId);
    const to = base.positions.get(stub.ghostChamberId);
    if (!from || !to) continue;
    const highlighted = highlightedStubIds.has(stub.id);
    const tag = stubTagLabel(stub);
    nodes.push({
      id: unitCellTagNodeId(stub.id),
      label: tag,
      compactLabel: tag,
      length: 0,
      position: [
        from[0] + TAG_MARKER_FRACTION * (to[0] - from[0]),
        from[1] + TAG_MARKER_FRACTION * (to[1] - from[1]),
        from[2] + TAG_MARKER_FRACTION * (to[2] - from[2]),
      ],
      drawingOnly: true,
      // Pinned only for the selected pair; otherwise ordinary labels under
      // the density cap, ranked above ghosts.
      alwaysLabel: pinnedTagStubIds.has(stub.id) || undefined,
      labelTone: "accent",
      colorHint: tagPalette[stub.pairIndex % tagPalette.length],
      nodeScale: highlighted ? 0.95 : 0.55,
      labelScale: highlighted ? 1.25 : 1,
      labelPriority: 2_000 - stub.pairIndex,
    });
  }

  const edges: SceneEdge[] = [];
  for (const edge of unitCell.edges) {
    const generatorLabel =
      base.generators[edge.generator]?.label ?? `s${edge.generator}`;
    switch (edge.role) {
      case "tree":
      case "internal":
        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          generator: edge.generator,
          compactLabel: generatorLabel,
          labelPriority: 3_000,
        });
        break;
      case "stub": {
        const highlighted = highlightedStubIds.has(edge.id);
        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          generator: edge.generator,
          compactLabel: generatorLabel,
          lineStyle: "dashed",
          labelPriority: highlighted ? 6_000 : 1_000,
          alwaysLabel: highlighted || undefined,
          readabilityOverlay: highlighted || undefined,
        });
        break;
      }
      case "outside":
        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          generator: edge.generator,
          compactLabel: "",
          lineStyle: "dotted",
          faint: true,
        });
        break;
      case "copy":
        if (options.showCopies) {
          edges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            generator: edge.generator,
            compactLabel: "",
            ghost: true,
            drawingOnly: true,
          });
        }
        break;
    }
  }

  const cells: SceneCell[] = unitCell.cells.map((cell) => ({
    id: cell.id,
    generatorPair: cell.generatorPair,
    boundaryNodeIds: cell.boundaryChamberIds,
    sourceCellId: cell.id,
    // A cell wholly inside D gets the normal fill; one that crosses the
    // boundary is faint, since part of it belongs to neighbouring copies.
    readabilityRole:
      cell.id === options.selectedCellId
        ? "focus"
        : cell.outsideChamberIds.length === 0
          ? undefined
          : "context",
  }));

  return {
    nodes,
    edges,
    cells,
    generators: base.generators,
    warnings: base.warnings,
  };
}

export function unitCellBadge(base: UnitCellBase): string | undefined {
  const unitCell = base.unitCell;
  if (!unitCell || base.unavailableReason) return undefined;
  return `Unit cell: ${unitCell.index} chambers, ${unitCell.gluingPairs.length} gluing pairs`;
}

/** Inspector text for the unit-cell view; undefined defers to the default. */
export function unitCellInspectorSummary(
  base: UnitCellBase,
  selection: Omit<UnitCellSceneOptions, "showCopies">,
): InspectorSummary | undefined {
  const unitCell = base.unitCell;
  if (!unitCell || base.unavailableReason) {
    return {
      selected: "The unit cell is unavailable for this system.",
      reason: base.unavailableReason ?? "No unit cell was built.",
      status: UNIT_CELL_VIEW_DESCRIPTION,
    };
  }
  const label = (pointId: string) => base.labelByPoint.get(pointId) ?? pointId;
  const stub = selectedUnitCellStub(base, selection);
  if (stub) {
    const partner = base.stubById.get(stub.partnerStubId)!;
    const generator =
      base.generators[stub.generator]?.label ?? `s${stub.generator}`;
    const from = base.chamberById.get(stub.fromChamberId)!;
    const partnerFrom = base.chamberById.get(partner.fromChamberId)!;
    return {
      selected: `Gluing stub ${stubTagLabel(stub)}: the ${generator}-edge leaving ${label(from.pointId)} through the boundary of the unit cell.`,
      reason: `Glued to ${stubTagLabel(partner)} (the ${generator}-edge leaving ${label(partnerFrom.pointId)}) by an element of H. Both stubs are lifts of one bar X edge, ${stub.barEdgeId}.`,
      status:
        "The gluing is exact: it comes from the finite action. Where the stubs are drawn is the reflection-orbit drawing.",
      details: [
        { label: "Tag", value: `${stub.tag} ↔ ${stub.tag}′` },
        { label: "bar X edge", value: stub.barEdgeId },
        { label: "Generator", value: generator },
      ],
    };
  }
  const chamber = selection.selectedNodeId
    ? base.chamberById.get(selection.selectedNodeId)
    : undefined;
  if (chamber && chamber.role !== "copy") {
    const ghostCount = unitCell.chambers.filter(
      (other) => other.role === "ghost" && other.pointId === chamber.pointId,
    ).length;
    const word = wordText(chamber.word, base.generators);
    if (chamber.role === "ghost") {
      return {
        selected: `A ghost chamber: H-equivalent to ${label(chamber.pointId)}; it lies outside the unit cell.`,
        reason: `It is the chamber ${word}, adjacent to the unit cell. An element of H carries it to the representative of ${label(chamber.pointId)}, so in bar X both are the same vertex.`,
        status:
          "The H-equivalence is exact (both words act the same way on the cosets). The position is the reflection-orbit drawing.",
        details: [
          { label: "Word", value: word },
          { label: "bar X vertex", value: chamber.pointId },
        ],
      };
    }
    return {
      selected: `${label(chamber.pointId)}, the chamber of the unit cell over this bar X vertex.`,
      reason: `It is the chamber ${word}, the nearest to e among the chambers over this coset that touch the domain (${distanceText(chamber.distance, unitCell.distanceKind)}). ${ghostCount} ghost ${ghostCount === 1 ? "copy appears" : "copies appear"} around the unit cell (highlighted).`,
      status: UNIT_CELL_VIEW_DESCRIPTION,
      details: [
        { label: "Representative word", value: word },
        { label: "bar X vertex", value: chamber.pointId },
        { label: "Ghost copies drawn", value: ghostCount },
      ],
    };
  }
  const cell = selection.selectedCellId
    ? unitCell.cells.find(
        (candidate) => candidate.id === selection.selectedCellId,
      )
    : undefined;
  if (cell) {
    const start = base.chamberById.get(cell.boundaryChamberIds[0])!;
    const pair = cell.generatorPair
      .map((generator) => base.generators[generator]?.label ?? `s${generator}`)
      .join(" and ");
    return {
      selected: `${cell.id}, a relation cell of bar X (a ${2 * cell.m}-gon alternating ${pair}).`,
      reason: `Drawn once, by its lift from the representative of ${label(start.pointId)}. ${
        cell.outsideChamberIds.length === 0
          ? "All its vertices lie in the unit cell."
          : `${cell.outsideChamberIds.length} of its ${2 * cell.m} vertices are ghosts outside the unit cell.`
      }`,
      status:
        "The boundary word is exact. In the reflection orbit every 2m-gon is planar and convex; the fill is a drawing.",
      details: [
        { label: "Boundary length", value: 2 * cell.m },
        { label: "Vertices outside D", value: cell.outsideChamberIds.length },
      ],
    };
  }
  return {
    selected: `The unit cell of H: ${unitCell.index} chambers and ${unitCell.gluingPairs.length} gluing pairs.`,
    reason:
      "bar X = H\\Sigma cannot be drawn in 3D without overlaps, but its universal cover can. The unit cell shows the local geometry; the gluing tags record the global topology, like the side pairings of a polygon.",
    status: UNIT_CELL_VIEW_DESCRIPTION,
    details: [
      { label: "Chambers (index of H)", value: unitCell.index },
      {
        label: "Spanning-tree edges",
        value: unitCell.edges.filter((edge) => edge.role === "tree").length,
      },
      {
        label: "Other edges inside D",
        value: unitCell.edges.filter((edge) => edge.role === "internal").length,
      },
      { label: "Gluing pairs", value: unitCell.gluingPairs.length },
      {
        label: "Cells crossing the boundary",
        value: unitCell.cells.filter(
          (cell) => cell.outsideChamberIds.length > 0,
        ).length,
      },
    ],
  };
}

function wordText(word: readonly number[], generators: SceneGenerator[]) {
  if (word.length === 0) return "e";
  return word
    .map((generator) => generators[generator]?.label ?? `s${generator}`)
    .join(" ");
}

function distanceText(
  distance: number,
  kind: UnitCell["distanceKind"],
): string {
  return kind === "hyperbolic"
    ? `hyperbolic distance ${distance.toFixed(3)}`
    : kind === "tits-euclidean"
      ? `Euclidean distance ${distance.toFixed(3)} in the Tits representation`
      : `word length ${distance}`;
}
