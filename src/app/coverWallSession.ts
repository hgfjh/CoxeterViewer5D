import { parseQuotientComplex, type QuotientComplex } from "../quotient";
import type { HyperbolicProjection } from "../types";
import type { TopLevelModelId } from "./orientation";
import {
  parseBarXRelationFamilyId,
  type BarXRelationFamilyId,
} from "./barXRelationFamilies";

export type CoverWallUiMode = "teaching" | "research";
export type CoverWallColorScheme = "light" | "dark";

export const COVER_WALL_MODEL_ORDER: TopLevelModelId[] = [
  "davis",
  "hat-x",
  "bar-x",
  "gamma",
  "projection",
];

export interface CoverWallViewSession {
  schemaVersion: 1;
  sessionKind: "coxeter-cover-wall-session";
  appVersion: "0.2.0";
  updatedAt: string;
  exampleId: string;
  sourceCover?: QuotientComplex;
  view: {
    model: TopLevelModelId;
    barRelationFamily: BarXRelationFamilyId;
    radius: number;
    projection: HyperbolicProjection;
    selectedNodeId?: string;
    selectedCellId?: string;
    selectedWallId?: string;
    wallSigns: Record<string, 1 | -1>;
    showCells: boolean;
    showWalls: boolean;
    wallDisplayMode: "all" | "selected";
    showInducedDirections: boolean;
    colorEdgesByWall: boolean;
    showDiscardedCells: boolean;
    showNodeLabels: boolean;
    showEdgeLabels: boolean;
    linkLens: "none" | "ascending" | "descending";
    uiMode: CoverWallUiMode;
    colorScheme: CoverWallColorScheme;
  };
}

/** Parse view state without trusting the finite action embedded in the file. */
export function parseCoverWallViewSession(
  contents: string,
): CoverWallViewSession {
  const input = JSON.parse(contents) as unknown;
  if (!input || typeof input !== "object") {
    throw new Error("Session JSON must contain an object.");
  }
  const record = input as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.sessionKind !== "coxeter-cover-wall-session"
  ) {
    throw new Error(
      'Expected a schemaVersion 1 "coxeter-cover-wall-session" file.',
    );
  }
  if (typeof record.exampleId !== "string") {
    throw new Error("Session exampleId must be a string.");
  }
  const rawView = record.view;
  if (!rawView || typeof rawView !== "object") {
    throw new Error("Session view must be an object.");
  }
  const view = rawView as Record<string, unknown>;
  if (!COVER_WALL_MODEL_ORDER.includes(view.model as TopLevelModelId)) {
    throw new Error(`Unknown session model: ${String(view.model)}.`);
  }
  const projectionOptions: HyperbolicProjection[] = [
    "poincare-axes",
    "poincare-pca",
    "klein-axes",
    "klein-pca",
  ];
  if (!projectionOptions.includes(view.projection as HyperbolicProjection)) {
    throw new Error(`Unknown session projection: ${String(view.projection)}.`);
  }
  if (
    !Number.isInteger(view.radius) ||
    Number(view.radius) < 1 ||
    Number(view.radius) > 8
  ) {
    throw new Error("Session radius must be an integer from 1 through 8.");
  }
  const rawSigns = view.wallSigns;
  if (!rawSigns || typeof rawSigns !== "object") {
    throw new Error("Session wallSigns must be an object.");
  }
  const wallSigns: Record<string, 1 | -1> = {};
  for (const [wallId, sign] of Object.entries(rawSigns)) {
    if (sign !== 1 && sign !== -1) {
      throw new Error(`Session wall sign for ${wallId} must be +1 or -1.`);
    }
    wallSigns[wallId] = sign;
  }
  const booleanField = (field: string): boolean => {
    if (typeof view[field] !== "boolean") {
      throw new Error(`Session view.${field} must be boolean.`);
    }
    return view[field];
  };
  const optionalBooleanField = (field: string, fallback: boolean): boolean => {
    if (view[field] === undefined) return fallback;
    return booleanField(field);
  };
  const optionalString = (field: string): string | undefined => {
    const value = view[field];
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw new Error(`Session view.${field} must be a string when present.`);
    }
    return value;
  };
  const linkLens = view.linkLens;
  if (
    linkLens !== "none" &&
    linkLens !== "ascending" &&
    linkLens !== "descending"
  ) {
    throw new Error("Session linkLens is invalid.");
  }
  const uiMode = view.uiMode;
  if (uiMode !== "teaching" && uiMode !== "research") {
    throw new Error("Session uiMode is invalid.");
  }
  const colorScheme = view.colorScheme;
  if (colorScheme !== "light" && colorScheme !== "dark") {
    throw new Error("Session colorScheme is invalid.");
  }
  const wallDisplayMode = view.wallDisplayMode ?? "all";
  if (wallDisplayMode !== "all" && wallDisplayMode !== "selected") {
    throw new Error("Session wallDisplayMode is invalid.");
  }
  const barRelationFamily = view.barRelationFamily ?? "shared-complex";
  if (
    typeof barRelationFamily !== "string" ||
    (barRelationFamily !== "all" &&
      barRelationFamily !== "shared-complex" &&
      parseBarXRelationFamilyId(barRelationFamily) === undefined)
  ) {
    throw new Error("Session barRelationFamily is invalid.");
  }

  // parseQuotientComplex rechecks ids, actions, cells, and certificate-shaped
  // metadata. The saved session is a transport envelope, not a trust boundary.
  const sourceCover =
    record.sourceCover === undefined
      ? undefined
      : parseQuotientComplex(record.sourceCover);

  return {
    schemaVersion: 1,
    sessionKind: "coxeter-cover-wall-session",
    appVersion: "0.2.0",
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : "1970-01-01T00:00:00.000Z",
    exampleId: record.exampleId,
    sourceCover,
    view: {
      model: view.model as TopLevelModelId,
      barRelationFamily: barRelationFamily as BarXRelationFamilyId,
      radius: Number(view.radius),
      projection: view.projection as HyperbolicProjection,
      selectedNodeId: optionalString("selectedNodeId"),
      selectedCellId: optionalString("selectedCellId"),
      selectedWallId: optionalString("selectedWallId"),
      wallSigns,
      showCells: booleanField("showCells"),
      showWalls: booleanField("showWalls"),
      wallDisplayMode,
      showInducedDirections: optionalBooleanField(
        "showInducedDirections",
        true,
      ),
      colorEdgesByWall: optionalBooleanField("colorEdgesByWall", true),
      showDiscardedCells: booleanField("showDiscardedCells"),
      showNodeLabels: booleanField("showNodeLabels"),
      showEdgeLabels: booleanField("showEdgeLabels"),
      linkLens,
      uiMode,
      colorScheme,
    },
  };
}
