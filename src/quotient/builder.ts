import type { CoxeterSystemInput } from "../types";
import type { QuotientBuildInput } from "./types";

export interface ParsedSubgroupWords {
  words: number[][];
  errors: string[];
}

export function parseSubgroupGeneratorWords(
  text: string,
  system: CoxeterSystemInput,
): ParsedSubgroupWords {
  const labels = new Map(
    system.generators.flatMap((generator, index) => [
      [generator.id, index] as const,
      [generator.label, index] as const,
      [`s${index}`, index] as const,
      [String(index), index] as const,
    ]),
  );
  const words: number[][] = [];
  const errors: string[] = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line, lineIndex) => {
      const tokens = line.split(/[\s,]+/).filter(Boolean);
      const word: number[] = [];
      for (const token of tokens) {
        const generator = labels.get(token);
        if (generator === undefined) {
          errors.push(`line ${lineIndex + 1}: unknown generator "${token}"`);
          continue;
        }
        word.push(generator);
      }
      if (word.length === 0) {
        errors.push(`line ${lineIndex + 1}: subgroup generator word is empty`);
      } else {
        words.push(word);
      }
    });

  return { words, errors };
}

export function createQuotientBuildInput(input: {
  sourceSystem: CoxeterSystemInput;
  subgroupText: string;
  maxCosets?: number;
  subgroupName?: string;
  requestedBackend?: QuotientBuildInput["requestedBackend"];
  includeGamePreset?: QuotientBuildInput["includeGamePreset"];
  artifactManifest?: QuotientBuildInput["artifactManifest"];
  notes?: string[];
}): { request?: QuotientBuildInput; errors: string[] } {
  const parsed = parseSubgroupGeneratorWords(
    input.subgroupText,
    input.sourceSystem,
  );
  if (parsed.errors.length > 0) {
    return { errors: parsed.errors };
  }

  return {
    request: {
      schemaVersion: 1,
      sourceSystem: input.sourceSystem,
      subgroupName: input.subgroupName,
      requestedBackend: input.requestedBackend,
      includeGamePreset: input.includeGamePreset,
      artifactManifest: input.artifactManifest,
      subgroupGenerators: parsed.words,
      subgroupGeneratorRecords: parsed.words.map((word, index) => ({
        id: `h${index}`,
        word,
        label: word
          .map(
            (generator) =>
              input.sourceSystem.generators[generator]?.label ??
              `s${generator}`,
          )
          .join(" "),
      })),
      maxCosets: input.maxCosets,
      notes: input.notes,
    },
    errors: [],
  };
}
