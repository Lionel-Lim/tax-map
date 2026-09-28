import { readdir, stat, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../build/', import.meta.url));
const maxFiles = 20_000;
const maxBytes = 25 * 1024 * 1024;
const files = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.isFile()) files.push({ path: path.relative(root, filename), bytes: (await stat(filename)).size });
    else throw new Error(`Unexpected asset type: ${filename}`);
  }
}

await visit(root);
for (const required of ['index.html', 'map/index.html', 'methodology/index.html', 'data-sources/index.html', '_headers', 'data/manifest.json']) {
  await access(path.join(root, required));
}
if (files.length > maxFiles) throw new Error(`${files.length} files exceed Cloudflare's free limit of ${maxFiles}.`);
const oversized = files.filter(file => file.bytes > maxBytes);
if (oversized.length) throw new Error(`Assets exceed Cloudflare's 25 MiB limit: ${oversized.map(file => file.path).join(', ')}`);
const largest = files.reduce((a, b) => a.bytes > b.bytes ? a : b);
console.log(`Cloudflare asset check passed: ${files.length}/${maxFiles} files; largest ${(largest.bytes / 1024 / 1024).toFixed(2)}/25 MiB (${largest.path}).`);
