import { describe, expect, it } from "vitest";

import {
  LABELLED_S4_RESEARCH_LANE,
  buildLabelledS4PilotPlan,
  computeLabelledS4CoxeterDataSha256,
  computeLabelledS4NerveSha256,
  isNormalizedRepositoryRelativePath,
  isRightAngledCoxeterPresentation,
  preflightLabelledS4Candidate,
  type LabelledS4CoxeterPresentation,
  type LabelledS4ExactEvidenceBinding,
  type LabelledS4NongeometricCandidate,
} from "../src/fibering/labelledS4ResearchLane";

const generators = ["s0", "s1", "s2", "s3", "s4", "s5"];

// This is the affine A~5 diagram. It is useful here because its nerve is the
// boundary of a 5-simplex, while Moussong's affine obstruction must reject it.
const affineA5Presentation: LabelledS4CoxeterPresentation = {
  rank: 6,
  generatorIds: generators,
  coxeterMatrix: Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 6 }, (_, column) => {
      if (row === column) return 1;
      const distance = Math.abs(row - column);
      return distance === 1 || distance === 5 ? 3 : 2;
    }),
  ),
};

const simplexBoundaryFacets = generators.map((omitted) =>
  generators.filter((generator) => generator !== omitted),
);

// Unit tests exercise the in-memory binding contract. Production runners must
// hash and replay the referenced files before constructing a passed binding.
function schemaTestEvidence(name: string): LabelledS4ExactEvidenceBinding {
  return {
    status: "passed",
    exactArithmetic: true,
    backend: "schema-test-only",
    artifactPath: `tests/fixtures/schema-only/${name}.json`,
    artifactSha256: "a".repeat(64),
    replay: {
      backendId: "labelled-s4-test-fixture-v1",
      argv: [name],
    },
    replayStatus: "passed",
  };
}

function affineA5Candidate(): LabelledS4NongeometricCandidate {
  const nerve = {
    dimension: 4 as const,
    maximalSimplices: simplexBoundaryFacets,
  };
  const coxeterDataSha256 =
    computeLabelledS4CoxeterDataSha256(affineA5Presentation);
  return {
    schemaVersion: 1,
    kind: "labelled-s4-nongeometric-coxeter-candidate",
    id: "test-affine-a5-obstruction",
    label: "Schema test: affine A~5 obstruction",
    claimScope: "abstract-coxeter-davis",
    ambientGeometryClaim: "none",
    intendedDavisDimension: 5,
    sourceRefs: [
      {
        citation: "Affine A~5 is used only as a standard obstruction control.",
      },
    ],
    presentation: affineA5Presentation,
    nerve,
    sphericalSubsets: {
      kind: "exact-maximal-spherical-subsets",
      coxeterDataSha256,
      exhaustive: true,
      maximalSphericalSubsets: [...simplexBoundaryFacets].reverse(),
      allListedSubsetsCertifiedSpherical: true,
      evidence: schemaTestEvidence("affine-a5-spherical"),
    },
    plSphere: {
      kind: "exact-pl-sphere",
      nerveSha256: computeLabelledS4NerveSha256(affineA5Presentation, nerve),
      dimension: 4,
      conclusion: "pl-sphere",
      proofKind: "simplicial-isomorphism-to-known-pl-sphere",
      closedCombinatorialManifoldVerified: true,
      integralHomologySphereVerified: true,
      plHomeomorphismVerified: true,
      evidence: schemaTestEvidence("simplex-boundary-pl-sphere"),
    },
    moussong: {
      kind: "exact-moussong-hyperbolicity",
      criterion: "no-affine-rank-ge-3-and-no-commuting-infinite-special-pair",
      coxeterDataSha256,
      irreducibleAffineAuditExhaustive: true,
      irreducibleAffineRankAtLeastThreeSubsets: [generators],
      commutingInfinitePairAuditExhaustive: true,
      commutingInfinitePairs: [],
      conclusion: "not-word-hyperbolic",
      evidence: schemaTestEvidence("affine-a5-moussong"),
    },
    notes: ["Test fixture only; it is not a lane candidate."],
  };
}

describe("labelled-S4 non-geometric research lane", () => {
  it("registers an empty, non-real-H5 intake lane", () => {
    expect(LABELLED_S4_RESEARCH_LANE.status).toBe("candidate-intake-open");
    expect(LABELLED_S4_RESEARCH_LANE.currentCandidateIds).toEqual([]);
    expect(
      LABELLED_S4_RESEARCH_LANE.geometryPolicy
        .realHyperbolic5ReflectionRealizationRequired,
    ).toBe(false);
    expect(LABELLED_S4_RESEARCH_LANE.rightAngledPolicy.admitted).toBe(false);
  });

  it("canonicalizes a nerve independently of facet ordering", () => {
    const forward = computeLabelledS4NerveSha256(affineA5Presentation, {
      dimension: 4,
      maximalSimplices: simplexBoundaryFacets,
    });
    const reversed = computeLabelledS4NerveSha256(affineA5Presentation, {
      dimension: 4,
      maximalSimplices: simplexBoundaryFacets
        .map((facet) => [...facet].reverse())
        .reverse(),
    });
    expect(reversed).toBe(forward);
  });

  it("recognizes exactly the right-angled matrix condition", () => {
    const rightAngled: LabelledS4CoxeterPresentation = {
      rank: 6,
      generatorIds: generators,
      coxeterMatrix: Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 6 }, (_, column) =>
          row === column ? 1 : (row + column) % 2 === 0 ? 2 : "inf",
        ),
      ),
    };
    expect(isRightAngledCoxeterPresentation(rightAngled)).toBe(true);
    expect(isRightAngledCoxeterPresentation(affineA5Presentation)).toBe(false);
  });

  it("rejects a right-angled candidate at preflight", () => {
    const candidate = affineA5Candidate();
    candidate.presentation = {
      ...candidate.presentation,
      coxeterMatrix: Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 6 }, (_, column) => (row === column ? 1 : 2)),
      ),
    };
    const coxeterDataSha256 = computeLabelledS4CoxeterDataSha256(
      candidate.presentation,
    );
    candidate.sphericalSubsets.coxeterDataSha256 = coxeterDataSha256;
    candidate.moussong.coxeterDataSha256 = coxeterDataSha256;
    candidate.plSphere.nerveSha256 = computeLabelledS4NerveSha256(
      candidate.presentation,
      candidate.nerve,
    );
    candidate.moussong.irreducibleAffineRankAtLeastThreeSubsets = [];
    candidate.moussong.conclusion = "word-hyperbolic";

    const result = preflightLabelledS4Candidate(candidate);
    expect(result.status).toBe("rejected");
    expect(result.checks.nonRightAngled).toBe(false);
    expect(result.errors).toContain(
      "Right-angled PL-S4 candidates are excluded: word-hyperbolicity would force an impossible flag-no-square four-dimensional generalized homology sphere.",
    );
  });

  it("rejects unsafe or non-normalized evidence paths", () => {
    expect(
      isNormalizedRepositoryRelativePath("scripts/certificates/a.json"),
    ).toBe(true);
    for (const artifactPath of [
      "../outside.json",
      "scripts/../outside.json",
      "/absolute.json",
      "C:/absolute.json",
      "scripts/certificate.json:alternate-stream",
      "scripts\\certificate.json",
      "scripts//certificate.json",
      "scripts/./certificate.json",
      "https://example.test/certificate.json",
    ]) {
      const candidate = affineA5Candidate();
      candidate.sphericalSubsets.evidence.artifactPath = artifactPath;
      const result = preflightLabelledS4Candidate(candidate);
      expect(result.status, artifactPath).toBe("rejected");
      expect(result.errors, artifactPath).toContain(
        "Maximal-spherical-subset evidence is not a valid replayable file binding.",
      );
    }
  });

  it("rejects the affine A~5 control only after the topology gates pass", () => {
    const result = preflightLabelledS4Candidate(affineA5Candidate());
    expect(result.status).toBe("rejected");
    expect(result.checks.maximalSphericalSubsetsAgreeWithNerve).toBe(true);
    expect(result.checks.plSphereProofExactAndReplayable).toBe(true);
    expect(result.checks.noIrreducibleAffineObstruction).toBe(false);
    expect(result.checks.wordHyperbolicityCertified).toBe(false);
    expect(result.errors).toContain(
      "Moussong's criterion found an irreducible affine obstruction.",
    );
  });

  it("rejects spherical-subset drift and blocks stale topology evidence", () => {
    const candidate = affineA5Candidate();
    candidate.sphericalSubsets.maximalSphericalSubsets =
      candidate.sphericalSubsets.maximalSphericalSubsets.slice(1);
    candidate.plSphere.nerveSha256 = "0".repeat(64);
    const result = preflightLabelledS4Candidate(candidate);
    expect(result.checks.maximalSphericalSubsetsAgreeWithNerve).toBe(false);
    expect(result.errors).toContain(
      "The nerve facets do not equal the exact maximal spherical subsets.",
    );
    expect(result.blockers).toContain("The PL-S4 certificate is stale.");
  });

  it("does not promote homology-sphere evidence without a PL proof", () => {
    const candidate = affineA5Candidate();
    candidate.plSphere.plHomeomorphismVerified = false;
    const result = preflightLabelledS4Candidate(candidate);
    expect(result.checks.plSphereProofExactAndReplayable).toBe(false);
    expect(result.errors).toContain(
      "Homology and manifold checks do not replace an exact PL-homeomorphism proof.",
    );
  });

  it("keeps an empty bounded pilot open for sourced intake", () => {
    const plan = buildLabelledS4PilotPlan([]);
    expect(plan.status).toBe("candidate-intake-open");
    expect(plan.queuedCandidateIds).toEqual([]);
    expect(plan.limits.maxCandidates).toBe(16);
    expect(plan.limits.maxPreflightSecondsPerCandidate).toBe(900);
  });

  it("orders the bounded queue and capacity deferral deterministically", () => {
    const makePassingSchemaCandidate = (id: string) => {
      const candidate = affineA5Candidate();
      candidate.id = id;
      candidate.moussong.irreducibleAffineRankAtLeastThreeSubsets = [];
      candidate.moussong.conclusion = "word-hyperbolic";
      return candidate;
    };
    const limits = {
      ...LABELLED_S4_RESEARCH_LANE.pilotLimits,
      maxCandidates: 1,
    };
    const a = makePassingSchemaCandidate("candidate-a");
    const b = makePassingSchemaCandidate("candidate-b");
    const forward = buildLabelledS4PilotPlan([b, a], limits);
    const reversed = buildLabelledS4PilotPlan([a, b], limits);

    expect(forward).toEqual(reversed);
    expect(forward.queuedCandidateIds).toEqual(["candidate-a"]);
    expect(
      forward.entries.map(({ candidateId, disposition }) => [
        candidateId,
        disposition,
      ]),
    ).toEqual([
      ["candidate-a", "queue"],
      ["candidate-b", "defer-capacity"],
    ]);
  });
});
