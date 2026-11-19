// SIA Setup para entregar (npm run dist:setup, después de npm run dist:win): mete en el .exe el
// instalador NSIS que acaba de generar electron-builder, con lo que ocupa SIA instalado (para la
// barra de progreso) y los certificados de sia-instance.json (como scripts/installer-config.mjs),
// y lo compila con Tauri. Sale dist-app/SIA Instalador <versión>.exe.
// Necesita Rust y, una vez, `npm install` en setup/.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCertsConfig } from '../../server/platform/config.js';

const setup = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(setup);
const dist = path.join(root, 'dist-app');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const fail = (msg) => { console.error(`[setup] ${msg}`); process.exit(1); };
const nsis = path.join(dist, `SIA Setup ${version}.exe`);
const unpacked = path.join(dist, 'win-unpacked');
if (!fs.existsSync(nsis) || !fs.existsSync(unpacked)) fail(`falta ${path.relative(root, nsis)}: antes, npm run dist:win`);
if (!fs.existsSync(path.join(setup, 'node_modules', '.bin'))) fail('falta la CLI de Tauri: cd setup && npm install');

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
  const p = path.join(dir, e.name);
  return sum + (e.isDirectory() ? size(p) : e.isFile() ? fs.statSync(p).size : 0);
}, 0);

let file = null;
try { file = JSON.parse(fs.readFileSync(path.join(root, 'sia-instance.json'), 'utf8')); } catch { /* sin fichero: sin comprobar certificados */ }
const { helpUrl, required } = parseCertsConfig(file);

const payload = path.join(setup, 'src-tauri', 'payload');
fs.mkdirSync(payload, { recursive: true });
fs.copyFileSync(nsis, path.join(payload, 'sia-nsis.exe'));
const paquete = {
  version,
  bytes: size(unpacked),
  nsis: 'sia-nsis.exe',
  // el | separa los nombres al comprobarlos (src-tauri: CERTS_PS), así que no puede ir dentro de uno
  certs: { guia: helpUrl, requeridos: required.filter((n) => !n.includes('|')) },
};
fs.writeFileSync(path.join(payload, 'paquete.json'), `${JSON.stringify(paquete, null, 2)}\n`);
// la versión del .exe, la de SIA
fs.writeFileSync(path.join(payload, 'tauri.version.json'), JSON.stringify({ version }));
console.log(`[setup] SIA ${version} · ${Math.round(paquete.bytes / 1e6)} MB instalado · certificados: ${paquete.certs.requeridos.join(', ') || 'sin comprobar'}`);

execSync(`npx tauri build --config "${path.join(payload, 'tauri.version.json')}"`, { cwd: setup, stdio: 'inherit' });

const out = path.join(dist, `SIA Instalador ${version}.exe`);
fs.copyFileSync(path.join(setup, 'src-tauri', 'target', 'release', 'sia-setup.exe'), out);
console.log(`[setup] ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1e6)} MB)`);
