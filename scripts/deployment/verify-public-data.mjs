import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

export async function verifyPublicData(root) {
  const top = (await readdir(path.join(root, 'data'))).sort();
  if (top.join('|') !== 'manifest.json|public-v1') throw new Error('Unfiltered or unexpected data directory would be published.');
  const releases = (await readdir(path.join(root, 'data/public-v1'))).sort();
  if (releases.join('|') !== 'england-2026-09-26-v1|sample-2026-09-26-v1') throw new Error('Unreviewed public data release.');
  for (const release of releases) {
    const base = path.join(root, 'data/public-v1', release);
    const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
    if (manifest.distribution?.id !== 'public-v1' || manifest.distribution.excludedPostcodeCountry !== 'N92000002') throw new Error('Missing public distribution evidence.');
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
    for (const relative of actual) {
      if (relative === 'manifest.json') continue;
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
      }
    }
    if (Object.keys(index.shards).some(key => /^BT/i.test(key)) || index.countries.N92000002
      || records !== index.records || records !== manifest.distribution.postcodeRecords) throw new Error('Public postcode coverage mismatch.');
  }
  const pointer = JSON.parse(await readFile(path.join(root, 'data/manifest.json'), 'utf8'));
  if (!/^public-v1\/(england|sample)-2026-09-26-v1\/manifest\.json$/.test(pointer.manifestPath)) throw new Error('Unsafe release pointer.');
  const bytes = await readFile(path.join(root, 'data', pointer.manifestPath));
  if (createHash('sha256').update(bytes).digest('hex') !== pointer.manifestSha256) throw new Error('Public manifest pointer checksum mismatch.');
}
