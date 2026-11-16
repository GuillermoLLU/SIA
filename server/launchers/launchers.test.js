import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResolver, spawnSpec } from './resolve.js';
import { mcpRename, mcpEnv, mcpServers } from './mcp.js';
import { repoKeyEnv, applyRepoKey, BASH_ENV_SCRIPT, REPO_KEY_VAR } from './repo-key.js';
import { createLaunchers } from './service.js';

const BASE = { url: 'https://x.supabase.co', key: 'pk', tokens: ['t1', 't2'] };
const BIN = { execPath: '/app/node', server: '/app/mcp/index.js' };

test('spawnSpec: en Windows un .cmd va por cmd.exe /c', () => {
  assert.deepEqual(spawnSpec('/usr/bin/copilot', ['-x'], { isWin: false }), { cmd: '/usr/bin/copilot', args: ['-x'] });
  assert.deepEqual(spawnSpec('C:\\copilot.CMD', ['-x'], { isWin: true, comspec: 'C:\\cmd.exe' }), { cmd: 'C:\\cmd.exe', args: ['/c', 'C:\\copilot.CMD', '-x'] });
  assert.deepEqual(spawnSpec('C:\\copilot.exe', [], { isWin: true }), { cmd: 'C:\\copilot.exe', args: [] });
});

test('resolver: en Windows las extensiones de PATHEXT antes que el fichero pelado; fuera, solo el literal', () => {
  const files = new Set(['C:\\bin\\copilot', 'C:\\bin\\copilot.CMD', '/usr/bin/copilot']);
  const isFile = (p) => { if (!files.has(p)) throw new Error('ENOENT'); return true; };
  const win = createResolver({ isWin: true, env: { PATH: 'C:\\nada;C:\\bin', PATHEXT: '.EXE;.CMD' }, isFile });
  assert.equal(win.resolve('copilot'), 'C:\\bin\\copilot.CMD');
  assert.equal(win.which('nope'), false);
  const nix = createResolver({ isWin: false, env: { PATH: '/usr/bin' }, isFile });
  assert.equal(nix.resolve('copilot'), '/usr/bin/copilot');
  assert.equal(nix.resolve('/usr/bin/copilot'), '/usr/bin/copilot', 'una ruta se comprueba tal cual');
  assert.equal(nix.resolve('/no/copilot'), null);
});

test('mcpEnv: proyectos y conexión por entorno; sin base, solo los proyectos', () => {
  assert.deepEqual(mcpEnv([1, 2], BASE), { ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: '1,2', SIA_SUPABASE_URL: BASE.url, SIA_SUPABASE_KEY: 'pk', SIA_ACCESS_TOKENS: 't1,t2' });
  assert.deepEqual(mcpEnv([], null), { ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: '' });
});

test('los servidores MCP de la sesión; sin base, ninguno', () => {
  const env = { A: '1' };
  assert.deepEqual(mcpServers(env, BASE, BIN), { knowledge: { command: '/app/node', args: ['/app/mcp/index.js'], env } });
  assert.equal(mcpServers(env, null, BIN), null);
});

test('mcpRename: el nombre antiguo del servidor pasa al vigente', () => {
  assert.equal(mcpRename('usa ITX-knowledge y ITX-knowledge'), 'usa knowledge y knowledge');
  assert.equal(mcpRename(null), null);
});

test('la clave de GitHub: fuera del entorno de Copilot, y a los comandos por BASH_ENV; en Windows, sin ella', () => {
  const key = repoKeyEnv({ token: 'ghp_1', platform: 'darwin', bashEnvFile: '/ws/.repo-env.sh', userBashEnv: '/home/u/.bash_env' });
  assert.deepEqual(key, { env: { [REPO_KEY_VAR]: 'ghp_1', BASH_ENV: '/ws/.repo-env.sh', SIA_USER_BASH_ENV: '/home/u/.bash_env' }, drop: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'], args: ['--bash-env', 'on'] });
  assert.deepEqual(applyRepoKey({ PATH: '/bin', GH_TOKEN: 'ghp_1', GITHUB_TOKEN: 'ghp_1', COPILOT_GITHUB_TOKEN: 'x' }, key), { PATH: '/bin', SIA_GH_TOKEN: 'ghp_1', BASH_ENV: '/ws/.repo-env.sh', SIA_USER_BASH_ENV: '/home/u/.bash_env' });
  assert.deepEqual(repoKeyEnv({ token: 'ghp_1', platform: 'win32', bashEnvFile: '/ws/.repo-env.sh' }), { env: {}, drop: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'], args: [] });
  assert.deepEqual(repoKeyEnv({ token: '', platform: 'darwin', bashEnvFile: '/ws/.repo-env.sh' }).args, []);
  assert.deepEqual(repoKeyEnv({ token: 'ghp_1', platform: 'darwin', bashEnvFile: null }).env, {});
  assert.equal(repoKeyEnv({ token: 'ghp_1', platform: 'darwin', bashEnvFile: '/ws/.repo-env.sh', userBashEnv: '/ws/.repo-env.sh' }).env.SIA_USER_BASH_ENV, undefined); // el nuestro no se encadena a sí mismo
  assert.match(BASH_ENV_SCRIPT, /export GH_TOKEN="\$SIA_GH_TOKEN"/);
  assert.doesNotMatch(BASH_ENV_SCRIPT, /ghp_/); // sin secretos en el guion
});

test('el servicio: el CLI en su modo programable con los servidores de la sesión, el guion de la clave y el entorno aparte de su cuenta', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-launchers-'));
  const launchers = createLaunchers({ workspace: dir, mcpServer: '/app/mcp/index.js', execPath: '/app/node', isWin: false, env: { PATH: '/nope' }, platform: 'darwin' });
  assert.equal(fs.readFileSync(path.join(dir, '.repo-env.sh'), 'utf8'), BASH_ENV_SCRIPT);
  assert.equal(launchers.installed(), false);
  const copilot = launchers.prepare([1], BASE);
  assert.equal(copilot.cmd, 'copilot');
  assert.ok(copilot.args.includes('--headless') && copilot.args.includes('--stdio'));
  assert.deepEqual(copilot.mcp.knowledge.args, ['/app/mcp/index.js']);
  assert.equal(copilot.mcp.knowledge.env.SIA_ALLOWED_PROJECTS, '1');
  assert.equal(launchers.prepare([], null).mcp, null);
  assert.deepEqual(fs.readdirSync(dir), ['.repo-env.sh']); // nada más en el workspace
  const chatEnv = { PATH: '/bin', GH_TOKEN: 'ghp_1', GITHUB_TOKEN: 'ghp_1' };
  assert.deepEqual(launchers.envFor(chatEnv), { env: { PATH: '/bin', SIA_GH_TOKEN: 'ghp_1', BASH_ENV: path.join(dir, '.repo-env.sh') }, args: ['--bash-env', 'on'] });
  assert.deepEqual(launchers.spec(['-x']), { cmd: 'copilot', args: ['-x'] });
  fs.rmSync(dir, { recursive: true, force: true });
});
