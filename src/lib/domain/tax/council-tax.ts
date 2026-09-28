import { rational, serializeRational } from './rational.js';
import type { SerializedRational } from './rational.js';

export const COUNCIL_TAX_BANDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const NINTHS = [6n, 7n, 8n, 9n, 11n, 13n, 15n, 18n] as const;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export interface CouncilTaxInput {
  readonly counts: Record<typeof COUNCIL_TAX_BANDS[number], number | string | null>;
  readonly bandDPence: number | null;
  readonly reportedTotal?: number | null;
  readonly geographyNeedsReview?: boolean;
}

export type CouncilTaxResult = {
  readonly status: 'available';
  readonly exactPence: SerializedRational;
  readonly sumOfBands: number;
  readonly weightedNinthsSum: string;
  readonly qualityFlags: string[];
} | {
  readonly status: 'unavailable' | 'invalid-input';
  readonly reasons: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(reasons: string[]): string[] {
  return [...new Set(reasons)].sort();
}

/** Gross authority-average charge; source markers never become zero or a fallback. */
export function calculateCouncilTax(input: unknown): CouncilTaxResult {
  if (!record(input)) return { status: 'invalid-input', reasons: ['invalid-council-tax-input'] };
  const invalid: string[] = [];
  const unavailable: string[] = [];
  const counts: bigint[] = [];
  if (input.counts === undefined || input.counts === null) unavailable.push('stock-unavailable');
  else if (!record(input.counts)) invalid.push('invalid-stock-counts');
  else {
    for (const band of COUNCIL_TAX_BANDS) {
      const value = input.counts[band];
      if (value === '-' || value === '[c]') {
        unavailable.push(value === '-' ? 'stock-marker-unverified' : 'stock-suppressed');
      } else if (value === null || value === undefined || value === '') {
        unavailable.push('stock-unavailable');
      } else if (typeof value === 'number') {
        if (Number.isSafeInteger(value) && value >= 0) counts.push(BigInt(value));
        else invalid.push('invalid-stock-count');
      } else if (typeof value === 'string') {
        if (/^[0-9]+$/.test(value)) {
          const parsed = BigInt(value);
          if (parsed <= MAX_SAFE_INTEGER) counts.push(parsed);
          else invalid.push('invalid-stock-count');
        } else unavailable.push('source-value-unrecognised');
      } else invalid.push('invalid-stock-count');
    }
  }

  const charge = input.bandDPence;
  if (charge === undefined || charge === null || charge === 0) unavailable.push('charge-unavailable');
  else if (typeof charge !== 'number' || !Number.isSafeInteger(charge) || charge < 0) {
    invalid.push('invalid-band-d-charge');
  }
  const reported = input.reportedTotal;
  if (reported === undefined || reported === null) unavailable.push('stock-total-unavailable');
  else if (typeof reported !== 'number' || !Number.isSafeInteger(reported) || reported < 0) {
    invalid.push('invalid-stock-total');
  }
  if (input.geographyNeedsReview !== undefined && typeof input.geographyNeedsReview !== 'boolean') {
    invalid.push('invalid-geography-review-flag');
  } else if (input.geographyNeedsReview === true) unavailable.push('geography-needs-review');

  let sum = 0n;
  let weighted = 0n;
  if (counts.length === COUNCIL_TAX_BANDS.length) {
    sum = counts.reduce((total, count) => total + count, 0n);
    weighted = counts.reduce((total, count, index) => total + count * NINTHS[index]!, 0n);
    if (sum === 0n) unavailable.push('stock-total-nonpositive');
    if (sum > MAX_SAFE_INTEGER) invalid.push('invalid-stock-sum');
    if (typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0) {
      const difference = sum - BigInt(reported);
      if (difference < -45n || difference > 45n) invalid.push('stock-reconciliation-out-of-range');
    }
  }
  if (invalid.length) return { status: 'invalid-input', reasons: unique([...invalid, ...unavailable]) };
  if (unavailable.length) return { status: 'unavailable', reasons: unique(unavailable) };

  return {
    status: 'available',
    exactPence: serializeRational(rational(BigInt(charge as number) * weighted, 9n * sum)),
    sumOfBands: Number(sum),
    weightedNinthsSum: weighted.toString(),
    qualityFlags: ['authority-average-charge-proxy', 'mixed-source-periods', 'rounded-stock-counts'],
  };
}
