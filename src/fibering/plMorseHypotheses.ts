import type { CoverCompressionResult } from "../compression";
import type { CoxeterSystemInput } from "../types";
import type {
  DirectedMorseLink,
  LawfulSubcomplexEvaluation,
  MorseLinksResult,
  WallCoorientation,
  WallSystem,
} from "../walls";

export type PLMorseHypothesisStatus = "passed" | "failed" | "missing-evidence";

export interface PLMorseHypothesisCheck {
  id: string;
  label: string;
  status: PLMorseHypothesisStatus;
  detail: string;
  evidence: string[];
}

export interface PLMorseAuxiliaryDiagnostic {
  id: "embedded-walls" | "self-osculation-free";
  label: string;
  passed: boolean;
  role: "probabilistic-orientation-search";
  detail: string;
  evidence: string[];
}

export interface DimensionTwoTripleCheck {
  generators: [number, number, number];
  reciprocalSum: number;
  passed: boolean;
}

export interface DimensionTwoCheck {
  passed: boolean;
  triples: DimensionTwoTripleCheck[];
  failedTriples: DimensionTwoTripleCheck[];
}

export interface PLMorseInputEvidence {
  schreierPresentationPassed: boolean;
  wallCocyclePassed: boolean;
  wallCocycleNonzero: boolean;
  primitiveImagePassed: boolean;
  periodDivisor?: number;
}

export interface PLMorseHypothesisCertificate {
  status: "passed" | "failed" | "incomplete";
  method: "jankiewicz-wise-lawful-subcomplex-pl-morse-checklist";
  theoremBoundary: string;
  checks: PLMorseHypothesisCheck[];
  /** Conditions used by the paper's random-orientation estimate, not by the deterministic Morse criterion. */
  auxiliaryDiagnostics: PLMorseAuxiliaryDiagnostic[];
  failedCheckIds: string[];
  missingEvidenceCheckIds: string[];
  dimensionTwo: DimensionTwoCheck;
  linkCertificates: VertexMorseLinkCertificate[];
  vertexLinkFailures: Array<{
    vertexId: string;
    ascendingNonempty: boolean;
    ascendingConnected: boolean;
    descendingNonempty: boolean;
    descendingConnected: boolean;
  }>;
  conclusion: {
    virtualAlgebraicFibrationCertified: boolean;
    statement: string;
    limitations: string[];
  };
}

export interface DirectedMorseLinkCertificate {
  kind: "ascending" | "descending";
  vertexIds: string[];
  cornerIds: string[];
  components: string[][];
  spanningTreeCornerIds: string[];
  nonempty: boolean;
  connected: boolean;
  spanningTreeVerified: boolean;
}

export interface VertexMorseLinkCertificate {
  vertexId: string;
  ascending: DirectedMorseLinkCertificate;
  descending: DirectedMorseLinkCertificate;
}

/**
 * Check the two-dimensional hypothesis used in Jankiewicz--Wise.
 * Infinite Coxeter entries contribute zero to the reciprocal sum.
 */
export function checkDimensionAtMostTwo(
  system: CoxeterSystemInput,
): DimensionTwoCheck {
  const triples: DimensionTwoTripleCheck[] = [];
  for (let first = 0; first < system.rank; first += 1) {
    for (let second = first + 1; second < system.rank; second += 1) {
      for (let third = second + 1; third < system.rank; third += 1) {
        const generators: [number, number, number] = [first, second, third];
        const reciprocalSum =
          reciprocalCoxeterEntry(system.coxeterMatrix[first][second]) +
          reciprocalCoxeterEntry(system.coxeterMatrix[first][third]) +
          reciprocalCoxeterEntry(system.coxeterMatrix[second][third]);
        triples.push({
          generators,
          reciprocalSum,
          passed: reciprocalSum <= 1 + 1e-12,
        });
      }
    }
  }
  const failedTriples = triples.filter((triple) => !triple.passed);
  return {
    passed: failedTriples.length === 0,
    triples,
    failedTriples,
  };
}

/**
 * Evaluate the finite, checkable hypotheses used to turn a wall orientation
 * into a virtual algebraic fibration. This does not infer any hypothesis from
 * the Three.js placement.
 */
export function certifyPLMorseHypotheses(input: {
  cover: CoverCompressionResult;
  wallSystem: WallSystem;
  coorientation: WallCoorientation;
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  morseLinks: MorseLinksResult;
  homomorphism: PLMorseInputEvidence;
}): PLMorseHypothesisCertificate {
  const {
    cover,
    wallSystem,
    coorientation,
    lawfulSubcomplex,
    morseLinks,
    homomorphism,
  } = input;
  const checks: PLMorseHypothesisCheck[] = [];
  const add = (
    id: string,
    label: string,
    status: PLMorseHypothesisStatus,
    detail: string,
    evidence: string[],
  ) => checks.push({ id, label, status, detail, evidence });

  const actionEvidence = cover.barX.provenance.actionEvidence;
  add(
    "finite-cover-action",
    "Finite connected cover action",
    actionEvidence === "not-supplied" ? "missing-evidence" : "passed",
    actionEvidence === "not-supplied"
      ? "The finite permutation action has no accepted action certificate."
      : `The finite permutation action is ${actionEvidence}.`,
    cover.barX.provenance.checksPerformed,
  );

  const torsionFreeEvidence = cover.barX.provenance.torsionFreeEvidence;
  add(
    "torsion-free-subgroup",
    "Finite-index torsion-free subgroup H",
    torsionFreeEvidence === "not-supplied" ? "missing-evidence" : "passed",
    torsionFreeEvidence === "not-supplied"
      ? "No accepted torsion-free certificate is attached to this cover."
      : `Torsion-freeness is ${torsionFreeEvidence}.`,
    cover.barX.provenance.limitations,
  );

  add(
    "compression-certificate",
    "Exact cellular compression hat X -> bar X",
    cover.certificate.status === "passed" ? "passed" : "failed",
    cover.certificate.status === "passed"
      ? "All generator-bigon and finite-dihedral cell fibers pass."
      : cover.certificate.errors.join(" "),
    Object.entries(cover.certificate.checks)
      .filter(([, passed]) => passed)
      .map(([name]) => name),
  );

  const connected = isConnectedOneSkeleton(cover);
  add(
    "finite-connected-complex",
    "Finite connected compressed complex",
    connected ? "passed" : "failed",
    connected
      ? `${cover.barX.vertices.length} vertices and ${cover.barX.geometricEdges.length} edges form one connected finite 1-skeleton.`
      : "The compressed 1-skeleton is empty or disconnected.",
    ["bar X finite vertex/edge arrays", "breadth-first connectivity check"],
  );

  const dimensionTwo = checkDimensionAtMostTwo(cover.barX.sourceSystem);
  add(
    "dimension-at-most-two",
    "Two-dimensional nonpositively curved Coxeter setting",
    dimensionTwo.passed ? "passed" : "failed",
    dimensionTwo.passed
      ? "Every generator triple has reciprocal Coxeter sum at most one."
      : `${dimensionTwo.failedTriples.length} generator triple(s) have reciprocal Coxeter sum greater than one.`,
    dimensionTwo.failedTriples.map(
      (triple) =>
        `${triple.generators.join(",")}: ${formatNumber(triple.reciprocalSum)} > 1`,
    ),
  );

  const regularCells = cover.barX.relationCells.every(
    (cell) =>
      Number.isInteger(cell.m) &&
      cell.m >= 2 &&
      cell.boundaryOccurrences.length === 2 * cell.m,
  );
  add(
    "affine-cell-models",
    "Compatible affine cell models",
    regularCells ? "passed" : "failed",
    regularCells
      ? "Every compressed relation cell has the expected 2m attaching cycle; its standard regular-polygon affine model is available."
      : "At least one compressed relation cell does not have an expected 2m attaching cycle.",
    ["exact boundary occurrence arrays", "Coxeter exponent m"],
  );

  const npcAsphericityEvidence =
    cover.certificate.status === "passed" &&
    dimensionTwo.passed &&
    regularCells;
  add(
    "aspherical-npc-setting",
    "Aspherical nonpositively curved setting",
    npcAsphericityEvidence ? "passed" : "failed",
    npcAsphericityEvidence
      ? "The certified compression, regular 2m cells, and dimension-at-most-two inequalities supply the nonpositive-curvature/asphericity implication used in the Jankiewicz--Wise setting."
      : "The accepted nonpositive-curvature/asphericity implication is unavailable because the compression, regular-cell, or dimension-at-most-two check fails.",
    [
      "Jankiewicz--Wise, Section 2.1",
      "regular 2m cell boundary checks",
      "all generator-triple reciprocal-sum checks",
    ],
  );

  add(
    "two-sided-walls",
    "Globally coorientable two-sided walls",
    wallSystem.diagnostics.twoSided ? "passed" : "failed",
    wallSystem.diagnostics.twoSided
      ? `${wallSystem.walls.length} abstract wall classes admit globally consistent transverse orientations.`
      : "At least one abstract wall has an orientation-parity conflict, so a global wall coorientation does not exist.",
    [
      `${wallSystem.diagnostics.twoSidednessWitnesses.length} two-sidedness witnesses`,
    ],
  );

  const auxiliaryDiagnostics: PLMorseAuxiliaryDiagnostic[] = [
    {
      id: "embedded-walls",
      label: "Embedded walls",
      passed: wallSystem.diagnostics.embedded,
      role: "probabilistic-orientation-search",
      detail: wallSystem.diagnostics.embedded
        ? "Every wall passes the finite embeddedness diagnostic."
        : "Some walls do not embed. This does not block a supplied coorientation whose cell sums and Morse links are checked directly.",
      evidence: [
        `${wallSystem.diagnostics.embeddednessWitnesses.length} embeddedness witnesses`,
      ],
    },
    {
      id: "self-osculation-free",
      label: "No self-osculation",
      passed: wallSystem.diagnostics.selfOsculationFree,
      role: "probabilistic-orientation-search",
      detail: wallSystem.diagnostics.selfOsculationFree
        ? "No wall self-osculates in the finite incidence data."
        : "Some walls self-osculate. This creates dependencies in the paper's random-orientation estimate, but it does not block a concrete orientation whose links are checked directly.",
      evidence: [
        `${wallSystem.diagnostics.selfOsculationWitnesses.length} self-osculation witnesses`,
      ],
    },
  ];

  const everyEdgeDirected =
    coorientation.valid &&
    cover.barX.geometricEdges.every((edge) => {
      const value = coorientation.edgeDirections[edge.id];
      return value === 1 || value === -1;
    });
  add(
    "wall-coorientation",
    "Global wall coorientation",
    everyEdgeDirected ? "passed" : "failed",
    everyEdgeDirected
      ? "Every geometric edge has one nonzero direction induced by its wall."
      : "The wall coorientation is invalid or leaves an edge unoriented.",
    coorientation.errors,
  );

  add(
    "cellular-cocycle",
    "Cocycle consistency around every compressed relation cell",
    homomorphism.wallCocyclePassed ? "passed" : "failed",
    homomorphism.wallCocyclePassed
      ? "Every signed cellular boundary sum is zero."
      : "At least one compressed relation cell has nonzero signed boundary sum.",
    [],
  );

  add(
    "circle-valued-map",
    "Cellular map to the circle",
    homomorphism.wallCocyclePassed ? "passed" : "failed",
    homomorphism.wallCocyclePassed
      ? "The integral edge cocycle has zero sum on every 2-cell boundary, so the 1-skeleton map extends over the compressed complex."
      : "A nonzero cell boundary sum prevents the edge map from extending to a cellular map to S^1.",
    ["integer edge values", "all compressed relation-cell boundary sums"],
  );

  add(
    "schreier-presentation",
    "Explicit Schreier presentation of H",
    homomorphism.schreierPresentationPassed ? "passed" : "failed",
    homomorphism.schreierPresentationPassed
      ? "The finite action yields deterministic Schreier generators and rewritten Coxeter relators."
      : "A complete Schreier presentation could not be constructed.",
    [],
  );

  const lawfulKeepsSkeleton =
    lawfulSubcomplex.valid &&
    lawfulSubcomplex.retainedVertexIds.length === cover.barX.vertices.length &&
    lawfulSubcomplex.retainedEdgeIds.length ===
      cover.barX.geometricEdges.length;
  add(
    "lawful-full-skeleton",
    "Lawful subcomplex with the full 1-skeleton",
    lawfulKeepsSkeleton ? "passed" : "failed",
    lawfulKeepsSkeleton
      ? `${lawfulSubcomplex.retainedCellIds.length} lawful relation cells are retained and the full 1-skeleton is unchanged.`
      : "The lawful-cell evaluation is invalid or does not retain the full 1-skeleton.",
    lawfulSubcomplex.errors,
  );

  const retainedCellById = new Map(
    lawfulSubcomplex.cells.map((cell) => [cell.cellId, cell]),
  );
  const affineMorseCells = lawfulSubcomplex.retainedCellIds.every((cellId) => {
    const cell = retainedCellById.get(cellId);
    return (
      cell?.lawful === true &&
      cell.transitionCount === 2 &&
      cell.sourceVertexId !== undefined &&
      cell.sinkVertexId !== undefined &&
      cell.sourceVertexId !== cell.sinkVertexId &&
      cell.positivePaths.length === 2 &&
      cell.positivePaths.every(
        (path) =>
          path.sourceVertexId === cell.sourceVertexId &&
          path.sinkVertexId === cell.sinkVertexId &&
          path.steps.length > 0,
      )
    );
  });
  add(
    "affine-morse-cells",
    "Affine nonconstant Morse map on retained cells",
    everyEdgeDirected && affineMorseCells ? "passed" : "failed",
    everyEdgeDirected && affineMorseCells
      ? "Each retained 2-cell has one source, one sink, and two positive boundary paths; the regular affine extension is nonconstant on every positive-dimensional cell."
      : "At least one edge has zero/undefined direction or one retained cell lacks the required source, sink, and two positive boundary paths.",
    lawfulSubcomplex.retainedCellIds,
  );

  add(
    "discrete-lifted-heights",
    "Closed discrete lifted vertex heights",
    everyEdgeDirected && Number.isFinite(cover.barX.vertices.length)
      ? "passed"
      : "failed",
    everyEdgeDirected
      ? "The finite quotient has integral +/-1 edge increments, so lifted vertex heights lie in Z and form a closed discrete subset of R."
      : "Integral nonzero edge increments have not been established.",
    ["finite quotient", "integer wall cochain", "edge values +/-1"],
  );

  add(
    "lawful-to-subgroup-surjection",
    "Lawful-kernel map surjects onto ker(phi in H)",
    lawfulKeepsSkeleton && homomorphism.schreierPresentationPassed
      ? "passed"
      : "failed",
    lawfulKeepsSkeleton && homomorphism.schreierPresentationPassed
      ? "The lawful subcomplex and bar X have the same connected 1-skeleton, so pi_1(Y) -> pi_1(bar X)=H is onto and carries the same edge cocycle. Its kernel therefore surjects onto ker(phi)."
      : "The full-one-skeleton or subgroup-presentation evidence needed for the kernel-surjection step is missing.",
    [
      "identical retained vertex and edge ids",
      "explicit Schreier presentation",
    ],
  );

  const linkCertificates = morseLinks.vertices.map((vertex) => ({
    vertexId: vertex.vertexId,
    ascending: certifyDirectedMorseLink(vertex.ascending),
    descending: certifyDirectedMorseLink(vertex.descending),
  }));
  const vertexLinkFailures = morseLinks.vertices
    .filter(
      (vertex) =>
        !vertex.ascending.nonempty ||
        !vertex.ascending.connected ||
        !vertex.descending.nonempty ||
        !vertex.descending.connected,
    )
    .map((vertex) => ({
      vertexId: vertex.vertexId,
      ascendingNonempty: vertex.ascending.nonempty,
      ascendingConnected: vertex.ascending.connected,
      descendingNonempty: vertex.descending.nonempty,
      descendingConnected: vertex.descending.connected,
    }));
  const linksPass = morseLinks.valid && vertexLinkFailures.length === 0;
  add(
    "morse-links",
    "Nonempty connected ascending and descending links",
    linksPass ? "passed" : "failed",
    linksPass
      ? `Both directed links are nonempty and connected at all ${morseLinks.vertices.length} vertices.`
      : `${vertexLinkFailures.length} vertex link(s) fail a nonempty or connectedness condition.`,
    morseLinks.errors,
  );

  add(
    "nonzero-wall-map",
    "Nontrivial wall map",
    homomorphism.wallCocycleNonzero ? "passed" : "failed",
    homomorphism.wallCocycleNonzero
      ? "The wall cochain has a nonzero period on H."
      : "All computed periods vanish, so this coorientation does not define a nontrivial map H -> Z.",
    [],
  );

  add(
    "primitive-image",
    "Primitive image Z",
    homomorphism.primitiveImagePassed ? "passed" : "failed",
    homomorphism.primitiveImagePassed
      ? `The period gcd is ${homomorphism.periodDivisor ?? 1}; division gives a surjection H -> Z.`
      : "The period subgroup could not be normalized to a certified primitive image.",
    [],
  );

  const failedCheckIds = checks
    .filter((check) => check.status === "failed")
    .map((check) => check.id);
  const missingEvidenceCheckIds = checks
    .filter((check) => check.status === "missing-evidence")
    .map((check) => check.id);
  const certified =
    failedCheckIds.length === 0 && missingEvidenceCheckIds.length === 0;
  const status: PLMorseHypothesisCertificate["status"] =
    failedCheckIds.length > 0
      ? "failed"
      : missingEvidenceCheckIds.length > 0
        ? "incomplete"
        : "passed";

  return {
    status,
    method: "jankiewicz-wise-lawful-subcomplex-pl-morse-checklist",
    theoremBoundary:
      "This certificate applies the finite lawful-subcomplex and Bestvina--Brady link criterion used by Jankiewicz--Wise; it is not a general theorem prover.",
    checks,
    auxiliaryDiagnostics,
    failedCheckIds,
    missingEvidenceCheckIds,
    dimensionTwo,
    linkCertificates,
    vertexLinkFailures,
    conclusion: {
      virtualAlgebraicFibrationCertified: certified,
      statement: certified
        ? "The supplied finite-index torsion-free subgroup H admits an explicit epimorphism H -> Z with finitely generated kernel."
        : "Virtual algebraic fibering is not certified for this coorientation; inspect the failed or unsupported hypotheses.",
      limitations: [
        "The conclusion concerns the explicit finite action, compressed cell complex, and coorientation in this artifact.",
        "The Three.js placement, cell spreading, and projection coordinates carry no proof content.",
        "No manifold, geometric fibering, or finitely presented-kernel claim is implied.",
      ],
    },
  };
}

function certifyDirectedMorseLink(
  link: DirectedMorseLink,
): DirectedMorseLinkCertificate {
  const vertexIds = link.vertices.map((vertex) => vertex.id).sort(compareIds);
  const vertexIdSet = new Set(vertexIds);
  const corners = [...link.corners].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const adjacency = new Map<
    string,
    Array<{ neighborId: string; cornerId: string }>
  >(vertexIds.map((vertexId) => [vertexId, []]));
  for (const corner of corners) {
    if (
      !vertexIdSet.has(corner.firstLinkVertexId) ||
      !vertexIdSet.has(corner.secondLinkVertexId)
    ) {
      continue;
    }
    adjacency.get(corner.firstLinkVertexId)?.push({
      neighborId: corner.secondLinkVertexId,
      cornerId: corner.id,
    });
    adjacency.get(corner.secondLinkVertexId)?.push({
      neighborId: corner.firstLinkVertexId,
      cornerId: corner.id,
    });
  }
  for (const entries of adjacency.values()) {
    entries.sort(
      (left, right) =>
        compareIds(left.cornerId, right.cornerId) ||
        compareIds(left.neighborId, right.neighborId),
    );
  }

  const spanningTreeCornerIds: string[] = [];
  const visited = new Set<string>();
  for (const root of vertexIds) {
    if (visited.has(root)) continue;
    visited.add(root);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const entry of adjacency.get(queue[cursor]) ?? []) {
        if (visited.has(entry.neighborId)) continue;
        visited.add(entry.neighborId);
        queue.push(entry.neighborId);
        spanningTreeCornerIds.push(entry.cornerId);
      }
    }
  }
  const expectedTreeSize = Math.max(
    0,
    vertexIds.length - link.components.length,
  );
  const spanningTreeVerified =
    spanningTreeCornerIds.length === expectedTreeSize &&
    link.components.flat().length === vertexIds.length;

  return {
    kind: link.kind,
    vertexIds,
    cornerIds: corners.map((corner) => corner.id),
    components: link.components.map((component) =>
      [...component].sort(compareIds),
    ),
    spanningTreeCornerIds,
    nonempty: link.nonempty,
    connected: link.connected,
    spanningTreeVerified,
  };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function reciprocalCoxeterEntry(entry: number | "inf"): number {
  return entry === "inf" ? 0 : 1 / entry;
}

function isConnectedOneSkeleton(cover: CoverCompressionResult): boolean {
  const { vertices, geometricEdges } = cover.barX;
  if (vertices.length === 0) return false;
  const adjacency = new Map(
    vertices.map((vertex) => [vertex.id, [] as string[]]),
  );
  for (const edge of geometricEdges) {
    adjacency.get(edge.sourceVertexId)?.push(edge.targetVertexId);
    adjacency.get(edge.targetVertexId)?.push(edge.sourceVertexId);
  }
  const seen = new Set<string>([vertices[0].id]);
  const queue = [vertices[0].id];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency.get(queue[cursor]) ?? []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size === vertices.length;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6);
}
