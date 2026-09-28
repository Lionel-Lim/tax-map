/** England SDLT, pinned to rules effective 1 April 2025 and verified 26 September 2026. */
export const SDLT_RULE_VERSION = 'sdlt-england-2025-04-01-v1';

const RESIDENTIAL_GUIDANCE = 'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates';
const ELIGIBILITY_GUIDANCE = 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29811';
const FIRST_TIME_GUIDANCE = 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29845';
const ROUNDING_GUIDANCE = 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050';
const CONSIDERATION_GUIDANCE = 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm03700';

export interface SdltBuyer {
  readonly profile: 'standard' | 'first-time-buyer';
  /** UK residence for SDLT purposes; nationality or income-tax residence alone is insufficient. */
  readonly residence: 'uk-resident';
  readonly purchaser: 'individual';
  readonly mainResidence: true;
  /** Explicit confirmation that higher rates for additional dwellings do not apply. */
  readonly additionalProperty: false;
  readonly propertyUse: 'residential';
  /** A single dwelling, with no linked land transaction. */
  readonly transaction: 'single-property';
  readonly tenure: 'freehold' | 'assigned-lease';
  readonly sharedOwnership: false;
  /** All purchasers satisfy HMRC's first-time-buyer definition, including worldwide acquisitions. */
  readonly firstTimeBuyerEligible?: boolean;
}

/** Scenario presets are explicit assumptions, not an assessment of a person's tax status. */
export const STANDARD_BUYER: Readonly<SdltBuyer> = Object.freeze({
  profile: 'standard', residence: 'uk-resident', purchaser: 'individual', mainResidence: true,
  additionalProperty: false, propertyUse: 'residential', transaction: 'single-property',
  tenure: 'freehold', sharedOwnership: false,
});
export const FIRST_TIME_BUYER: Readonly<SdltBuyer> = Object.freeze({
  ...STANDARD_BUYER, profile: 'first-time-buyer', firstTimeBuyerEligible: true,
});

interface SdltRuleBand {
  readonly lowerPence: number;
  readonly upperPence: number | null;
  readonly rateNumerator: number;
  readonly rateDenominator: number;
}

/** Mirrored by the independently reviewed JSON register; a test prevents drift. */
export const SDLT_RULES = Object.freeze({
  version: SDLT_RULE_VERSION,
  jurisdiction: 'England',
  effectiveFrom: '2025-04-01',
  verifiedOn: '2026-09-26',
  rounding: 'floor-total-to-whole-pound',
  considerationRounding: 'none',
  firstTimeBuyerMaximumPence: 50_000_000,
  standardBands: Object.freeze([
    Object.freeze({ lowerPence: 0, upperPence: 12_500_000, rateNumerator: 0, rateDenominator: 100 }),
    Object.freeze({ lowerPence: 12_500_000, upperPence: 25_000_000, rateNumerator: 2, rateDenominator: 100 }),
    Object.freeze({ lowerPence: 25_000_000, upperPence: 92_500_000, rateNumerator: 5, rateDenominator: 100 }),
    Object.freeze({ lowerPence: 92_500_000, upperPence: 150_000_000, rateNumerator: 10, rateDenominator: 100 }),
    Object.freeze({ lowerPence: 150_000_000, upperPence: null, rateNumerator: 12, rateDenominator: 100 }),
  ] satisfies readonly SdltRuleBand[]),
  firstTimeBuyerBands: Object.freeze([
    Object.freeze({ lowerPence: 0, upperPence: 30_000_000, rateNumerator: 0, rateDenominator: 100 }),
    Object.freeze({ lowerPence: 30_000_000, upperPence: 50_000_000, rateNumerator: 5, rateDenominator: 100 }),
  ] satisfies readonly SdltRuleBand[]),
  guidanceUrls: Object.freeze([
    RESIDENTIAL_GUIDANCE, ELIGIBILITY_GUIDANCE, FIRST_TIME_GUIDANCE,
    ROUNDING_GUIDANCE, CONSIDERATION_GUIDANCE,
  ]),
});

export interface SdltExactPence {
  readonly numerator: string;
  readonly denominator: string;
}

export interface SdltBandBreakdown {
  readonly lowerPence: number;
  readonly upperPence: number | null;
  readonly taxablePence: string;
  readonly rate: { readonly numerator: number; readonly denominator: number };
  readonly taxExactPence: SdltExactPence;
}

export interface SdltReason {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly guidanceUrl?: string;
}

export type SdltResult = {
  readonly status: 'available';
  readonly valuePence: number;
  readonly buyer: SdltBuyer;
  /** Statutory payable SDLT, represented in integer pence and rounded down to a whole pound. */
  readonly totalPence: string;
  readonly rawTaxExactPence: SdltExactPence;
  readonly rounding: 'floor-total-to-whole-pound';
  readonly bands: readonly SdltBandBreakdown[];
  readonly ruleVersion: string;
  readonly rule: {
    readonly version: string;
    readonly jurisdiction: string;
    readonly effectiveFrom: string;
    readonly verifiedOn: string;
  };
  readonly guidanceUrls: readonly string[];
} | {
  readonly status: 'invalid-input' | 'unavailable';
  readonly reasons: readonly SdltReason[];
  readonly ruleVersion: string;
  readonly guidanceUrls: readonly string[];
};

function exact(numerator: bigint, denominator: bigint): SdltExactPence {
  let a = numerator;
  let b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: (numerator / a).toString(), denominator: (denominator / a).toString() };
}

function unsupported(field: string, message: string, guidanceUrl = RESIDENTIAL_GUIDANCE): SdltReason {
  return { code: 'unsupported-buyer', field, message, guidanceUrl };
}

/**
 * Calculate a deliberately limited, versioned purchase scenario.
 * valuePence is the entire chargeable consideration, not the deposit or mortgage.
 * The comparison layer treats its representative property value as that consideration.
 * Unknown or incomplete profiles never fall back to the standard rate.
 */
export function calculateSdlt(valuePence: number, buyer: unknown, ruleVersion: string): SdltResult {
  const failure = (status: 'invalid-input' | 'unavailable', reasons: SdltReason[]): SdltResult => ({
    status, reasons, ruleVersion: typeof ruleVersion === 'string' ? ruleVersion : '',
    guidanceUrls: [...new Set(reasons.flatMap((reason) => reason.guidanceUrl ? [reason.guidanceUrl] : []))],
  });
  if (!Number.isSafeInteger(valuePence) || valuePence < 0) {
    return failure('invalid-input', [{
      code: 'invalid-amount', field: 'valuePence',
      message: 'Chargeable consideration must be a non-negative safe integer in pence.',
      guidanceUrl: CONSIDERATION_GUIDANCE,
    }]);
  }
  if (ruleVersion !== SDLT_RULE_VERSION) {
    return failure('unavailable', [{
      code: 'unsupported-rule-version', field: 'ruleVersion',
      message: `Only the explicitly pinned rule version ${SDLT_RULE_VERSION} is supported.`,
      guidanceUrl: RESIDENTIAL_GUIDANCE,
    }]);
  }
  if (buyer === null || typeof buyer !== 'object' || Array.isArray(buyer)) {
    return failure('unavailable', [unsupported('buyer', 'Provide an explicit supported buyer and transaction profile.')]);
  }
  const supplied = buyer as Record<string, unknown>;
  const reasons: SdltReason[] = [];
  const allowed = new Set([
    'profile', 'residence', 'purchaser', 'mainResidence', 'additionalProperty', 'propertyUse',
    'transaction', 'tenure', 'sharedOwnership', 'firstTimeBuyerEligible',
  ]);
  for (const key of Object.keys(supplied)) {
    if (!allowed.has(key)) reasons.push(unsupported(`buyer.${key}`, 'Unknown buyer or transaction fields cannot be ignored.'));
  }
  if (supplied.profile !== 'standard' && supplied.profile !== 'first-time-buyer') {
    reasons.push(unsupported('buyer.profile', 'Select the standard or eligible first-time-buyer profile.'));
  }
  if (supplied.residence !== 'uk-resident') {
    reasons.push(unsupported('buyer.residence', 'Only purchasers confirmed UK resident for SDLT purposes are supported.'));
  }
  if (supplied.purchaser !== 'individual') {
    reasons.push(unsupported('buyer.purchaser', 'Companies, trusts, partnerships and other non-individual purchasers are unsupported.'));
  }
  if (supplied.mainResidence !== true) {
    reasons.push(unsupported('buyer.mainResidence', 'The scenario only supports a dwelling intended as the purchaser’s main residence.', ELIGIBILITY_GUIDANCE));
  }
  if (supplied.additionalProperty !== false) {
    reasons.push(unsupported('buyer.additionalProperty', 'Confirm that additional-dwelling higher rates do not apply; surcharge and refund cases are unsupported.'));
  }
  if (supplied.propertyUse !== 'residential') {
    reasons.push(unsupported('buyer.propertyUse', 'Mixed-use and non-residential land are unsupported.'));
  }
  if (supplied.transaction !== 'single-property') {
    reasons.push(unsupported('buyer.transaction', 'Only a single dwelling with no linked transactions is supported.', ELIGIBILITY_GUIDANCE));
  }
  if (supplied.tenure !== 'freehold' && supplied.tenure !== 'assigned-lease') {
    reasons.push(unsupported('buyer.tenure', 'Only a freehold or existing assigned lease is supported; new leases and rent calculations are excluded.'));
  }
  if (supplied.sharedOwnership !== false) {
    reasons.push(unsupported('buyer.sharedOwnership', 'Shared ownership transactions are unsupported.'));
  }
  if (supplied.firstTimeBuyerEligible !== undefined && typeof supplied.firstTimeBuyerEligible !== 'boolean') {
    reasons.push(unsupported('buyer.firstTimeBuyerEligible', 'First-time-buyer eligibility must be an explicit boolean.', FIRST_TIME_GUIDANCE));
  }
  if (supplied.profile === 'first-time-buyer') {
    if (supplied.firstTimeBuyerEligible !== true) {
      reasons.push({ code: 'first-time-buyer-ineligible', field: 'buyer.firstTimeBuyerEligible',
        message: 'All purchasers must confirm HMRC first-time-buyer eligibility; no standard-rate substitution is made.',
        guidanceUrl: FIRST_TIME_GUIDANCE });
    }
    if (valuePence > SDLT_RULES.firstTimeBuyerMaximumPence) {
      reasons.push({ code: 'first-time-buyer-price-limit', field: 'valuePence',
        message: 'First-time-buyer relief is unavailable above £500,000. Choose an explicitly supported standard scenario to compare standard rates.',
        guidanceUrl: RESIDENTIAL_GUIDANCE });
    }
  }
  if (reasons.length > 0) return failure('unavailable', reasons);

  const validatedBuyer: SdltBuyer = {
    profile: supplied.profile as SdltBuyer['profile'], residence: 'uk-resident', purchaser: 'individual',
    mainResidence: true, additionalProperty: false, propertyUse: 'residential', transaction: 'single-property',
    tenure: supplied.tenure as SdltBuyer['tenure'], sharedOwnership: false,
    ...(typeof supplied.firstTimeBuyerEligible === 'boolean' ? { firstTimeBuyerEligible: supplied.firstTimeBuyerEligible } : {}),
  };
  const selectedBands: readonly SdltRuleBand[] = validatedBuyer.profile === 'first-time-buyer'
    ? SDLT_RULES.firstTimeBuyerBands : SDLT_RULES.standardBands;
  const value = BigInt(valuePence);
  let taxNumerator = 0n;
  const bands = selectedBands.map((band): SdltBandBreakdown => {
    const lower = BigInt(band.lowerPence);
    const upper = band.upperPence === null ? value : BigInt(band.upperPence);
    const capped = value < upper ? value : upper;
    const taxable = capped > lower ? capped - lower : 0n;
    const numerator = taxable * BigInt(band.rateNumerator);
    // Every rate in this pinned version has denominator 100. No band is rounded.
    taxNumerator += numerator;
    return {
      lowerPence: band.lowerPence, upperPence: band.upperPence, taxablePence: taxable.toString(),
      rate: { numerator: band.rateNumerator, denominator: band.rateDenominator },
      taxExactPence: exact(numerator, BigInt(band.rateDenominator)),
    };
  });
  return {
    status: 'available', valuePence, buyer: validatedBuyer,
    totalPence: ((taxNumerator / 10_000n) * 100n).toString(),
    rawTaxExactPence: exact(taxNumerator, 100n), rounding: 'floor-total-to-whole-pound', bands,
    ruleVersion: SDLT_RULE_VERSION,
    rule: { version: SDLT_RULE_VERSION, jurisdiction: SDLT_RULES.jurisdiction,
      effectiveFrom: SDLT_RULES.effectiveFrom, verifiedOn: SDLT_RULES.verifiedOn },
    guidanceUrls: [...SDLT_RULES.guidanceUrls],
  };
}
