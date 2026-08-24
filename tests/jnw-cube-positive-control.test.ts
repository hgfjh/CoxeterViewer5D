import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildJnwCubePositiveControlCertificate,
  computeJnwCubePositiveControlArtifactDigest,
  replayJnwCubePositiveControlCertificate,
  type JnwCubePositiveControlCertificate,
} from "../src/fibering/jnwCubePositiveControl";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SOURCE_PATH = "public/examples/jnw_cube_graph.json";
const ARTIFACT_PATH =
  "scripts/certificates/torsion-free/jnw_cube_graph_degree4_positive_control.json";
const EXPECTED_ARTIFACT_DIGEST =
  "8c1a391da160e587cc9167b98f1e215d3ea5fa4924373ec3da6f08844958885c";

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function trackedCertificate(): JnwCubePositiveControlCertificate {
  return loadJson(ARTIFACT_PATH) as JnwCubePositiveControlCertificate;
}

function reseal(
  certificate: JnwCubePositiveControlCertificate,
  section: keyof JnwCubePositiveControlCertificate["sectionDigests"],
): void {
  certificate.sectionDigests[section] = canonicalSha256(certificate[section]);
  certificate.artifactDigest =
    computeJnwCubePositiveControlArtifactDigest(certificate);
}

describe("JNW cube-graph rigorous positive control", () => {
  it("certifies the degree-four torsion-free action and complete square quotient", () => {
    const certificate = buildJnwCubePositiveControlCertificate(
      loadJson(SOURCE_PATH),
    );

    expect(certificate.status).toBe("passed");
    expect(certificate.finiteAction.candidate.index).toBe(4);
    expect(certificate.finiteAction.certificate.status).toBe("passed");
    expect(
      Object.values(certificate.finiteAction.certificate.checks).every(Boolean),
    ).toBe(true);
    expect(
      certificate.finiteAction.sphericalPlan.sphericalSubgroups,
    ).toHaveLength(20);
    expect(
      certificate.finiteAction.certificate.sphericalActions.every(
        (action) => action.free && action.faithful,
      ),
    ).toBe(true);
    expect(certificate.fullDavisQuotient.dimension).toBe(2);
    expect(certificate.fullDavisQuotient.cellCountByDimension).toEqual({
      "0": 4,
      "1": 16,
      "2": 12,
    });
    expect(certificate.npcAndDirectedLinks.checks).toMatchObject({
      locallyCatZero: true,
      universalCoverCatZero: true,
      universalCoverContractible: true,
      quotientAspherical: true,
    });
  });

  it("computes the full integral H^1 lattice and normalizes the JNW class honestly", () => {
    const certificate = buildJnwCubePositiveControlCertificate(
      loadJson(SOURCE_PATH),
    );
    const h1 = certificate.integralH1;
    const cocycle = certificate.primitiveCocycle;

    expect(h1.rankH1).toBe(6);
    expect(h1.isomorphicTo).toBe("Z^6");
    expect(h1.pivotColumns).toEqual([0, 1, 3, 5, 7, 9, 11]);
    expect(h1.freeColumns).toEqual([2, 4, 6, 8, 10, 12]);
    expect(h1.basis).toHaveLength(6);
    expect(Object.values(h1.checks).every(Boolean)).toBe(true);

    // The visible edge labels are all +/-1, but closed periods are even.
    // The certificate must normalize the cohomology class, not infer
    // primitivity from a single non-loop edge.
    expect(cocycle.rawH1Coordinates).toEqual([2, 2, 0, 2, 0, 2]);
    expect(cocycle.rawPeriodImageGcd).toBe(2);
    expect(cocycle.normalizationDivisor).toBe(2);
    expect(cocycle.primitiveH1Coordinates).toEqual([1, 1, 0, 1, 0, 1]);
    expect(cocycle.surjectivityWitness.rawPeriod).toBe(2);
    expect(Math.abs(cocycle.surjectivityWitness.primitivePeriod)).toBe(1);
    expect(Object.values(cocycle.checks).every(Boolean)).toBe(true);
  });

  it("checks every ascending and descending link as a nonempty tree", () => {
    const certificate = buildJnwCubePositiveControlCertificate(
      loadJson(SOURCE_PATH),
    );
    const links = certificate.npcAndDirectedLinks.vertexLinks;

    expect(links).toHaveLength(4);
    for (const vertex of links) {
      expect(vertex.full.generators).toHaveLength(8);
      expect(vertex.full.edges).toHaveLength(12);
      expect(vertex.full.flag).toBe(true);
      for (const directed of [vertex.ascending, vertex.descending]) {
        expect(directed.generators).toHaveLength(4);
        expect(directed.edges).toHaveLength(3);
        expect(directed.components).toHaveLength(1);
        expect(directed.nonempty).toBe(true);
        expect(directed.connected).toBe(true);
        expect(directed.tree).toBe(true);
        expect(directed.collapsible).toBe(true);
      }
      expect(Object.values(vertex.checks).every(Boolean)).toBe(true);
    }
    expect(certificate.theorem.result).toMatchObject({
      subgroupIndex: 4,
      h1IsomorphicTo: "Z^6",
      primitiveEpimorphismToZ: true,
      kernelFinitelyGenerated: true,
      virtualAlgebraicFibration: true,
    });
    expect(certificate.theorem.nonClaims.join(" ")).toContain(
      "not a compact hyperbolic 5-cube",
    );
    expect(certificate.theorem.nonClaims.join(" ")).toContain(
      "No smooth, bundle, or topological fibration",
    );
  });

  it("matches and freshly replays the tracked production artifact", () => {
    const source = loadJson(SOURCE_PATH);
    const stored = trackedCertificate();
    const rebuilt = buildJnwCubePositiveControlCertificate(source);

    expect(stored.artifactDigest).toBe(EXPECTED_ARTIFACT_DIGEST);
    expect(rebuilt.artifactDigest).toBe(EXPECTED_ARTIFACT_DIGEST);
    expect(canonicalSha256(stored)).toBe(canonicalSha256(rebuilt));
    expect(
      replayJnwCubePositiveControlCertificate(stored, source),
    ).toMatchObject({
      valid: true,
      checks: {
        envelopeRecognized: true,
        storedArtifactDigestValid: true,
        authoritativeSourceMatches: true,
        sectionDigestsValid: true,
        freshReconstructionMatches: true,
      },
      errors: [],
    });
  });

  it("rejects internally resealed action, H^1, link, and theorem tampering", () => {
    const source = loadJson(SOURCE_PATH);

    const actionTamper = structuredClone(trackedCertificate());
    actionTamper.finiteAction.candidate.generatorImages[0][0] = 0;
    reseal(actionTamper, "finiteAction");

    const h1Tamper = structuredClone(trackedCertificate());
    h1Tamper.integralH1.basis[0].cotreeValues[0] = 9;
    // Bind the outer reseal only. Fresh source reconstruction is the security
    // boundary tested here, so an attacker-controlled inner digest is immaterial.
    h1Tamper.integralH1.certificateDigest = "0".repeat(64);
    reseal(h1Tamper, "integralH1");

    const linkTamper = structuredClone(trackedCertificate());
    linkTamper.npcAndDirectedLinks.vertexLinks[0].ascending.edges.pop();
    reseal(linkTamper, "npcAndDirectedLinks");

    const theoremTamper = structuredClone(trackedCertificate());
    theoremTamper.theorem.nonClaims = [];
    reseal(theoremTamper, "theorem");

    for (const tampered of [
      actionTamper,
      h1Tamper,
      linkTamper,
      theoremTamper,
    ]) {
      const replay = replayJnwCubePositiveControlCertificate(tampered, source);
      expect(replay.checks.storedArtifactDigestValid).toBe(true);
      expect(replay.checks.sectionDigestsValid).toBe(true);
      expect(replay.checks.freshReconstructionMatches).toBe(false);
      expect(replay.valid).toBe(false);
      expect(replay.errors.join(" ")).toContain("Fresh exact reconstruction");
    }
  });

  it("rejects a certificate replayed against a different source identity", () => {
    const source = loadJson(SOURCE_PATH) as Record<string, unknown>;
    const alteredSource = { ...source, name: "Altered JNW source identity" };
    const replay = replayJnwCubePositiveControlCertificate(
      trackedCertificate(),
      alteredSource,
    );

    expect(replay.valid).toBe(false);
    expect(replay.checks.authoritativeSourceMatches).toBe(false);
    expect(replay.checks.freshReconstructionMatches).toBe(false);
  });
});
