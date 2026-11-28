import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoverCompressionResult } from "../compression/types";
import { generatorColor, type SceneGenerator } from "../render/SceneView";
import type {
  LawfulSubcomplexEvaluation,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  atlasPolygonGeometry,
  buildCellAtlas,
  cellBoundaryText,
  cellsContaining,
  filterCellAtlas,
  type AtlasPolygonGeometry,
  type CellAtlasCell,
  type CellAtlasComplex,
  type CellAtlasFilter,
  type CellAtlasHover,
} from "./cellAtlasModel";
import { wallColor, wallLabel } from "./wallScene";

export interface CellAtlasProps {
  cover: CoverCompressionResult;
  complex: CellAtlasComplex;
  wallSystem?: WallSystem;
  coorientation?: WallCoorientation;
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  selectedWallId?: string;
  generators: readonly SceneGenerator[];
  colorScheme: "light" | "dark";
  selectedCellId?: string;
  onSelectCell: (cellId: string, familyId: CellAtlasCell["familyId"]) => void;
}

// Side length of every drawn polygon, in SVG units. Fixing the side rather
// than the radius keeps generator labels equally spaced in squares, hexagons
// and octagons.
const SIDE_LENGTH = 54;
// Corner labels use a 10px monospace face; this is its advance width.
const LABEL_CHAR_WIDTH = 6.1;

/**
 * Every relation cell of hat X or bar X drawn separately as a regular
 * 2m-gon from its exact attaching word. Positions inside a cell are a drawing
 * convention; the boundary word, the corner vertices and the shared-vertex /
 * shared-edge highlighting are exact.
 */
export function CellAtlas(props: CellAtlasProps) {
  const {
    cover,
    complex,
    wallSystem,
    coorientation,
    lawfulSubcomplex,
    selectedWallId,
    generators,
    colorScheme,
    selectedCellId,
    onSelectCell,
  } = props;
  const model = useMemo(
    () =>
      buildCellAtlas({
        cover,
        complex,
        wallSystem,
        coorientation,
        lawfulSubcomplex,
        selectedWallId,
      }),
    [
      complex,
      coorientation,
      cover,
      lawfulSubcomplex,
      selectedWallId,
      wallSystem,
    ],
  );
  const [filter, setFilter] = useState<CellAtlasFilter>({
    familyId: "all",
    text: "",
  });
  const familyId =
    filter.familyId === "all" ||
    model.families.some((family) => family.id === filter.familyId)
      ? filter.familyId
      : "all";
  const visibleFamilies = useMemo(
    () => filterCellAtlas(model, { familyId, text: filter.text }),
    [familyId, filter.text, model],
  );
  const visibleCount = visibleFamilies.reduce(
    (sum, family) => sum + family.cells.length,
    0,
  );

  const [hover, setHover] = useState<CellAtlasHover>();
  const highlighted = useMemo(
    () => cellsContaining(model, hover),
    [hover, model],
  );
  const colors = useMemo(
    () =>
      cover.barX.sourceSystem.generators.map((_, index) =>
        generatorColor([...generators], index, colorScheme),
      ),
    [colorScheme, cover.barX.sourceSystem.generators, generators],
  );
  const selectedWallColor =
    wallSystem && selectedWallId
      ? wallColor(wallSystem, selectedWallId)
      : undefined;
  const hasWallCrossings =
    complex === "bar-x" &&
    model.families.some((family) =>
      family.cells.some((cell) => cell.wallCrossings.length > 0),
    );

  // Scroll to a cell selected elsewhere (the 3D view, the inspector, or a
  // previous visit to the atlas), but not to one just clicked here.
  const containerRef = useRef<HTMLDivElement>(null);
  const clickedRef = useRef<string>(undefined);
  useEffect(() => {
    if (!selectedCellId || clickedRef.current === selectedCellId) return;
    const element = containerRef.current?.querySelector<HTMLElement>(
      `[data-cell-id="${CSS.escape(selectedCellId)}"]`,
    );
    element?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [selectedCellId, visibleFamilies]);

  const handleSelect = useCallback(
    (cell: CellAtlasCell) => {
      clickedRef.current = cell.id;
      onSelectCell(cell.id, cell.familyId);
    },
    [onSelectCell],
  );

  const hoverText = hover
    ? hover.kind === "vertex"
      ? `Vertex ${model.vertexLabels.get(hover.id) ?? hover.id} lies in ${highlighted.size} of ${model.cellCount} relation cells`
      : `This ${generatorOfEdge(model, hover.id) ?? ""} edge lies in ${highlighted.size} of ${model.cellCount} relation cells`
    : undefined;

  return (
    <section
      className="cell-atlas"
      aria-label={`${complex === "hat-x" ? "hat X" : "bar X"} cell atlas`}
      data-testid="cell-atlas"
    >
      <header className="cell-atlas-header">
        <p className="cell-atlas-caption">
          Each relation cell drawn separately from its exact boundary word;
          shared vertices and edges are highlighted on hover.
        </p>
        <div className="cell-atlas-controls">
          <label>
            <span>Family</span>
            <select
              aria-label="Cell atlas relation family"
              value={familyId}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  familyId: event.target.value as CellAtlasFilter["familyId"],
                }))
              }
            >
              <option value="all">
                All families ({model.families.length})
              </option>
              {model.families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Vertex</span>
            <input
              type="search"
              aria-label="Filter cells by vertex label"
              placeholder="e.g. (12)(34)"
              value={filter.text}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  text: event.target.value,
                }))
              }
            />
          </label>
          <span className="cell-atlas-count" data-testid="cell-atlas-count">
            {visibleCount} of {model.cellCount} cells
          </span>
        </div>
        <ul className="cell-atlas-legend" aria-label="Cell atlas key">
          <li className="cell-atlas-generators">
            {cover.barX.sourceSystem.generators.map((generator, index) => (
              <span key={generator.id ?? index}>
                <i style={{ background: colors[index] }} aria-hidden="true" />
                {generator.label}
              </span>
            ))}
          </li>
          {model.hasLawfulStatus ? (
            <li>
              <svg width="12" height="12" aria-hidden="true">
                <path d="M6 1 L11 11 L1 11 Z" className="cell-atlas-source" />
              </svg>{" "}
              source and{" "}
              <svg width="12" height="12" aria-hidden="true">
                <rect
                  x="1.5"
                  y="1.5"
                  width="9"
                  height="9"
                  className="cell-atlas-sink"
                />
              </svg>{" "}
              sink corner of a lawful cell; arrows are the current
              coorientation.
            </li>
          ) : null}
          {model.discardedCellCount > 0 ? (
            <li>
              Faint cells ({model.discardedCellCount}) are discarded by the
              lawful subcomplex for this coorientation.
            </li>
          ) : null}
          {hasWallCrossings && wallSystem && selectedWallId ? (
            <li>
              <svg width="22" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="21"
                  y2="4"
                  stroke={selectedWallColor}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>{" "}
              Dashed: wall {wallLabel(wallSystem, selectedWallId)}, its dual
              edges and its arcs through cells.
            </li>
          ) : null}
          {model.omittedBigonCount > 0 ? (
            <li>
              {model.omittedBigonCount} generator bigons not shown. The 2m lifts
              of one bar X cell sit side by side; lifts whose base points differ
              by a rotation of the cycle have the same boundary.
            </li>
          ) : null}
        </ul>
        <p className="cell-atlas-hover" aria-live="polite">
          {hoverText ??
            "Hover a corner label or an edge to see where it is shared."}
        </p>
      </header>

      <div className="cell-atlas-scroll" ref={containerRef}>
        {visibleFamilies.length === 0 ? (
          <p className="cell-atlas-empty">
            No relation cells match the filter.
          </p>
        ) : null}
        {visibleFamilies.map((family) => {
          const sideCount = 2 * family.m;
          const radius = SIDE_LENGTH / (2 * Math.sin(Math.PI / sideCount));
          const geometry = atlasPolygonGeometry(sideCount, radius);
          const labelRoom = Math.max(
            26,
            model.maxCornerLabelLength * LABEL_CHAR_WIDTH + 12,
          );
          const width = Math.ceil(2 * (radius + labelRoom));
          const height = Math.ceil(2 * (radius + 20));
          return (
            <section
              key={family.id}
              className="cell-atlas-family"
              aria-label={family.title}
              data-family-id={family.id}
            >
              <h3>{family.title}</h3>
              <div
                className="cell-atlas-grid"
                style={
                  {
                    "--cell-atlas-card-width": `${width + 12}px`,
                    "--cell-atlas-card-height": `${height + 34}px`,
                  } as React.CSSProperties
                }
              >
                {family.cells.map((cell) => {
                  const lit = highlighted.has(cell.id);
                  return (
                    <AtlasCellCard
                      key={cell.id}
                      cell={cell}
                      geometry={geometry}
                      width={width}
                      height={height}
                      colors={colors}
                      wallStroke={selectedWallColor}
                      selected={cell.id === selectedCellId}
                      highlighted={lit}
                      hoverVertexId={
                        lit && hover?.kind === "vertex" ? hover.id : undefined
                      }
                      hoverEdgeId={
                        lit && hover?.kind === "edge" ? hover.id : undefined
                      }
                      onSelect={handleSelect}
                      onHover={setHover}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function generatorOfEdge(
  model: ReturnType<typeof buildCellAtlas>,
  edgeId: string,
): string | undefined {
  for (const family of model.families) {
    for (const cell of family.cells) {
      const side = cell.sides.find((candidate) => candidate.edgeId === edgeId);
      if (side) return side.generatorLabel;
    }
  }
  return undefined;
}

interface AtlasCellCardProps {
  cell: CellAtlasCell;
  geometry: AtlasPolygonGeometry;
  width: number;
  height: number;
  colors: readonly string[];
  wallStroke?: string;
  selected: boolean;
  highlighted: boolean;
  hoverVertexId?: string;
  hoverEdgeId?: string;
  onSelect: (cell: CellAtlasCell) => void;
  onHover: (hover: CellAtlasHover | undefined) => void;
}

// Memoised so a hover redraws only the cells whose highlight changed; C44's
// bar X has 364 cards.
const AtlasCellCard = memo(function AtlasCellCard({
  cell,
  geometry,
  width,
  height,
  colors,
  wallStroke,
  selected,
  highlighted,
  hoverVertexId,
  hoverEdgeId,
  onSelect,
  onHover,
}: AtlasCellCardProps) {
  const boundaryText = cellBoundaryText(cell);
  const status = cell.status;
  const statusText = status
    ? status.lawful
      ? "lawful"
      : `not lawful · ${status.transitionCount} sign changes`
    : undefined;
  const classes = [
    "cell-atlas-card",
    selected ? "is-selected" : "",
    highlighted ? "is-highlighted" : "",
    status?.discarded ? "is-discarded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const outline = geometry.corners.map((c) => `${c.x},${c.y}`).join(" ");
  return (
    <button
      type="button"
      className={classes}
      data-cell-id={cell.id}
      aria-pressed={selected}
      aria-label={`Relation cell ${cell.id}: ${boundaryText}${statusText ? `, ${statusText}` : ""}`}
      title={`${cell.id}\n${boundaryText}${statusText ? `\n${statusText}` : ""}`}
      onClick={() => onSelect(cell)}
    >
      <svg
        className="cell-atlas-svg"
        width={width}
        height={height}
        viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
        role="presentation"
        onMouseLeave={() => onHover(undefined)}
      >
        <polygon className="cell-atlas-fill" points={outline} />
        {cell.wallCrossings.map((crossing) => {
          const from = geometry.sides[crossing.fromSide];
          const to = geometry.sides[crossing.toSide];
          return (
            <line
              key={crossing.segmentId}
              className="cell-atlas-wall-arc"
              x1={from.midX}
              y1={from.midY}
              x2={to.midX}
              y2={to.midY}
              stroke={wallStroke}
            />
          );
        })}
        {cell.sides.map((side, index) => {
          const start = geometry.corners[index];
          const end = geometry.corners[(index + 1) % geometry.corners.length];
          const placement = geometry.sides[index];
          const lit = side.edgeId === hoverEdgeId;
          return (
            <g
              key={`${index}:${side.edgeId}`}
              className={`cell-atlas-side${lit ? " is-hovered" : ""}`}
              onMouseEnter={() => onHover({ kind: "edge", id: side.edgeId })}
            >
              <title>{`${side.generatorLabel} edge ${side.edgeId}`}</title>
              {side.inSelectedWall ? (
                <line
                  className="cell-atlas-wall-edge"
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={wallStroke}
                />
              ) : null}
              <line
                className="cell-atlas-edge"
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={colors[side.generator]}
              />
              {side.directionAlongBoundary ? (
                <path
                  className="cell-atlas-arrow"
                  d={chevron(placement, side.directionAlongBoundary)}
                  stroke={colors[side.generator]}
                />
              ) : null}
              <line
                className="cell-atlas-hit"
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
              />
              <text
                className="cell-atlas-edge-label"
                x={placement.labelX}
                y={placement.labelY}
              >
                {side.generatorLabel}
              </text>
            </g>
          );
        })}
        {cell.corners.map((corner, index) => {
          const point = geometry.corners[index];
          const lit = corner.vertexId === hoverVertexId;
          const isSource = status?.sourceCorner === index;
          const isSink = status?.sinkCorner === index;
          // Glyphs sit just inside the corner, away from the outside label.
          const glyphX = point.x * 0.78;
          const glyphY = point.y * 0.78;
          return (
            <g
              key={`${index}:${corner.vertexId}`}
              className={`cell-atlas-corner${lit ? " is-hovered" : ""}`}
              onMouseEnter={() =>
                onHover({ kind: "vertex", id: corner.vertexId })
              }
            >
              <title>{corner.label}</title>
              <circle
                className="cell-atlas-vertex"
                cx={point.x}
                cy={point.y}
                r={lit ? 5 : index === 0 ? 3.6 : 2.6}
              />
              {isSource ? (
                <path
                  className="cell-atlas-source"
                  d={`M${glyphX} ${glyphY - 5} L${glyphX + 4.5} ${glyphY + 3.5} L${glyphX - 4.5} ${glyphY + 3.5} Z`}
                />
              ) : null}
              {isSink ? (
                <rect
                  className="cell-atlas-sink"
                  x={glyphX - 3.8}
                  y={glyphY - 3.8}
                  width={7.6}
                  height={7.6}
                />
              ) : null}
              <text
                className="cell-atlas-vertex-label"
                x={point.labelX}
                y={point.labelY}
                textAnchor={point.anchor}
              >
                {corner.label}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="cell-atlas-card-caption">
        <span>
          ({cell.boundaryWord[0]} {cell.boundaryWord[1]})<sup>{cell.m}</sup>{" "}
          from {cell.corners[0]?.label}
        </span>
        {statusText ? (
          <span
            className={`cell-atlas-status${status?.lawful ? " is-lawful" : ""}`}
          >
            {status?.discarded ? "discarded" : statusText}
          </span>
        ) : null}
      </span>
    </button>
  );
});

/** Small chevron on a side midpoint, pointing along the coorientation arrow. */
function chevron(
  side: AtlasPolygonGeometry["sides"][number],
  direction: 1 | -1,
): string {
  const tx = side.tangentX * direction;
  const ty = side.tangentY * direction;
  const tipX = side.midX + tx * 3.5;
  const tipY = side.midY + ty * 3.5;
  const backX = side.midX - tx * 3.5;
  const backY = side.midY - ty * 3.5;
  return `M${backX - ty * 4} ${backY + tx * 4} L${tipX} ${tipY} L${backX + ty * 4} ${backY - tx * 4}`;
}
