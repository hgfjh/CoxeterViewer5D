import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  countCertificationBlockedEntries,
  filterTumarkinEightFacetCatalogue,
  representativeTumarkinEightFacetEntries,
  tumarkinEightFacetCatalogue,
  tumarkinEightFacetSourceRef,
} from "../src/catalogue/eightFacet5d";
import { validateCoxeterSystemInput } from "../src/coxeter";

describe("Tumarkin 5D eight-facet catalogue", () => {
  it("records all 15 certified Table 4.10 entries", () => {
    expect(tumarkinEightFacetCatalogue).toHaveLength(15);
    expect(
      new Set(tumarkinEightFacetCatalogue.map((entry) => entry.id)).size,
    ).toBe(15);
    expect(tumarkinEightFacetSourceRef.locator).toContain("Table 4.10");

    for (const [index, entry] of tumarkinEightFacetCatalogue.entries()) {
      expect(entry.dimension).toBe(5);
      expect(entry.facets).toBe(8);
      expect(entry.tableIndex).toBe(index + 1);
      expect(entry.galeDiagram).toBe("G11411");
      expect(entry.dataStatus).toBe("certified");
      expect(entry.renderable).toBe(true);
      expect(entry.renderStatus).toBe("renderable-example");
      expect(entry.certificationStatus).toBe("certified");
      expect(entry.exampleFile).toMatch(
        /^tumarkin_5d_8facet_g11411_\d\d\.json$/,
      );
      expect(entry.requiredForCertification).toHaveLength(0);
    }
  });

  it("keeps only a small representative set in the main gallery", () => {
    expect(
      representativeTumarkinEightFacetEntries().map(
        (entry) => entry.tableIndex,
      ),
    ).toEqual([1, 8, 15]);
    expect(countCertificationBlockedEntries()).toBe(0);
  });

  it("filters by table index, representative status, and uncertified status", () => {
    expect(
      filterTumarkinEightFacetCatalogue({ query: "08", filter: "all" }).map(
        (entry) => entry.tableIndex,
      ),
    ).toEqual([8]);
    expect(
      filterTumarkinEightFacetCatalogue({
        query: "",
        filter: "representative",
      }),
    ).toHaveLength(3);
    expect(
      filterTumarkinEightFacetCatalogue({
        query: "certified",
        filter: "blocked",
      }),
    ).toHaveLength(0);
  });

  it("points every catalogue entry at a valid certified Coxeter-system example", () => {
    for (const entry of tumarkinEightFacetCatalogue) {
      expect(entry.exampleFile).toBeDefined();
      const example = JSON.parse(
        readFileSync(
          resolve("public/examples", entry.exampleFile ?? ""),
          "utf-8",
        ),
      );
      expect(validateCoxeterSystemInput(example).ok).toBe(true);
      expect(example.rank).toBe(8);
      expect(example.dataStatus).toBe("certified");
      expect(example.certificate?.status).toBe("passed");
      expect(example.certificate?.scopes).toContain("source-transcription");
      expect(example.certificate?.scopes).toContain("gram-signature");
    }
  });
});
