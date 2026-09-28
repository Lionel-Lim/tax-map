import assert from 'node:assert/strict';
import test from 'node:test';
import {
  add, compare, divide, multiply, parseRational, rational,
  roundHalfAwayFromZero, serializeRational, subtract,
} from '../../src/lib/domain/tax/rational.js';
import { moneyAmount } from '../../src/lib/domain/tax/money.js';

test('rational arithmetic reduces fractions and keeps denominators positive', () => {
  assert.deepEqual(rational(12n, -18n), { numerator: -2n, denominator: 3n });
  assert.deepEqual(rational(0n, -99n), { numerator: 0n, denominator: 1n });
  assert.deepEqual(add(rational(1n, 6n), rational(1n, 3n)), rational(1n, 2n));
  assert.deepEqual(subtract(rational(1n, 6n), rational(1n, 3n)), rational(-1n, 6n));
  assert.deepEqual(multiply(rational(3n, 7n), rational(14n, 5n)), rational(6n, 5n));
  assert.deepEqual(divide(rational(3n, 7n), rational(-6n, 5n)), rational(-5n, 14n));
  assert.equal(compare(rational(2n, 3n), rational(4n, 6n)), 0);
  assert.equal(compare(rational(-2n, 3n), rational(-1n, 2n)), -1);
  assert.equal(compare(rational(2n, 3n), rational(1n, 2n)), 1);
  assert.throws(() => rational(1n, 0n), RangeError);
  assert.throws(() => divide(rational(1n), rational(0n)), RangeError);
});

test('public rational parser rejects coercion, unsafe numbers, and invalid denominators', () => {
  assert.deepEqual(parseRational({ numerator: 10, denominator: 20 }), rational(1n, 2n));
  assert.deepEqual(parseRational({ numerator: '-10', denominator: '20' }), rational(-1n, 2n));
  assert.deepEqual(parseRational(rational(1n, 3n)), rational(1n, 3n));
  for (const input of [null, undefined, [], 3, {}, { numerator: 1 },
    { numerator: 1, denominator: 0 }, { numerator: 1, denominator: -3 },
    { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
    { numerator: 1, denominator: Infinity }, { numerator: NaN, denominator: 1 },
    { numerator: true, denominator: 1 }, { numerator: '1.2', denominator: '1' },
    { numerator: '1e3', denominator: '1' }, { numerator: ' 1 ', denominator: '1' },
    { numerator: '', denominator: '1' }, { numerator: '+1', denominator: '1' },
  ]) assert.equal(parseRational(input), null, `Should reject ${JSON.stringify(input)}`);
});

test('exact serialized fractions survive JSON round trips beyond number precision', () => {
  const original = rational(900719925474099312345678901n, 23n);
  const serialized = serializeRational(original);
  assert.equal(typeof serialized.numerator, 'string');
  assert.deepEqual(parseRational(JSON.parse(JSON.stringify(serialized))), original);
  assert.deepEqual(subtract(add(original, rational(1n, 7n)), original), rational(1n, 7n));
});

test('halves round away from zero for positive and negative fractions', () => {
  for (const [numerator, denominator, expected] of [
    [0n, 1n, 0n], [1n, 2n, 1n], [-1n, 2n, -1n],
    [149n, 100n, 1n], [-149n, 100n, -1n],
    [3n, 2n, 2n], [-3n, 2n, -2n],
    [1n, 3n, 0n], [-1n, 3n, 0n], [2n, 3n, 1n], [-2n, 3n, -1n],
  ]) assert.equal(roundHalfAwayFromZero(rational(numerator!, denominator!)), expected);
});

test('GBP formats pennies and pounds independently without double rounding', () => {
  const justUnderHalfPound = moneyAmount(rational(49999n, 1000n));
  assert.equal(justUnderHalfPound.roundedPence, '50');
  assert.equal(justUnderHalfPound.displayPrecise, '£0.50');
  assert.equal(justUnderHalfPound.displayPounds, '£0');
  assert.equal(moneyAmount(rational(50n)).displayPounds, '£1');
  assert.equal(moneyAmount(rational(-50n)).displayPounds, '-£1');
  assert.equal(moneyAmount(rational(1n, 2n)).displayPrecise, '£0.01');
  assert.equal(moneyAmount(rational(-1n, 2n)).displayPrecise, '-£0.01');
  assert.equal(moneyAmount(rational(123456789n)).displayPrecise, '£1,234,567.89');
  assert.equal(moneyAmount(rational(-123456789n)).displayPrecise, '-£1,234,567.89');
  assert.equal(moneyAmount(rational(900719925474099312345n)).displayPrecise,
    '£9,007,199,254,740,993,123.45');
});

test('rounded zero never gets a negative or positive sign', () => {
  const tinyNegative = moneyAmount(rational(-1n, 3n), { signed: true });
  assert.equal(tinyNegative.roundedPence, '0');
  assert.equal(tinyNegative.displayPounds, '£0');
  assert.equal(tinyNegative.displayPrecise, '£0.00');
  assert.equal(moneyAmount(rational(1n), { signed: true }).displayPrecise, '+£0.01');
  assert.equal(moneyAmount(rational(100n), { signed: true }).displayPounds, '+£1');
});

test('monthly equivalents retain the unrounded annual fraction', () => {
  const annual = rational(149999n, 1000n);
  assert.equal(moneyAmount(annual).roundedPence, '150');
  assert.equal(moneyAmount(divide(annual, rational(12n))).roundedPence, '12');
  assert.equal(moneyAmount(divide(rational(150n), rational(12n))).roundedPence, '13');
});
