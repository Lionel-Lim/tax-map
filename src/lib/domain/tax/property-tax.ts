import { rational } from './rational.js';

export const DEFAULT_PROPERTY_TAX_RATE_PERCENT = 0.48;
export const PROPERTY_TAX_RATE_ERROR = 'Property tax rate must be between 0% and 100%, with at most four decimal places.';

export function isPropertyTaxRatePercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    && /^\d+(?:\.\d{1,4})?$/.test(String(value));
}

/** Convert a validated percentage to an exact fraction, without floating-point multiplication. */
export function propertyTaxRateFraction(percent: number) {
  const [whole, fraction = ''] = String(percent).split('.');
  return rational(BigInt(`${whole}${fraction}`), 100n * 10n ** BigInt(fraction.length));
}
