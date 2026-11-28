/**
 * Colour channels of the 3D viewer.
 *
 * Hue is reserved for generators. Word-length shells are encoded by a neutral
 * lightness ramp, and the selection uses amber/gold, a hue band the generator
 * palette leaves out, so a vertex colour never reads as a generator.
 */

export type SceneColorScheme = "light" | "dark";

/**
 * Twelve categorical generator colours per theme. They were chosen by a
 * greedy search over an OKLCH pool (render-agent palsearch/joint scripts,
 * reusing viz-audit/palette.py): each new colour maximises the minimum
 * CIEDE2000 distance to the previous ones under normal vision, deuteranopia
 * and protanopia at once (Machado 2009 simulation), in both themes, and to the
 * selection amber. Every prefix is therefore as separated as the search could
 * make it; rank k uses the first k colours.
 *
 * Measured minima (all three vision types): first 6 >= 13.9, first 12 >= 8.2
 * ΔE00. Line contrast: >= 3.2:1 on the light canvas, >= 4.9:1 on the dark one.
 */
export const generatorPaletteLight = [
  "#1f63c9",
  "#7f3e48",
  "#349794",
  "#944a08",
  "#911470",
  "#2d9c70",
  "#2291c3",
  "#237e69",
  "#a56949",
  "#1d7892",
  "#345687",
  "#7e432b",
] as const;

/** Same hues and order as the light palette, lightened for #0d1117. */
export const generatorPaletteDark = [
  "#619dfb",
  "#b9727b",
  "#72d0cc",
  "#cf804a",
  "#ce54a7",
  "#6ed6a6",
  "#70cafa",
  "#61b69f",
  "#e0a07e",
  "#5cafcb",
  "#678bc0",
  "#b7775e",
] as const;

/**
 * Generator colour for an index, without silent wrap-around. Past the
 * curated twelve, the index cycles through the hues again with a lightness
 * shift per round (darker, then lighter), so no two generators share a colour
 * even for rank > 12, although later rounds are less separated than the first.
 */
export function fallbackGeneratorColor(
  index: number,
  scheme: SceneColorScheme = "light",
): string {
  const palette =
    scheme === "dark" ? generatorPaletteDark : generatorPaletteLight;
  const safeIndex = Math.max(0, Math.floor(index));
  const base = palette[safeIndex % palette.length];
  const round = Math.floor(safeIndex / palette.length);
  if (round === 0) return base;
  // Rounds alternate darker/lighter with growing magnitude: -, +, --, ++ ...
  const magnitude = Math.ceil(round / 2) * 0.16;
  const amount = round % 2 === 1 ? -magnitude : magnitude;
  return shiftLightness(base, Math.max(-0.7, Math.min(0.7, amount)));
}

/** Mixes toward black (negative) or white (positive) in sRGB. */
function shiftLightness(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return `#${channels
    .map((channel) =>
      Math.round(channel * (1 - t) + target * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Neutral (slate) lightness ramp for word-length shells. Shell 0 (the
 * identity) is the strongest tone; each further shell moves one step toward
 * the background and the ramp then stays at its last step instead of
 * wrapping, so a lighter vertex is always at least as far from the root.
 * Every step keeps >= 3:1 contrast against its canvas.
 */
export const shellRampLight = [
  "#111827",
  "#1f2937",
  "#334155",
  "#475569",
  "#5b6676",
  "#6b7280",
] as const;
export const shellRampDark = [
  "#f8fafc",
  "#e2e8f0",
  "#cbd5e1",
  "#b4bfcc",
  "#a0acbb",
  "#94a3b8",
] as const;

export function shellColor(
  length: number,
  scheme: SceneColorScheme = "light",
): string {
  const ramp = scheme === "dark" ? shellRampDark : shellRampLight;
  const step = Math.max(0, Math.min(ramp.length - 1, Math.floor(length)));
  return ramp[step];
}

/** Selection colour: amber/gold, outside the generator palette's hue band. */
export const selectionColor: Record<SceneColorScheme, string> = {
  light: "#d97706",
  dark: "#fbbf24",
};

/** Neighbours of the selection: a quieter tone of the same amber family. */
export const selectionNeighborColor: Record<SceneColorScheme, string> = {
  light: "#a16207",
  dark: "#fde68a",
};
