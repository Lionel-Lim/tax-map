import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Native file watching across the postcode shards can make Wrangler fail to
// spawn workerd on macOS (EBADF). Poll infrequently for this built-site preview.
const env = { ...process.env };
if (process.platform === 'darwin') {
  env.CHOKIDAR_USEPOLLING = '1';
  env.CHOKIDAR_INTERVAL = '10000';
}
const wrangler = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const child = spawn(process.execPath, [wrangler, 'dev', '--ip', '127.0.0.1', '--port', '4174'], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
