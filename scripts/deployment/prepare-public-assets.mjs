import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySourceData } from './verify-public-data.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = path.join(project, 'static');
const output = path.join(project, '.build/public-static');
const releases = ['sample-2026-09-26-v1', 'england-2026-09-26-v1'];

// Keep the already-published public-v1 bytes and URLs unchanged. The repository
// must contain only cleaned data; never silently filter a contaminated source.
await verifySourceData(sourceRoot);
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'data/public-v1'), { recursive: true });
await copyFile(path.join(sourceRoot, '_headers'), path.join(output, '_headers'));
await copyFile(path.join(sourceRoot, 'favicon.svg'), path.join(output, 'favicon.svg'));
await copyFile(path.join(sourceRoot, 'social-preview.png'), path.join(output, 'social-preview.png'));
for (const releaseId of releases) {
  const source = path.join(sourceRoot, 'data', releaseId);
  const destination = path.join(output, 'data/public-v1', releaseId);
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  for (const relative of ['manifest.json', ...Object.keys(manifest.artifacts)]) {
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(source, relative), target);
  }
  console.log(`${releaseId}: verified ${manifest.distribution.postcodeRecords} records; no Northern Ireland data.`);
}
const current = releases[1];
const currentManifest = await readFile(path.join(output, 'data/public-v1', current, 'manifest.json'));
await writeFile(path.join(output, 'data/manifest.json'), `${JSON.stringify({
  schemaVersion: '1.0.0', releaseId: current, distribution: 'public-v1',
  manifestPath: `public-v1/${current}/manifest.json`,
  manifestSha256: createHash('sha256').update(currentManifest).digest('hex'),
})}\n`);
