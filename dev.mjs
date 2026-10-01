// Cross-platform dev launcher (Windows / macOS / Linux).
// Starts the PTY bridge (server) and the web UI together.
//   node dev.mjs
// Honors SIA_CMD / SIA_ARGS to choose what the bridge launches
// (e.g. SIA_CMD=claude node dev.mjs).

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// First run on a fresh clone: install whatever is missing, no manual steps.
for (const dir of ['server', 'web', 'mcp']) {
  if (!existsSync(join(root, dir, 'node_modules'))) {
    console.log(`[setup] instalando dependencias de ${dir}/…`);
    const r = spawnSync('npm', ['install'], { cwd: join(root, dir), stdio: 'inherit', shell: isWin });
    if (r.status !== 0) { console.error(`[setup] npm install falló en ${dir}/`); process.exit(1); }
  }
}

function run(label, cwd) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: join(root, cwd),
    env: process.env,
    stdio: 'inherit',
    shell: isWin, // needed so Windows resolves npm.cmd
  });
  child.on('exit', (code) => {
    console.log(`[${label}] terminó (code ${code}). Cerrando sia…`);
    shutdown();
  });
  return child;
}

let children = [];
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) { try { c.kill(); } catch {} }
  process.exit(0);
}

children = [run('server', 'server'), run('web', 'web')];
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
