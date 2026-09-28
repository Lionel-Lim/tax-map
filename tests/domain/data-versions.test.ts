import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareArea, SAMPLE_DATA_VERSION, ENGLAND_DATA_VERSION, AREA_SCHEMA_VERSION, POLICY_VERSION } from '../../src/lib/domain/tax/index.js';

const { areas } = JSON.parse(readFileSync(`static/data/${SAMPLE_DATA_VERSION}/areas.json`, 'utf8'));
const area = areas.find((record: { code: string }) => record.code === 'E02002830');
const options = { dataVersion: SAMPLE_DATA_VERSION, dataSchemaVersion: AREA_SCHEMA_VERSION,
  policyVersion: POLICY_VERSION, mode: 'ongoing-owner', jurisdiction: 'England', residenceScope: 'primary-residence' };

test('each supported data release keeps its own provenance without changing the calculation', () => {
  for (const dataVersion of [SAMPLE_DATA_VERSION, ENGLAND_DATA_VERSION]) {
    const result = compareArea(area, { ...options, dataVersion });
    assert.equal(result.status, 'available');
    assert.equal(result.provenance?.dataVersion, dataVersion);
    if (result.status === 'available') assert.equal(result.difference.displayPrecise, '-£813.98');
  }
  assert.equal(compareArea(area, { ...options, dataVersion: 'england-latest' }).status, 'unavailable');
});

test('invalid source boundaries remain unavailable even after personal financial overrides', () => {
  const invalidGeometry = { ...area, availability: 'unavailable', unavailableReasons: ['boundary-invalid'] };
  const result = compareArea(invalidGeometry, { ...options, dataVersion: ENGLAND_DATA_VERSION,
    overrides: { propertyValuePence: 30_000_000, annualCouncilTaxPence: 180_000 } });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.reasons.includes('boundary-invalid'));
});
