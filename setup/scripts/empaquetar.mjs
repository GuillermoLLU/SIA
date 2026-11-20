// SIA Setup para entregar: mete en él lo que instala, con lo que ocupa SIA instalado (para la barra
// de progreso) y los certificados de sia-instance.json (como scripts/installer-config.mjs), y lo
// compila con Tauri.
// - Windows (npm run dist:setup, tras dist:win): el instalador NSIS de electron-builder. Sale
//   dist-app/SIA Instalador <versión>.exe.
// - Mac (npm run dist:setup:mac, tras dist): SIA.app comprimido. Sale dist-app/SIA Instalador
//   <versión>.dmg, firmado ad hoc como SIA (scripts/adhoc-sign.cjs).
// Necesita Rust y, una vez, `npm install` en setup/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCertsConfig } from '../../server/platform/config.js';

const setup = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(setup);
const dist = path.join(root, 'dist-app');
const mac = process.platform === 'darwin';
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const fail = (msg) => { console.error(`[setup] ${msg}`); process.exit(1); };
if (!fs.existsSync(path.join(setup, 'node_modules', '.bin'))) fail('falta la CLI de Tauri: cd setup && npm install');

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
  const p = path.join(dir, e.name);
  return sum + (e.isDirectory() ? size(p) : e.isFile() ? fs.statSync(p).size : 0);
}, 0);

const payload = path.join(setup, 'src-tauri', 'payload');
fs.rmSync(payload, { recursive: true, force: true });
fs.mkdirSync(payload, { recursive: true });

// Lo que se instala y lo que ocupa SIA instalado
let archivo, bytes;
if (mac) {
  // electron-builder deja SIA.app en dist-app/mac-arm64/, mac/ o mac-universal/, según la arquitectura
  const app = ['mac-arm64', 'mac-universal', 'mac'].map((d) => path.join(dist, d, 'SIA.app')).find((p) => fs.existsSync(p));
  if (!app) fail('falta dist-app/mac*/SIA.app: antes, npm run dist');
  archivo = 'sia-app.zip';
  execFileSync('ditto', ['-c', '-k', '--keepParent', app, path.join(payload, archivo)]);
  bytes = size(app);
} else {
  const nsis = path.join(dist, `SIA Setup ${version}.exe`);
  const unpacked = path.join(dist, 'win-unpacked');
  if (!fs.existsSync(nsis) || !fs.existsSync(unpacked)) fail(`falta ${path.relative(root, nsis)}: antes, npm run dist:win`);
  archivo = 'sia-nsis.exe';
  fs.copyFileSync(nsis, path.join(payload, archivo));
  bytes = size(unpacked);
}

let file = null;
try { file = JSON.parse(fs.readFileSync(path.join(root, 'sia-instance.json'), 'utf8')); } catch { /* sin fichero: sin comprobar certificados */ }
const { helpUrl, required } = parseCertsConfig(file);
const paquete = {
  version,
  bytes,
  archivo,
  // el | separa los nombres al comprobarlos (src-tauri: CERTS_PS y CERTS_SH), así que no puede ir dentro de uno
  certs: { guia: helpUrl, requeridos: required.filter((n) => !n.includes('|')) },
};
fs.writeFileSync(path.join(payload, 'paquete.json'), `${JSON.stringify(paquete, null, 2)}\n`);
console.log(`[setup] SIA ${version} · ${Math.round(bytes / 1e6)} MB instalado · certificados: ${paquete.certs.requeridos.join(', ') || 'sin comprobar'}`);

// La versión, la de SIA; en Mac, además, su .dmg firmado ad hoc
const config = mac ? { version, bundle: { active: true, targets: ['dmg'], macOS: { signingIdentity: '-' } } } : { version };
fs.writeFileSync(path.join(payload, 'tauri.config.json'), JSON.stringify(config));
execSync(`npx tauri build --config "${path.join(payload, 'tauri.config.json')}"`, { cwd: setup, stdio: 'inherit' });

const release = path.join(setup, 'src-tauri', 'target', 'release');
const out = path.join(dist, `SIA Instalador ${version}.${mac ? 'dmg' : 'exe'}`);
if (mac) {
  const dmgs = path.join(release, 'bundle', 'dmg');
  const dmg = fs.readdirSync(dmgs).find((f) => f.endsWith('.dmg'));
  if (!dmg) fail('Tauri no ha generado el .dmg');
  fs.copyFileSync(path.join(dmgs, dmg), out);
} else {
  fs.copyFileSync(path.join(release, 'sia-setup.exe'), out);
}
console.log(`[setup] ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1e6)} MB)`);
