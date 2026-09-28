import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPostcodeLookup, DataLoadError, loadRelease, normalisePostcode, searchAreas } from '../../src/lib/data/index.js';
import type { Fetcher } from '../../src/lib/data/index.js';

const SAMPLE = 'sample-2026-09-26-v1';
const BASE = `/data/${SAMPLE}`;
function fixtureFetcher(change?: (url: string, value: unknown) => unknown): { fetcher: Fetcher; requests: string[] } {
  const requests: string[] = [];
  const fetcher: Fetcher = async (url) => {
    requests.push(url);
    assert.ok(url.startsWith(`${BASE}/`), 'all data requests must stay in the explicitly pinned local release');
    const value: unknown = JSON.parse(await readFile(`static${url}`, 'utf8'));
    return { ok: true, status: 200, json: async () => change ? change(url, value) : value };
  };
  return { fetcher, requests };
}
const loaded = loadRelease({ dataVersion: SAMPLE, fetcher: fixtureFetcher().fetcher });
function record(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }
function rows(value: unknown): unknown[][] { return record(value).rows as unknown[][]; }
const hasError = (code: string) => (error: unknown) => error instanceof DataLoadError && error.code === code;

test('load the complete pinned sample and canonical policy without postcode data or a latest pointer', async () => {
  const { fetcher, requests } = fixtureFetcher();
  const release = await loadRelease({ dataVersion: SAMPLE, fetcher });
  assert.equal(release.areas.length, 203);
  assert.equal(release.areas.filter(area => area.availability === 'unavailable').length, 107);
  assert.equal(release.manifest.publicReleaseReady, false);
  assert.equal(release.policy.annualRate.numerator, 48);
  assert.deepEqual(requests.sort(), ['areas.json', 'manifest.json', 'policy.json', 'search.json'].map(file => `${BASE}/${file}`).sort());
  assert.equal(release.areaByCode.get('E06000016')?.name, 'Leicester');
});

test('unsupported versions fail before any fetch and never become the current release', async () => {
  const { fetcher, requests } = fixtureFetcher();
  for (const dataVersion of ['latest', 'sample-old', '', '../../other']) {
    await assert.rejects(loadRelease({ dataVersion, fetcher }), hasError('unsupported-data-version'));
  }
  assert.equal(requests.length, 0);
});

test('incompatible release schemas, identities and policies fail closed', async () => {
  for (const [file, patch, expected] of [
    ['manifest.json', { schemaVersion: '2.0.0' }, 'unsupported-data-schema'],
    ['manifest.json', { releaseId: 'another-release' }, 'invalid-data'],
    ['manifest.json', { policyVersions: ['unknown:1'] }, 'unsupported-policy-version'],
    ['areas.json', { releaseId: 'another-release' }, 'invalid-data'],
    ['policy.json', { annualRate: { numerator: 480, denominator: 10000 } }, 'unsupported-policy-version'],
  ] as const) {
    const { fetcher } = fixtureFetcher((url, value) => url === `${BASE}/${file}` ? { ...record(value), ...patch } : value);
    await assert.rejects(loadRelease({ dataVersion: SAMPLE, fetcher }), hasError(expected));
  }
});

test('duplicate statistics, invented baselines and missing search rows cannot be displayed', async () => {
  for (const kind of ['duplicate', 'baseline', 'search'] as const) {
    const { fetcher } = fixtureFetcher((url, value) => {
      if (url === `${BASE}/areas.json` && kind !== 'search') {
        const areas = record(value).areas as Record<string, unknown>[];
        if (kind === 'duplicate') areas.push(areas[0]!);
        else areas[0]!.councilTaxExactPence = { numerator: 1, denominator: 1 };
      }
      if (url === `${BASE}/search.json` && kind === 'search') (record(value).areas as unknown[]).pop();
      return value;
    });
    await assert.rejects(loadRelease({ dataVersion: SAMPLE, fetcher }), hasError('invalid-data'));
  }
});

test('the independent name/code search includes unavailable areas and preserves geography', async () => {
  const release = await loaded;
  assert.deepEqual(searchAreas(release, ' e06000016 ').map(area => area.name), ['Leicester']);
  assert.equal(searchAreas(release, '', 'LAD').length, 5);
  assert.equal(searchAreas(release, '', 'MSOA').length, 198);
  assert.equal(searchAreas(release, 'E02000937')[0]?.availability, 'unavailable');
  assert.equal(searchAreas(release, 'Battersea Park')[0]?.code, 'E02000923');
});

test('postcode normalisation accepts casing and whitespace, rejects incomplete and unsafe inputs', () => {
  assert.equal(normalisePostcode(' \tsw11 1aa\n'), 'SW11 1AA');
  assert.equal(normalisePostcode('le17rh'), 'LE1 7RH');
  assert.equal(normalisePostcode('GIR 0AA'), 'GIR 0AA');
  assert.equal(normalisePostcode('NPT 0VA'), 'NPT 0VA');
  for (const input of ['', 'SW11', 'SW11 1A', 'London', '../LE1', 'LE1?7RH', '💥']) assert.equal(normalisePostcode(input), null);
});

test('postcode index and shards load only on demand, deduplicate concurrent requests, and stay local', async () => {
  const release = await loaded, { fetcher, requests } = fixtureFetcher();
  const lookup = createPostcodeLookup(release, { fetcher });
  assert.equal(requests.length, 0);
  assert.equal((await lookup.lookup('SW11')).status, 'malformed');
  assert.equal(requests.length, 0);
  const results = await Promise.all([lookup.lookup('sw11 1aa'), lookup.lookup('SW11 1BD')]);
  assert.deepEqual(results.map(result => result.status), ['found', 'unavailable-area']);
  assert.equal(results[0]!.area?.code, 'E02000930');
  assert.equal(results[1]!.area?.availability, 'unavailable');
  await lookup.lookup('SW11 1AA');
  assert.deepEqual(requests, [`${BASE}/postcodes/index.json`, `${BASE}/postcodes/SW11.json`]);
  assert.ok(requests.every(url => !url.includes('1AA') && !url.includes('1BD') && !url.includes('?')));
});

test('known, terminated, outside-country and outside-sample records are distinct source-derived states', async () => {
  const lookup = createPostcodeLookup(await loaded, { fetcher: fixtureFetcher().fetcher });
  for (const [postcode, expected] of [
    ['LE1 7RH', 'found'], ['LE1 1AA', 'unavailable-area'], ['LE1 1AB', 'terminated'],
    ['SW1A 0AA', 'outside-sample-coverage'], ['EH1 1AD', 'outside-england'], ['BT1 1AA', 'outside-england'],
    ['ZZ99 9ZZ', 'unknown'], ['SW11 0ZZ', 'unknown'],
  ]) assert.equal((await lookup.lookup(postcode!)).status, expected, postcode);
  const outside = await lookup.lookup('SW1A 0AA');
  assert.equal(outside.record?.country, 'E92000001');
  assert.equal(outside.area, undefined);
});

test('a missing outward shard is unknown without downloading a made-up shard', async () => {
  const { fetcher, requests } = fixtureFetcher(), lookup = createPostcodeLookup(await loaded, { fetcher });
  assert.equal((await lookup.lookup('ZZ99 9ZZ')).status, 'unknown');
  assert.deepEqual(requests, [`${BASE}/postcodes/index.json`]);
});

test('failed index and shard requests stay network errors and can be retried', async () => {
  for (const failingFile of ['index.json', 'SW11.json']) {
    const fixture = fixtureFetcher();
    let fail = true;
    const fetcher: Fetcher = async url => {
      if (url.endsWith(`/${failingFile}`) && fail) { fail = false; return { ok: false, status: 404, json: async () => null }; }
      return fixture.fetcher(url);
    };
    const lookup = createPostcodeLookup(await loaded, { fetcher });
    assert.equal((await lookup.lookup('SW11 1AA')).status, 'network-error');
    assert.equal((await lookup.lookup('SW11 1AA')).status, 'found');
  }
  const rejected = createPostcodeLookup(await loaded, { fetcher: async () => { throw new Error('offline'); } });
  assert.equal((await rejected.lookup('SW11 1AA')).status, 'network-error');
});

test('malformed shard data and an unsafe path are errors rather than unknown postcodes', async () => {
  for (const kind of ['path', 'row', 'json'] as const) {
    const fixture = fixtureFetcher((url, value) => {
      if (url.endsWith('/index.json') && kind === 'path') {
        const shards = record(record(value).shards);
        record(shards.SW11).path = 'https://example.com/SW11%201AA';
      }
      if (url.endsWith('/SW11.json') && kind === 'row') rows(value)[0]![1] = 999;
      return value;
    });
    const fetcher: Fetcher = kind === 'json' ? async () => ({ ok: true, status: 200, json: async () => { throw new Error('JSON'); } }) : fixture.fetcher;
    const result = await createPostcodeLookup(await loaded, { fetcher }).lookup('SW11 1AA');
    assert.equal(result.status, 'network-error');
    assert.equal(result.reason, 'invalid-data');
    assert.ok(fixture.requests.every(url => url.startsWith(BASE)));
  }
});

test('missing source geography does not invent a sample location or silently select the council', async () => {
  const { fetcher } = fixtureFetcher((url, value) => {
    if (url.endsWith('/SW11.json')) rows(value).find(row => row[0] === 'SW11 1AA')![4] = null;
    return value;
  });
  const result = await createPostcodeLookup(await loaded, { fetcher }).lookup('SW11 1AA');
  assert.equal(result.status, 'unavailable-area');
  assert.equal(result.reason, 'geography-unavailable');
  assert.equal(result.area, undefined);
});

test('a conflicting postcode authority cannot produce a valid postcode-selected estimate', async () => {
  const { fetcher } = fixtureFetcher((url, value) => {
    if (url.endsWith('/SW11.json')) rows(value).find(row => row[0] === 'SW11 1AA')![5] = 'E09000033';
    return value;
  });
  const result = await createPostcodeLookup(await loaded, { fetcher }).lookup('SW11 1AA');
  assert.equal(result.status, 'unavailable-area');
  assert.equal(result.reason, 'geography-needs-review');
  assert.equal(result.area, undefined, 'a conflicting postcode must not select an otherwise available area');
});
