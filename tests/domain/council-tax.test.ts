import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateCouncilTax } from '../../src/lib/domain/tax/council-tax.js';
import type { CouncilTaxInput } from '../../src/lib/domain/tax/council-tax.js';
import { moneyAmount } from '../../src/lib/domain/tax/money.js';
import { parseRational, rational, serializeRational } from '../../src/lib/domain/tax/rational.js';

const sourceJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const allD = (): CouncilTaxInput => ({
  counts: { A: 0, B: 0, C: 0, D: 100, E: 0, F: 0, G: 0, H: 0 },
  bandDPence: 180000,
  reportedTotal: 100,
});

test('all five immutable Phase 0 baselines reproduce exactly', () => {
  const fixtures = sourceJson('data/fixtures/phase0-worked-examples.json');
  assert.equal(fixtures.length, 5);
  for (const fixture of fixtures) {
    const [pounds, pennies] = fixture.charge.band_d_gbp.split('.');
    const result = calculateCouncilTax({
      counts: fixture.stock.counts_by_band,
      reportedTotal: fixture.stock.reported_total,
      bandDPence: Number(BigInt(pounds) * 100n + BigInt(pennies)),
    });
    assert.equal(result.status, 'available', fixture.msoa_code);
    if (result.status !== 'available') continue;
    assert.deepEqual(result.exactPence, serializeRational(rational(
      BigInt(fixture.baseline_exact_gbp.numerator) * 100n,
      BigInt(fixture.baseline_exact_gbp.denominator),
    )), fixture.msoa_code);
    assert.equal(result.sumOfBands, fixture.stock.sum_of_bands);
    assert.equal(result.weightedNinthsSum, String(fixture.stock.weighted_ninths_sum));
    assert.deepEqual([...result.qualityFlags].sort(), [...fixture.quality_flags].sort());
    assert.equal(moneyAmount(parseRational(result.exactPence)!).displayPrecise.replaceAll(',', ''),
      `£${fixture.expected.baseline_gbp}`);
  }
});

test('independently checked Leicester LAD baseline reproduces exactly', () => {
  const fixture = sourceJson('data/fixtures/phase1-lad-worked-example.json');
  const result = calculateCouncilTax({
    counts: fixture.stock.rawCounts,
    reportedTotal: Number(fixture.stock.rawReportedTotal),
    bandDPence: fixture.charge.bandDPence,
  });
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.deepEqual(result.exactPence, serializeRational(parseRational(fixture.expected.councilTaxExactPence)!));
  assert.equal(moneyAmount(parseRational(result.exactPence)!).roundedPence,
    String(fixture.expected.councilTaxRoundedPence));
});

test('every Phase 1 source record retains its exact baseline or unavailable status', () => {
  const { areas } = sourceJson('static/data/sample-2026-09-26-v1/areas.json');
  let available = 0;
  let unavailable = 0;
  for (const area of areas) {
    const result = calculateCouncilTax({
      counts: area.sourceRefs.stock?.rawCounts,
      bandDPence: area.sourceRefs.charge?.bandDPence,
      reportedTotal: area.sourceRefs.stock?.reportedTotal,
      geographyNeedsReview: area.unavailableReasons.includes('geography-needs-review'),
    });
    if (area.councilTaxExactPence !== null) {
      assert.equal(result.status, 'available', area.code);
      if (result.status !== 'available') continue;
      available++;
      assert.deepEqual(result.exactPence, serializeRational(parseRational(area.councilTaxExactPence)!), area.code);
      assert.equal(result.sumOfBands, area.sourceRefs.stock.sumOfBands, area.code);
    } else {
      unavailable++;
      assert.equal(result.status, 'unavailable', area.code);
      if (result.status !== 'unavailable') continue;
      for (const reason of area.unavailableReasons.filter((value: string) => value !== 'price-unavailable')) {
        assert.ok(result.reasons.includes(reason), `${area.code}: ${reason}`);
      }
      assert.equal('exactPence' in result, false);
    }
  }
  assert.equal(available, 96);
  assert.equal(unavailable, 107);
});

test('Council Tax uses exact ninths and the band sum rather than reported total', () => {
  const result = calculateCouncilTax({
    counts: { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1, H: 1 },
    bandDPence: 100,
    reportedTotal: 10,
  });
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.equal(result.sumOfBands, 8);
  assert.equal(result.weightedNinthsSum, '87');
  assert.deepEqual(result.exactPence, serializeRational(rational(725n, 6n)));
  const onlyA = { ...allD(), counts: { ...allD().counts, A: 100, D: 0 }, bandDPence: 100 };
  assert.deepEqual(calculateCouncilTax(onlyA), {
    status: 'available', exactPence: { numerator: '200', denominator: '3' },
    sumOfBands: 100, weightedNinthsSum: '600',
    qualityFlags: ['authority-average-charge-proxy', 'mixed-source-periods', 'rounded-stock-counts'],
  });
});

test('published zero remains zero; missing, dash and suppressed bands withhold results', () => {
  assert.equal(calculateCouncilTax(allD()).status, 'available');
  const cases: [unknown, string][] = [
    ['-', 'stock-marker-unverified'], ['[c]', 'stock-suppressed'],
    [null, 'stock-unavailable'], [undefined, 'stock-unavailable'], ['', 'stock-unavailable'],
    ['..', 'source-value-unrecognised'], ['unknown', 'source-value-unrecognised'],
  ];
  for (const [value, reason] of cases) {
    const result = calculateCouncilTax({ ...allD(), counts: { ...allD().counts, H: value } });
    assert.equal(result.status, 'unavailable', String(value));
    if (result.status === 'unavailable') assert.ok(result.reasons.includes(reason));
    assert.equal('exactPence' in result, false);
  }
});

test('missing charges, missing reconciliation totals, zero stocks, and geography review stay unavailable', () => {
  for (const [input, reason] of [
    [{ ...allD(), bandDPence: null }, 'charge-unavailable'],
    [{ ...allD(), bandDPence: 0 }, 'charge-unavailable'],
    [{ ...allD(), reportedTotal: null }, 'stock-total-unavailable'],
    [{ ...allD(), reportedTotal: undefined }, 'stock-total-unavailable'],
    [{ ...allD(), counts: null }, 'stock-unavailable'],
    [{ ...allD(), geographyNeedsReview: true }, 'geography-needs-review'],
    [{ ...allD(), counts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 }, reportedTotal: 0 },
      'stock-total-nonpositive'],
  ] as const) {
    const result = calculateCouncilTax(input);
    assert.equal(result.status, 'unavailable');
    if (result.status === 'unavailable') assert.ok(result.reasons.includes(reason));
  }
});

test('stock reconciliation accepts the inclusive 45 dwelling bound and rejects an excess', () => {
  for (const reportedTotal of [55, 145]) {
    assert.equal(calculateCouncilTax({ ...allD(), reportedTotal }).status, 'available');
  }
  for (const reportedTotal of [54, 146]) {
    const result = calculateCouncilTax({ ...allD(), reportedTotal });
    assert.equal(result.status, 'invalid-input');
    assert.ok(result.reasons.includes('stock-reconciliation-out-of-range'));
  }
});

test('malformed schemas and unsafe, negative, fractional or non-finite integers are rejected', () => {
  for (const input of [null, [], 'input', 2, { ...allD(), counts: [] },
    { ...allD(), geographyNeedsReview: 'false' }, { ...allD(), geographyNeedsReview: null },
    { ...allD(), bandDPence: '180000' },
  ]) assert.equal(calculateCouncilTax(input).status, 'invalid-input');
  for (const bad of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, true, {}]) {
    for (const input of [
      { ...allD(), counts: { ...allD().counts, A: bad } },
      { ...allD(), bandDPence: bad },
      { ...allD(), reportedTotal: bad },
    ]) assert.equal(calculateCouncilTax(input).status, 'invalid-input', String(bad));
  }
  assert.equal(calculateCouncilTax({ ...allD(), counts: {
    ...allD().counts, A: '9007199254740992',
  } }).status, 'invalid-input');
  assert.equal(calculateCouncilTax({ ...allD(), counts: {
    ...allD().counts, A: Number.MAX_SAFE_INTEGER,
  }, reportedTotal: Number.MAX_SAFE_INTEGER }).status, 'invalid-input');
});

test('weighted intermediate values remain exact beyond Number safe precision', () => {
  const count = 1_000_000_000_000_000;
  const result = calculateCouncilTax({
    counts: { A: count, B: count, C: count, D: count, E: count, F: count, G: count, H: count },
    bandDPence: 100,
    reportedTotal: count * 8,
  });
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.equal(result.weightedNinthsSum, '87000000000000000');
  assert.deepEqual(result.exactPence, serializeRational(rational(725n, 6n)));
});
