import { add, subtract, multiply, divide, compare, rational, parseRational, serializeRational, roundHalfAwayFromZero } from './rational.js';
import type { Rational } from './rational.js';
import { moneyAmount } from './money.js';
import { ILLUSTRATIVE_POLICY, POLICY_VERSION, validatePolicy } from './policy.js';
import { calculateSdlt } from './sdlt.js';
import type { SdltResult } from './sdlt.js';
import { isRecord, validProvenance, validateComparisonInput } from './validation.js';
import { ENGINE_VERSION, INPUT_SCHEMA_VERSION } from './types.js';
import type { ComparisonMode, ComparisonResult, FailedComparison, Issue, ResultContext } from './types.js';

const GUIDANCE = 'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates';
const ZERO = rational(0n);

export function contextFor(raw: unknown): ResultContext {
  const v = isRecord(raw) ? raw : {};
  return { engineVersion: ENGINE_VERSION, schemaVersion: INPUT_SCHEMA_VERSION,
    requestedPolicyVersion: typeof v.policyVersion === 'string' ? v.policyVersion : null,
    mode: typeof v.mode === 'string' && ['ongoing-owner', 'annualised-ownership', 'purchase-year'].includes(v.mode) ? v.mode as ComparisonMode : null,
    provenance: validProvenance(v.provenance) ? JSON.parse(JSON.stringify(v.provenance)) : null };
}
export function failure(raw: unknown, status: 'invalid-input' | 'unavailable', issues: Issue[]): FailedComparison {
  return { ...contextFor(raw), status, reasons: [...new Set(issues.map(i => i.code))], issues,
    guidanceUrls: [...new Set(issues.flatMap(i => i.guidanceUrl ? [i.guidanceUrl] : []))] };
}
function percentDisplay(exact: Rational): string {
  const hundredths = roundHalfAwayFromZero(multiply(exact, rational(100n)));
  const absolute = hundredths < 0n ? -hundredths : hundredths;
  return `${hundredths < 0n ? '−' : hundredths > 0n ? '+' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}%`;
}

/** Pure public boundary: no fetching, runtime APIs, clocks or implicit latest versions. */
export function compareTaxes(raw: unknown, policy: unknown = ILLUSTRATIVE_POLICY): ComparisonResult {
  const parsed = validateComparisonInput(raw);
  if (!parsed.valid) return failure(raw, parsed.status, parsed.issues);
  const input = parsed.input;
  if (input.policyVersion !== POLICY_VERSION) return failure(raw, 'unavailable', [{ code: 'unsupported-policy-version', field: 'policyVersion', message: 'The requested policy version is not supported.' }]);
  const selected = validatePolicy(policy);
  if (!selected.valid) return failure(raw, 'unavailable', [{ code: selected.reason, field: 'policy', message: 'Policy settings do not match the pinned version.' }]);
  // Validate purchase scope even when another required source value is missing.
  let sdlt: SdltResult | null = null;
  if (input.mode !== 'ongoing-owner' || input.buyer !== undefined || input.sdltRuleVersion !== undefined) {
    sdlt = calculateSdlt(input.propertyValuePence ?? 0, input.buyer, input.sdltRuleVersion ?? '');
    if (sdlt.status !== 'available') return failure(raw, sdlt.status, sdlt.reasons.map(i => ({ ...i, guidanceUrl: i.guidanceUrl ?? GUIDANCE })));
  }
  const missing = [...(input.unavailableReasons ?? [])];
  if (input.propertyValuePence === null) missing.push('price-unavailable');
  if (input.annualCouncilTaxPence === null) missing.push('council-tax-unavailable');
  if (missing.length) return failure(raw, 'unavailable', [...new Set(missing)].map(code => ({ code, field: 'inputs', message: 'A required area input is unavailable under the recorded source rules.' })));

  const value = rational(BigInt(input.propertyValuePence!));
  const councilTax = typeof input.annualCouncilTaxPence === 'number'
    ? rational(BigInt(input.annualCouncilTaxPence)) : parseRational(input.annualCouncilTaxPence)!;
  const upfront = sdlt?.status === 'available' && input.mode !== 'ongoing-owner' ? rational(BigInt(sdlt.totalPence)) : ZERO;
  const sdltIncluded = input.mode === 'annualised-ownership'
    ? divide(upfront, rational(BigInt(input.ownershipYears!))) : upfront;
  const current = add(councilTax, sdltIncluded);
  const propertyTax = multiply(value, rational(BigInt(selected.policy.annualRate.numerator), BigInt(selected.policy.annualRate.denominator)));
  const difference = subtract(propertyTax, current);
  const basis = input.mode === 'purchase-year' ? 'first-year-cash-cost' : 'annual';
  const percentage = current.numerator === 0n ? null : multiply(divide(difference, current), rational(100n));
  const classification = compare(difference, rational(-10000n)) < 0 ? 'lower'
    : compare(difference, rational(10000n)) > 0 ? 'higher' : 'near-zero';
  const provenance = contextFor(raw).provenance!;
  return { ...contextFor(raw), status: 'available', mode: input.mode, provenance,
    policyVersion: POLICY_VERSION, sdltRuleVersion: input.mode === 'ongoing-owner' ? null : input.sdltRuleVersion!,
    currency: 'GBP', units: 'pence', basis,
    estimateKind: [provenance.valueSource, provenance.councilTaxSource].includes('personal-input') ? 'personal-comparison'
      : provenance.valueSource === 'fixture' && provenance.councilTaxSource === 'fixture' ? 'fixture' : 'area-estimate',
    ownershipYears: input.mode === 'annualised-ownership' ? input.ownershipYears! : null,
    propertyValue: moneyAmount(value),
    current: { councilTax: moneyAmount(councilTax), sdltUpfront: moneyAmount(upfront), sdltIncluded: moneyAmount(sdltIncluded), total: moneyAmount(current) },
    scenario: { propertyTax: moneyAmount(propertyTax), councilTax: moneyAmount(ZERO), sdlt: moneyAmount(ZERO), total: moneyAmount(propertyTax) },
    difference: moneyAmount(difference, { signed: true }),
    monthlyEquivalent: basis === 'annual' ? moneyAmount(divide(difference, rational(12n)), { signed: true }) : null,
    percentageDifference: percentage ? { exact: serializeRational(percentage), display: percentDisplay(percentage) } : null,
    direction: difference.numerator > 0n ? 'higher' : difference.numerator < 0n ? 'lower' : 'unchanged',
    classification: { kind: classification, basis, thresholdPence: '10000' },
    qualityFlags: [...new Set(input.qualityFlags ?? [])],
    assumptions: [selected.policy.label, 'Owner-occupied primary residence in England.',
      'The scenario replaces Council Tax and SDLT for the supported purchase cases.',
      'No transition cap, deferral, personal discounts or exemptions are modelled.',
      ...(provenance.valueSource === 'area-estimate' ? ['The area median transaction price is a proxy, not an individual property valuation.'] : []),
      ...(provenance.councilTaxSource === 'area-estimate' ? ['Estimated gross Council Tax uses an authority-average charge.'] : []),
      ...(input.mode === 'annualised-ownership' ? [`SDLT is spread over ${input.ownershipYears} years without growth, future tax changes, finance costs or discounting.`] : []),
      ...(input.mode === 'purchase-year' ? ['First-year cash-cost comparison; the difference is not a recurring annual saving.'] : [])],
    sdlt: input.mode === 'ongoing-owner' ? null : sdlt };
}
