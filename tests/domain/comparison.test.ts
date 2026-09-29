import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareTaxes } from '../../src/lib/domain/tax/comparison.js';
import { ILLUSTRATIVE_POLICY, POLICY_VERSION } from '../../src/lib/domain/tax/policy.js';
import { SDLT_RULE_VERSION, STANDARD_BUYER, FIRST_TIME_BUYER } from '../../src/lib/domain/tax/sdlt.js';
import type { AvailableComparison, ComparisonInput } from '../../src/lib/domain/tax/types.js';

const sourceJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function input(overrides: Record<string, unknown> = {}): ComparisonInput {
  return {
    schemaVersion: '1.0.0', policyVersion: POLICY_VERSION,
    mode: 'ongoing-owner', jurisdiction: 'England', residenceScope: 'primary-residence',
    propertyValuePence: 30_000_000, annualCouncilTaxPence: 180_000,
    provenance: { dataVersion: 'phase0-fixtures', methodologyVersion: 'phase0-v1',
      valueSource: 'fixture', councilTaxSource: 'fixture' },
    ...overrides,
  } as ComparisonInput;
}
function purchase(mode: 'annualised-ownership' | 'purchase-year', overrides: Record<string, unknown> = {}): ComparisonInput {
  return input({ mode, propertyValuePence: 50_000_000, buyer: STANDARD_BUYER,
    sdltRuleVersion: SDLT_RULE_VERSION, ...(mode === 'annualised-ownership' ? { ownershipYears: 20 } : {}),
    ...overrides });
}
function available(value: unknown, policy: unknown = ILLUSTRATIVE_POLICY): AvailableComparison {
  const result = compareTaxes(value, policy);
  assert.equal(result.status, 'available', JSON.stringify(result));
  return result;
}
function failure(value: unknown, status: 'unavailable' | 'invalid-input', reason?: string, policy?: unknown) {
  const result = compareTaxes(value, policy);
  assert.equal(result.status, status, JSON.stringify(result));
  assert.equal('difference' in result, false);
  assert.equal('current' in result, false);
  assert.equal('scenario' in result, false);
  assert.equal('classification' in result, false);
  if (reason) assert.ok(result.reasons.includes(reason), JSON.stringify(result));
  return result;
}

test('plan examples use exactly 0.48%, with positive changes meaning greater cost', () => {
  const lower = available(input());
  assert.deepEqual(lower.scenario.propertyTax.exactPence, { numerator: '144000', denominator: '1' });
  assert.equal(lower.scenario.total.displayPrecise, '£1,440.00');
  assert.equal(lower.difference.roundedPence, '-36000');
  assert.equal(lower.difference.displayPounds, '-£360');
  assert.equal(lower.monthlyEquivalent?.roundedPence, '-3000');
  assert.equal(lower.direction, 'lower');
  assert.deepEqual(lower.percentageDifference, { exact: { numerator: '-20', denominator: '1' }, display: '−20.00%' });
  const higher = available(input({ propertyValuePence: 50_000_000 }));
  assert.equal(higher.difference.roundedPence, '60000');
  assert.equal(higher.difference.displayPounds, '+£600');
  assert.equal(higher.monthlyEquivalent?.roundedPence, '5000');
  assert.equal(higher.direction, 'higher');
  assert.deepEqual(higher.percentageDifference, { exact: { numerator: '100', denominator: '3' }, display: '+33.33%' });
});

test('fractional property-tax pennies survive the exact 48/10000 rate', () => {
  const result = available(input({ propertyValuePence: 1, annualCouncilTaxPence: 0 }));
  assert.deepEqual(result.scenario.propertyTax.exactPence, { numerator: '3', denominator: '625' });
  assert.equal(result.scenario.propertyTax.roundedPence, '0');
  assert.equal(result.direction, 'higher');
});

test('custom rates use exact arithmetic and update totals, displays and classification in every mode', () => {
  const result = available(input({ propertyTaxRatePercent: 1 }));
  assert.equal(result.propertyTaxRatePercent, 1);
  assert.equal(result.scenario.total.displayPrecise, '£3,000.00');
  assert.equal(result.difference.displayPrecise, '+£1,200.00');
  assert.equal(result.monthlyEquivalent?.displayPrecise, '+£100.00');
  assert.equal(result.classification.kind, 'higher');
  assert.ok(result.assumptions.includes('Illustrative 1% property tax — uncapped (custom rate).'));
  assert.ok(result.assumptions.every(value => !value.includes('0.48%')));
  const fractional = available(input({ propertyValuePence: 1, propertyTaxRatePercent: 0.1234 }));
  assert.deepEqual(fractional.scenario.propertyTax.exactPence, { numerator: '617', denominator: '500000' });
  for (const mode of ['annualised-ownership', 'purchase-year'] as const) {
    const custom = available(purchase(mode, { propertyTaxRatePercent: 0.6, ownershipYears: 10 }));
    assert.equal(custom.scenario.total.displayPrecise, '£3,000.00');
    assert.equal(custom.current.sdltUpfront.displayPrecise, '£15,000.00');
    assert.equal(custom.difference.displayPrecise, mode === 'annualised-ownership' ? '-£300.00' : '-£13,800.00');
  }
  assert.equal(available(input({ propertyTaxRatePercent: 0 })).scenario.total.roundedPence, '0');
  assert.equal(available(input({ propertyTaxRatePercent: 100 })).scenario.total.roundedPence, '30000000');
  assert.equal(available(input()).propertyTaxRatePercent, 0.48);
  assert.deepEqual(ILLUSTRATIVE_POLICY.annualRate, { numerator: 48, denominator: 10000 });
});

test('invalid custom rates never produce a numeric result or fall back to the default', () => {
  for (const propertyTaxRatePercent of [-1, 100.0001, 0.12345, NaN, Infinity, null, '', '0.48', [], {}]) {
    failure(input({ propertyTaxRatePercent }), 'invalid-input', 'invalid-property-tax-rate');
  }
});

test('annualised and purchase-year examples account for independently expected £15,000 SDLT', () => {
  const annualised = available(purchase('annualised-ownership'));
  assert.equal(annualised.current.sdltUpfront.roundedPence, '1500000');
  assert.equal(annualised.current.sdltIncluded.roundedPence, '75000');
  assert.equal(annualised.current.total.roundedPence, '255000');
  assert.equal(annualised.scenario.total.roundedPence, '240000');
  assert.equal(annualised.difference.roundedPence, '-15000');
  assert.equal(annualised.monthlyEquivalent?.roundedPence, '-1250');
  assert.equal(annualised.ownershipYears, 20);
  assert.equal(annualised.basis, 'annual');
  assert.ok(annualised.assumptions.some(value => value.includes('without growth')));

  const firstYear = available(purchase('purchase-year'));
  assert.equal(firstYear.current.sdltUpfront.roundedPence, '1500000');
  assert.equal(firstYear.current.sdltIncluded.roundedPence, '1500000');
  assert.equal(firstYear.current.total.roundedPence, '1680000');
  assert.equal(firstYear.difference.roundedPence, '-1440000');
  assert.equal(firstYear.monthlyEquivalent, null);
  assert.equal(firstYear.ownershipYears, null);
  assert.equal(firstYear.basis, 'first-year-cash-cost');
  assert.equal(firstYear.classification.basis, 'first-year-cash-cost');
  assert.ok(firstYear.assumptions.some(value => value.includes('not a recurring annual saving')));
  for (const result of [annualised, firstYear]) {
    assert.equal(result.scenario.councilTax.roundedPence, '0');
    assert.equal(result.scenario.sdlt.roundedPence, '0');
    assert.equal(result.sdltRuleVersion, SDLT_RULE_VERSION);
    assert.equal(result.sdlt?.status, 'available');
  }
});

test('annualisation preserves fractions for ownership periods that do not divide SDLT', () => {
  const result = available(purchase('annualised-ownership', { ownershipYears: 7 }));
  assert.deepEqual(result.current.sdltIncluded.exactPence, { numerator: '1500000', denominator: '7' });
  assert.deepEqual(result.current.total.exactPence, { numerator: '2760000', denominator: '7' });
  assert.deepEqual(result.difference.exactPence, { numerator: '-1080000', denominator: '7' });
  assert.deepEqual(result.monthlyEquivalent?.exactPence, { numerator: '-90000', denominator: '7' });
});

test('first-time-buyer selection changes only the supported purchase liability', () => {
  const result = available(purchase('annualised-ownership', { buyer: FIRST_TIME_BUYER }));
  assert.equal(result.current.sdltUpfront.roundedPence, '1000000');
  assert.equal(result.current.total.roundedPence, '230000');
  assert.equal(result.scenario.total.roundedPence, '240000');
  assert.equal(result.difference.roundedPence, '10000');
  assert.equal(result.classification.kind, 'near-zero');
});

test('all five immutable real examples reproduce their displayed comparison results', () => {
  const fixtures = sourceJson('data/fixtures/phase0-worked-examples.json');
  assert.equal(fixtures.length, 5);
  for (const fixture of fixtures) {
    const result = available(input({ propertyValuePence: fixture.price.value * 100,
      annualCouncilTaxPence: { numerator: String(BigInt(fixture.baseline_exact_gbp.numerator) * 100n),
        denominator: String(fixture.baseline_exact_gbp.denominator) } }));
    const asPennies = (gbp: string) => BigInt(gbp.replace('.', '')).toString();
    assert.equal(result.current.councilTax.roundedPence, asPennies(fixture.expected.baseline_gbp), fixture.msoa_code);
    assert.equal(result.scenario.total.roundedPence, asPennies(fixture.expected.scenario_gbp), fixture.msoa_code);
    assert.equal(result.difference.roundedPence, asPennies(fixture.expected.annual_change_gbp), fixture.msoa_code);
    assert.equal(result.monthlyEquivalent?.roundedPence, asPennies(fixture.expected.monthly_equivalent_gbp), fixture.msoa_code);
  }
});

test('immutable synthetic comparison cases retain expected signs, modes and missing data', () => {
  const { cases } = sourceJson('data/fixtures/phase0-synthetic-examples.json');
  for (const fixture of cases) {
    if (fixture.mode === undefined && fixture.id !== 'missing-price') continue;
    const values: Record<string, unknown> = { ...input() };
    for (const field of ['mode', 'propertyValuePence', 'annualCouncilTaxPence', 'ownershipYears']) {
      if (Object.hasOwn(fixture, field)) values[field] = fixture[field];
    }
    if (values.mode !== 'ongoing-owner') Object.assign(values, { buyer: STANDARD_BUYER, sdltRuleVersion: SDLT_RULE_VERSION });
    if (fixture.expectedStatus) {
      failure(values, fixture.expectedStatus, fixture.expectedReason);
      continue;
    }
    const result = available(values);
    const expected = [
      [fixture.expectedScenarioPence, result.scenario.total.roundedPence],
      [fixture.expectedCurrentPence, result.current.total.roundedPence],
      [fixture.expectedAnnualChangePence, result.difference.roundedPence],
      [fixture.expectedFirstYearChangePence, result.difference.roundedPence],
      [fixture.expectedMonthlyEquivalentPence, result.monthlyEquivalent?.roundedPence],
    ];
    for (const [value, actual] of expected) if (value !== undefined) assert.equal(actual, String(value), fixture.id);
    if (fixture.expectedRecurringMonthlyDisplay === null) assert.equal(result.monthlyEquivalent, null);
  }
});

test('near-zero annual classification includes exactly ±£100 and uses unrounded values', () => {
  const cases: [unknown, 'lower' | 'higher' | 'near-zero', 'lower' | 'higher'][] = [
    [134000, 'near-zero', 'higher'], [154000, 'near-zero', 'lower'],
    [{ numerator: '133999999', denominator: '1000' }, 'higher', 'higher'],
    [{ numerator: '154000001', denominator: '1000' }, 'lower', 'lower'],
    [{ numerator: '134000001', denominator: '1000' }, 'near-zero', 'higher'],
    [{ numerator: '153999999', denominator: '1000' }, 'near-zero', 'lower'],
  ];
  for (const [annualCouncilTaxPence, kind, direction] of cases) {
    const result = available(input({ annualCouncilTaxPence }));
    assert.equal(result.classification.kind, kind);
    assert.equal(result.classification.basis, 'annual');
    assert.equal(result.classification.thresholdPence, '10000');
    assert.equal(result.direction, direction);
    assert.notEqual(result.monthlyEquivalent, null);
  }
});

test('monthly equivalents use the unrounded annual difference and do not affect map class', () => {
  const tiny = available(input({ propertyValuePence: 1250,
    annualCouncilTaxPence: { numerator: '1', denominator: '1000' } }));
  assert.deepEqual(tiny.difference.exactPence, { numerator: '5999', denominator: '1000' });
  assert.equal(tiny.difference.roundedPence, '6');
  assert.deepEqual(tiny.monthlyEquivalent?.exactPence, { numerator: '5999', denominator: '12000' });
  assert.equal(tiny.monthlyEquivalent?.roundedPence, '0');
  assert.equal(tiny.monthlyEquivalent?.displayPrecise, '£0.00');
  const outsideAnnualThreshold = available(input({ annualCouncilTaxPence: 133999 }));
  assert.equal(outsideAnnualThreshold.monthlyEquivalent?.roundedPence, '833');
  assert.equal(outsideAnnualThreshold.classification.kind, 'higher');
});

test('unchanged and zero-current cases retain defined directions and percentage semantics', () => {
  const unchanged = available(input({ propertyValuePence: 37_500_000 }));
  assert.equal(unchanged.difference.roundedPence, '0');
  assert.equal(unchanged.direction, 'unchanged');
  assert.equal(unchanged.classification.kind, 'near-zero');
  assert.deepEqual(unchanged.percentageDifference, { exact: { numerator: '0', denominator: '1' }, display: '0.00%' });
  const noCurrent = available(input({ annualCouncilTaxPence: 0 }));
  assert.equal(noCurrent.percentageDifference, null);
  assert.equal(noCurrent.direction, 'higher');
  const allZero = available(input({ annualCouncilTaxPence: 0, propertyValuePence: 0 }));
  assert.equal(allZero.percentageDifference, null);
  assert.equal(allZero.direction, 'unchanged');
});

test('rounded negative zero disappears from currency and percentage without losing the exact sign', () => {
  const result = available(input({ propertyValuePence: 10000,
    annualCouncilTaxPence: { numerator: '480001', denominator: '10000' } }));
  assert.deepEqual(result.difference.exactPence, { numerator: '-1', denominator: '10000' });
  assert.equal(result.direction, 'lower');
  assert.equal(result.difference.roundedPence, '0');
  assert.equal(result.difference.displayPounds, '£0');
  assert.equal(result.difference.displayPrecise, '£0.00');
  assert.equal(result.monthlyEquivalent?.displayPrecise, '£0.00');
  assert.equal(result.percentageDifference?.display, '0.00%');
});

test('all modes preserve detached provenance, version context and JSON-safe output', () => {
  for (const mode of ['ongoing-owner', 'annualised-ownership', 'purchase-year'] as const) {
    const provenance = { dataVersion: 'sample-2026-09-26-v1', methodologyVersion: 'phase0-v1' as const,
      valueSource: 'area-estimate' as const, councilTaxSource: 'area-estimate' as const,
      area: { code: 'E02002830', name: 'Bradgate Heights & Beaumont Leys', geography: 'MSOA' as const, availability: 'available' as const },
      sourcePeriods: { price: '2024-10-01/2025-09-30', stock: '2025-03-31', charge: '2026-04-01/2027-03-31' },
      sourceRefs: { price: { sourceId: 'ons-msoa-prices', cell: '1a!DT350' }, rawCounts: [2570, '-'] },
    };
    const supplied = mode === 'ongoing-owner' ? input({ provenance }) : purchase(mode, { provenance });
    supplied.qualityFlags = ['mixed-source-periods', 'rounded-stock-counts', 'mixed-source-periods'];
    const before = JSON.stringify(supplied);
    const result = available(supplied);
    assert.equal(JSON.stringify(supplied), before);
    assert.deepEqual(result.provenance, provenance);
    assert.notEqual(result.provenance, provenance);
    assert.equal(result.estimateKind, 'area-estimate');
    assert.equal(result.schemaVersion, '1.0.0');
    assert.equal(result.engineVersion, '1.0.0');
    assert.equal(result.requestedPolicyVersion, POLICY_VERSION);
    assert.equal(result.policyVersion, POLICY_VERSION);
    assert.equal(result.mode, mode);
    assert.equal(result.currency, 'GBP');
    assert.equal(result.units, 'pence');
    assert.deepEqual(result.qualityFlags, ['mixed-source-periods', 'rounded-stock-counts']);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    provenance.sourceRefs.price.cell = 'changed-after-calculation';
    assert.equal(JSON.stringify(result.provenance).includes('changed-after-calculation'), false);
  }
});

test('personal sources are explicit and any personal input marks a personal comparison', () => {
  assert.equal(available(input()).estimateKind, 'fixture');
  for (const field of ['valueSource', 'councilTaxSource']) {
    const provenance = { ...input().provenance, [field]: 'personal-input', dataVersion: null };
    const result = available(input({ provenance }));
    assert.equal(result.estimateKind, 'personal-comparison');
    assert.deepEqual(result.provenance, provenance);
  }
});

test('missing inputs and explicit source reasons never produce a numeric or neutral result', () => {
  for (const [overrides, reason] of [
    [{ propertyValuePence: null }, 'price-unavailable'],
    [{ annualCouncilTaxPence: null }, 'council-tax-unavailable'],
    [{ unavailableReasons: ['stock-marker-unverified'] }, 'stock-marker-unverified'],
    [{ unavailableReasons: ['stock-suppressed'] }, 'stock-suppressed'],
    [{ unavailableReasons: ['geography-needs-review'] }, 'geography-needs-review'],
  ] as const) {
    const result = failure(input(overrides), 'unavailable', reason);
    assert.deepEqual(result.provenance, input().provenance);
    assert.equal(result.mode, 'ongoing-owner');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
  const both = failure(input({ propertyValuePence: null, annualCouncilTaxPence: null,
    unavailableReasons: ['price-unavailable', 'price-unavailable'] }), 'unavailable');
  assert.deepEqual([...both.reasons].sort(), ['council-tax-unavailable', 'price-unavailable']);
});

test('the canonical policy matches its immutable JSON and changed semantics are rejected', () => {
  const fixture = sourceJson('data/policies/illustrative-ppt-v1.json');
  assert.deepEqual(ILLUSTRATIVE_POLICY, fixture);
  available(input(), fixture);
  for (const policy of [null, [], {},
    { ...fixture, annualRate: { numerator: 48, denominator: 1000 } },
    { ...fixture, annualRate: { numerator: 96, denominator: 20000 } },
    { ...fixture, annualRate: { numerator: 48, denominator: 0 } },
    { ...fixture, annualRate: { numerator: '48', denominator: 10000 } },
    { ...fixture, annualIncreaseCap: 120000 },
    { ...fixture, replacesCouncilTax: false },
    { ...fixture, deferralModelled: true },
    { ...fixture, sdltTreatment: 'retained' },
    { ...fixture, jurisdiction: 'Wales' },
    { ...fixture, status: 'enacted' },
    { ...fixture, version: '2.0.0' },
    { ...fixture, hiddenSurcharge: 5 },
  ]) failure(input(), 'unavailable', 'unsupported-policy-configuration', policy);
});

test('schema, policy and SDLT versions are explicit and cannot silently fall back', () => {
  failure(input({ schemaVersion: '2.0.0' }), 'invalid-input', 'unsupported-input-schema');
  failure(input({ policyVersion: '' }), 'invalid-input', 'invalid-policy-version');
  failure(input({ policyVersion: 'illustrative-ppt:2.0.0' }), 'unavailable', 'unsupported-policy-version');
  failure(purchase('purchase-year', { sdltRuleVersion: 'latest' }), 'unavailable', 'unsupported-rule-version');
  failure(purchase('purchase-year', { sdltRuleVersion: undefined }), 'invalid-input', 'sdlt-rule-version-required');
  failure(purchase('annualised-ownership', { ownershipYears: undefined }), 'invalid-input', 'ownership-years-required');
});

test('unsupported jurisdictions, residence scopes and purchase cases retain guidance and no estimate', () => {
  failure(input({ jurisdiction: 'Wales' }), 'unavailable', 'unsupported-jurisdiction');
  failure(input({ residenceScope: 'second-home' }), 'unavailable', 'unsupported-residence-scope');
  for (const mode of ['annualised-ownership', 'purchase-year'] as const) {
    const result = failure(purchase(mode, { buyer: { ...STANDARD_BUYER, additionalProperty: true } }), 'unavailable', 'unsupported-buyer');
    assert.ok(result.guidanceUrls.includes('https://www.gov.uk/stamp-duty-land-tax/residential-property-rates'));
    failure(purchase(mode, { buyer: undefined }), 'unavailable', 'unsupported-buyer');
    failure(purchase(mode, { buyer: FIRST_TIME_BUYER, propertyValuePence: 50_000_001 }), 'unavailable', 'first-time-buyer-price-limit');
  }
  failure(purchase('purchase-year', { buyer: { ...STANDARD_BUYER, tenure: 'new-lease' }, propertyValuePence: null }), 'unavailable', 'unsupported-buyer');
  failure(input({ buyer: { ...STANDARD_BUYER, additionalProperty: true }, sdltRuleVersion: SDLT_RULE_VERSION }), 'unavailable', 'unsupported-buyer');
});

test('non-object schemas, unknown fields and malformed money fail without coercion', () => {
  for (const value of [null, undefined, [], 'input', 0, false]) failure(value, 'invalid-input', 'invalid-input-schema');
  failure(input({ unmodelledDiscount: 25 }), 'invalid-input', 'unknown-input-field');
  for (const value of [undefined, -1, 1.1, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1,
    '30000000', '', false, true, [], {}, 1n]) {
    failure(input({ propertyValuePence: value }), 'invalid-input', 'invalid-property-value');
    failure(input({ annualCouncilTaxPence: value }), 'invalid-input', 'invalid-council-tax');
  }
});

test('exact Council Tax fractions reject unexpected fields and invalid number representations', () => {
  for (const bill of [
    { numerator: '180000', denominator: '1', discount: 0 },
    { numerator: '180000', denominator: '1', constructor: 'ignored' },
    { numerator: -1, denominator: 1 }, { numerator: 1, denominator: 0 },
    { numerator: 1, denominator: -1 }, { numerator: 1.5, denominator: 1 },
    { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
    { numerator: 1n, denominator: 1n }, { numerator: '1e3', denominator: '1' },
    { numerator: ' 180000 ', denominator: '1' }, { numerator: 'Infinity', denominator: '1' },
    { numerator: '180000' }, { denominator: '1' }, { numerator: [], denominator: 1 },
  ]) failure(input({ annualCouncilTaxPence: bill }), 'invalid-input', 'invalid-council-tax');
});

test('enum arrays and objects never pass through string coercion', () => {
  for (const mode of [['ongoing-owner'], { toString: () => 'ongoing-owner' }, 'unknown']) {
    const result = failure(input({ mode }), 'invalid-input', 'unsupported-comparison-mode');
    assert.equal(result.mode, null);
  }
  for (const field of ['valueSource', 'councilTaxSource']) {
    failure(input({ provenance: { ...input().provenance, [field]: ['fixture'] } }), 'invalid-input', 'invalid-provenance');
  }
  const area = { code: 'E02002830', name: 'Leicester 004', geography: 'MSOA', availability: 'available' };
  for (const patch of [{ geography: ['MSOA'] }, { availability: ['available'] }]) {
    failure(input({ provenance: { ...input().provenance, area: { ...area, ...patch } } }), 'invalid-input', 'invalid-provenance');
  }
});

test('invalid ownership periods, provenance and reason arrays are explicit input errors', () => {
  for (const ownershipYears of [0, -1, 1.5, '20', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, []]) {
    failure(purchase('annualised-ownership', { ownershipYears }), 'invalid-input', 'invalid-ownership-years');
  }
  for (const provenance of [undefined, null, [], {},
    { ...input().provenance, methodologyVersion: 'latest' },
    { ...input().provenance, sourceRefs: [] },
    { ...input().provenance, sourceRefs: { invalid: NaN } },
    { ...input().provenance, sourceRefs: { invalid: 1n } },
    { ...input().provenance, sourcePeriods: { price: null } },
    { ...input().provenance, valueSource: 'area-estimate' },
  ]) failure(input({ provenance }), 'invalid-input', 'invalid-provenance');
  for (const field of ['qualityFlags', 'unavailableReasons']) {
    for (const value of [null, 'stock-suppressed', {}, [''], [null], [0]]) {
      failure(input({ [field]: value }), 'invalid-input', 'invalid-reason-list');
    }
  }
});

test('ongoing-owner mode excludes purchase tax even when an explicit valid buyer is supplied', () => {
  const plain = available(input());
  const withBuyer = available(input({ buyer: STANDARD_BUYER, sdltRuleVersion: SDLT_RULE_VERSION }));
  assert.deepEqual(withBuyer.current, plain.current);
  assert.deepEqual(withBuyer.difference, plain.difference);
  assert.equal(withBuyer.sdlt, null);
  assert.equal(withBuyer.sdltRuleVersion, null);
  assert.equal(withBuyer.ownershipYears, null);
});

test('unavailable area provenance cannot become an area estimate by dropping its reasons', () => {
  failure(input({ provenance: { ...input().provenance, valueSource: 'area-estimate', councilTaxSource: 'area-estimate',
    area: { code: 'E02000927', name: 'Unavailable sample area', geography: 'MSOA', availability: 'unavailable' } } }),
  'invalid-input', 'inconsistent-area-availability');
});
