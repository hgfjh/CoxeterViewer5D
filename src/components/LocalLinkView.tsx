import type { LocalLink } from "../davis";

export interface LocalLinkViewProps {
  localLink: LocalLink;
  activeGeneratorPair?: [number, number];
  disabledPairs?: Set<string>;
  onGeneratorStep?: (generator: number) => void;
  onPairToggle?: (pair: [number, number]) => void;
}

export function LocalLinkView({
  localLink,
  activeGeneratorPair,
  disabledPairs,
  onGeneratorStep,
  onPairToggle,
}: LocalLinkViewProps) {
  const size = 180;
  const center = size / 2;
  const radius = 66;
  const positions = new Map(
    localLink.vertices.map((vertex, index) => {
      const angle =
        -Math.PI / 2 + (2 * Math.PI * index) / localLink.vertices.length;
      return [
        vertex.generator,
        {
          x: center + radius * Math.cos(angle),
          y: center + radius * Math.sin(angle),
        },
      ] as const;
    }),
  );
  const higherSubsets = localLink.sphericalSubsets.filter(
    (subset) => subset.rank >= 3,
  );
  const rankTwoSubsets = localLink.sphericalSubsets.filter(
    (subset) => subset.rank === 2,
  );

  return (
    <svg
      className="local-link-view"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Local link at ${localLink.nodeId}`}
    >
      {higherSubsets.map((subset) => {
        const points = subset.generators
          .map((generator) => positions.get(generator))
          .filter((point): point is { x: number; y: number } => Boolean(point));
        return points.length >= 3 ? (
          <polygon
            key={subset.id}
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            className="local-link-face"
          />
        ) : null;
      })}
      {rankTwoSubsets.map((subset) => {
        const [source, target] = subset.generators.map((generator) =>
          positions.get(generator),
        );
        const pair = subset.generators as [number, number];
        const key = pairKey(pair);
        const active = activeGeneratorPair
          ? pairKey(activeGeneratorPair) === key
          : false;
        const disabled = disabledPairs?.has(key) ?? false;
        return source && target ? (
          <g
            key={subset.id}
            role="button"
            tabIndex={0}
            aria-label={`Focus ${subset.generatorLabels.join("-")} rank-two cells`}
            aria-pressed={!disabled}
            onClick={() => onPairToggle?.(pair)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPairToggle?.(pair);
              }
            }}
          >
            <line
              className="local-link-edge-hit"
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
            <line
              className={`local-link-edge${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
          </g>
        ) : null;
      })}
      {localLink.vertices.map((vertex) => {
        const position = positions.get(vertex.generator);
        if (!position) {
          return null;
        }
        return (
          <g
            key={vertex.generatorId}
            role="button"
            tabIndex={0}
            aria-label={`Step by ${vertex.label}`}
            onClick={() => onGeneratorStep?.(vertex.generator)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onGeneratorStep?.(vertex.generator);
              }
            }}
          >
            <circle
              className="local-link-node"
              cx={position.x}
              cy={position.y}
              r="12"
              style={{ fill: vertex.colorHint ?? "#6b7280" }}
            />
            <text
              className="local-link-label"
              x={position.x}
              y={position.y + 4}
              textAnchor="middle"
            >
              {vertex.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function pairKey(pair: [number, number]) {
  return `${pair[0]}-${pair[1]}`;
}
