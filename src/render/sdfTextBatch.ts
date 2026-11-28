import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
} from "three";
import type { ColorRepresentation } from "three";

export type SdfTextColor =
  | ColorRepresentation
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export interface SdfGlyphRaster {
  character: string;
  width: number;
  height: number;
  alpha: Uint8Array;
  /** Horizontal advance in em units. */
  advance: number;
  /** Left, bottom, right, and top bounds in em units around the baseline. */
  planeBounds: readonly [number, number, number, number];
}

export type SdfGlyphRasterizer = (character: string) => SdfGlyphRaster;

export interface SdfGlyphMetric {
  character: string;
  advance: number;
  planeBounds: readonly [number, number, number, number];
  uvBounds: readonly [number, number, number, number];
  drawable: boolean;
}

export interface SdfGlyphAtlas {
  readonly texture: DataTexture;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly spread: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineHeight: number;
  readonly glyphs: ReadonlyMap<string, SdfGlyphMetric>;
  readonly disposed: boolean;
  dispose(): void;
}

export interface SdfCanvasContext {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetrics;
  getImageData(x: number, y: number, width: number, height: number): ImageData;
}

export interface SdfCanvasSurface {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: { willReadFrequently?: boolean },
  ): SdfCanvasContext | null;
}

export type SdfCanvasFactory = (
  width: number,
  height: number,
) => SdfCanvasSurface;

export interface SdfTextCapability {
  supported: boolean;
  fallback: "sprite-text";
  reason?: string;
}

export interface SdfAtlasOptions {
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize?: number;
  spread?: number;
  threshold?: number;
  maxTextureSize?: number;
  ascender?: number;
  descender?: number;
  lineHeight?: number;
  rasterizeGlyph?: SdfGlyphRasterizer;
  canvasFactory?: SdfCanvasFactory;
}

export interface SdfTextLabel {
  id: string;
  text: string;
  anchor: readonly [number, number, number];
  /** Height of one em in world units. */
  worldHeight: number;
  foreground?: SdfTextColor;
  background?: SdfTextColor;
  border?: SdfTextColor;
  /** Anchor location within the padded label rectangle, like THREE.Sprite.center. */
  center?: readonly [number, number];
  visible?: boolean;
  padding?: number | readonly [number, number];
  borderWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface SdfTextBatchOptions {
  foreground?: SdfTextColor;
  background?: SdfTextColor;
  border?: SdfTextColor;
  padding?: number | readonly [number, number];
  borderWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
  smoothing?: number;
  depthTest?: boolean;
  renderOrder?: number;
  /** Dispose the shared atlas when this batch is disposed. Defaults to false. */
  ownsAtlas?: boolean;
}

export interface SdfTextBatch {
  readonly group: Group;
  readonly glyphMesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly panelMesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly atlas: SdfGlyphAtlas;
  readonly labelCount: number;
  readonly glyphCount: number;
  readonly disposed: boolean;
  setLabelAnchor(
    labelId: string,
    anchor: readonly [number, number, number],
  ): boolean;
  setLabelVisibility(labelId: string, visible: boolean): boolean;
  /** Fractional visibility in [0, 1], e.g. for depth-based fading. */
  setLabelOpacity(labelId: string, opacity: number): boolean;
  /** Uniform screen-facing size multiplier for every label in the batch. */
  setLabelScale(scale: number): void;
  dispose(): void;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GlyphPlacement {
  metric: SdfGlyphMetric;
  left: number;
  bottom: number;
  right: number;
  top: number;
}

interface LabelLayout {
  label: SdfTextLabel;
  glyphs: GlyphPlacement[];
  panel: readonly [number, number, number, number];
  foreground: Rgba;
  background: Rgba;
  border: Rgba;
  borderWidth: number;
  visible: number;
}

interface LabelVertexRanges {
  glyphStart: number;
  glyphCount: number;
  panelStart: number;
  panelCount: number;
  anchor: [number, number, number];
}

const glyphVertexShader = /* glsl */ `
uniform float uLabelScale;
attribute vec2 aOffset;
attribute vec4 aForeground;
attribute float aVisibility;

varying vec2 vUv;
varying vec4 vForeground;
varying float vVisibility;

void main() {
  vec4 viewAnchor = modelViewMatrix * vec4(position, 1.0);
  viewAnchor.xy += aOffset * uLabelScale;
  gl_Position = projectionMatrix * viewAnchor;
  vUv = uv;
  vForeground = aForeground;
  vVisibility = aVisibility;
}
`;

const glyphFragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uSmoothing;

varying vec2 vUv;
varying vec4 vForeground;
varying float vVisibility;

void main() {
  float signedDistance = texture2D(uAtlas, vUv).r;
  float coverage = smoothstep(
    0.5 - uSmoothing,
    0.5 + uSmoothing,
    signedDistance
  );
  float alpha = coverage * vForeground.a * vVisibility;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(vForeground.rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const panelVertexShader = /* glsl */ `
uniform float uLabelScale;
attribute vec2 aOffset;
attribute vec2 aPanelUv;
attribute vec4 aBackground;
attribute vec4 aBorder;
attribute float aBorderWidth;
attribute float aVisibility;

varying vec2 vPanelUv;
varying vec4 vBackground;
varying vec4 vBorder;
varying float vBorderWidth;
varying float vVisibility;

void main() {
  vec4 viewAnchor = modelViewMatrix * vec4(position, 1.0);
  viewAnchor.xy += aOffset * uLabelScale;
  gl_Position = projectionMatrix * viewAnchor;
  vPanelUv = aPanelUv;
  vBackground = aBackground;
  vBorder = aBorder;
  vBorderWidth = aBorderWidth;
  vVisibility = aVisibility;
}
`;

const panelFragmentShader = /* glsl */ `
uniform float uBorderFeather;

varying vec2 vPanelUv;
varying vec4 vBackground;
varying vec4 vBorder;
varying float vBorderWidth;
varying float vVisibility;

void main() {
  float edgeDistance = min(
    min(vPanelUv.x, 1.0 - vPanelUv.x),
    min(vPanelUv.y, 1.0 - vPanelUv.y)
  );
  float borderMix = 1.0 - smoothstep(
    vBorderWidth,
    vBorderWidth + uBorderFeather,
    edgeDistance
  );
  vec4 color = mix(vBackground, vBorder, borderMix);
  color.a *= vVisibility;
  if (color.a <= 0.001) discard;
  gl_FragColor = color;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const defaultForeground = [1, 1, 1, 1] as const;
const defaultBackground = [0.035, 0.055, 0.085, 0.82] as const;
const defaultBorder = [0.7, 0.78, 0.88, 0.72] as const;

/**
 * Reports whether this runtime can rasterize a shared glyph atlas. Callers can
 * retain their sprite-label path when browser canvas support is unavailable.
 */
export function checkSdfTextCapability(
  options: Pick<SdfAtlasOptions, "canvasFactory"> = {},
): SdfTextCapability {
  const canvasFactory = options.canvasFactory ?? defaultCanvasFactory();
  if (!canvasFactory) {
    return {
      supported: false,
      fallback: "sprite-text",
      reason: "This runtime has no browser or offscreen 2D canvas.",
    };
  }

  try {
    const context = canvasFactory(2, 2).getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      return {
        supported: false,
        fallback: "sprite-text",
        reason: "A 2D canvas exists but no 2D context is available.",
      };
    }
    context.getImageData(0, 0, 1, 1);
    return { supported: true, fallback: "sprite-text" };
  } catch (error) {
    return {
      supported: false,
      fallback: "sprite-text",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Builds one single-channel SDF texture for all supplied Unicode code points.
 * A custom rasterizer keeps atlas generation deterministic in non-canvas tests.
 */
export function buildSdfGlyphAtlas(
  characters: Iterable<string>,
  options: SdfAtlasOptions = {},
): SdfGlyphAtlas {
  const fontSize = positiveFinite(options.fontSize ?? 48, "fontSize");
  const spread = positiveInteger(options.spread ?? 8, "spread");
  const threshold = finiteInRange(options.threshold ?? 0.5, 0, 1, "threshold");
  const maxTextureSize = positiveInteger(
    options.maxTextureSize ?? 4096,
    "maxTextureSize",
  );
  const rasterizeGlyph =
    options.rasterizeGlyph ?? createCanvasRasterizer(options, fontSize, spread);
  const uniqueCharacters = collectCharacters(characters);
  const rasters = uniqueCharacters.map((character) => {
    const raster = rasterizeGlyph(character);
    validateRaster(raster, character);
    return raster;
  });

  if (rasters.length === 0) {
    const data = new Uint8Array([0]);
    return createAtlasResult(data, 1, 1, spread, new Map(), options);
  }

  const cellWidth = Math.max(...rasters.map((raster) => raster.width));
  const cellHeight = Math.max(...rasters.map((raster) => raster.height));
  const desiredColumns = Math.max(1, Math.ceil(Math.sqrt(rasters.length)));
  const width = nextPowerOfTwo(Math.max(cellWidth, desiredColumns * cellWidth));
  const columns = Math.max(
    1,
    Math.floor(Math.min(width, maxTextureSize) / cellWidth),
  );
  const rows = Math.ceil(rasters.length / columns);
  const atlasWidth = Math.min(width, maxTextureSize);
  const atlasHeight = nextPowerOfTwo(rows * cellHeight);
  if (cellWidth > maxTextureSize || atlasHeight > maxTextureSize) {
    throw new Error(
      `SDF glyph atlas requires ${atlasWidth}x${atlasHeight} pixels, exceeding the ${maxTextureSize}px limit.`,
    );
  }

  const data = new Uint8Array(atlasWidth * atlasHeight);
  const glyphs = new Map<string, SdfGlyphMetric>();
  rasters.forEach((raster, index) => {
    const cellX = (index % columns) * cellWidth;
    const cellY = Math.floor(index / columns) * cellHeight;
    const sdf = generateSignedDistanceField(
      raster.alpha,
      raster.width,
      raster.height,
      spread,
      threshold,
    );

    // Texture v=0 addresses the first data row. Canvas rows run top to bottom,
    // so atlas insertion is flipped once and label quads keep normal UVs.
    for (let sourceY = 0; sourceY < raster.height; sourceY += 1) {
      const targetY = cellY + (raster.height - sourceY - 1);
      data.set(
        sdf.subarray(sourceY * raster.width, (sourceY + 1) * raster.width),
        targetY * atlasWidth + cellX,
      );
    }

    glyphs.set(raster.character, {
      character: raster.character,
      advance: raster.advance,
      planeBounds: raster.planeBounds,
      uvBounds: [
        cellX / atlasWidth,
        cellY / atlasHeight,
        (cellX + raster.width) / atlasWidth,
        (cellY + raster.height) / atlasHeight,
      ],
      drawable: raster.alpha.some((alpha) => alpha > 0),
    });
  });

  return createAtlasResult(
    data,
    atlasWidth,
    atlasHeight,
    spread,
    glyphs,
    options,
  );
}

/**
 * Converts an alpha mask to an 8-bit signed distance field. The transform is
 * linear in pixel count; atlas generation must not become quadratic in glyph
 * area when a large alphabet is loaded.
 */
export function generateSignedDistanceField(
  alpha: Uint8Array,
  width: number,
  height: number,
  spread: number,
  threshold = 0.5,
): Uint8Array {
  positiveInteger(width, "width");
  positiveInteger(height, "height");
  positiveFinite(spread, "spread");
  finiteInRange(threshold, 0, 1, "threshold");
  if (alpha.length !== width * height) {
    throw new Error(
      `Alpha mask has ${alpha.length} values; expected ${width * height}.`,
    );
  }

  const cutoff = threshold * 255;
  const inside = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    inside[index] = alpha[index] >= cutoff ? 1 : 0;
  }
  const distanceToInside = squaredEuclideanDistance(inside, width, height, 1);
  const distanceToOutside = squaredEuclideanDistance(inside, width, height, 0);
  const output = new Uint8Array(alpha.length);
  for (let index = 0; index < output.length; index += 1) {
    const signedDistance =
      Math.sqrt(distanceToOutside[index]) - Math.sqrt(distanceToInside[index]);
    const encoded = 0.5 + signedDistance / (2 * spread);
    output[index] = Math.round(255 * Math.min(1, Math.max(0, encoded)));
  }
  return output;
}

/**
 * Creates two draw batches: one for all panels and one for all glyphs. Anchors
 * and visibility remain mutable BufferAttributes, while glyph UV/layout data
 * stays immutable for the lifetime of the batch.
 */
export function createSdfTextBatch(
  atlas: SdfGlyphAtlas,
  labels: readonly SdfTextLabel[],
  options: SdfTextBatchOptions = {},
): SdfTextBatch {
  if (atlas.disposed) {
    throw new Error("Cannot build an SDF text batch from a disposed atlas.");
  }
  const duplicateIds = duplicateLabelIds(labels);
  if (duplicateIds.length > 0) {
    throw new Error(
      `SDF text label ids must be unique: ${duplicateIds.join(", ")}.`,
    );
  }

  const layouts = labels.map((label) => layoutLabel(atlas, label, options));
  const glyphCount = layouts.reduce(
    (sum, layout) => sum + layout.glyphs.length,
    0,
  );
  const glyphGeometry = createGlyphGeometry(glyphCount);
  const panelGeometry = createPanelGeometry(layouts.length);
  const ranges = new Map<string, LabelVertexRanges>();

  let glyphQuad = 0;
  layouts.forEach((layout, labelIndex) => {
    const glyphStart = glyphQuad * 4;
    for (const glyph of layout.glyphs) {
      writeGlyphQuad(glyphGeometry, glyphQuad, layout, glyph);
      glyphQuad += 1;
    }
    const panelStart = labelIndex * 4;
    writePanelQuad(panelGeometry, labelIndex, layout);
    ranges.set(layout.label.id, {
      glyphStart,
      glyphCount: glyphQuad * 4 - glyphStart,
      panelStart,
      panelCount: 4,
      anchor: [...layout.label.anchor],
    });
  });

  glyphGeometry.computeBoundingSphere();
  panelGeometry.computeBoundingSphere();
  const depthTest = options.depthTest ?? false;
  // One uniform object shared by both materials: scaling the camera-facing
  // offsets resizes every label without rebuilding geometry.
  const labelScale = { value: 1 };
  const glyphMaterial = new ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas.texture },
      uSmoothing: {
        value: positiveFinite(options.smoothing ?? 0.075, "smoothing"),
      },
      uLabelScale: labelScale,
    },
    vertexShader: glyphVertexShader,
    fragmentShader: glyphFragmentShader,
    transparent: true,
    depthTest,
    depthWrite: false,
    side: DoubleSide,
  });
  const panelMaterial = new ShaderMaterial({
    uniforms: {
      uBorderFeather: { value: 0.0125 },
      uLabelScale: labelScale,
    },
    vertexShader: panelVertexShader,
    fragmentShader: panelFragmentShader,
    transparent: true,
    depthTest,
    depthWrite: false,
    side: DoubleSide,
  });
  const panelMesh = new Mesh(panelGeometry, panelMaterial);
  const glyphMesh = new Mesh(glyphGeometry, glyphMaterial);
  const renderOrder = options.renderOrder ?? 10_000;
  panelMesh.renderOrder = renderOrder;
  glyphMesh.renderOrder = renderOrder + 1;
  // Vertex positions are anchors; camera-facing offsets live in the shader and
  // cannot be represented by a stable CPU-side bounding volume.
  panelMesh.frustumCulled = false;
  glyphMesh.frustumCulled = false;
  panelMesh.name = "sdf-label-panels";
  glyphMesh.name = "sdf-label-glyphs";

  const group = new Group();
  group.name = "sdf-text-batch";
  group.add(panelMesh, glyphMesh);
  let disposed = false;

  return {
    group,
    glyphMesh,
    panelMesh,
    atlas,
    labelCount: labels.length,
    glyphCount,
    get disposed() {
      return disposed;
    },
    setLabelAnchor(labelId, anchor) {
      const range = ranges.get(labelId);
      if (!range || disposed) return false;
      validateAnchor(anchor);
      writeAnchorRange(
        glyphGeometry,
        range.glyphStart,
        range.glyphCount,
        anchor,
        true,
      );
      writeAnchorRange(
        panelGeometry,
        range.panelStart,
        range.panelCount,
        anchor,
        true,
      );
      range.anchor = [...anchor];
      return true;
    },
    setLabelScale(scale) {
      labelScale.value = positiveFinite(scale, "label scale");
    },
    setLabelVisibility(labelId, visible) {
      const range = ranges.get(labelId);
      if (!range || disposed) return false;
      writeScalarRange(
        glyphGeometry,
        "aVisibility",
        range.glyphStart,
        range.glyphCount,
        visible ? 1 : 0,
        true,
      );
      writeScalarRange(
        panelGeometry,
        "aVisibility",
        range.panelStart,
        range.panelCount,
        visible ? 1 : 0,
        true,
      );
      return true;
    },
    setLabelOpacity(labelId, opacity) {
      const range = ranges.get(labelId);
      if (!range || disposed) return false;
      // aVisibility multiplies both glyph and panel alpha in the shaders, so a
      // fractional value fades the whole chip.
      const value = Number.isFinite(opacity)
        ? Math.min(1, Math.max(0, opacity))
        : 1;
      writeScalarRange(
        glyphGeometry,
        "aVisibility",
        range.glyphStart,
        range.glyphCount,
        value,
        true,
      );
      writeScalarRange(
        panelGeometry,
        "aVisibility",
        range.panelStart,
        range.panelCount,
        value,
        true,
      );
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      glyphGeometry.dispose();
      panelGeometry.dispose();
      glyphMaterial.dispose();
      panelMaterial.dispose();
      if (options.ownsAtlas) atlas.dispose();
      ranges.clear();
    },
  };
}

function createAtlasResult(
  data: Uint8Array,
  width: number,
  height: number,
  spread: number,
  glyphs: Map<string, SdfGlyphMetric>,
  options: SdfAtlasOptions,
): SdfGlyphAtlas {
  const texture = new DataTexture(
    data,
    width,
    height,
    RedFormat,
    UnsignedByteType,
  );
  texture.name = "sdf-glyph-atlas";
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  let disposed = false;
  return {
    texture,
    data,
    width,
    height,
    spread,
    ascender: options.ascender ?? 0.8,
    descender: options.descender ?? -0.2,
    lineHeight: positiveFinite(options.lineHeight ?? 1.2, "lineHeight"),
    glyphs,
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    },
  };
}

function createCanvasRasterizer(
  options: SdfAtlasOptions,
  fontSize: number,
  spread: number,
): SdfGlyphRasterizer {
  const capability = checkSdfTextCapability(options);
  if (!capability.supported) {
    throw new Error(
      `Cannot build an SDF glyph atlas: ${capability.reason ?? "canvas rasterization is unavailable"}`,
    );
  }
  const canvasFactory = options.canvasFactory ?? defaultCanvasFactory();
  if (!canvasFactory) {
    throw new Error(
      "Cannot build an SDF glyph atlas without a canvas factory.",
    );
  }
  const font = `${options.fontWeight ?? 600} ${fontSize}px ${options.fontFamily ?? "system-ui, sans-serif"}`;
  const padding = spread + 2;

  return (character) => {
    const measurementContext = require2dContext(canvasFactory(2, 2));
    measurementContext.font = font;
    const measurement = measurementContext.measureText(character);
    const left = finiteMetric(measurement.actualBoundingBoxLeft, 0);
    const right = finiteMetric(
      measurement.actualBoundingBoxRight,
      measurement.width,
    );
    const ascent = finiteMetric(
      measurement.actualBoundingBoxAscent,
      fontSize * 0.8,
    );
    const descent = finiteMetric(
      measurement.actualBoundingBoxDescent,
      fontSize * 0.2,
    );
    const width = Math.max(1, Math.ceil(left + right) + padding * 2);
    const height = Math.max(1, Math.ceil(ascent + descent) + padding * 2);
    const canvas = canvasFactory(width, height);
    const context = require2dContext(canvas);
    context.clearRect(0, 0, width, height);
    context.font = font;
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(character, padding + left, padding + ascent);
    const rgba = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let index = 0; index < alpha.length; index += 1) {
      alpha[index] = rgba[index * 4 + 3];
    }
    return {
      character,
      width,
      height,
      alpha,
      advance: measurement.width / fontSize,
      planeBounds: [
        -left / fontSize - padding / fontSize,
        -descent / fontSize - padding / fontSize,
        right / fontSize + padding / fontSize,
        ascent / fontSize + padding / fontSize,
      ],
    };
  };
}

function defaultCanvasFactory(): SdfCanvasFactory | undefined {
  if (typeof document !== "undefined" && document.createElement) {
    return (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as SdfCanvasSurface;
    };
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return (width, height) =>
      new OffscreenCanvas(width, height) as unknown as SdfCanvasSurface;
  }
  return undefined;
}

function require2dContext(canvas: SdfCanvasSurface): SdfCanvasContext {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("A 2D canvas context is required for SDF text.");
  return context;
}

function collectCharacters(values: Iterable<string>): string[] {
  const characters = new Set<string>();
  for (const value of values) {
    for (const character of Array.from(value)) {
      if (character !== "\n" && character !== "\r") characters.add(character);
    }
  }
  return [...characters].sort(compareCodePoints);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const count = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < count; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function validateRaster(raster: SdfGlyphRaster, character: string): void {
  if (raster.character !== character) {
    throw new Error(
      `Rasterizer returned ${JSON.stringify(raster.character)} for ${JSON.stringify(character)}.`,
    );
  }
  positiveInteger(raster.width, `${character} raster width`);
  positiveInteger(raster.height, `${character} raster height`);
  if (raster.alpha.length !== raster.width * raster.height) {
    throw new Error(
      `${character} raster has ${raster.alpha.length} alpha values; expected ${raster.width * raster.height}.`,
    );
  }
  positiveOrZeroFinite(raster.advance, `${character} advance`);
  raster.planeBounds.forEach((value, index) =>
    finite(value, `${character} planeBounds[${index}]`),
  );
}

function squaredEuclideanDistance(
  mask: Uint8Array,
  width: number,
  height: number,
  target: number,
): Float64Array {
  const infinity = 1e20;
  const temporary = new Float64Array(mask.length);
  const output = new Float64Array(mask.length);
  const maxLength = Math.max(width, height);
  const source = new Float64Array(maxLength);
  const distance = new Float64Array(maxLength);
  const locations = new Int32Array(maxLength);
  const boundaries = new Float64Array(maxLength + 1);

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      source[y] = mask[y * width + x] === target ? 0 : infinity;
    }
    distanceTransform1d(source, height, distance, locations, boundaries);
    for (let y = 0; y < height; y += 1) {
      temporary[y * width + x] = distance[y];
    }
  }
  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) source[x] = temporary[offset + x];
    distanceTransform1d(source, width, distance, locations, boundaries);
    for (let x = 0; x < width; x += 1) output[offset + x] = distance[x];
  }
  return output;
}

// Felzenszwalb-Huttenlocher's lower-envelope transform computes exact squared
// Euclidean distances without scanning every source pixel for every target.
function distanceTransform1d(
  source: Float64Array,
  length: number,
  output: Float64Array,
  locations: Int32Array,
  boundaries: Float64Array,
): void {
  let envelope = 0;
  locations[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;
  for (let point = 1; point < length; point += 1) {
    let intersection = parabolaIntersection(source, point, locations[envelope]);
    while (intersection <= boundaries[envelope] && envelope > 0) {
      envelope -= 1;
      intersection = parabolaIntersection(source, point, locations[envelope]);
    }
    envelope += 1;
    locations[envelope] = point;
    boundaries[envelope] = intersection;
    boundaries[envelope + 1] = Number.POSITIVE_INFINITY;
  }
  envelope = 0;
  for (let point = 0; point < length; point += 1) {
    while (boundaries[envelope + 1] < point) envelope += 1;
    const difference = point - locations[envelope];
    output[point] = difference * difference + source[locations[envelope]];
  }
}

function parabolaIntersection(
  source: Float64Array,
  left: number,
  right: number,
): number {
  return (
    (source[left] + left * left - source[right] - right * right) /
    (2 * left - 2 * right)
  );
}

function layoutLabel(
  atlas: SdfGlyphAtlas,
  label: SdfTextLabel,
  options: SdfTextBatchOptions,
): LabelLayout {
  validateAnchor(label.anchor);
  const worldHeight = positiveFinite(
    label.worldHeight,
    `${label.id} worldHeight`,
  );
  const center = label.center ?? [0.5, 0.5];
  finite(center[0], `${label.id} center[0]`);
  finite(center[1], `${label.id} center[1]`);
  const lineHeight = positiveFinite(
    label.lineHeight ?? options.lineHeight ?? atlas.lineHeight,
    `${label.id} lineHeight`,
  );
  const letterSpacing = finite(
    label.letterSpacing ?? options.letterSpacing ?? 0,
    `${label.id} letterSpacing`,
  );
  const padding = normalizePadding(
    label.padding ?? options.padding ?? [0.18, 0.1],
  );
  const glyphs: GlyphPlacement[] = [];
  const lines = label.text.replace(/\r\n?/g, "\n").split("\n");
  let minX = 0;
  let maxX = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  lines.forEach((line, lineIndex) => {
    const characters = Array.from(line);
    const baseline = (lines.length - lineIndex - 1) * lineHeight;
    let penX = 0;
    characters.forEach((character, characterIndex) => {
      const metric = atlas.glyphs.get(character);
      if (!metric) {
        throw new Error(
          `SDF atlas does not contain ${JSON.stringify(character)} required by label ${JSON.stringify(label.id)}.`,
        );
      }
      const [left, bottom, right, top] = metric.planeBounds;
      if (metric.drawable) {
        glyphs.push({
          metric,
          left: penX + left,
          bottom: baseline + bottom,
          right: penX + right,
          top: baseline + top,
        });
      }
      minX = Math.min(minX, penX + left);
      maxX = Math.max(maxX, penX + right);
      minY = Math.min(minY, baseline + bottom);
      maxY = Math.max(maxY, baseline + top);
      penX += metric.advance;
      if (characterIndex < characters.length - 1) penX += letterSpacing;
    });
    minX = Math.min(minX, 0);
    maxX = Math.max(maxX, penX);
    minY = Math.min(minY, baseline + atlas.descender);
    maxY = Math.max(maxY, baseline + atlas.ascender);
  });

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = atlas.descender;
    maxY = atlas.ascender;
  }
  const panelLeft = minX - padding[0];
  const panelRight = maxX + padding[0];
  const panelBottom = minY - padding[1];
  const panelTop = maxY + padding[1];
  const centerX = panelLeft + (panelRight - panelLeft) * center[0];
  const centerY = panelBottom + (panelTop - panelBottom) * center[1];
  const scalePlacement = (placement: GlyphPlacement): GlyphPlacement => ({
    metric: placement.metric,
    left: (placement.left - centerX) * worldHeight,
    bottom: (placement.bottom - centerY) * worldHeight,
    right: (placement.right - centerX) * worldHeight,
    top: (placement.top - centerY) * worldHeight,
  });

  return {
    label,
    glyphs: glyphs.map(scalePlacement),
    panel: [
      (panelLeft - centerX) * worldHeight,
      (panelBottom - centerY) * worldHeight,
      (panelRight - centerX) * worldHeight,
      (panelTop - centerY) * worldHeight,
    ],
    foreground: resolveColor(
      label.foreground ?? options.foreground,
      defaultForeground,
    ),
    background: resolveColor(
      label.background ?? options.background,
      defaultBackground,
    ),
    border: resolveColor(label.border ?? options.border, defaultBorder),
    borderWidth: finiteInRange(
      label.borderWidth ?? options.borderWidth ?? 0.045,
      0,
      0.5,
      `${label.id} borderWidth`,
    ),
    visible: label.visible === false ? 0 : 1,
  };
}

function createGlyphGeometry(quadCount: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = quadCount * 4;
  geometry.setAttribute(
    "position",
    dynamicAttribute(new Float32Array(vertexCount * 3), 3),
  );
  geometry.setAttribute(
    "aOffset",
    new Float32BufferAttribute(vertexCount * 2, 2),
  );
  geometry.setAttribute("uv", new Float32BufferAttribute(vertexCount * 2, 2));
  geometry.setAttribute(
    "aForeground",
    new Float32BufferAttribute(vertexCount * 4, 4),
  );
  geometry.setAttribute(
    "aVisibility",
    dynamicAttribute(new Float32Array(vertexCount), 1),
  );
  geometry.setIndex(new BufferAttribute(createQuadIndices(quadCount), 1));
  return geometry;
}

function createPanelGeometry(quadCount: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = quadCount * 4;
  geometry.setAttribute(
    "position",
    dynamicAttribute(new Float32Array(vertexCount * 3), 3),
  );
  geometry.setAttribute(
    "aOffset",
    new Float32BufferAttribute(vertexCount * 2, 2),
  );
  geometry.setAttribute(
    "aPanelUv",
    new Float32BufferAttribute(vertexCount * 2, 2),
  );
  geometry.setAttribute(
    "aBackground",
    new Float32BufferAttribute(vertexCount * 4, 4),
  );
  geometry.setAttribute(
    "aBorder",
    new Float32BufferAttribute(vertexCount * 4, 4),
  );
  geometry.setAttribute(
    "aBorderWidth",
    new Float32BufferAttribute(vertexCount, 1),
  );
  geometry.setAttribute(
    "aVisibility",
    dynamicAttribute(new Float32Array(vertexCount), 1),
  );
  geometry.setIndex(new BufferAttribute(createQuadIndices(quadCount), 1));
  return geometry;
}

function dynamicAttribute(array: Float32Array, itemSize: number) {
  const attribute = new Float32BufferAttribute(array, itemSize);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

function createQuadIndices(quadCount: number): Uint16Array | Uint32Array {
  const IndexArray = quadCount * 4 > 65_535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(quadCount * 6);
  for (let quad = 0; quad < quadCount; quad += 1) {
    const vertex = quad * 4;
    const index = quad * 6;
    indices.set(
      [vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3],
      index,
    );
  }
  return indices;
}

function writeGlyphQuad(
  geometry: BufferGeometry,
  quad: number,
  layout: LabelLayout,
  glyph: GlyphPlacement,
): void {
  const vertex = quad * 4;
  writeAnchorRange(geometry, vertex, 4, layout.label.anchor);
  writeVec2Quad(
    geometry,
    "aOffset",
    vertex,
    glyph.left,
    glyph.bottom,
    glyph.right,
    glyph.top,
  );
  const [u0, v0, u1, v1] = glyph.metric.uvBounds;
  writeVec2Quad(geometry, "uv", vertex, u0, v0, u1, v1);
  writeColorRange(geometry, "aForeground", vertex, 4, layout.foreground);
  writeScalarRange(geometry, "aVisibility", vertex, 4, layout.visible);
}

function writePanelQuad(
  geometry: BufferGeometry,
  quad: number,
  layout: LabelLayout,
): void {
  const vertex = quad * 4;
  writeAnchorRange(geometry, vertex, 4, layout.label.anchor);
  writeVec2Quad(geometry, "aOffset", vertex, ...layout.panel);
  writeVec2Quad(geometry, "aPanelUv", vertex, 0, 0, 1, 1);
  writeColorRange(geometry, "aBackground", vertex, 4, layout.background);
  writeColorRange(geometry, "aBorder", vertex, 4, layout.border);
  writeScalarRange(geometry, "aBorderWidth", vertex, 4, layout.borderWidth);
  writeScalarRange(geometry, "aVisibility", vertex, 4, layout.visible);
}

function writeAnchorRange(
  geometry: BufferGeometry,
  start: number,
  count: number,
  anchor: readonly [number, number, number],
  markUpdate = false,
): void {
  const attribute = geometry.getAttribute("position") as BufferAttribute;
  for (let vertex = start; vertex < start + count; vertex += 1) {
    attribute.setXYZ(vertex, anchor[0], anchor[1], anchor[2]);
  }
  if (markUpdate) markAttributeRange(attribute, start, count);
}

function writeVec2Quad(
  geometry: BufferGeometry,
  attributeName: string,
  start: number,
  left: number,
  bottom: number,
  right: number,
  top: number,
): void {
  const attribute = geometry.getAttribute(attributeName);
  attribute.setXY(start, left, bottom);
  attribute.setXY(start + 1, right, bottom);
  attribute.setXY(start + 2, right, top);
  attribute.setXY(start + 3, left, top);
}

function writeColorRange(
  geometry: BufferGeometry,
  attributeName: string,
  start: number,
  count: number,
  color: Rgba,
): void {
  const attribute = geometry.getAttribute(attributeName);
  for (let vertex = start; vertex < start + count; vertex += 1) {
    attribute.setXYZW(vertex, color.r, color.g, color.b, color.a);
  }
}

function writeScalarRange(
  geometry: BufferGeometry,
  attributeName: string,
  start: number,
  count: number,
  value: number,
  markUpdate = false,
): void {
  const attribute = geometry.getAttribute(attributeName) as BufferAttribute;
  for (let vertex = start; vertex < start + count; vertex += 1) {
    attribute.setX(vertex, value);
  }
  if (markUpdate) markAttributeRange(attribute, start, count);
}

function markAttributeRange(
  attribute: BufferAttribute,
  start: number,
  count: number,
): void {
  attribute.addUpdateRange(
    start * attribute.itemSize,
    count * attribute.itemSize,
  );
  attribute.needsUpdate = true;
}

function resolveColor(
  value: SdfTextColor | undefined,
  fallback: readonly [number, number, number, number],
): Rgba {
  if (Array.isArray(value)) {
    const values = value as readonly number[];
    if (values.length !== 3 && values.length !== 4) {
      throw new Error("SDF text colors must contain three or four components.");
    }
    values.forEach((component, index) =>
      finiteInRange(component, 0, 1, `color[${index}]`),
    );
    return { r: values[0], g: values[1], b: values[2], a: values[3] ?? 1 };
  }
  if (value !== undefined) {
    const color = new Color(value as ColorRepresentation);
    return { r: color.r, g: color.g, b: color.b, a: 1 };
  }
  return { r: fallback[0], g: fallback[1], b: fallback[2], a: fallback[3] };
}

function normalizePadding(
  value: number | readonly [number, number],
): readonly [number, number] {
  const pair = typeof value === "number" ? [value, value] : value;
  return [
    positiveOrZeroFinite(pair[0], "padding[0]"),
    positiveOrZeroFinite(pair[1], "padding[1]"),
  ];
}

function duplicateLabelIds(labels: readonly SdfTextLabel[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (seen.has(label.id)) duplicates.add(label.id);
    seen.add(label.id);
  }
  return [...duplicates].sort();
}

function validateAnchor(anchor: readonly [number, number, number]): void {
  if (anchor.length !== 3)
    throw new Error("Label anchors require three coordinates.");
  anchor.forEach((value, index) => finite(value, `anchor[${index}]`));
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
}

function positiveFinite(value: number, name: string): number {
  finite(value, name);
  if (value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
}

function positiveOrZeroFinite(value: number, name: string): number {
  finite(value, name);
  if (value < 0) throw new Error(`${name} must not be negative.`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function finiteInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  finite(value, name);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function finiteMetric(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}
