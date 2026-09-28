import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPostcodeLookup, DataLoadError, loadRelease, searchAreas } from '../../src/lib/data/index.js';
import type { Fetcher, ReleaseManifest } from '../../src/lib/data/index.js';
import { AREA_SCHEMA_VERSION, ENGLAND_DATA_VERSION, POLICY_VERSION, SAMPLE_DATA_VERSION, SDLT_RULE_VERSION, STANDARD_BUYER, compareArea } from '../../src/lib/domain/tax/index.js';
import type { AreaRecord } from '../../src/lib/domain/tax/index.js';

const BASE = `/data/public-v1/${ENGLAND_DATA_VERSION}`;
const LEICESTER = 'E06000016';
const BRADGATE = 'E02002830';
const hasError = (code: string) => (error: unknown) => error instanceof DataLoadError && error.code === code;
const object = (value: unknown) => value as Record<string, unknown>;

// Keep corruption/cache cases small: these use the England shard format with
// genuine pinned sample records. Full national inventory is checked separately.
async function nationalFixture(change?: (path: string, value: unknown) => unknown) {
  const original = async (path: string) => JSON.parse(await readFile(`.build/public-static/data/public-v1/${SAMPLE_DATA_VERSION}/${path}`, 'utf8')) as unknown;
  const manifest = await original('manifest.json') as ReleaseManifest;
  const all = (object(await original('areas.json')).areas as AreaRecord[]);
  const councils = all.filter(area => area.geography === 'LAD');
  const payloads = new Map<string, unknown>();
  manifest.releaseId = ENGLAND_DATA_VERSION;
  manifest.scope = 'england';
  manifest.initialAreasPath = 'councils.json';
  manifest.areaShards = {};
  const artifact = { bytes: 100, sha256: 'a'.repeat(64) };
  manifest.artifacts['councils.json'] = artifact;
  payloads.set('councils.json', { schemaVersion: AREA_SCHEMA_VERSION, releaseId: ENGLAND_DATA_VERSION, areas: councils });
  for (const council of councils) {
    const path = `areas/msoa/${council.code}.json`;
    const areas = all.filter(area => area.parentCode === council.code);
    manifest.areaShards[council.code] = { ...artifact, path, records: areas.length };
    manifest.artifacts[path] = artifact;
    payloads.set(path, { schemaVersion: AREA_SCHEMA_VERSION, releaseId: ENGLAND_DATA_VERSION, parentCode: council.code, areas });
  }
  payloads.set('manifest.json', manifest);
  const requests: string[] = [];
  const fetcher: Fetcher = async url => {
    assert.ok(url.startsWith(`${BASE}/`), 'a national request must retain its declared release');
    requests.push(url);
    const path = url.slice(BASE.length + 1);
    const value: unknown = payloads.has(path) ? structuredClone(payloads.get(path)) : await original(path);
    return { ok: true, status: 200, json: async () => change ? change(path, value) : value };
  };
  return { fetcher, requests };
}

test('England defaults load only council statistics while global search includes unloaded neighbourhoods', async () => {
  const fixture = await nationalFixture();
  const release = await loadRelease({ fetcher: fixture.fetcher });
  assert.equal(release.manifest.releaseId, ENGLAND_DATA_VERSION);
  assert.equal(release.areas.length, 5);
  assert.ok(release.areas.every(area => area.geography === 'LAD'));
  assert.equal(release.search.length, 203);
  assert.equal(release.searchByCode.get(BRADGATE)?.parentCode, LEICESTER);
  assert.equal(release.areaByCode.has(BRADGATE), false);
  assert.equal(searchAreas(release, 'Bradgate')[0]?.code, BRADGATE);
  assert.equal(release.loadedDistricts.size, 0);
  assert.deepEqual(fixture.requests.sort(), ['manifest.json', 'councils.json', 'search.json', 'policy.json'].map(path => `${BASE}/${path}`).sort());
});

test('district and area loads share one request, retain provenance, and do not eagerly fetch other districts', async () => {
  const fixture = await nationalFixture();
  const release = await loadRelease({ fetcher: fixture.fetcher });
  const [area, district, another] = await Promise.all([
    release.ensureArea(BRADGATE), release.loadDistrict(LEICESTER), release.ensureArea('E02002827'),
  ]);
  assert.equal(area?.code, BRADGATE);
  assert.equal(another?.availability, 'unavailable');
  assert.equal(district.length, 38);
  assert.equal(release.areaByCode.size, 43);
  assert.equal(release.areas.length, 5, 'the UI explicitly refreshes its displayed statistics from areaByCode');
  assert.deepEqual([...release.loadedDistricts], [LEICESTER]);
  assert.equal(fixture.requests.filter(path => path.includes('/areas/msoa/')).length, 1);
  const before = fixture.requests.length;
  assert.equal(await release.ensureArea(BRADGATE), area);
  assert.equal((await release.loadDistrict(LEICESTER)).length, 38);
  assert.equal((await release.ensureArea(LEICESTER))?.name, 'Leicester');
  assert.equal(await release.ensureArea('E99999999'), undefined);
  await assert.rejects(release.loadDistrict('../other'), hasError('invalid-data'));
  assert.equal(fixture.requests.length, before);
  const result = compareArea(area, { dataVersion: ENGLAND_DATA_VERSION, dataSchemaVersion: AREA_SCHEMA_VERSION,
    policyVersion: POLICY_VERSION, mode: 'ongoing-owner', jurisdiction: 'England', residenceScope: 'primary-residence' });
  assert.equal(result.status, 'available');
  assert.equal(result.provenance?.dataVersion, ENGLAND_DATA_VERSION);
});

test('the district manifest rejects unsafe paths, conflicting artifact identities and mismatched counts', async () => {
  for (const kind of ['path', 'hash', 'count', 'missing-district'] as const) {
    const fixture = await nationalFixture((path, value) => {
      if (path !== 'manifest.json') return value;
      const manifest = value as ReleaseManifest;
      if (kind === 'path') manifest.areaShards![LEICESTER]!.path = 'https://example.com/private';
      if (kind === 'hash') manifest.areaShards![LEICESTER]!.sha256 = 'b'.repeat(64);
      if (kind === 'count') manifest.areaShards![LEICESTER]!.records++;
      if (kind === 'missing-district') delete manifest.areaShards![LEICESTER];
      return value;
    });
    await assert.rejects(loadRelease({ fetcher: fixture.fetcher }), hasError('invalid-data'), kind);
    assert.ok(fixture.requests.every(path => path.startsWith(BASE)));
  }
});

test('a corrupt district never exposes partial statistics and can be retried', async () => {
  for (const kind of ['parent', 'version', 'duplicate', 'missing', 'metadata'] as const) {
    let corrupt = true;
    const fixture = await nationalFixture((path, value) => {
      if (path !== `areas/msoa/${LEICESTER}.json` || !corrupt) return value;
      const payload = object(value), areas = payload.areas as AreaRecord[];
      if (kind === 'parent') payload.parentCode = 'E06000065';
      if (kind === 'version') payload.releaseId = SAMPLE_DATA_VERSION;
      if (kind === 'duplicate') areas[1] = structuredClone(areas[0]!);
      if (kind === 'missing') areas.pop();
      if (kind === 'metadata') areas[0]!.name = 'An invented name';
      return value;
    });
    const release = await loadRelease({ fetcher: fixture.fetcher });
    await assert.rejects(release.ensureArea(BRADGATE), hasError('invalid-data'), kind);
    assert.equal(release.areaByCode.size, 5);
    assert.equal(release.loadedDistricts.has(LEICESTER), false);
    corrupt = false;
    assert.equal((await release.ensureArea(BRADGATE))?.code, BRADGATE);
    assert.equal(release.areaByCode.size, 43);
    assert.equal(fixture.requests.filter(path => path.endsWith(`/${LEICESTER}.json`)).length, 2);
  }
});

test('postcode coverage validates against the global inventory and lazily loads the matched council only', async () => {
  const fixture = await nationalFixture();
  const release = await loadRelease({ fetcher: fixture.fetcher });
  assert.equal(release.areaByCode.size, 5);
  const lookup = createPostcodeLookup(release, { fetcher: fixture.fetcher });
  const found = await lookup.lookup(' le4 0dd ');
  assert.equal(found.status, 'found');
  assert.equal(found.area?.code, BRADGATE);
  assert.deepEqual([...release.loadedDistricts], [LEICESTER]);
  assert.deepEqual(fixture.requests.filter(path => /postcodes|areas\/msoa/.test(path)), [
    `${BASE}/postcodes/index.json`, `${BASE}/postcodes/LE4.json`, `${BASE}/areas/msoa/${LEICESTER}.json`,
  ]);
  const unavailable = await lookup.lookup('LE4 0SZ');
  assert.equal(unavailable.status, 'unavailable-area');
  assert.equal(unavailable.area?.availability, 'unavailable');
  assert.match(unavailable.message, /in this release/);
  assert.equal(fixture.requests.filter(path => path.includes('/areas/msoa/')).length, 1);
});

test('a failed neighbourhood fetch remains a recoverable postcode network error', async () => {
  const fixture = await nationalFixture();
  let fail = true;
  const fetcher: Fetcher = async url => {
    if (url.endsWith(`/areas/msoa/${LEICESTER}.json`) && fail) {
      fail = false;
      return { ok: false, status: 503, json: async () => null };
    }
    return fixture.fetcher(url);
  };
  const release = await loadRelease({ fetcher });
  const lookup = createPostcodeLookup(release, { fetcher });
  const first = await lookup.lookup('LE4 0DD');
  assert.equal(first.status, 'network-error');
  assert.equal(first.reason, 'network-error');
  assert.equal(first.area, undefined);
  assert.equal(release.areaByCode.size, 5);
  assert.equal((await lookup.lookup('LE4 0DD')).status, 'found');
  assert.equal(fixture.requests.filter(path => path.endsWith('/postcodes/LE4.json')).length, 1);
});

function realEnglandFetcher() {
  const requests: string[] = [];
  const fetcher: Fetcher = async url => {
    assert.ok(url.startsWith(`${BASE}/`), 'the real national integration must not substitute another release');
    requests.push(url);
    const value: unknown = JSON.parse(await readFile(`.build/public-static${url}`, 'utf8'));
    return { ok: true, status: 200, json: async () => value };
  };
  return { fetcher, requests };
}

test('all 7152 real England records load from their district shards and remain consistent in every mode', async () => {
  const fixture = realEnglandFetcher();
  const release = await loadRelease({ fetcher: fixture.fetcher });
  assert.equal(release.areas.length, 296);
  assert.equal(release.search.length, 7152);
  assert.equal(release.search.filter(row => row.geography === 'MSOA').length, 6856);
  assert.equal(fixture.requests.length, 4, 'initial render downloads no district or postcode payload');
  await Promise.all(release.areas.map(council => release.loadDistrict(council.code)));
  assert.equal(release.areaByCode.size, 7152);
  assert.equal(release.loadedDistricts.size, 296);
  assert.equal(fixture.requests.filter(path => path.includes('/areas/msoa/')).length, 296);
  assert.equal(fixture.requests.some(path => path.includes('/postcodes/')), false);
  for (const mode of ['ongoing-owner', 'annualised-ownership', 'purchase-year'] as const) {
    const coverage = { LAD: { available: 0, unavailable: 0 }, MSOA: { available: 0, unavailable: 0 } };
    for (const area of release.areaByCode.values()) {
      const result = compareArea(area, { dataVersion: ENGLAND_DATA_VERSION, dataSchemaVersion: AREA_SCHEMA_VERSION,
        policyVersion: POLICY_VERSION, mode, jurisdiction: 'England', residenceScope: 'primary-residence',
        ownershipYears: 20, buyer: STANDARD_BUYER, sdltRuleVersion: SDLT_RULE_VERSION });
      assert.equal(result.status, area.availability, `${mode} ${area.code}: ${JSON.stringify(result.status === 'available' ? [] : result.issues)}`);
      coverage[area.geography][area.availability]++;
      assert.equal(result.provenance?.dataVersion, ENGLAND_DATA_VERSION, `${mode} ${area.code} provenance`);
    }
    for (const geography of ['LAD', 'MSOA'] as const) {
      assert.equal(coverage[geography].available, release.manifest.coverage[geography].available);
      assert.equal(coverage[geography].unavailable, release.manifest.coverage[geography].unavailable);
    }
  }
});

test('a real postcode outside the original sample now resolves through one England district', async () => {
  const fixture = realEnglandFetcher();
  const release = await loadRelease({ fetcher: fixture.fetcher });
  const result = await createPostcodeLookup(release, { fetcher: fixture.fetcher }).lookup('SW1A 0AA');
  assert.ok(result.status === 'found' || result.status === 'unavailable-area', result.message);
  assert.equal(result.area?.code, 'E02000979');
  assert.equal(result.area?.parentCode, 'E09000033');
  assert.deepEqual([...release.loadedDistricts], ['E09000033']);
  assert.equal(fixture.requests.filter(path => path.includes('/areas/msoa/')).length, 1);
});
