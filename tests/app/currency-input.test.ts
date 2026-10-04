import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoundsInput, formatPoundsInput } from '../../src/lib/data/currency-input.js';

test('currency inputs accept UK formatting and retain exact pennies', () => {
  for (const input of ['300000', '300,000', '£300,000', ' £ 300,000 ']) assert.equal(parsePoundsInput(input), 30000000);
  assert.equal(parsePoundsInput('£1,800.50'), 180050);
  assert.equal(parsePoundsInput('0.01'), 1);
  assert.equal(parsePoundsInput('0'), 0);
  assert.equal(parsePoundsInput('  '), undefined);
  assert.equal(formatPoundsInput(180050), '1,800.50');
  assert.equal(parsePoundsInput('90,071,992,547,409.91'), Number.MAX_SAFE_INTEGER);
  assert.throws(() => parsePoundsInput('90,071,992,547,409.92'), /too large/);
});

test('currency inputs reject malformed grouping and ambiguous values', () => {
  for (const input of ['30,00', '1,80,000', '1.800,50', '-20', '£', '1e3', '12.345', '1 800', 'Infinity']) {
    assert.throws(() => parsePoundsInput(input), /Enter an amount/);
  }
});
