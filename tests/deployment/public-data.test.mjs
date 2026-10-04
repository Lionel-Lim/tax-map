import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { verifyPublicData, verifySourceData } from '../../scripts/deployment/verify-public-data.mjs';

const releases = ['england-2026-09-26-v1', 'sample-2026-09-26-v1'];
const digest = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`);

test('repository sources are clean and preserve the existing immutable public releases', async () => {
  await verifySourceData('static');
  const publishedHashes = {
    'england-2026-09-26-v1': '2b0d3b12fb4e04cc02e88e07b1ec22dc2b52521faab662cb5df5168d8ad3a85f',
    'sample-2026-09-26-v1': 'c329cd5de9f574f5cacfaf1160aabe2560e54704a6804b4e58af3cd19fd70a2c',
  };
  for (const release of releases) {
    const source = await readFile(`static/data/${release}/manifest.json`);
    assert.equal(digest(source).sha256, publishedHashes[release]);
    assert.deepEqual(await readFile(`.build/public-static/data/public-v1/${release}/manifest.json`), source);
  }
});

test('the public distribution contains no NI records, has complete checksums, and retains tax statistics', async () => {
  await verifyPublicData('.build/public-static');
  for (const release of ['england-2026-09-26-v1', 'sample-2026-09-26-v1']) {
    for (const file of ['areas.json', 'policy.json', 'search.json', 'postcodes/LE4.json']) {
      assert.deepEqual(await readFile(`.build/public-static/data/public-v1/${release}/${file}`), await readFile(`static/data/${release}/${file}`));
    }
    const index = JSON.parse(await readFile(`.build/public-static/data/public-v1/${release}/postcodes/index.json`));
    assert.equal(index.records, 2651940);
    assert.equal(Object.keys(index.shards).length, 3039);
  }
});

// Small, entirely synthetic releases let us inject restricted markers with
// matching checksums, proving the guard inspects both JSON and gzip contents.
async function syntheticSource(root, corruptFormat, marker) {
  for (const release of releases) {
    const base = path.join(root, 'data', release);
    await mkdir(path.join(base, 'postcodes'), { recursive: true });
    const clean = ['AA1 1AA', null, null, 'E92000001'];
    const restricted = marker === 'country'
      ? ['AA1 1AA', null, null, 'N92000002'] : ['bt99 9zz', null, null, null];
    const json = encode({ outward: 'AA1', rows: [corruptFormat === 'json' ? restricted : clean] });
    const gzip = gzipSync(encode({ outward: 'AA1', rows: [corruptFormat === 'gzip' ? restricted : clean] }));
    const index = encode({ distribution: 'public-v1', countries: { E92000001: 'England' }, records: 1,
      shards: { AA1: { path: 'postcodes/AA1.json', records: 1, ...digest(json),
        gzipPath: 'postcodes/AA1.json.gz', gzipSha256: digest(gzip).sha256 } } });
    const artifacts = { 'postcodes/AA1.json': json, 'postcodes/AA1.json.gz': gzip, 'postcodes/index.json': index };
    const manifest = encode({ releaseId: release,
      distribution: { id: 'public-v1', excludedPostcodeCountry: 'N92000002', excludedPostcodeRecords: 63023,
        postcodeRecords: 1, postcodeShards: 1 },
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([file, bytes]) => [file, digest(bytes)])) });
    for (const [file, bytes] of Object.entries({ ...artifacts, 'manifest.json': manifest })) await writeFile(path.join(base, file), bytes);
    if (release === releases[0]) await writeFile(path.join(root, 'data/manifest.json'), encode({
      manifestPath: `${release}/manifest.json`, manifestSha256: digest(manifest).sha256,
    }));
  }
}

for (const format of ['json', 'gzip']) {
  for (const marker of ['postcode', 'country']) {
    test(`source guard rejects a restricted ${marker} marker in ${format}, even with matching checksums`, async () => {
      const temp = await mkdtemp(path.join(tmpdir(), 'taxmap-source-check-'));
      try {
        await syntheticSource(temp);
        await verifySourceData(temp);
        await syntheticSource(temp, format, marker);
        await assert.rejects(verifySourceData(temp), /Restricted Northern Ireland postcode data/);
      } finally { await rm(temp, { recursive: true, force: true }); }
    });
  }
}

test('publication guard rejects a raw release or an unexpected data file', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'taxmap-public-check-'));
  try {
    await mkdir(path.join(temp, 'data/england-2026-09-26-v1'), { recursive: true });
    await writeFile(path.join(temp, 'data/manifest.json'), '{}');
    await assert.rejects(verifyPublicData(temp), /Unfiltered or unexpected/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
