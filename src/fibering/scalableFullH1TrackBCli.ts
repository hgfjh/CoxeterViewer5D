export const SCALABLE_FULL_H1_TRACK_B_USAGE = [
  "Usage:",
  "  pnpm cover:fiber:scalable-h1 -- \\",
  "    (--system SYSTEM.json | --example BUNDLED_ID) --action ACTION.json \\",
  "    --rank-certificate RANK.json --kernel-witness WITNESS.json \\",
  "    --output RESULT.json [--verify-artifact RESULT.json] \\",
  "    [--run-cheap-screen true|false] [--max-input-bytes N]",
].join("\n");

export interface ScalableFullH1TrackBCliArguments {
  system?: string;
  example?: string;
  action: string;
  rankCertificate: string;
  kernelWitness: string;
  output: string;
  verifyArtifact?: string;
  runCheapScreen: boolean;
  maxInputBytes: number;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive safe integer.`);
  }
  return parsed;
}

function booleanValue(value: string, flag: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} requires true or false.`);
}

export function parseScalableFullH1TrackBArguments(
  argv: readonly string[],
): ScalableFullH1TrackBCliArguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.includes("--help")) {
    throw new Error(SCALABLE_FULL_H1_TRACK_B_USAGE);
  }
  if (normalized.length % 2 !== 0) {
    throw new Error(SCALABLE_FULL_H1_TRACK_B_USAGE);
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag.startsWith("--") || values.has(flag)) {
      throw new Error(SCALABLE_FULL_H1_TRACK_B_USAGE);
    }
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--example",
    "--action",
    "--rank-certificate",
    "--kernel-witness",
    "--output",
    "--verify-artifact",
    "--run-cheap-screen",
    "--max-input-bytes",
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) {
      throw new Error(
        `Unknown flag ${flag}.\n${SCALABLE_FULL_H1_TRACK_B_USAGE}`,
      );
    }
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) {
      throw new Error(`Missing ${flag}.\n${SCALABLE_FULL_H1_TRACK_B_USAGE}`);
    }
    return value;
  };
  const system = values.get("--system");
  const example = values.get("--example");
  if (Boolean(system) === Boolean(example)) {
    throw new Error("Supply exactly one of --system or --example.");
  }
  return {
    ...(system ? { system } : {}),
    ...(example ? { example } : {}),
    action: required("--action"),
    rankCertificate: required("--rank-certificate"),
    kernelWitness: required("--kernel-witness"),
    output: required("--output"),
    ...(values.has("--verify-artifact")
      ? { verifyArtifact: required("--verify-artifact") }
      : {}),
    runCheapScreen: values.has("--run-cheap-screen")
      ? booleanValue(required("--run-cheap-screen"), "--run-cheap-screen")
      : true,
    maxInputBytes: values.has("--max-input-bytes")
      ? positiveInteger(required("--max-input-bytes"), "--max-input-bytes")
      : 1024 * 1024 * 1024,
  };
}
