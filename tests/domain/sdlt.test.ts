import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateSdlt, FIRST_TIME_BUYER, STANDARD_BUYER, SDLT_RULES, SDLT_RULE_VERSION,
  type SdltBuyer, type SdltResult,
} from '../../src/lib/domain/tax/sdlt.js';

function available(valuePence: number, buyer: unknown = STANDARD_BUYER) {
  const result = calculateSdlt(valuePence, buyer, SDLT_RULE_VERSION);
  assert.equal(result.status, 'available', JSON.stringify(result));
  if (result.status !== 'available') throw new Error('Expected available SDLT');
  return result;
}

function assertFailure(result: SdltResult, code: string, status = 'unavailable') {
  assert.equal(result.status, status);
  if (result.status === 'available') throw new Error('Expected rejected SDLT');
  assert.ok(result.reasons.some((reason) => reason.code === code), JSON.stringify(result));
  assert.equal('totalPence' in result, false);
  assert.doesNotThrow(() => JSON.stringify(result));
}

test('the reviewed JSON rule register exactly matches executable rules', () => {
  const fixture = JSON.parse(readFileSync('data/rules/sdlt-england-2025-04-01.json', 'utf8'));
  assert.deepEqual(SDLT_RULES, fixture);
  assert.equal(SDLT_RULES.effectiveFrom, '2025-04-01');
  assert.equal(SDLT_RULES.verifiedOn, '2026-09-26');
});

interface OfficialFixture {
  ruleVersion: string;
  examples: {
    id: string; buyerProfile: string; valuePence: number;
    expectedTotalPence: string; expectedBandTaxPence: string[];
  }[];
}
const official = JSON.parse(readFileSync('data/fixtures/phase2-sdlt-examples.json', 'utf8')) as OfficialFixture;
for (const example of official.examples) {
  test(`independent official example: ${example.id}`, () => {
    assert.equal(official.ruleVersion, SDLT_RULE_VERSION);
    const result = available(example.valuePence,
      example.buyerProfile === 'first-time-buyer' ? FIRST_TIME_BUYER : STANDARD_BUYER);
    assert.equal(result.totalPence, example.expectedTotalPence);
    assert.deepEqual(result.bands.map((band) => band.taxExactPence),
      example.expectedBandTaxPence.map((numerator) => ({ numerator, denominator: '1' })));
  });
}

// Expected values are hand-derived from the published marginal bands. Each triple is
// one penny below, exactly at, and one penny above the threshold, before payable rounding.
const standardBoundaries = [
  { threshold: 12_500_000, totals: ['0', '0', '0'], raw: [['0', '1'], ['0', '1'], ['1', '50']] },
  { threshold: 25_000_000, totals: ['249900', '250000', '250000'], raw: [['12499999', '50'], ['250000', '1'], ['5000001', '20']] },
  { threshold: 92_500_000, totals: ['3624900', '3625000', '3625000'], raw: [['72499999', '20'], ['3625000', '1'], ['36250001', '10']] },
  { threshold: 150_000_000, totals: ['9374900', '9375000', '9375000'], raw: [['93749999', '10'], ['9375000', '1'], ['234375003', '25']] },
];
for (const boundary of standardBoundaries) {
  for (const [index, offset] of [-1, 0, 1].entries()) {
    test(`standard SDLT at ${boundary.threshold} pence ${offset < 0 ? '-' : '+'} ${Math.abs(offset)} penny`, () => {
      const result = available(boundary.threshold + offset);
      assert.equal(result.totalPence, boundary.totals[index]);
      assert.deepEqual(result.rawTaxExactPence, {
        numerator: boundary.raw[index]![0], denominator: boundary.raw[index]![1],
      });
      assert.equal(result.bands.reduce((sum, band) => sum + BigInt(band.taxablePence), 0n),
        BigInt(boundary.threshold + offset));
    });
  }
}

const firstTimeBoundaries = [
  { value: 29_999_999, total: '0', raw: ['0', '1'] },
  { value: 30_000_000, total: '0', raw: ['0', '1'] },
  { value: 30_000_001, total: '0', raw: ['1', '20'] },
  { value: 49_999_999, total: '999900', raw: ['19999999', '20'] },
  { value: 50_000_000, total: '1000000', raw: ['1000000', '1'] },
];
for (const example of firstTimeBoundaries) {
  test(`first-time-buyer boundary at ${example.value} pence`, () => {
    const result = available(example.value, FIRST_TIME_BUYER);
    assert.equal(result.totalPence, example.total);
    assert.deepEqual(result.rawTaxExactPence, { numerator: example.raw[0], denominator: example.raw[1] });
  });
}

test('one penny above £500,000 loses first-time-buyer relief without a standard substitution', () => {
  assertFailure(calculateSdlt(50_000_001, FIRST_TIME_BUYER, SDLT_RULE_VERSION), 'first-time-buyer-price-limit');
  assert.equal(available(50_000_001, STANDARD_BUYER).totalPence, '1500000');
});

test('zero consideration is a valid zero tax scenario for either supported profile', () => {
  for (const buyer of [STANDARD_BUYER, FIRST_TIME_BUYER]) {
    const result = available(0, buyer);
    assert.equal(result.totalPence, '0');
    assert.deepEqual(result.rawTaxExactPence, { numerator: '0', denominator: '1' });
  }
});

test('statutory rounding floors the final tax, retaining consideration pence', () => {
  // £1,500,008.34: £93,750 + (£8.34 × 12%) = £93,751.0008 -> £93,751.
  const result = available(150_000_834);
  assert.equal(result.totalPence, '9375100');
  assert.deepEqual(result.rawTaxExactPence, { numerator: '234377502', denominator: '25' });
  assert.equal(result.bands.at(-1)!.taxablePence, '834');
  // Half-pound tax rounds down under HMRC's SDLT rule, unlike money display rounding.
  assert.equal(available(30_001_000).totalPence, '500000');
  assert.equal(available(30_001_999).totalPence, '500000');
  assert.equal(available(30_002_000).totalPence, '500100');
});

test('existing assigned leases use the same supported consideration calculation', () => {
  assert.equal(available(29_500_000, { ...STANDARD_BUYER, tenure: 'assigned-lease' }).totalPence, '475000');
});

test('safe integer upper bound remains exact and serializable', () => {
  const result = available(Number.MAX_SAFE_INTEGER);
  assert.equal(result.valuePence, 9_007_199_254_740_991);
  assert.equal(result.totalPence, '1080863901943900');
  assert.deepEqual(result.rawTaxExactPence, { numerator: '27021597548597973', denominator: '25' });
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('invalid monetary inputs are rejected before BigInt conversion', () => {
  for (const value of [-1, NaN, Infinity, -Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1, '30000000', null, undefined]) {
    assertFailure(calculateSdlt(value as number, STANDARD_BUYER, SDLT_RULE_VERSION), 'invalid-amount', 'invalid-input');
  }
});

test('unknown or missing SDLT version is never replaced with the pinned version', () => {
  for (const version of ['', 'latest', 'sdlt-england-2022-09-23', undefined, null]) {
    assertFailure(calculateSdlt(30_000_000, STANDARD_BUYER, version as string), 'unsupported-rule-version');
  }
});

test('missing buyer objects and every missing scope confirmation are unsupported', () => {
  for (const buyer of [null, undefined, 'standard', [], {}, 42]) {
    assertFailure(calculateSdlt(30_000_000, buyer, SDLT_RULE_VERSION), 'unsupported-buyer');
  }
  for (const field of Object.keys(STANDARD_BUYER)) {
    const buyer: Record<string, unknown> = { ...STANDARD_BUYER };
    delete buyer[field];
    assertFailure(calculateSdlt(30_000_000, buyer, SDLT_RULE_VERSION), 'unsupported-buyer');
  }
});

const unsupportedCases: Record<string, unknown>[] = [
  { profile: 'landlord' }, { residence: 'non-uk-resident' }, { purchaser: 'company' },
  { purchaser: 'trust' }, { purchaser: 'partnership' }, { mainResidence: false },
  { additionalProperty: true }, { propertyUse: 'mixed-use' }, { propertyUse: 'non-residential' },
  { transaction: 'linked' }, { transaction: 'multiple-properties' }, { tenure: 'new-lease' },
  { sharedOwnership: true }, { firstTimeBuyerEligible: 'yes' }, { specialRelief: true },
];
for (const override of unsupportedCases) {
  test(`rejects unsupported scope ${JSON.stringify(override)}`, () => {
    const result = calculateSdlt(30_000_000, { ...STANDARD_BUYER, ...override }, SDLT_RULE_VERSION);
    assertFailure(result, 'unsupported-buyer');
    assert.ok(result.guidanceUrls.every((url) => url.startsWith('https://www.gov.uk/')));
    assert.ok(result.guidanceUrls.length > 0);
  });
}

test('first-time buyers must explicitly confirm eligibility for every purchaser', () => {
  for (const firstTimeBuyerEligible of [undefined, false, 'true']) {
    assertFailure(calculateSdlt(30_000_000, { ...FIRST_TIME_BUYER, firstTimeBuyerEligible }, SDLT_RULE_VERSION), 'first-time-buyer-ineligible');
  }
});

test('buyer and rule provenance are detached from mutable caller inputs', () => {
  const buyer = { ...STANDARD_BUYER } as { -readonly [Key in keyof SdltBuyer]: SdltBuyer[Key] };
  const result = available(50_000_000, buyer);
  buyer.profile = 'first-time-buyer';
  assert.equal(result.buyer.profile, 'standard');
  assert.equal(result.ruleVersion, SDLT_RULE_VERSION);
  assert.equal(result.rule.verifiedOn, '2026-09-26');
  assert.equal(result.rule.effectiveFrom, '2025-04-01');
  assert.equal(result.rounding, 'floor-total-to-whole-pound');
  assert.ok(Object.isFrozen(STANDARD_BUYER));
  assert.ok(Object.isFrozen(FIRST_TIME_BUYER));
  assert.ok(Object.isFrozen(SDLT_RULES.standardBands[0]));
});
