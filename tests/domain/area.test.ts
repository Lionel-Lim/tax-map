import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compareArea, POLICY_VERSION, SAMPLE_DATA_VERSION, AREA_SCHEMA_VERSION, SDLT_RULE_VERSION,
  STANDARD_BUYER, FIRST_TIME_BUYER } from '../../src/lib/domain/tax/index.js';
import type { AreaRecord, AreaComparisonOptions, AvailableComparison } from '../../src/lib/domain/tax/index.js';

const dataset = JSON.parse(readFileSync(`static/data/${SAMPLE_DATA_VERSION}/areas.json`, 'utf8')) as { areas: AreaRecord[] };
const settings: AreaComparisonOptions = { dataVersion: SAMPLE_DATA_VERSION, dataSchemaVersion: AREA_SCHEMA_VERSION,
  policyVersion: POLICY_VERSION, mode: 'ongoing-owner', jurisdiction: 'England', residenceScope: 'primary-residence' };
const available = dataset.areas.find(a => a.code === 'E02002830')!;
const unavailable = dataset.areas.find(a => a.code === 'E02000927')!;
function success(area: AreaRecord, options: AreaComparisonOptions = settings): AvailableComparison {
  const result = compareArea(area, options);
  assert.equal(result.status, 'available', JSON.stringify(result));
  if (result.status !== 'available') throw new Error('Expected result');
  return result;
}

test('all 203 sample areas preserve coverage and provenance in every standard mode', () => {
  assert.equal(dataset.areas.length, 203);
  for (const mode of ['ongoing-owner', 'annualised-ownership', 'purchase-year'] as const) {
    let count = 0;
    for (const area of dataset.areas) {
      const before = JSON.stringify(area);
      const options = { ...settings, mode, ...(mode === 'ongoing-owner' ? {} : {
        buyer: STANDARD_BUYER, sdltRuleVersion: SDLT_RULE_VERSION, ownershipYears: 20 }) };
      const result = compareArea(area, options);
      assert.equal(result.status, area.availability, `${area.code}/${mode}`);
      assert.equal(result.provenance?.dataVersion, SAMPLE_DATA_VERSION);
      assert.equal(result.provenance?.area?.code, area.code);
      assert.deepEqual(result.provenance?.sourceRefs, area.sourceRefs);
      assert.equal(JSON.stringify(area), before, 'input must not mutate');
      assert.doesNotThrow(() => JSON.stringify(result));
      if (result.status === 'available') {
        count++;
        assert.equal(result.estimateKind, 'area-estimate');
        assert.deepEqual(result.qualityFlags, area.qualityFlags);
        assert.equal(result.provenance.sourcePeriods?.stock, '2025-03-31');
        assert.equal(result.monthlyEquivalent === null, mode === 'purchase-year');
      } else assert.ok(result.reasons.includes('stock-marker-unverified'));
    }
    assert.equal(count, 96);
  }
});

test('a personal bill repairs all 107 missing baselines without changing any area estimate', () => {
  let count = 0;
  for (const area of dataset.areas.filter(a => a.availability === 'unavailable')) {
    const before = JSON.stringify(area);
    const result = success(area, { ...settings, overrides: { annualCouncilTaxPence: 180000 } });
    assert.equal(result.estimateKind, 'personal-comparison');
    assert.equal(result.provenance.area?.availability, 'unavailable');
    assert.equal(result.provenance.valueSource, 'area-estimate');
    assert.equal(result.provenance.councilTaxSource, 'personal-input');
    assert.equal(result.current.councilTax.displayPrecise, '£1,800.00');
    assert.equal(compareArea(area, settings).status, 'unavailable', 'reset restores original result');
    assert.equal(JSON.stringify(area), before);
    count++;
  }
  assert.equal(count, 107);
});

test('value-only overrides cannot supply missing Council Tax, and zero is an explicit personal input', () => {
  assert.equal(compareArea(unavailable, { ...settings, overrides: { propertyValuePence: 30000000 } }).status, 'unavailable');
  const result = success(unavailable, { ...settings, overrides: { annualCouncilTaxPence: 0 } });
  assert.equal(result.current.total.roundedPence, '0');
  assert.equal(result.percentageDifference, null);
});

test('each missing source dependency needs an override; unknown reasons stay unavailable', () => {
  const missing: AreaRecord = { ...unavailable, pricePence: null,
    unavailableReasons: ['stock-marker-unverified', 'price-unavailable'] };
  for (const overrides of [{ annualCouncilTaxPence: 180000 }, { propertyValuePence: 30000000 }]) {
    assert.equal(compareArea(missing, { ...settings, overrides }).status, 'unavailable');
  }
  const overrides = { annualCouncilTaxPence: 180000, propertyValuePence: 30000000 };
  assert.equal(success(missing, { ...settings, overrides }).difference.displayPrecise, '-£360.00');
  assert.equal(compareArea({ ...missing, unavailableReasons: ['unknown-quality-failure'] }, { ...settings, overrides }).status, 'unavailable');
  assert.equal(compareArea({ ...missing, unavailableReasons: ['source-value-unrecognised'] }, { ...settings, overrides }).status, 'available');
});

test('personal comparisons cannot bypass policy, rule version, buyer or transaction scope', () => {
  const overrides = { annualCouncilTaxPence: 180000, propertyValuePence: 50000001 };
  for (const patch of [
    { policyVersion: 'unknown' }, { dataVersion: 'latest' }, { dataSchemaVersion: '2' },
    { mode: 'purchase-year', buyer: FIRST_TIME_BUYER, sdltRuleVersion: SDLT_RULE_VERSION },
    { mode: 'purchase-year', buyer: STANDARD_BUYER, sdltRuleVersion: 'latest' },
    { mode: 'purchase-year', buyer: { ...STANDARD_BUYER, additionalProperty: true }, sdltRuleVersion: SDLT_RULE_VERSION },
  ]) assert.equal(compareArea(unavailable, { ...settings, overrides, ...patch }).status, 'unavailable');
});

test('invalid overrides, area schemas and forged exact baselines fail closed', () => {
  for (const overrides of [null, [], { annualCouncilTaxPence: null }, { annualCouncilTaxPence: -1 },
    { annualCouncilTaxPence: NaN }, { annualCouncilTaxPence: 1.5 }, { propertyValuePence: Infinity },
    { propertyValuePence: Number.MAX_SAFE_INTEGER + 1 }, { unknown: 0 }]) {
    assert.equal(compareArea(available, { ...settings, overrides }).status, 'invalid-input');
  }
  for (const patch of [{ geography: ['MSOA'] }, { availability: ['available'] },
    { councilTaxExactPence: { numerator: '1', denominator: '1' } },
    { councilTaxExactPence: { numerator: '1', denominator: '1', unit: 'GBP' } },
    { pricePence: -1 }, { propertyType: 'flat' }, { parentCode: null },
    { availability: 'unavailable', unavailableReasons: [] }]) {
    assert.equal(compareArea({ ...available, ...patch }, settings).status, 'invalid-input');
  }
});

test('results own their provenance and never change input records when a consumer edits them', () => {
  const original = JSON.stringify(available);
  const result = success(available);
  result.provenance.area!.name = 'Changed';
  result.provenance.sourceRefs!.charge = null;
  result.qualityFlags.push('added');
  assert.equal(JSON.stringify(available), original);
});

test('retained values still require source references and exact baseline checks on unavailable rows', () => {
  const missingPrice = { ...available, availability: 'unavailable', pricePence: null,
    unavailableReasons: ['price-unavailable'], councilTaxExactPence: { numerator: 1, denominator: 1 } };
  assert.equal(compareArea(missingPrice, { ...settings, overrides: { propertyValuePence: 30000000 } }).status, 'invalid-input');
  assert.equal(compareArea({ ...unavailable, sourceRefs: {} }, { ...settings, overrides: { annualCouncilTaxPence: 180000 } }).status, 'invalid-input');
  const validMissingPrice: AreaRecord = { ...available, availability: 'unavailable', pricePence: null, unavailableReasons: ['price-unavailable'] };
  assert.equal(success(validMissingPrice, { ...settings, overrides: { propertyValuePence: 30000000 } }).provenance.area?.availability, 'unavailable');
});
