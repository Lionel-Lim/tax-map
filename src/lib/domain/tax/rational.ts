/** Exact, reduced fractions for monetary intermediate values. Never serialize bigint directly. */
export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export interface SerializedRational {
  readonly numerator: string;
  readonly denominator: string;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return absolute(left);
}

export function rational(numerator: bigint, denominator: bigint = 1n): Rational {
  if (denominator === 0n) throw new RangeError('A rational denominator cannot be zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiply(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divide(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function compare(left: Rational, right: Rational): -1 | 0 | 1 {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function serializeRational(value: Rational): SerializedRational {
  const normalized = rational(value.numerator, value.denominator);
  return { numerator: normalized.numerator.toString(), denominator: normalized.denominator.toString() };
}

function parseInteger(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : null;
  if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  return null;
}

/** Accepts Phase 1 integer fields or the JSON-safe string representation. */
export function parseRational(value: unknown): Rational | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const numerator = parseInteger(fields.numerator);
  const denominator = parseInteger(fields.denominator);
  if (numerator === null || denominator === null || denominator <= 0n) return null;
  return rational(numerator, denominator);
}

/** Rounds one time, using exact halves away from zero. */
export function roundHalfAwayFromZero(value: Rational): bigint {
  const normalized = rational(value.numerator, value.denominator);
  const magnitude = absolute(normalized.numerator);
  const rounded = (magnitude + normalized.denominator / 2n) / normalized.denominator;
  return normalized.numerator < 0n ? -rounded : rounded;
}
