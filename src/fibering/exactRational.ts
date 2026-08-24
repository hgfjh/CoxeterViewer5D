/** A reduced rational number encoded with decimal integers for JSON safety. */
export interface ExactRational {
  numerator: string;
  denominator: string;
}

function gcdBigInt(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function parseInteger(value: string, name: string): bigint {
  if (!/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name} must be a canonical decimal integer.`);
  }
  return BigInt(value);
}

/** Construct a reduced rational with positive denominator. */
export function exactRational(
  numerator: bigint | number | string,
  denominator: bigint | number | string = 1n,
): ExactRational {
  let n =
    typeof numerator === "bigint"
      ? numerator
      : typeof numerator === "number"
        ? BigInt(numerator)
        : parseInteger(numerator, "numerator");
  let d =
    typeof denominator === "bigint"
      ? denominator
      : typeof denominator === "number"
        ? BigInt(denominator)
        : parseInteger(denominator, "denominator");
  if (d === 0n)
    throw new Error("An exact rational cannot have denominator zero.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcdBigInt(n, d);
  return {
    numerator: (n / divisor).toString(),
    denominator: (d / divisor).toString(),
  };
}

export function rationalParts(value: ExactRational): [bigint, bigint] {
  const numerator = parseInteger(value.numerator, "numerator");
  const denominator = parseInteger(value.denominator, "denominator");
  if (denominator <= 0n) {
    throw new Error("An exact rational must have a positive denominator.");
  }
  const normalized = exactRational(numerator, denominator);
  if (
    normalized.numerator !== value.numerator ||
    normalized.denominator !== value.denominator
  ) {
    throw new Error(
      "An exact rational must be stored in reduced canonical form.",
    );
  }
  return [numerator, denominator];
}

export function addRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  const [ln, ld] = rationalParts(left);
  const [rn, rd] = rationalParts(right);
  return exactRational(ln * rd + rn * ld, ld * rd);
}

export function subtractRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  const [ln, ld] = rationalParts(left);
  const [rn, rd] = rationalParts(right);
  return exactRational(ln * rd - rn * ld, ld * rd);
}

export function multiplyRationalByInteger(
  value: ExactRational,
  multiplier: bigint | number,
): ExactRational {
  const [numerator, denominator] = rationalParts(value);
  return exactRational(numerator * BigInt(multiplier), denominator);
}

export function divideRationalByInteger(
  value: ExactRational,
  divisor: bigint | number,
): ExactRational {
  const integer = BigInt(divisor);
  if (integer === 0n) throw new Error("Cannot divide a rational by zero.");
  const [numerator, denominator] = rationalParts(value);
  return exactRational(numerator, denominator * integer);
}

export function compareRationals(
  left: ExactRational,
  right: ExactRational,
): -1 | 0 | 1 {
  const [ln, ld] = rationalParts(left);
  const [rn, rd] = rationalParts(right);
  const difference = ln * rd - rn * ld;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function rationalSign(value: ExactRational): -1 | 0 | 1 {
  const [numerator] = rationalParts(value);
  return numerator < 0n ? -1 : numerator > 0n ? 1 : 0;
}

export function rationalToNumber(value: ExactRational): number {
  const [numerator, denominator] = rationalParts(value);
  return Number(numerator) / Number(denominator);
}

export function formatExactRational(value: ExactRational): string {
  rationalParts(value);
  return value.denominator === "1"
    ? value.numerator
    : `${value.numerator}/${value.denominator}`;
}
