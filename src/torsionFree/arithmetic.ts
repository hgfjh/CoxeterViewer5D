import type { ExactIntegerValue } from "./types";

export function toExactIntegerValue(value: bigint): ExactIntegerValue {
  if (value < 0n) {
    throw new Error(
      "Exact integer values in torsion-free planning are nonnegative.",
    );
  }

  const safeInteger =
    value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
  return {
    decimal: value.toString(),
    ...(safeInteger === undefined ? {} : { safeInteger }),
  };
}

export function exactIntegerToBigInt(value: ExactIntegerValue): bigint {
  return BigInt(value.decimal);
}

export function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

/** Computes an integer LCM without passing through floating-point numbers. */
export function leastCommonMultiple(values: Iterable<bigint>): bigint {
  let result = 1n;
  for (const rawValue of values) {
    const value = rawValue < 0n ? -rawValue : rawValue;
    if (value === 0n) {
      return 0n;
    }
    result = (result / greatestCommonDivisor(result, value)) * value;
  }
  return result;
}

export function factorial(value: number): bigint {
  let result = 1n;
  for (let factor = 2; factor <= value; factor += 1) {
    result *= BigInt(factor);
  }
  return result;
}
