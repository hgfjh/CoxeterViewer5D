import {
  MAKAROV_P0_P1_DEFAULT_PRIME_CAP,
  MAKAROV_P0_P1_DEFAULT_TIER,
  MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS,
  makarovP0P1CampaignConfiguration,
} from "./makarovP0P1ActionCampaign";

export const MAKAROV_P0_P1_CAMPAIGN_DEFAULT_OUTPUT =
  "scripts/certificates/portfolio/makarov_p0_p1_action_acquisition.json";
export const MAKAROV_P0_P1_CAMPAIGN_DEFAULT_DISCOVERY =
  ".cover-search/makarov-p0-p1/p0.discovery.json";
export const MAKAROV_P0_P1_CAMPAIGN_DEFAULT_CHECKPOINT_DIRECTORY =
  ".cover-search/makarov-p0-p1/checkpoints";
export const MAKAROV_P0_P1_CAMPAIGN_DEFAULT_MAX_INPUT_BYTES = 256 * 1024 * 1024;

export interface MakarovP0P1CampaignCliArguments {
  output: string;
  discovery: string;
  checkpointDirectory: string;
  execute: boolean;
  verifyOnly: boolean;
  reusePassed: boolean;
  selectedP0DegreeTier: number;
  maxCongruencePrime: number;
  timeoutSeconds: number;
  maxInputBytes: number;
}

const ARGUMENT_NAMES = new Set([
  "--output",
  "--discovery",
  "--checkpoint-directory",
  "--execute",
  "--verify-only",
  "--reuse-passed",
  "--tier",
  "--max-congruence-prime",
  "--timeout-seconds",
  "--max-input-bytes",
]);

function booleanValue(
  value: string | undefined,
  label: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function positiveInteger(
  value: string | undefined,
  label: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

export function parseMakarovP0P1CampaignArguments(
  argv: readonly string[],
): MakarovP0P1CampaignCliArguments {
  const separators = argv
    .map((value, index) => (value === "--" ? index : -1))
    .filter((index) => index >= 0);
  if (separators.length > 1) {
    throw new Error("Arguments contain more than one -- separator.");
  }
  const normalized = argv.filter((_value, index) => index !== separators[0]);
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error(
        "Arguments must be supplied as distinct --name value pairs.",
      );
    }
    if (!ARGUMENT_NAMES.has(key)) throw new Error(`Unknown argument ${key}.`);
    values.set(key, value);
  }
  const execute = booleanValue(values.get("--execute"), "--execute", false);
  const verifyOnly = booleanValue(
    values.get("--verify-only"),
    "--verify-only",
    false,
  );
  if (execute && verifyOnly) {
    throw new Error("--execute and --verify-only cannot both be true.");
  }
  const selectedP0DegreeTier = positiveInteger(
    values.get("--tier"),
    "--tier",
    MAKAROV_P0_P1_DEFAULT_TIER,
  );
  const maxCongruencePrime = positiveInteger(
    values.get("--max-congruence-prime"),
    "--max-congruence-prime",
    MAKAROV_P0_P1_DEFAULT_PRIME_CAP,
  );
  const timeoutSeconds = positiveInteger(
    values.get("--timeout-seconds"),
    "--timeout-seconds",
    MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS,
  );
  // The core validator is the single authority for active tiers and caps.
  makarovP0P1CampaignConfiguration({
    selectedP0DegreeTier,
    maxCongruencePrime,
    timeoutSeconds,
  });
  return {
    output: values.get("--output") ?? MAKAROV_P0_P1_CAMPAIGN_DEFAULT_OUTPUT,
    discovery:
      values.get("--discovery") ?? MAKAROV_P0_P1_CAMPAIGN_DEFAULT_DISCOVERY,
    checkpointDirectory:
      values.get("--checkpoint-directory") ??
      MAKAROV_P0_P1_CAMPAIGN_DEFAULT_CHECKPOINT_DIRECTORY,
    execute,
    verifyOnly,
    reusePassed: booleanValue(
      values.get("--reuse-passed"),
      "--reuse-passed",
      true,
    ),
    selectedP0DegreeTier,
    maxCongruencePrime,
    timeoutSeconds,
    maxInputBytes: positiveInteger(
      values.get("--max-input-bytes"),
      "--max-input-bytes",
      MAKAROV_P0_P1_CAMPAIGN_DEFAULT_MAX_INPUT_BYTES,
    ),
  };
}
