import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const RELEASES = ['england-2026-09-26-v1', 'sample-2026-09-26-v1'];
const ALLOWED_ARTIFACT = /^(areas(?:\/msoa\/E\d{8})?\.json|councils\.json|policy\.json|search\.json|sources\.json|boundaries\/(?:lad|msoa(?:\/E\d{8})?)\.geojson|postcodes\/[A-Z][A-Z0-9]{1,3}\.json(?:\.gz)?|postcodes\/index\.json)$/;

export async function verifySourceData(root) {
  await verifyData(root, true);
}

export async function verifyPublicData(root) {
  await verifyData(root, false);
}

async function verifyData(root, source) {
  const top = (await readdir(path.join(root, 'data'))).sort();
  if (source && top.includes('.staging')) {
    if ((await readdir(path.join(root, 'data/.staging'))).length) throw new Error('Unreviewed staged data in source directory.');
    top.splice(top.indexOf('.staging'), 1);
  }
  const expected = source ? [...RELEASES, 'manifest.json'].sort() : ['manifest.json', 'public-v1'];
  if (top.join('|') !== expected.join('|')) throw new Error('Unfiltered or unexpected data directory would be published.');
  const dataRoot = path.join(root, source ? 'data' : 'data/public-v1');
  const releases = source ? RELEASES : (await readdir(dataRoot)).sort();
  if (releases.join('|') !== RELEASES.join('|')) throw new Error('Unreviewed public data release.');
  for (const release of releases) {
    const base = path.join(dataRoot, release);
    const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
    if (manifest.releaseId !== release || manifest.distribution?.id !== 'public-v1'
      || manifest.distribution.excludedPostcodeCountry !== 'N92000002'
      || manifest.distribution.excludedPostcodeRecords !== 63023) throw new Error('Missing public distribution evidence.');
    const actual = [];
    async function visit(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile()) actual.push(path.relative(base, file));
        else throw new Error('Non-file in public data.');
      }
    }
    await visit(base);
    if (actual.sort().join('|') !== ['manifest.json', ...Object.keys(manifest.artifacts)].sort().join('|')) throw new Error('Public artifact inventory mismatch.');
    const index = JSON.parse(await readFile(path.join(base, 'postcodes/index.json'), 'utf8'));
    let records = 0;
    let shards = 0;
    for (const relative of actual) {
      if (relative === 'manifest.json') continue;
      if (!ALLOWED_ARTIFACT.test(relative)) throw new Error(`Unreviewed public asset: ${relative}`);
      if (/^postcodes\/BT/i.test(relative)) throw new Error(`Restricted Northern Ireland postcode data: ${relative}`);
      const bytes = await readFile(path.join(base, relative));
      const expected = manifest.artifacts[relative];
      if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Public checksum mismatch: ${relative}`);
      if (!relative.startsWith('postcodes/') || relative === 'postcodes/index.json') continue;
      const data = JSON.parse(relative.endsWith('.gz') ? gunzipSync(bytes).toString() : bytes.toString());
      if (/^BT/i.test(data.outward) || data.rows.some(row => /^BT/i.test(row[0]) || row[3] === 'N92000002')) throw new Error(`Restricted Northern Ireland postcode data: ${relative}`);
      if (!relative.endsWith('.gz')) {
        const shard = index.shards[data.outward];
        if (shard?.path !== relative || shard.records !== data.rows.length || shard.sha256 !== expected.sha256) throw new Error(`Postcode index mismatch: ${relative}`);
        records += data.rows.length;
        shards += 1;
      } else {
        const shard = index.shards[data.outward];
        if (shard?.gzipPath !== relative || shard.records !== data.rows.length || shard.gzipSha256 !== expected.sha256) throw new Error(`Postcode gzip index mismatch: ${relative}`);
      }
    }
    if (Object.keys(index.shards).some(key => /^BT/i.test(key)) || index.countries.N92000002
      || index.distribution !== 'public-v1' || shards !== Object.keys(index.shards).length
      || shards !== manifest.distribution.postcodeShards
      || records !== index.records || records !== manifest.distribution.postcodeRecords) throw new Error('Public postcode coverage mismatch.');
  }
  const pointer = JSON.parse(await readFile(path.join(root, 'data/manifest.json'), 'utf8'));
  const pointerPattern = source ? /^(england|sample)-2026-09-26-v1\/manifest\.json$/ : /^public-v1\/(england|sample)-2026-09-26-v1\/manifest\.json$/;
  if (!pointerPattern.test(pointer.manifestPath)) throw new Error('Unsafe release pointer.');
  const bytes = await readFile(path.join(root, 'data', pointer.manifestPath));
  if (createHash('sha256').update(bytes).digest('hex') !== pointer.manifestSha256) throw new Error('Public manifest pointer checksum mismatch.');
}
