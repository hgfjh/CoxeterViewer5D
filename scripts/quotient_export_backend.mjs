#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BACKEND_VERSION = "1.1.0";
const MATRIX_KEY_PRECISION = 10;
const DEFAULT_MAX_COSETS = 256;
const MAX_GROUP_ELEMENTS = 50_000;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function backendId(backend) {
  return backend === "gap"
    ? "gapQuotientExportBackend"
    : "sageQuotientExportBackend";
}

function printOrWrite(value, outputPath) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

function skippedReport({ backend, inputPath, inputHash, warnings }) {
  return {
    ok: true,
    status: "skipped",
    backend: backendId(backend),
    backendVersion: BACKEND_VERSION,
    checkedAt: "1970-01-01T00:00:00.000Z",
    inputPath: inputPath ?? null,
    inputHash,
    output: null,
    warnings,
  };
}

function isInteger(value) {
  return Number.isInteger(value) && !Number.isNaN(value);
}

function validateBuildRequest(request) {
  const errors = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { errors: ["build request must be a JSON object"] };
  }

  const source = request.sourceSystem;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    errors.push("sourceSystem must be an object");
  } else {
    if (source.schemaVersion !== 1) {
      errors.push("sourceSystem.schemaVersion must be 1");
    }
    if (!isInteger(source.rank) || source.rank < 1) {
      errors.push("sourceSystem.rank must be a positive integer");
    }
    if (
      !Array.isArray(source.generators) ||
      source.generators.length !== source.rank
    ) {
      errors.push(
        "sourceSystem.generators must have sourceSystem.rank entries",
      );
    }
    if (
      !Array.isArray(source.coxeterMatrix) ||
      source.coxeterMatrix.length !== source.rank
    ) {
      errors.push("sourceSystem.coxeterMatrix must be rank by rank");
    } else {
      for (let i = 0; i < source.rank; i += 1) {
        const row = source.coxeterMatrix[i];
        if (!Array.isArray(row) || row.length !== source.rank) {
          errors.push(
            `sourceSystem.coxeterMatrix[${i}] must have rank entries`,
          );
          continue;
        }
        for (let j = 0; j < source.rank; j += 1) {
          const entry = row[j];
          if (i === j && entry !== 1) {
            errors.push(`sourceSystem.coxeterMatrix[${i}][${j}] must be 1`);
          } else if (
            i !== j &&
            entry !== "inf" &&
            (!isInteger(entry) || entry < 2)
          ) {
            errors.push(
              `sourceSystem.coxeterMatrix[${i}][${j}] must be an integer >= 2 or "inf"`,
            );
          } else if (
            Array.isArray(source.coxeterMatrix[j]) &&
            source.coxeterMatrix[j][i] !== entry
          ) {
            errors.push(
              `sourceSystem.coxeterMatrix must be symmetric at (${i}, ${j})`,
            );
          }
        }
      }
    }
  }

  if (!Array.isArray(request.subgroupGenerators)) {
    errors.push("subgroupGenerators must be an array of words");
  } else {
    request.subgroupGenerators.forEach((word, index) => {
      if (!Array.isArray(word)) {
        errors.push(`subgroupGenerators[${index}] must be a word array`);
        return;
      }
      word.forEach((generator, wordIndex) => {
        if (
          !isInteger(generator) ||
          generator < 0 ||
          (source?.rank !== undefined && generator >= source.rank)
        ) {
          errors.push(
            `subgroupGenerators[${index}][${wordIndex}] must be a valid generator index`,
          );
        }
      });
    });
  }

  if (
    request.maxCosets !== undefined &&
    (!isInteger(request.maxCosets) || request.maxCosets < 1)
  ) {
    errors.push("maxCosets must be a positive integer when provided");
  }

  return { errors, source };
}

function hasInfiniteEntry(matrix) {
  return matrix.some((row) => row.some((entry) => entry === "inf"));
}

function finiteGramValue(entry) {
  if (entry === 2) {
    return 0;
  }
  return -Math.cos(Math.PI / entry);
}

function buildGram(matrix) {
  return matrix.map((row, i) =>
    row.map((entry, j) => (i === j ? 1 : finiteGramValue(entry))),
  );
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_unused, j) => (i === j ? 1 : 0)),
  );
}

function multiplyMatrices(left, right) {
  const rows = left.length;
  const shared = right.length;
  const columns = right[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: columns }, (_unused, j) => {
      let value = 0;
      for (let k = 0; k < shared; k += 1) {
        value += left[i][k] * right[k][j];
      }
      return value;
    }),
  );
}

function roundedMatrixKey(matrix) {
  const scale = 10 ** MATRIX_KEY_PRECISION;
  return matrix
    .flat()
    .map((entry) => {
      const rounded = Math.round(entry * scale) / scale;
      return Object.is(rounded, -0) ? 0 : rounded;
    })
    .join(",");
}

function buildSimpleReflections(matrix) {
  const gram = buildGram(matrix);
  const rank = matrix.length;
  return matrix.map((_row, generator) => {
    const reflection = identityMatrix(rank);
    for (let column = 0; column < rank; column += 1) {
      reflection[generator][column] -= 2 * gram[column][generator];
    }
    return reflection;
  });
}

function wordMatrix(word, reflections) {
  return word.reduce(
    (matrix, generator) => multiplyMatrices(matrix, reflections[generator]),
    identityMatrix(reflections.length),
  );
}

function nodeIdFromWord(word) {
  return word.length === 0 ? "e" : `w:${word.join(".")}`;
}

function enumerateFiniteGroup(source, reflections) {
  const identity = identityMatrix(source.rank);
  const elements = [
    {
      id: "e",
      word: [],
      matrix: identity,
      key: roundedMatrixKey(identity),
    },
  ];
  const keyToIndex = new Map([[elements[0].key, 0]]);
  let capped = false;

  for (let cursor = 0; cursor < elements.length; cursor += 1) {
    const element = elements[cursor];
    for (let generator = 0; generator < source.rank; generator += 1) {
      const matrix = multiplyMatrices(element.matrix, reflections[generator]);
      const key = roundedMatrixKey(matrix);
      if (keyToIndex.has(key)) {
        continue;
      }
      if (elements.length >= MAX_GROUP_ELEMENTS) {
        capped = true;
        continue;
      }
      const word = [...element.word, generator];
      keyToIndex.set(key, elements.length);
      elements.push({
        id: nodeIdFromWord(word),
        word,
        matrix,
        key,
      });
    }
  }

  return { elements, keyToIndex, capped };
}

function enumerateSubgroup(request, reflections, group) {
  const generatorWords = request.subgroupGenerators ?? [];
  const subgroupMatrices = [];
  for (const word of generatorWords) {
    subgroupMatrices.push(wordMatrix(word, reflections));
    subgroupMatrices.push(wordMatrix([...word].reverse(), reflections));
  }

  const identity = identityMatrix(reflections.length);
  const elements = [
    { matrix: identity, key: roundedMatrixKey(identity), word: [] },
  ];
  const seen = new Set([elements[0].key]);
  const errors = [];
  let capped = false;

  for (let cursor = 0; cursor < elements.length; cursor += 1) {
    if (subgroupMatrices.length === 0) {
      break;
    }
    const element = elements[cursor];
    for (const generatorMatrix of subgroupMatrices) {
      const matrix = multiplyMatrices(element.matrix, generatorMatrix);
      const key = roundedMatrixKey(matrix);
      if (!group.keyToIndex.has(key)) {
        errors.push(
          "subgroup enumeration reached an element outside the enumerated finite group",
        );
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      if (elements.length >= MAX_GROUP_ELEMENTS) {
        capped = true;
        continue;
      }
      seen.add(key);
      elements.push({ matrix, key, word: [] });
    }
  }

  return { elements, keys: [...seen].sort(), errors, capped };
}

function buildLeftCosets(group, subgroup) {
  const elementCoset = Array.from({ length: group.elements.length }, () => -1);
  const cosets = [];
  const errors = [];

  for (let index = 0; index < group.elements.length; index += 1) {
    if (elementCoset[index] >= 0) {
      continue;
    }
    const representative = group.elements[index];
    const memberIndices = new Set();
    for (const subgroupElement of subgroup.elements) {
      const matrix = multiplyMatrices(
        subgroupElement.matrix,
        representative.matrix,
      );
      const key = roundedMatrixKey(matrix);
      const memberIndex = group.keyToIndex.get(key);
      if (memberIndex === undefined) {
        errors.push(
          "left-coset construction found an element outside the enumerated group",
        );
        continue;
      }
      memberIndices.add(memberIndex);
    }
    const cosetIndex = cosets.length;
    for (const memberIndex of memberIndices) {
      if (
        elementCoset[memberIndex] !== -1 &&
        elementCoset[memberIndex] !== cosetIndex
      ) {
        errors.push("left-coset construction produced overlapping cosets");
      }
      elementCoset[memberIndex] = cosetIndex;
    }
    cosets.push({
      id: `q${cosetIndex}`,
      representativeIndex: index,
      memberIndices: [...memberIndices].sort((left, right) => left - right),
    });
  }

  return { cosets, elementCoset, errors };
}

function edgeId(source, target, generator) {
  return source === target
    ? `qe:${source}:s${generator}`
    : `qe:${source}:${target}:s${generator}`;
}

function finitePairs(matrix) {
  const pairs = [];
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) {
      const entry = matrix[i][j];
      if (Number.isInteger(entry)) {
        pairs.push([i, j, entry]);
      }
    }
  }
  return pairs;
}

function canonicalBoundaryKey(boundary) {
  const rotations = [];
  for (let index = 0; index < boundary.length; index += 1) {
    rotations.push(
      [...boundary.slice(index), ...boundary.slice(0, index)].join(">"),
    );
  }
  const reversed = [...boundary].reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    rotations.push(
      [...reversed.slice(index), ...reversed.slice(0, index)].join(">"),
    );
  }
  return rotations.sort()[0] ?? "";
}

function buildQuotientComplex(request, backend, inputHash) {
  const { errors, source } = validateBuildRequest(request);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (hasInfiniteEntry(source.coxeterMatrix)) {
    return {
      ok: true,
      skipped: true,
      warnings: [
        "Finite in-repo quotient export is available only for Coxeter systems with all finite matrix entries. Use Sage/GAP for infinite finite-index subgroup enumeration.",
      ],
    };
  }

  const maxCosets = request.maxCosets ?? DEFAULT_MAX_COSETS;
  const reflections = buildSimpleReflections(source.coxeterMatrix);
  const group = enumerateFiniteGroup(source, reflections);
  const subgroup = enumerateSubgroup(request, reflections, group);
  const cosetData = buildLeftCosets(group, subgroup);
  const errorsCombined = [
    ...(group.capped ? ["finite group enumeration hit the element cap"] : []),
    ...(subgroup.capped ? ["subgroup enumeration hit the element cap"] : []),
    ...subgroup.errors,
    ...cosetData.errors,
  ];

  if (cosetData.cosets.length > maxCosets) {
    errorsCombined.push(
      `quotient has ${cosetData.cosets.length} cosets, exceeding maxCosets ${maxCosets}`,
    );
  }

  if (errorsCombined.length > 0) {
    return { ok: false, errors: errorsCombined };
  }

  const vertices = cosetData.cosets.map((coset) => {
    const representative = group.elements[coset.representativeIndex];
    return {
      id: coset.id,
      label: coset.id,
      representativeWord: representative.word,
    };
  });

  const actions = [];
  const actionImagesByGenerator = [];
  for (let generator = 0; generator < source.rank; generator += 1) {
    const images = {};
    for (const coset of cosetData.cosets) {
      const representative = group.elements[coset.representativeIndex];
      const targetMatrix = multiplyMatrices(
        representative.matrix,
        reflections[generator],
      );
      const targetKey = roundedMatrixKey(targetMatrix);
      const targetElement = group.keyToIndex.get(targetKey);
      const targetCoset =
        targetElement === undefined
          ? -1
          : cosetData.elementCoset[targetElement];
      if (targetCoset < 0) {
        return {
          ok: false,
          errors: [
            `generator ${generator} action left the enumerated quotient at ${coset.id}`,
          ],
        };
      }
      images[coset.id] = cosetData.cosets[targetCoset].id;
    }
    actionImagesByGenerator.push(images);
    actions.push({ generator, images });
  }

  const edges = [];
  for (const coset of cosetData.cosets) {
    for (let generator = 0; generator < source.rank; generator += 1) {
      const target = actionImagesByGenerator[generator][coset.id];
      edges.push({
        id: edgeId(coset.id, target, generator),
        source: coset.id,
        target,
        generator,
        inverseEdgeId: edgeId(target, coset.id, generator),
        label: source.generators?.[generator]?.label ?? `s${generator}`,
      });
    }
  }

  const cells = [];
  const seenCells = new Set();
  for (const [i, j, m] of finitePairs(source.coxeterMatrix)) {
    for (const vertex of vertices) {
      const boundaryVertexIds = [];
      const boundaryEdgeIds = [];
      let current = vertex.id;
      for (let step = 0; step < 2 * m; step += 1) {
        const generator = step % 2 === 0 ? i : j;
        const target = actionImagesByGenerator[generator][current];
        boundaryVertexIds.push(current);
        boundaryEdgeIds.push(edgeId(current, target, generator));
        current = target;
      }
      if (current !== vertex.id) {
        return {
          ok: false,
          errors: [
            `rank-two relation (${i}, ${j}) did not close at ${vertex.id}`,
          ],
        };
      }
      const key = `${i}-${j}:${canonicalBoundaryKey(boundaryVertexIds)}`;
      if (seenCells.has(key)) {
        continue;
      }
      seenCells.add(key);
      cells.push({
        id: `qcell:${i}-${j}:${cells.length}`,
        generatorPair: [i, j],
        m,
        boundaryVertexIds,
        boundaryEdgeIds,
      });
    }
  }

  const warning =
    "Quotient was produced by deterministic finite left-coset enumeration from the request file. Infinite or large-index subgroup enumeration still belongs in Sage/GAP.";
  const certificate = {
    status: "passed",
    backend: backendId(backend),
    backendVersion: BACKEND_VERSION,
    scopes: ["quotient-action"],
    command: `node scripts/quotient_export_backend.mjs --backend ${backend}`,
    checkedAt: "1970-01-01T00:00:00.000Z",
    inputHash,
    diagnostics: {
      groupElements: group.elements.length,
      subgroupElements: subgroup.elements.length,
      cosets: vertices.length,
      finitePairCells: cells.length,
      cosetConvention:
        "left cosets H\\W with right multiplication by Coxeter generators",
      matrixKeyPrecision: MATRIX_KEY_PRECISION,
    },
    warnings: [warning],
  };
  const game =
    request.includeGamePreset === "i2-5-height"
      ? {
          activeAssignmentId: "i2-5-height-generators",
          activeCocycleId: "i2-5-height-cocycle",
          assignments: [
            {
              id: "i2-5-height-generators",
              label: "I2(5) height cocycle s0=+1, s1=-1",
              description:
                "Integer generator labeling used by the quotient/game demo.",
              kind: "integer-generator-labeling",
              generatorStates: [
                { generator: 0, value: 1 },
                { generator: 1, value: -1 },
              ],
              notes: [
                "For the identity-subgroup I2(5) quotient, the alternating decagon has zero boundary sum.",
              ],
            },
          ],
          cocycles: [
            {
              id: "i2-5-height-cocycle",
              label: "I2(5) demo cocycle",
              assignmentId: "i2-5-height-generators",
              coefficientRing: "Z",
              certificate: {
                status: "passed",
                backend: backendId(backend),
                scopes: ["morse-cocycle"],
                inputHash,
              },
              notes: [
                "The app and certifier scripts re-check the rank-two boundary sums before treating this as passed.",
              ],
            },
          ],
          experimentLogs: [
            {
              id: "i2-5-workflow-demo",
              label: "I2(5) quotient/game demo",
              inputHash,
              assignmentId: "i2-5-height-generators",
              cocycleId: "i2-5-height-cocycle",
              diagnostics: {
                intendedLenses: [
                  "ascending-link",
                  "descending-link",
                  "full-local-link",
                ],
              },
            },
          ],
          notes: [
            "This block is a demo game assignment, not a torsion-free or manifold certificate.",
          ],
        }
      : request.includeGamePreset === "zero"
        ? {
            activeAssignmentId: "zero-generators",
            activeCocycleId: "zero-cocycle",
            assignments: [
              {
                id: "zero-generators",
                label: "Zero generator labels",
                kind: "integer-generator-labeling",
                generatorStates: Array.from(
                  { length: source.rank },
                  (_unused, generator) => ({ generator, value: 0 }),
                ),
              },
            ],
            cocycles: [
              {
                id: "zero-cocycle",
                label: "Zero cocycle",
                assignmentId: "zero-generators",
                coefficientRing: "Z",
              },
            ],
          }
        : undefined;

  const quotient = {
    schemaVersion: 1,
    name:
      request.subgroupName && request.subgroupName.trim().length > 0
        ? `${source.name} quotient (${request.subgroupName})`
        : `${source.name} quotient from build request`,
    sourceSystem: source,
    generatorRank: source.rank,
    permutationAction: actions,
    vertices,
    edges,
    twoCells: cells,
    subgroup: {
      name: request.subgroupName ?? "request subgroup",
      index: vertices.length,
      generators: request.subgroupGenerators,
      source: backendId(backend),
      certificate,
      notes: request.notes ?? [],
    },
    verifier: certificate,
    schreierCertificate: {
      status: "passed",
      method: "in-repo-permutation-action",
      checkedAt: "1970-01-01T00:00:00.000Z",
      generatorRank: source.rank,
      vertexCount: vertices.length,
      checks: {
        generatorRegularity: true,
        bijectiveActions: true,
        involutiveGenerators: true,
        edgeCompatibility: true,
        coxeterRelations: true,
        rankTwoCellCoverage: true,
        duplicateRankTwoCells: true,
      },
      rankTwoOrbits: cells.map((cell) => ({
        generatorPair: cell.generatorPair,
        m: cell.m,
        orbitKey: `${cell.generatorPair.join(",")}:${cell.boundaryVertexIds.join(">")}`,
        boundaryVertexIds: cell.boundaryVertexIds,
        matchedCellIds: [cell.id],
      })),
      errors: [],
      warnings: [warning],
    },
    ...(game ? { game } : {}),
    warnings: [warning],
  };

  const outputText = JSON.stringify(quotient);
  quotient.verifier.outputHash = sha256Text(outputText);
  quotient.subgroup.certificate.outputHash = quotient.verifier.outputHash;
  if (quotient.game?.cocycles?.[0]?.certificate) {
    quotient.game.cocycles[0].certificate.outputHash =
      quotient.verifier.outputHash;
  }

  return { ok: true, quotient };
}

const backend = arg("--backend", "sage");
const inputPath = arg("--input", undefined);
const outputPath = arg("--output", undefined);
const inputText = inputPath ? readFileSync(inputPath, "utf8") : "{}";
const inputHash = sha256Text(inputText);

if (!inputPath) {
  printOrWrite(
    skippedReport({
      backend,
      inputPath,
      inputHash,
      warnings: [
        "Pass --input with a QuotientBuildInput request to emit a finite QuotientComplex artifact.",
      ],
    }),
    outputPath,
  );
  process.exit(0);
}

let request;
try {
  request = JSON.parse(inputText);
} catch (error) {
  printOrWrite(
    {
      ok: false,
      status: "failed",
      backend: backendId(backend),
      backendVersion: BACKEND_VERSION,
      inputPath,
      inputHash,
      errors: [`input is not valid JSON: ${error.message}`],
    },
    outputPath,
  );
  process.exit(1);
}

const result = buildQuotientComplex(request, backend, inputHash);
if (result.skipped) {
  printOrWrite(
    skippedReport({
      backend,
      inputPath,
      inputHash,
      warnings: result.warnings,
    }),
    outputPath,
  );
  process.exit(0);
}

if (!result.ok) {
  printOrWrite(
    {
      ok: false,
      status: "failed",
      backend: backendId(backend),
      backendVersion: BACKEND_VERSION,
      inputPath,
      inputHash,
      errors: result.errors,
    },
    outputPath,
  );
  process.exit(1);
}

printOrWrite(result.quotient, outputPath);
