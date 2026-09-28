import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(project, '.build/public-static');
const releases = ['sample-2026-09-26-v1', 'england-2026-09-26-v1'];
const digest = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`);

// Build a separate distribution; never rewrite the pinned research releases.
// Only explicitly inventoried website assets can cross this publication boundary.
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'data/public-v1'), { recursive: true });
await copyFile(path.join(project, 'static/_headers'), path.join(output, '_headers'));
await copyFile(path.join(project, 'static/favicon.svg'), path.join(output, 'favicon.svg'));
for (const releaseId of releases) {
  const source = path.join(project, 'static/data', releaseId);
  const destination = path.join(output, 'data/public-v1', releaseId);
  const sourceManifestBytes = await readFile(path.join(source, 'manifest.json'));
  const manifest = JSON.parse(sourceManifestBytes);
  const indexBytes = await readFile(path.join(source, 'postcodes/index.json'));
  const index = JSON.parse(indexBytes);
  const artifacts = {};
  const omitted = new Set(['validation.json', 'postcodes/index.json']);
  let removedRecords = 0;

  for (const [outward, shard] of Object.entries(index.shards)) {
    const bytes = await readFile(path.join(source, shard.path));
    const expected = manifest.artifacts[shard.path];
    if (JSON.stringify(digest(bytes)) !== JSON.stringify({ bytes: expected.bytes, sha256: expected.sha256 })) {
      throw new Error(`Source checksum mismatch: ${releaseId}/${shard.path}`);
    }
    const data = JSON.parse(bytes);
    const niRows = data.rows.filter(row => /^BT/i.test(row[0]) || row[3] === 'N92000002');
    if (/^BT/i.test(outward) || niRows.length) {
      if (niRows.length !== data.rows.length) throw new Error(`Mixed-country restricted shard: ${outward}`);
      omitted.add(shard.path);
      omitted.add(shard.gzipPath);
      removedRecords += data.rows.length;
      delete index.shards[outward];
    }
  }
  if (removedRecords !== 63023) throw new Error(`Unexpected Northern Ireland inventory in ${releaseId}: ${removedRecords}`);

  for (const [relative, expected] of Object.entries(manifest.artifacts)) {
    if (omitted.has(relative)) continue;
    if (!/^(areas(?:\/msoa\/E\d{8})?\.json|councils\.json|policy\.json|search\.json|sources\.json|boundaries\/(?:lad|msoa(?:\/E\d{8})?)\.geojson|postcodes\/[A-Z][A-Z0-9]{1,3}\.json(?:\.gz)?)$/.test(relative)) {
      throw new Error(`Unreviewed public asset: ${relative}`);
    }
    const bytes = await readFile(path.join(source, relative));
    const actual = digest(bytes);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error(`Source checksum mismatch: ${relative}`);
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    artifacts[relative] = actual;
  }
  delete index.countries.N92000002;
  index.records -= removedRecords;
  index.coverage = 'Pinned postcode directory excluding all Northern Ireland records. BT postcodes are outside this lookup.';
  index.publicationRestriction = 'Northern Ireland records are excluded from this public distribution. Source validation status is retained separately from publication filtering.';
  index.distribution = 'public-v1';
  const publicIndex = encode(index);
  await writeFile(path.join(destination, 'postcodes/index.json'), publicIndex);
  artifacts['postcodes/index.json'] = digest(publicIndex);
  manifest.artifacts = artifacts;
  manifest.distribution = {
    id: 'public-v1', sourceManifestSha256: digest(sourceManifestBytes).sha256,
    excludedPostcodeCountry: 'N92000002', excludedPostcodeRecords: removedRecords,
    postcodeRecords: index.records, postcodeShards: Object.keys(index.shards).length,
    note: 'Filtered public preview. Original publicReleaseReady and coverage describe the research release; incomplete estimates remain unavailable.',
  };
  await writeFile(path.join(destination, 'manifest.json'), encode(manifest));
  console.log(`${releaseId}: excluded ${removedRecords} Northern Ireland records; retained ${index.records} records in ${Object.keys(index.shards).length} shards.`);
}
const current = releases[1];
const currentManifest = await readFile(path.join(output, 'data/public-v1', current, 'manifest.json'));
await writeFile(path.join(output, 'data/manifest.json'), encode({
  schemaVersion: '1.0.0', releaseId: current, distribution: 'public-v1',
  manifestPath: `public-v1/${current}/manifest.json`, manifestSha256: digest(currentManifest).sha256,
}));
