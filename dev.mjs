// Cross-platform dev launcher (Windows / macOS / Linux).
// Starts the bridge (server) and the web UI together.
//   node dev.mjs

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// Las dependencias declaradas en el package.json de cada carpeta que no estén en su node_modules (una rama que añade
// un paquete nuevo, o una carpeta a medio instalar). Sin node_modules, todas.
const missingDeps = (dir) => {
  const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  return names.filter((name) => !existsSync(join(root, dir, 'node_modules', name)));
};

// First run on a fresh clone, or after a branch adds dependencies: install whatever is missing, no manual steps.
for (const dir of ['server', 'web', 'mcp']) {
  const missing = existsSync(join(root, dir, 'node_modules')) ? missingDeps(dir) : ['node_modules'];
  if (missing.length) {
    console.log(`[setup] instalando dependencias de ${dir}/ (faltan: ${missing.join(', ')})…`);
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
