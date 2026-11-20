// «Desinstalar SIA.exe» (npm run dist:setup, antes de dist:win): SIA Setup sin nada dentro y en
// modo desinstalar (SIA_SETUP_MODO, en src-tauri/build.rs). Lo deja en build/, donde el
// instalador NSIS lo recoge y lo registra como desinstalador de SIA (build/installer.nsh).
// Solo Windows: en Mac se desinstala llevando SIA a la Papelera.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setup = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(setup);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'win32') process.exit(0);
if (!fs.existsSync(path.join(setup, 'node_modules', '.bin'))) {
  console.error('[setup] falta la CLI de Tauri: cd setup && npm install');
  process.exit(1);
}

const config = path.join(setup, 'src-tauri', 'target', 'desinstalador.config.json');
fs.mkdirSync(path.dirname(config), { recursive: true });
fs.writeFileSync(config, JSON.stringify({ version }));
execSync(`npx tauri build --config "${config}"`, { cwd: setup, stdio: 'inherit', env: { ...process.env, SIA_SETUP_MODO: 'desinstalar' } });

const out = path.join(root, 'build', 'Desinstalar SIA.exe');
fs.copyFileSync(path.join(setup, 'src-tauri', 'target', 'release', 'sia-setup.exe'), out);
console.log(`[setup] ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1e6)} MB)`);
