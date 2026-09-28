import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyPublicData } from '../../scripts/deployment/verify-public-data.mjs';

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

test('publication guard rejects a raw release or an unexpected data file', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'taxmap-public-check-'));
  try {
    await mkdir(path.join(temp, 'data/england-2026-09-26-v1'), { recursive: true });
    await writeFile(path.join(temp, 'data/manifest.json'), '{}');
    await assert.rejects(verifyPublicData(temp), /Unfiltered or unexpected/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
