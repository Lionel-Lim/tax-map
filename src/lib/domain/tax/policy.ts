export const POLICY_VERSION = 'illustrative-ppt:1.0.0';

/** Canonical v1 semantics; a familiar ID never authorises changed tax rules. */
export const ILLUSTRATIVE_POLICY = Object.freeze({
  id: 'illustrative-ppt', version: '1.0.0', status: 'illustrative',
  label: 'Illustrative 0.48% property tax — uncapped', jurisdiction: 'England', currency: 'GBP',
  annualRate: Object.freeze({ numerator: 48, denominator: 10000 }),
  residenceScope: 'primary-residence', replacesCouncilTax: true,
  sdltTreatment: 'abolished-for-supported-primary-residence-purchases',
  annualIncreaseCap: null, deferralModelled: false, defaultComparison: 'ongoing-owner',
  valuationMeasure: 'ONS median transaction price, all property types', methodologyVersion: 'phase0-v1',
  reviewedOn: '2026-09-06', contextSource: 'https://fairershare.org.uk/proportional-property-tax/',
  note: 'An illustrative replacement scenario. This configuration does not implement the complete Fairer Share proposal or describe an enacted tax.',
} as const);
export type Policy = typeof ILLUSTRATIVE_POLICY;

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => equal(a[k], b[k]));
}

export function validatePolicy(value: unknown): { valid: true; policy: Policy } | { valid: false; reason: string } {
  if (!equal(value, ILLUSTRATIVE_POLICY)) return { valid: false, reason: 'unsupported-policy-configuration' };
  return { valid: true, policy: ILLUSTRATIVE_POLICY };
}
