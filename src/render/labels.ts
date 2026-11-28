export interface LabelEntry {
  id: string;
  selected?: boolean;
  priority?: number;
}

export interface LabelBudgetOptions<T> {
  enabled: boolean;
  maxLabels: number;
  maxCharacters: number;
  getLabel: (item: T) => string | undefined;
  getPriority?: (item: T) => number;
}

export interface PickedLabelEntry<T> {
  item: T;
  label: string;
}

export interface SegmentLabelCandidate {
  id: string;
  segmentKey: string;
  priority: number;
}

export interface SemanticEdgeLabelSource {
  id: string;
  compactLabel?: string;
  semanticLabelKind?: "generator" | "coxeter-order";
  readabilityOverlay?: boolean;
}

/**
 * Resolves the mathematical meaning of an edge label in a semantic view.
 * Gamma edges carry Coxeter exponents; edges in cell complexes carry the
 * generator traversed by that 1-cell. Drawing overlays may supply an explicit
 * compact label, but they do not change either convention.
 */
export function semanticEdgeLabelText(
  edge: SemanticEdgeLabelSource,
  generatorLabel: string,
): string {
  if (
    edge.semanticLabelKind === "coxeter-order" ||
    edge.id.startsWith("Gamma:e:")
  ) {
    return edge.compactLabel ?? generatorLabel;
  }
  return edge.readabilityOverlay
    ? (edge.compactLabel ?? generatorLabel)
    : generatorLabel;
}

/**
 * Splits a word label into generator tokens: whitespace-separated words
 * ("t24 t1 t4"), or concatenated letter-plus-index tokens ("s0s1s2", "abab").
 * Returns undefined when the label has no such structure.
 */
export function wordLabelTokens(label: string): string[] | undefined {
  const trimmed = label.trim();
  if (/\s/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    // Generator labels start with a letter (Latin or Greek): "s0", "t24".
    return words.every((word) => /^[A-Za-zͰ-Ͽ][\w']*$/.test(word))
      ? words
      : undefined;
  }
  if (/^(?:[A-Za-z][0-9]*'*)+$/.test(trimmed)) {
    return trimmed.match(/[A-Za-z][0-9]*'*/g) ?? undefined;
  }
  return undefined;
}

/**
 * Shortens long word labels without cutting through a generator token.
 *
 * A word too long for the budget is shown as its leading tokens, an
 * ellipsis, the last token and the word length, e.g. "t24 t1 … t9 (ℓ=7)".
 * Keeping whole tokens matters: a cut such as "t1...4" reads as different
 * generators. The length suffix is outside the character budget. Labels
 * that are not generator words fall back to a character cut.
 */
export function compactLabelText(label: string, maxCharacters: number): string {
  if (maxCharacters < 4 || label.length <= maxCharacters) {
    return label;
  }

  const tokens = wordLabelTokens(label);
  if (tokens && tokens.length >= 3) {
    const separator = /\s/.test(label.trim()) ? " " : "";
    const last = tokens[tokens.length - 1];
    const ellipsis = `${separator}…${separator}`;
    const head: string[] = [tokens[0]];
    for (let index = 1; index < tokens.length - 1; index += 1) {
      const candidate = [...head, tokens[index]].join(separator);
      if (candidate.length + ellipsis.length + last.length > maxCharacters) {
        break;
      }
      head.push(tokens[index]);
    }
    if (head.length < tokens.length - 1) {
      return `${head.join(separator)}${ellipsis}${last} (ℓ=${tokens.length})`;
    }
    return label;
  }

  const headLength = Math.max(1, Math.ceil((maxCharacters - 1) / 2));
  const tailLength = Math.max(1, Math.floor((maxCharacters - 1) / 2));
  return `${label.slice(0, headLength)}…${label.slice(-tailLength)}`;
}

/**
 * Chooses at most one label for each drawn segment.
 *
 * This matters for Y_Gamma, where several relation boundaries can share the
 * same geometric segment. The highest-priority semantic label wins and the
 * renderer avoids stacking different generator names on one edge.
 */
export function selectSegmentLabelBudget<T extends SegmentLabelCandidate>(
  entries: T[],
  maxLabels: number,
): T[] {
  if (maxLabels <= 0) {
    return [];
  }

  const bestBySegment = new Map<string, T>();
  for (const entry of entries) {
    const previous = bestBySegment.get(entry.segmentKey);
    if (!previous || compareSegmentLabelCandidates(entry, previous) < 0) {
      bestBySegment.set(entry.segmentKey, entry);
    }
  }

  return [...bestBySegment.values()]
    .sort(compareSegmentLabelCandidates)
    .slice(0, maxLabels);
}

/**
 * Stable priority budget for node and edge labels.
 */
export function selectLabelBudget<T extends { id: string }>(
  items: T[],
  options: LabelBudgetOptions<T>,
): Array<PickedLabelEntry<T>> {
  if (!options.enabled || options.maxLabels <= 0) {
    return [];
  }

  const entries = items
    .map((item) => {
      const label = options.getLabel(item);
      return label
        ? {
            item,
            label: compactLabelText(label, options.maxCharacters),
            priority: options.getPriority?.(item) ?? 0,
          }
        : undefined;
    })
    .filter((entry): entry is PickedLabelEntry<T> & { priority: number } =>
      Boolean(entry),
    );

  return entries
    .sort((left, right) => {
      const priorityDifference = right.priority - left.priority;
      return priorityDifference === 0
        ? left.item.id.localeCompare(right.item.id)
        : priorityDifference;
    })
    .slice(0, options.maxLabels)
    .map(({ item, label }) => ({ item, label }));
}

function compareSegmentLabelCandidates<T extends SegmentLabelCandidate>(
  left: T,
  right: T,
): number {
  const priorityDifference = right.priority - left.priority;
  return priorityDifference === 0
    ? left.id.localeCompare(right.id)
    : priorityDifference;
}

export function pickLabelEntries<T extends LabelEntry>(
  entries: T[],
  maxLabels: number,
): T[] {
  if (maxLabels <= 0) {
    return [];
  }

  return [...entries]
    .sort((left, right) => {
      if (Boolean(left.selected) !== Boolean(right.selected)) {
        return left.selected ? -1 : 1;
      }

      const priorityDifference = (left.priority ?? 0) - (right.priority ?? 0);
      return priorityDifference === 0
        ? left.id.localeCompare(right.id)
        : priorityDifference;
    })
    .slice(0, maxLabels);
}

/** Scenes with more visible vertices than this switch to the dense label rule. */
export const denseLabelNodeThreshold = 60;
const denseNodeLabelBase = 25;
/**
 * Pinned labels (alwaysLabel, relation boundaries) bypass the dense cap only
 * when at most this many are pinned; beyond that they are ordinary labels.
 */
export const denseLabelPinLimit = 40;
const denseEdgeLabelBase = 12;
const maxLabelZoomLevel = 3;

export interface LabelDensityInput {
  visibleNodeCount: number;
  maxNodeLabels: number;
  maxEdgeLabels: number;
  /**
   * Camera zoom relative to the framed view, as the ratio
   * framedDistance / currentDistance. Values above 1 mean the user zoomed in.
   */
  zoomRatio?: number;
}

export interface LabelDensityBudget {
  dense: boolean;
  /** Zoom level used for the dense caps: 0 at the framed view, +1 per 2x zoom. */
  zoomLevel: number;
  /** Cap for ordinary labels; selected/neighbour/pinned labels bypass it. */
  nodeCap: number;
  edgeCap: number;
}

/**
 * Label density rule for the 3D viewer.
 *
 * Small scenes keep the caller's full budget, so every vertex of an I2(m) or
 * A3 ball stays labelled. Past {@link denseLabelNodeThreshold} vertices the
 * ordinary labels are capped hard (25 vertices, 12 edges at the framed view)
 * and the cap doubles each time the camera moves twice as close. Labels that
 * explain the current selection are exempt from this cap; they still count
 * against the caller's hard maximum.
 */
export function labelDensityBudget(
  input: LabelDensityInput,
): LabelDensityBudget {
  const dense = input.visibleNodeCount > denseLabelNodeThreshold;
  const zoomLevel = labelZoomLevel(input.zoomRatio ?? 1);
  if (!dense) {
    return {
      dense,
      zoomLevel,
      nodeCap: input.maxNodeLabels,
      edgeCap: input.maxEdgeLabels,
    };
  }
  const factor = 2 ** zoomLevel;
  return {
    dense,
    zoomLevel,
    nodeCap: Math.min(input.maxNodeLabels, denseNodeLabelBase * factor),
    edgeCap: Math.min(input.maxEdgeLabels, denseEdgeLabelBase * factor),
  };
}

/** Quantizes a zoom ratio so labels are rebuilt only at 2x zoom steps. */
export function labelZoomLevel(zoomRatio: number): number {
  if (!Number.isFinite(zoomRatio) || zoomRatio <= 1) {
    return 0;
  }
  return Math.min(maxLabelZoomLevel, Math.floor(Math.log2(zoomRatio)));
}

/**
 * Applies the dense cap to an already priority-sorted list. Entries flagged
 * as exempt (selection context, pinned labels) are kept regardless of the
 * cap, ordinary entries must also pass `accept`, and the result never
 * exceeds `hardMax`.
 */
export function applyDenseLabelCap<T>(
  sorted: readonly T[],
  cap: number,
  hardMax: number,
  isExempt: (entry: T) => boolean,
  accept?: (entry: T, exempt: boolean) => boolean,
): T[] {
  const picked: T[] = [];
  let ordinary = 0;
  for (const entry of sorted) {
    if (picked.length >= hardMax) {
      break;
    }
    const exempt = isExempt(entry);
    if (!exempt && ordinary >= cap) {
      continue;
    }
    // `accept` (e.g. a screen-space collision check) may reject ordinary
    // entries; it is still called for exempt ones so they reserve space.
    const accepted = accept ? accept(entry, exempt) : true;
    if (exempt) {
      picked.push(entry);
    } else if (accepted) {
      picked.push(entry);
      ordinary += 1;
    }
  }
  return picked;
}

export type Rgb = readonly [number, number, number];

/** Parses `#rgb` or `#rrggbb` into sRGB channels in [0, 1]. */
export function parseHexColor(value: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  return [0, 2, 4].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  ) as unknown as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** WCAG 2 relative luminance of an sRGB color. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(left: Rgb, right: Rgb): number {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composites a translucent chip color over the canvas background. */
export function blendOver(
  foreground: Rgb,
  alpha: number,
  background: Rgb,
): Rgb {
  return foreground.map(
    (channel, index) => channel * alpha + background[index] * (1 - alpha),
  ) as unknown as Rgb;
}

/**
 * Moves a label color toward black or white (whichever direction gains
 * contrast against `background`) until the WCAG ratio reaches `minimum`.
 * The hue is kept as far as possible so generator-colored edge labels still
 * read as their generator.
 */
export function ensureTextContrast(
  text: Rgb,
  background: Rgb,
  minimum = 4.5,
): Rgb {
  if (contrastRatio(text, background) >= minimum) {
    return text;
  }
  const target: Rgb =
    relativeLuminance(background) > 0.18 ? [0, 0, 0] : [1, 1, 1];
  for (let step = 1; step <= 20; step += 1) {
    const t = step / 20;
    const mixed = text.map(
      (channel, index) => channel * (1 - t) + target[index] * t,
    ) as unknown as Rgb;
    if (contrastRatio(mixed, background) >= minimum) {
      return mixed;
    }
  }
  return target;
}
