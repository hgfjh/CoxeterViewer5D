import type { DataStatus, SourceRef } from "../types";
import rawCatalogue from "./tumarkin_5d_8facet_catalogue.json";

export type EightFacetRenderStatus = "renderable-example";

export type EightFacetCertificationStatus =
  | "blocked-pending-transcription"
  | "certified";

export interface EightFacetCatalogueEntry {
  id: string;
  label: string;
  dimension: 5;
  facets: 8;
  galeDiagram: "G11411";
  table: "4.10";
  tableIndex: number;
  dataStatus: DataStatus;
  renderStatus: EightFacetRenderStatus;
  renderable: boolean;
  exampleFile?: string;
  representative: boolean;
  certificationStatus: EightFacetCertificationStatus;
  sourceRefId: string;
  sourceLocator: string;
  notes: string[];
  requiredForCertification: string[];
}

interface EightFacetCatalogueFile {
  schemaVersion: 1;
  kind: "compact-5d-eight-facet-catalogue";
  name: string;
  description: string;
  sourceRef: SourceRef;
  entries: EightFacetCatalogueEntry[];
}

export type EightFacetCatalogueFilter = "all" | "representative" | "blocked";

const catalogue = rawCatalogue as EightFacetCatalogueFile;

export const tumarkinEightFacetSourceRef = catalogue.sourceRef;

/**
 * Tumarkin Table 4.10 is kept as a searchable catalogue so the main example
 * picker does not become a wall of 15 similar compact cases. Each entry points
 * at a bundled CoxeterSystemInput generated from the source-vector EPS
 * transcription and checked by the Tumarkin eight-facet certifier.
 */
export const tumarkinEightFacetCatalogue = catalogue.entries;

export function representativeTumarkinEightFacetEntries() {
  return tumarkinEightFacetCatalogue.filter((entry) => entry.representative);
}

export function filterTumarkinEightFacetCatalogue(input: {
  query: string;
  filter: EightFacetCatalogueFilter;
}): EightFacetCatalogueEntry[] {
  const query = input.query.trim().toLocaleLowerCase();
  return tumarkinEightFacetCatalogue.filter((entry) => {
    if (input.filter === "representative" && !entry.representative) {
      return false;
    }
    if (
      input.filter === "blocked" &&
      entry.certificationStatus !== "blocked-pending-transcription"
    ) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }
    const searchable = [
      entry.id,
      entry.label,
      entry.galeDiagram,
      entry.table,
      entry.tableIndex.toString().padStart(2, "0"),
      entry.sourceLocator,
      entry.certificationStatus,
      entry.renderStatus,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export function countCertificationBlockedEntries(): number {
  return tumarkinEightFacetCatalogue.filter(
    (entry) => entry.certificationStatus === "blocked-pending-transcription",
  ).length;
}
