import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_STATE, parseSharedState, serializeSharedState, stateToComparisonOptions } from '../../src/lib/data/index.js';
import { ENGLAND_DATA_VERSION, FIRST_TIME_BUYER, POLICY_VERSION, SAMPLE_DATA_VERSION, SDLT_RULE_VERSION, STANDARD_BUYER } from '../../src/lib/domain/tax/index.js';
import type { SharedState } from '../../src/lib/data/index.js';

function parse(query: string): SharedState {
  const parsed = parseSharedState(query);
  if (!parsed.ok) assert.fail(parsed.errors.join(' '));
  return parsed.state;
}

test('the landing view compares Leicester Council Tax only with a default 0.48% property tax', () => {
  assert.deepEqual(parse(''), {
    dataVersion: ENGLAND_DATA_VERSION, policyVersion: POLICY_VERSION, sdltRuleVersion: SDLT_RULE_VERSION,
    areaCode: 'E06000016', geography: 'LAD', mode: 'ongoing-owner', buyer: 'standard', ownershipYears: 20, propertyTaxRatePercent: 0.48,
    display: 'annual', propertyType: 'all', postcode: null,
  });
  assert.equal(DEFAULT_STATE.mode, 'ongoing-owner');
  const options = stateToComparisonOptions(parse(''));
  assert.equal(options.ownershipYears, 20);
  assert.equal(options.buyer, undefined);
  assert.equal(options.sdltRuleVersion, undefined);
  assert.equal(options.propertyTaxRatePercent, 0.48);
  assert.deepEqual(stateToComparisonOptions({ ...DEFAULT_STATE, mode: 'annualised-ownership' }).buyer, STANDARD_BUYER);
});

test('supported explicit shared settings override every landing preference', () => {
  const state: SharedState = { ...DEFAULT_STATE, areaCode: 'E02002856', geography: 'MSOA', mode: 'annualised-ownership',
    buyer: 'first-time-buyer', ownershipYears: 7, propertyTaxRatePercent: 0.625, display: 'monthly' };
  assert.deepEqual(parse(serializeSharedState(state)), state);
  assert.deepEqual(stateToComparisonOptions(state).buyer, FIRST_TIME_BUYER);
  const params = new URLSearchParams(serializeSharedState(state));
  assert.equal(params.get('data'), ENGLAND_DATA_VERSION);
  assert.equal(params.get('policy'), POLICY_VERSION);
  assert.equal(params.get('rule'), SDLT_RULE_VERSION);
  assert.equal(params.get('rate'), '0.625');
  assert.equal(stateToComparisonOptions(state).propertyTaxRatePercent, 0.625);
});

test('old sample links retain their explicit data release after the England default changes', () => {
  const sample = { ...DEFAULT_STATE, dataVersion: SAMPLE_DATA_VERSION, areaCode: 'E02002830', geography: 'MSOA' as const };
  const restored = parse(serializeSharedState(sample));
  assert.deepEqual(restored, sample);
  assert.equal(stateToComparisonOptions(restored).dataVersion, SAMPLE_DATA_VERSION);
  assert.equal(parse('data=sample-2026-09-26-v1&mode=ongoing-owner').dataVersion, SAMPLE_DATA_VERSION);
  assert.equal(parse('').dataVersion, ENGLAND_DATA_VERSION);
});

test('all modes and meaningful display preferences survive independent URL round trips', () => {
  for (const mode of ['ongoing-owner', 'annualised-ownership', 'purchase-year'] as const) {
    for (const display of ['annual', 'monthly', 'percentage'] as const) {
      if (mode === 'purchase-year' && display === 'monthly') continue;
      const state = { ...DEFAULT_STATE, mode, display };
      assert.deepEqual(parse(serializeSharedState(state)), state);
    }
  }
});

test('unsupported data, policy and SDLT versions never silently become current defaults', () => {
  for (const key of ['data', 'policy', 'rule']) for (const value of ['latest', 'old-v1', '']) {
    const result = parseSharedState(`${key}=${value}`);
    assert.equal(result.ok, false, `${key}=${value}`);
    if (!result.ok) assert.match(result.errors.join(' '), /No newer version has been substituted/);
  }
  assert.equal(parseSharedState('mode=ongoing-owner&rule=old-v1').ok, false, 'even an inactive rule setting remains explicit');
});

test('invalid settings, ambiguous duplicate keys and unsafe area IDs are rejected', () => {
  for (const query of [
    'mode=other', 'buyer=additional-property', 'years=0', 'years=-1', 'years=2.5', 'years=Infinity',
    'years=9007199254740992', 'years=', 'years=20e0', 'years=01', 'geography=country',
    'type=flat', 'display=unknown', 'area=../../etc', 'area=S02002856', 'postcode=LE1',
    'mode=purchase-year&display=monthly', 'mode=ongoing-owner&mode=purchase-year', 'area=E06000016&area=E06000065',
    'rate=', 'rate=-1', 'rate=100.0001', 'rate=0.12345', 'rate=NaN', 'rate=Infinity', 'rate=1e-2', 'rate=0.48&rate=1',
  ]) assert.equal(parseSharedState(query).ok, false, query);
});

test('personal amounts and full postcodes are absent from share URLs by default', () => {
  const state = { ...DEFAULT_STATE, postcode: 'SW11 1AA', propertyValuePence: 999_00, annualCouncilTaxPence: 2000_00 };
  const query = serializeSharedState(state);
  assert.doesNotMatch(query, /postcode|1AA|Value|Council|999|200000/);
  assert.equal(parse(query).postcode, null);
  const hostile = parse('propertyValuePence=99900&annualCouncilTaxPence=200000&unrecognised=true');
  assert.deepEqual(hostile, DEFAULT_STATE);
});

test('a full postcode is included and restored only by an explicit share option', () => {
  const query = serializeSharedState({ ...DEFAULT_STATE, postcode: 'SW11 1AA' }, { includePostcode: true });
  assert.equal(parse(query).postcode, 'SW11 1AA');
  assert.equal(parse(serializeSharedState({ ...DEFAULT_STATE }, { includePostcode: true, postcode: 'sw111aa' })).postcode, 'SW11 1AA');
  assert.throws(() => serializeSharedState({ ...DEFAULT_STATE }, { includePostcode: true }), /valid postcode/);
});

test('serialization validates settings and never emits a share link that will use other assumptions', () => {
  assert.throws(() => serializeSharedState({ ...DEFAULT_STATE, ownershipYears: NaN }), /positive whole number/);
  assert.throws(() => serializeSharedState({ ...DEFAULT_STATE, policyVersion: 'unknown' }), /unsupported/);
  assert.throws(() => serializeSharedState({ ...DEFAULT_STATE, mode: 'purchase-year', display: 'monthly' }), /monthly/);
  assert.throws(() => serializeSharedState({ ...DEFAULT_STATE, propertyTaxRatePercent: NaN }), /Property tax rate/);
});

test('an explicitly cleared area remains cleared after reload, rather than selecting the landing example', () => {
  const state = { ...DEFAULT_STATE, areaCode: null };
  assert.deepEqual(parse(serializeSharedState(state)), state);
});

test('replaying earlier history restores its selections without changing the landing configuration', () => {
  const first = { ...DEFAULT_STATE, mode: 'ongoing-owner' as const, geography: 'MSOA' as const, areaCode: 'E02002856' };
  const second = { ...DEFAULT_STATE, mode: 'purchase-year' as const, buyer: 'first-time-buyer' as const, ownershipYears: 8 };
  const entries = [serializeSharedState(first), serializeSharedState(second)];
  assert.deepEqual(parse(entries[1]!), second);
  assert.deepEqual(parse(entries[0]!), first);
  assert.equal(DEFAULT_STATE.mode, 'ongoing-owner');
  assert.equal(DEFAULT_STATE.areaCode, 'E06000016');
});

test('legacy purchase links keep their chosen period and the default rate; zero is an explicit custom rate', () => {
  const legacy = parse('mode=annualised-ownership&years=7');
  assert.equal(legacy.mode, 'annualised-ownership');
  assert.equal(legacy.ownershipYears, 7);
  assert.equal(legacy.propertyTaxRatePercent, 0.48);
  for (const propertyTaxRatePercent of [0, 0.0001, 0.1234, 100]) {
    assert.equal(parse(serializeSharedState({ ...DEFAULT_STATE, propertyTaxRatePercent })).propertyTaxRatePercent, propertyTaxRatePercent);
  }
});
