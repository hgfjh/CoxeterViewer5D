import { describe, expect, it } from "vitest";

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import A3_SAGE_RADIUS_6 from "./fixtures/generated/A3_sage_radius_6.json";
import I2_5_SAGE_RADIUS_5 from "./fixtures/generated/I2_5_sage_radius_5.json";
import I2_5 from "../public/examples/I2_5.json";
import {
  gapKbmagExactBackend,
  parseGeneratedCayleyBall,
  sageExactBackend,
  certifyGeneratedCayleyBall,
  validateGeneratedCayleyBall,
} from "../src/backends";
import {
  classifyIncidentEdges,
  certifyMorseCocycle,
  resolveIntegerEdgeAssignment,
  validateRankTwoCocycle,
} from "../src/game";
import { computeF2HomologySummary } from "../src/topology";
import {
  certifyQuotientAction,
  certifyVisibleTorsionFree,
  parseQuotientComplex,
  quotientManifoldStatus,
  validateQuotientComplex,
} from "../src/quotient";
import { browserApproxBackend } from "../src/cayley";
import type { QuotientComplex } from "../src/quotient";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";
const I2_5_INPUT = I2_5 as CoxeterSystemInput;

describe("exact backend stubs", () => {
  it("reports that Sage generation is unavailable in-browser", async () => {
    await expect(
      sageExactBackend.generate(I2_5_INPUT, 3),
    ).rejects.toMatchObject({
      name: "ExactBackendUnavailableError",
      details: {
        ok: false,
        code: "exact-backend-not-available",
        backend: "sage",
        operation: "generate",
        browserAvailable: false,
      },
    });
  });

  it("validates generated JSON imported from external exact backends", async () => {
    const ball = await browserApproxBackend.generate(I2_5_INPUT, 2, {
      createdAt,
    });
    const imported = await gapKbmagExactBackend.importExactOutput({
      ...ball,
      metadata: {
        ...ball.metadata,
        deduplication: "external-gap-kbmag",
      },
    });

    expect(imported.metadata.deduplication).toBe("external-gap-kbmag");
    expect(gapKbmagExactBackend.availability("generate")).toMatchObject({
      backend: "gap-kbmag",
      operation: "generate",
      requiredRuntime: "GAP with KBMAG",
    });
  });
});

describe("generated Cayley ball JSON helpers", () => {
  it("accepts generated JSON and rejects broken graph references", async () => {
    const ball = await browserApproxBackend.generate(I2_5_INPUT, 2, {
      createdAt,
    });
    const ok = validateGeneratedCayleyBall(ball);

    expect(ok.ok).toBe(true);
    expect(parseGeneratedCayleyBall(ball).metadata.deduplication).toBe(
      "rounded-matrix",
    );

    const broken = {
      ...ball,
      edges: [
        ...ball.edges,
        {
          id: "bad-edge",
          source: "e",
          target: "missing",
          generator: 0,
        },
      ],
    };

    expect(validateGeneratedCayleyBall(broken).errors).toContain(
      'edges[4].target refers to unknown node "missing".',
    );
  });
});

describe("exact Sage generated fixtures", () => {
  it("validates the full I2(5) exact Cayley graph and Davis decagon", () => {
    const ball = parseGeneratedCayleyBall(I2_5_SAGE_RADIUS_5);
    const appCertification = certifyGeneratedCayleyBall(ball);

    expect(ball.metadata.deduplication).toBe("external-sage");
    expect(ball.metadata.certification?.status).toBe("passed");
    expect(appCertification.status).toBe("certified");
    expect(ball.nodes).toHaveLength(10);
    expect(ball.edges).toHaveLength(10);
    expect(ball.metadata.warnings.join(" ")).toContain(
      "deduplicated by Sage algebraic real reflection matrices",
    );
    expect(ball.twoCells).toHaveLength(1);
    expect(ball.twoCells[0]).toMatchObject({
      generatorPair: [0, 1],
      m: 5,
    });
    expect(ball.twoCells[0].boundaryNodeIds).toHaveLength(10);
  });

  it("validates the full A3 exact Cayley graph and rank-two cells", () => {
    const ball = parseGeneratedCayleyBall(A3_SAGE_RADIUS_6);
    const appCertification = certifyGeneratedCayleyBall(ball);

    expect(ball.metadata.deduplication).toBe("external-sage");
    expect(appCertification.checks?.rankTwoBoundaries).toBe(true);
    expect(ball.nodes).toHaveLength(24);
    expect(ball.edges).toHaveLength(36);
    expect(ball.twoCells).toHaveLength(14);
    expect(
      ball.twoCells.filter((cell) => cell.generatorPair.join("-") === "0-2"),
    ).toHaveLength(6);
  });

  it("rejects generated balls that falsely claim certification", () => {
    const broken = {
      ...I2_5_SAGE_RADIUS_5,
      metadata: {
        ...I2_5_SAGE_RADIUS_5.metadata,
        certification: {
          status: "certified",
          verifier: "test",
          checks: {
            reducedWords: true,
            generatorEdgeCompleteness: true,
            rankTwoBoundaries: true,
            capAwareCompleteness: true,
          },
          errors: [],
          warnings: [],
        },
      },
      twoCells: [
        {
          ...I2_5_SAGE_RADIUS_5.twoCells[0],
          boundaryNodeIds: [
            I2_5_SAGE_RADIUS_5.twoCells[0].boundaryNodeIds[1],
            I2_5_SAGE_RADIUS_5.twoCells[0].boundaryNodeIds[0],
            ...I2_5_SAGE_RADIUS_5.twoCells[0].boundaryNodeIds.slice(2),
          ],
        },
      ],
    };

    const result = validateGeneratedCayleyBall(broken);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("boundary does not alternate");
  });
});

function validQuotient(): QuotientComplex {
  return {
    schemaVersion: 1,
    name: "Toy quotient",
    vertices: [{ id: "q0" }, { id: "q1" }],
    edges: [
      {
        id: "a",
        source: "q0",
        target: "q1",
        generator: 0,
        inverseEdgeId: "aInv",
      },
      {
        id: "aInv",
        source: "q1",
        target: "q0",
        generator: 0,
        inverseEdgeId: "a",
      },
    ],
    twoCells: [],
  };
}

function oneVertexI2Quotient(): QuotientComplex {
  return {
    schemaVersion: 1,
    name: "One vertex I2 quotient",
    sourceSystem: I2_5_INPUT,
    vertices: [{ id: "q" }],
    edges: [
      {
        id: "s0",
        source: "q",
        target: "q",
        generator: 0,
        inverseEdgeId: "s0",
      },
      {
        id: "s1",
        source: "q",
        target: "q",
        generator: 1,
        inverseEdgeId: "s1",
      },
    ],
    permutationAction: [
      { generator: 0, images: { q: "q" } },
      { generator: 1, images: { q: "q" } },
    ],
    twoCells: [
      {
        id: "cell",
        generatorPair: [0, 1],
        m: 5,
        boundaryVertexIds: Array(10).fill("q"),
        boundaryEdgeIds: Array.from({ length: 10 }, (_, index) =>
          index % 2 === 0 ? "s0" : "s1",
        ),
      },
    ],
  };
}

describe("quotient preparation validators", () => {
  it("catches broken edge pairings and cell vertex references", () => {
    const broken: QuotientComplex = {
      ...validQuotient(),
      edges: [
        {
          id: "a",
          source: "q0",
          target: "q1",
          generator: 0,
          inverseEdgeId: "aInv",
        },
        {
          id: "aInv",
          source: "q0",
          target: "q1",
          generator: 0,
          inverseEdgeId: "a",
        },
      ],
      twoCells: [
        {
          id: "bad-cell",
          generatorPair: [0, 1],
          m: 2,
          boundaryVertexIds: ["q0", "q1", "missing", "q0"],
        },
      ],
    };

    const result = validateQuotientComplex(broken);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'edges["a"] inverse must reverse source and target.',
        "twoCells[0].boundaryVertexIds[2] refers to an unknown vertex.",
      ]),
    );
  });

  it("does not allow manifold language without torsion-free verification", () => {
    const unverified: QuotientComplex = {
      ...validQuotient(),
      subgroup: {
        name: "H",
        manifoldClaimed: true,
      },
    };

    expect(validateQuotientComplex(unverified).errors).toContain(
      "subgroup.manifoldClaimed requires torsionFreeVerification metadata.",
    );

    const verified: QuotientComplex = {
      ...validQuotient(),
      subgroup: {
        name: "H",
        manifoldClaimed: true,
        torsionFreeVerification: {
          verified: true,
          method: "published-reference",
          source: "Example citation",
        },
      },
    };

    expect(validateQuotientComplex(verified).ok).toBe(true);
    expect(quotientManifoldStatus(verified)).toMatchObject({
      canUseManifoldLanguage: true,
      label: "torsion-free quotient manifold",
    });
  });

  it("validates generator-regular quotient graphs against source rank", () => {
    const regular = {
      ...validQuotient(),
      generatorRank: 1,
      permutationAction: [
        {
          generator: 0,
          images: {
            q0: "q1",
            q1: "q0",
          },
        },
      ],
    };

    expect(validateQuotientComplex(regular).ok).toBe(true);

    const irregular = {
      ...validQuotient(),
      generatorRank: 2,
    };

    expect(validateQuotientComplex(irregular).errors).toContain(
      'vertex "q0" must have exactly one outgoing edge for generator 1; found 0.',
    );
  });

  it("preserves source systems and checks permutation Coxeter relations", () => {
    const relationBroken: QuotientComplex = {
      schemaVersion: 1,
      name: "Broken I2 action",
      sourceSystem: I2_5_INPUT,
      vertices: [{ id: "q0" }, { id: "q1" }, { id: "q2" }],
      edges: [
        {
          id: "g0-q0-q1",
          source: "q0",
          target: "q1",
          generator: 0,
          inverseEdgeId: "g0-q1-q0",
        },
        {
          id: "g0-q1-q0",
          source: "q1",
          target: "q0",
          generator: 0,
          inverseEdgeId: "g0-q0-q1",
        },
        {
          id: "g0-q2-q2",
          source: "q2",
          target: "q2",
          generator: 0,
          inverseEdgeId: "g0-q2-q2",
        },
        {
          id: "g1-q0-q0",
          source: "q0",
          target: "q0",
          generator: 1,
          inverseEdgeId: "g1-q0-q0",
        },
        {
          id: "g1-q1-q2",
          source: "q1",
          target: "q2",
          generator: 1,
          inverseEdgeId: "g1-q2-q1",
        },
        {
          id: "g1-q2-q1",
          source: "q2",
          target: "q1",
          generator: 1,
          inverseEdgeId: "g1-q1-q2",
        },
      ],
      permutationAction: [
        {
          generator: 0,
          images: { q0: "q1", q1: "q0", q2: "q2" },
        },
        {
          generator: 1,
          images: { q0: "q0", q1: "q2", q2: "q1" },
        },
      ],
      twoCells: [],
    };

    const result = validateQuotientComplex(relationBroken);

    expect(result.errors.join(" ")).toContain(
      "permutationAction violates (s0s1)^5=1",
    );
    expect(
      validateQuotientComplex({
        ...validQuotient(),
        subgroup: { index: 3 },
      }).errors,
    ).toContain("subgroup.index must match quotient vertex count (2).");

    const sourcePreserved = parseQuotientComplex({
      schemaVersion: 1,
      name: "One vertex source quotient",
      sourceSystem: I2_5_INPUT,
      vertices: [{ id: "q" }],
      edges: [
        {
          id: "s0",
          source: "q",
          target: "q",
          generator: 0,
          inverseEdgeId: "s0",
        },
        {
          id: "s1",
          source: "q",
          target: "q",
          generator: 1,
          inverseEdgeId: "s1",
        },
      ],
      permutationAction: [
        { generator: 0, images: { q: "q" } },
        { generator: 1, images: { q: "q" } },
      ],
      twoCells: [],
    });

    expect(sourcePreserved.sourceSystem?.name).toBe(I2_5_INPUT.name);
  });

  it("validates imported quotient game assignment labels", () => {
    const result = validateQuotientComplex({
      ...validQuotient(),
      game: {
        activeAssignmentId: "bad",
        assignments: [
          {
            id: "bad",
            kind: "integer-edge-labeling",
            edgeStates: [{ edgeId: "missing", value: 1 }],
          },
        ],
      },
    });

    expect(result.errors).toContain(
      "edgeStates[0].edgeId refers to an unknown edge.",
    );
  });

  it("emits structured quotient action and visible torsion certificates", () => {
    const quotient = oneVertexI2Quotient();
    const schreier = certifyQuotientAction(quotient, {
      checkedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(schreier.status).toBe("passed");
    expect(schreier.rankTwoOrbits).toHaveLength(1);
    expect(schreier.checks.rankTwoCellCoverage).toBe(true);

    const torsion = certifyVisibleTorsionFree(quotient);
    expect(torsion.status).toBe("failed");
    expect(torsion.witnesses[0]).toMatchObject({
      vertexId: "q",
      sphericalSubsetId: "T:0",
      word: [0],
    });

    expect(
      validateQuotientComplex({
        ...quotient,
        schreierCertificate: schreier,
        torsionFreeCertificate: torsion,
      }).ok,
    ).toBe(true);
  });

  it("fails quotient action certification when rank-two orbit cells are absent", () => {
    const missingCells = {
      ...oneVertexI2Quotient(),
      twoCells: [],
    };

    const certificate = certifyQuotientAction(missingCells);

    expect(certificate.status).toBe("failed");
    expect(certificate.errors.join(" ")).toContain("has no quotient two-cell");
  });
});

describe("game and PL Morse preparation helpers", () => {
  const edges = [
    { id: "e01", source: "v0", target: "v1", generator: 0 },
    { id: "e12", source: "v1", target: "v2", generator: 1 },
    { id: "e23", source: "v2", target: "v3", generator: 0 },
    { id: "e30", source: "v3", target: "v0", generator: 1 },
  ];

  const cell = {
    id: "square",
    generatorPair: [0, 1] as [number, number],
    m: 2,
    boundaryVertexIds: ["v0", "v1", "v2", "v3"],
    boundaryEdgeIds: ["e01", "e12", "e23", "e30"],
  };

  it("checks integer boundary sums around rank-two cells", () => {
    const exact = validateRankTwoCocycle([cell], edges, [
      { edgeId: "e01", value: 1 },
      { edgeId: "e12", value: -1 },
      { edgeId: "e23", value: -2 },
      { edgeId: "e30", value: 2 },
    ]);

    expect(exact.ok).toBe(true);
    expect(exact.checks[0].boundarySum).toBe(0);
    expect(exact.checks[0]).toMatchObject({
      expectedBoundaryLength: 4,
      actualBoundaryLength: 4,
      missingEdgeSteps: [],
      missingStateEdgeIds: [],
    });

    const broken = validateRankTwoCocycle([cell], edges, [
      { edgeId: "e01", value: 1 },
      { edgeId: "e12", value: 1 },
      { edgeId: "e23", value: 1 },
      { edgeId: "e30", value: 1 },
    ]);

    expect(broken.ok).toBe(false);
    expect(broken.errors).toContain('cell "square" has boundary sum 4, not 0.');

    const missingLabel = validateRankTwoCocycle([cell], edges, [
      { edgeId: "e01", value: 1 },
      { edgeId: "e12", value: -1 },
      { edgeId: "e23", value: -2 },
    ]);

    expect(missingLabel.checks[0].missingStateEdgeIds).toEqual(["e30"]);
  });

  it("uses imported game assignments instead of generator-parity labels", () => {
    const assignment = resolveIntegerEdgeAssignment(
      {
        activeAssignmentId: "height",
        assignments: [
          {
            id: "height",
            label: "Imported height labels",
            kind: "integer-edge-labeling",
            edgeStates: [
              { edgeId: "e01", value: 7 },
              { edgeId: "e12", value: -3 },
              { edgeId: "e23", value: -7 },
              { edgeId: "e30", value: 3 },
            ],
          },
        ],
      },
      edges,
      2,
    );

    expect(assignment.source).toBe("imported");
    expect(assignment.edgeStates).toContainEqual({
      edgeId: "e23",
      value: -7,
    });
    expect(
      validateRankTwoCocycle([cell], edges, assignment.edgeStates).ok,
    ).toBe(true);
  });

  it("classifies incident edges at a selected vertex", () => {
    const flows = classifyIncidentEdges("v0", edges, [
      { edgeId: "e01", value: 1 },
      { edgeId: "e12", value: -1 },
      { edgeId: "e23", value: -2 },
      { edgeId: "e30", value: 2 },
    ]);

    expect(flows).toEqual([
      expect.objectContaining({
        edgeId: "e01",
        neighborId: "v1",
        valueAwayFromVertex: 1,
        classification: "ascending",
      }),
      expect.objectContaining({
        edgeId: "e30",
        neighborId: "v3",
        valueAwayFromVertex: -2,
        classification: "descending",
      }),
    ]);
  });

  it("validates named cocycles and experiment logs", () => {
    const quotient: QuotientComplex = {
      ...validQuotient(),
      game: {
        activeAssignmentId: "height",
        activeCocycleId: "cocycle",
        assignments: [
          {
            id: "height",
            kind: "integer-edge-labeling",
            edgeStates: [
              { edgeId: "a", value: 1 },
              { edgeId: "aInv", value: -1 },
            ],
          },
        ],
        cocycles: [
          {
            id: "cocycle",
            assignmentId: "height",
            coefficientRing: "Z",
            certificate: {
              status: "passed",
              backend: "test",
            },
          },
        ],
        experimentLogs: [
          {
            id: "run",
            assignmentId: "height",
            cocycleId: "cocycle",
            diagnostics: { selectedVertexId: "q0" },
          },
        ],
      },
    };

    expect(validateQuotientComplex(quotient).ok).toBe(true);

    const broken = validateQuotientComplex({
      ...quotient,
      game: {
        ...quotient.game,
        activeCocycleId: "missing",
      },
    });

    expect(broken.errors).toContain(
      "game.activeCocycleId must refer to a named cocycle.",
    );
  });

  it("produces a bounded Morse cocycle certificate", () => {
    const certificate = certifyMorseCocycle(
      {
        activeAssignmentId: "height",
        activeCocycleId: "cocycle",
        assignments: [
          {
            id: "height",
            kind: "integer-edge-labeling",
            edgeStates: [
              { edgeId: "e01", value: 1 },
              { edgeId: "e12", value: -1 },
              { edgeId: "e23", value: -2 },
              { edgeId: "e30", value: 2 },
            ],
          },
        ],
        cocycles: [
          {
            id: "cocycle",
            assignmentId: "height",
            coefficientRing: "Z",
          },
        ],
      },
      [cell],
      edges,
      2,
      { checkedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(certificate).toMatchObject({
      status: "passed",
      assignmentId: "height",
      cocycleId: "cocycle",
      cellCount: 1,
    });
  });
});

describe("local-link topology helpers and scripts", () => {
  it("computes reduced H0 and H1 over F2 for finite complexes", () => {
    const circle = computeF2HomologySummary({
      vertices: ["a", "b", "c"],
      simplices: [
        ["a", "b"],
        ["b", "c"],
        ["a", "c"],
      ],
    });

    expect(circle).toMatchObject({
      coefficientField: "F2",
      connectedComponents: 1,
      reducedBetti0: 0,
      betti1: 1,
    });

    const filledTriangle = computeF2HomologySummary({
      vertices: ["a", "b", "c"],
      simplices: [["a", "b", "c"]],
    });

    expect(filledTriangle.betti1).toBe(0);
  });

  it("runs quotient, Morse, and local-link certifier scripts", () => {
    const directory = mkdtempSync(join(tmpdir(), "coxeter-quotient-"));
    const quotientPath = join(directory, "quotient.json");
    writeFileSync(quotientPath, JSON.stringify(oneVertexI2Quotient()), "utf8");

    const quotient = spawnSync(
      "node",
      ["scripts/certify_quotient.mjs", quotientPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(quotient.status).toBe(0);
    expect(JSON.parse(quotient.stdout).schreierCertificate.status).toBe(
      "passed",
    );

    const morse = spawnSync(
      "node",
      ["scripts/certify_morse.mjs", quotientPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(morse.status).toBe(0);
    expect(JSON.parse(morse.stdout).certificate.status).toBe("passed");

    const localLinks = spawnSync(
      "node",
      ["scripts/certify_local_links.mjs", quotientPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(localLinks.status).toBe(0);
    expect(JSON.parse(localLinks.stdout).localLinks[0].homology.betti1).toBe(0);
  });

  it("runs quotient workflow export and parity scripts", () => {
    const nativeSageHook = spawnSync(
      "python",
      [
        "scripts/sage_quotient_export.py",
        "--input",
        "tests/fixtures/quotients/I2_5_identity_subgroup_build_request.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(nativeSageHook.status).toBe(0);
    const nativeSage = JSON.parse(nativeSageHook.stdout);
    expect([1, "skipped"]).toContain(
      nativeSage.schemaVersion ?? nativeSage.status,
    );

    const sageDemo = spawnSync(
      "node",
      [
        "scripts/run_quotient_export.mjs",
        "--backend",
        "sage",
        "--input",
        "tests/fixtures/quotients/I2_5_identity_subgroup_build_request.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          COXETER_QUOTIENT_EXTERNAL_MODE: "in-repo",
        },
      },
    );
    expect(sageDemo.status).toBe(0);
    const quotient = JSON.parse(sageDemo.stdout);
    expect(quotient.vertices).toHaveLength(10);
    expect(quotient.game.activeCocycleId).toBe("i2-5-height-cocycle");
    expect(quotient.verifier.diagnostics.wrapper).toBe(
      "scripts/run_quotient_export.mjs",
    );
    expect(
      quotient.verifier.diagnostics.externalToolStatus.nativeExporter ??
        quotient.verifier.diagnostics.externalToolStatus.exporterCommand,
    ).toBeDefined();

    const parity = spawnSync(
      "node",
      ["scripts/compare_quotient_backends.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          COXETER_QUOTIENT_EXTERNAL_MODE: "in-repo",
        },
      },
    );
    expect(parity.status).toBe(0);
    expect(JSON.parse(parity.stdout).ok).toBe(true);

    const workflow = spawnSync("node", ["scripts/validate_workflow.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(workflow.status).toBe(0);
    expect(JSON.parse(workflow.stdout).workflow).toBe("quotient-game-i2-5");
  }, 20000);
});

describe("backend reproducibility command contracts", () => {
  it("exposes bounded reproducibility commands in package scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["registry:validate"]).toBe(
      "node scripts/registry_validate.mjs",
    );
    expect(packageJson.scripts["schema:migrate"]).toBe(
      "node scripts/schema_migrate.mjs",
    );
    expect(packageJson.scripts["regenerate:all"]).toBe(
      "node scripts/regenerate_all.mjs",
    );
    expect(packageJson.scripts["compare:all-backends"]).toBe(
      "node scripts/compare_all_backends.mjs",
    );
    expect(packageJson.scripts["adapter:validate"]).toBe(
      "node scripts/adapter_contract_validate.mjs",
    );
  });

  it("validates artifact registry and external adapter contracts", () => {
    const registry = spawnSync(
      process.execPath,
      ["scripts/registry_validate.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(registry.status).toBe(0);
    const registryReport = JSON.parse(registry.stdout) as {
      ok: boolean;
      manifests: Array<{
        artifactCount: number;
        artifacts: Array<{
          artifactHash: { status: string };
          inputHash: { status: string };
        }>;
      }>;
    };
    expect(registryReport.ok).toBe(true);
    expect(registryReport.manifests[0]?.artifactCount).toBe(2);
    expect(
      registryReport.manifests[0]?.artifacts.every(
        (artifact) =>
          artifact.artifactHash.status === "matched" &&
          artifact.inputHash.status === "matched",
      ),
    ).toBe(true);

    const adapters = spawnSync(
      process.execPath,
      ["scripts/adapter_contract_validate.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(adapters.status).toBe(0);
    const adapterReport = JSON.parse(adapters.stdout) as {
      ok: boolean;
      requiredTools: string[];
      tools: string[];
    };
    expect(adapterReport.ok).toBe(true);
    expect(adapterReport.requiredTools).toEqual([
      "SageMath",
      "GAP/KBMAG",
      "CoxIter",
      "polymake",
      "Regina",
    ]);
    expect(adapterReport.tools).toEqual(
      expect.arrayContaining(adapterReport.requiredTools),
    );
  });

  it("migrates legacy Coxeter JSON only when explicitly asked to write", () => {
    const directory = mkdtempSync(join(tmpdir(), "coxeter-schema-migrate-"));
    const legacyPath = join(directory, "legacy.json");
    const legacy = {
      name: "Legacy A2",
      rank: 2,
      generatorLabels: ["a", "b"],
      matrix: [
        [1, 3],
        [3, 1],
      ],
    };

    try {
      writeFileSync(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
      const dryRun = spawnSync(
        process.execPath,
        ["scripts/schema_migrate.mjs", legacyPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(dryRun.status).toBe(0);
      const dryRunReport = JSON.parse(dryRun.stdout) as {
        dryRun: boolean;
        files: Array<{
          changed: boolean;
          written: boolean;
          migrations: string[];
          preview: { schemaVersion: number; coxeterMatrix: number[][] };
        }>;
      };
      expect(dryRunReport.dryRun).toBe(true);
      expect(dryRunReport.files[0]?.changed).toBe(true);
      expect(dryRunReport.files[0]?.written).toBe(false);
      expect(dryRunReport.files[0]?.migrations).toEqual(
        expect.arrayContaining([
          "set schemaVersion=1",
          "renamed matrix to coxeterMatrix",
          "converted generatorLabels to generators",
        ]),
      );
      expect(dryRunReport.files[0]?.preview.schemaVersion).toBe(1);
      expect(JSON.parse(readFileSync(legacyPath, "utf8")).schemaVersion).toBe(
        undefined,
      );

      const write = spawnSync(
        process.execPath,
        ["scripts/schema_migrate.mjs", "--write", legacyPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(write.status).toBe(0);
      const migrated = JSON.parse(readFileSync(legacyPath, "utf8")) as {
        schemaVersion: number;
        coxeterMatrix: number[][];
        generators: Array<{ id: string; label: string }>;
      };
      expect(migrated.schemaVersion).toBe(1);
      expect(migrated.coxeterMatrix[0][1]).toBe(3);
      expect(migrated.generators).toEqual([
        { id: "s0", label: "a" },
        { id: "s1", label: "b" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports regeneration as a deterministic dry run by default", () => {
    const result = spawnSync(process.execPath, ["scripts/regenerate_all.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      mode: string;
      results: unknown[];
      plannedWrites: string[];
      plan: Array<{ id: string; writes: string[] }>;
    };

    expect(report.ok).toBe(true);
    expect(report.mode).toBe("dry-run");
    expect(report.results).toEqual([]);
    expect(report.plan.map((step) => step.id)).toEqual(
      expect.arrayContaining(["exact-sage-i2-5", "exact-gap-a3"]),
    );
    expect(report.plannedWrites).toContain(
      "tests/fixtures/generated/I2_5_sage_radius_5.json",
    );
  });

  it("aggregates all backend parity checks without external quotient tools", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/compare_all_backends.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      reportName: string;
      checks: Array<{ id: string; ok: boolean }>;
    };

    expect(report.ok).toBe(true);
    expect(report.reportName).toBe(
      "coxeter-viewer-all-backend-reproducibility",
    );
    expect(report.checks.map((check) => check.id)).toEqual([
      "adapter-contracts",
      "exact-generated-fixtures",
      "quotient-game-fixtures",
    ]);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  }, 20000);
});
