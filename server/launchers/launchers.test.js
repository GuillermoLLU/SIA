import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launcherById, launcherArgs, promptArgs, spawnSpec } from './launchers.js';
import { mcpRename, mcpEnv, mcpConfig, mcpServers, codexProfile, codexProfileToml, tomlStr } from './mcp.js';
import { repoKeyEnv, applyRepoKey, BASH_ENV_SCRIPT, REPO_KEY_VAR } from './repo-key.js';
import { createResolver } from './resolve.js';
import { createLaunchers } from './service.js';

const BASE = { url: 'https://x.supabase.co', key: 'pk', tokens: ['t1', 't2'] };
const BIN = { execPath: '/app/node', server: '/app/mcp/index.js' };

test('launcherById: el pedido o el primero; Copilot va sin terminal', () => {
  assert.equal(launcherById('codex').id, 'codex');
  assert.equal(launcherById('nope').id, 'claude');
  assert.equal(launcherById('copilot').native, true);
  assert.equal(launcherById('claude').native, undefined);
});

test('argumentos por CLI: sin confirmaciones y con su MCP; Copilot en su modo programable; Codex sin base, sin perfil', () => {
  assert.deepEqual(launcherArgs('claude', { mcpFile: '/w/m.json' }), ['--permission-mode', 'bypassPermissions', '--setting-sources', '', '--mcp-config', '/w/m.json']);
  assert.deepEqual(launcherArgs('copilot', {}), ['--headless', '--no-auto-update', '--log-level', 'error', '--stdio', '--disable-builtin-mcps']);
  assert.deepEqual(launcherArgs('codex', { profile: 'sia-s1' }), ['--dangerously-bypass-approvals-and-sandbox', '-p', 'sia-s1']);
  assert.deepEqual(launcherArgs('codex', { profile: null }), ['--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(promptArgs('hola'), ['hola']);
});

test('spawnSpec: en Windows un .cmd va por cmd.exe /c', () => {
  assert.deepEqual(spawnSpec('/usr/bin/claude', ['-x'], { isWin: false }), { cmd: '/usr/bin/claude', args: ['-x'] });
  assert.deepEqual(spawnSpec('C:\\claude.CMD', ['-x'], { isWin: true, comspec: 'C:\\cmd.exe' }), { cmd: 'C:\\cmd.exe', args: ['/c', 'C:\\claude.CMD', '-x'] });
  assert.deepEqual(spawnSpec('C:\\claude.exe', [], { isWin: true }), { cmd: 'C:\\claude.exe', args: [] });
});

test('mcpEnv: proyectos y conexión por entorno; sin base, solo los proyectos', () => {
  assert.deepEqual(mcpEnv([1, 2], BASE), { ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: '1,2', SIA_SUPABASE_URL: BASE.url, SIA_SUPABASE_KEY: 'pk', SIA_ACCESS_TOKENS: 't1,t2' });
  assert.deepEqual(mcpEnv([], null), { ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: '' });
});

test('los servidores MCP de la sesión y el fichero de Claude; sin base, ninguno', () => {
  const env = { A: '1' };
  assert.deepEqual(mcpServers(env, BASE, BIN), { knowledge: { command: '/app/node', args: ['/app/mcp/index.js'], env } });
  assert.equal(mcpServers(env, null, BIN), null);
  assert.deepEqual(mcpConfig(env, BASE, BIN), { mcpServers: { knowledge: { command: '/app/node', args: ['/app/mcp/index.js'], env } } });
  assert.deepEqual(mcpConfig(env, null, BIN), { mcpServers: {} });
});

test('perfil de Codex: TOML con el MCP y su entorno, cadenas escapadas', () => {
  assert.equal(tomlStr('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(codexProfile('s3'), 'sia-s3');
  const toml = codexProfileToml({ SIA_SUPABASE_KEY: 'pk' }, BIN);
  assert.match(toml, /^\[mcp_servers\.knowledge\]$/m);
  assert.match(toml, /^command = "\/app\/node"$/m);
  assert.match(toml, /^SIA_SUPABASE_KEY = "pk"$/m);
});

test('mcpRename: el nombre antiguo del servidor pasa al vigente', () => {
  assert.equal(mcpRename('usa ITX-knowledge y ITX-knowledge'), 'usa knowledge y knowledge');
  assert.equal(mcpRename(null), null);
});

test('resolver: en Windows las extensiones de PATHEXT antes que el fichero pelado; fuera, solo el literal', () => {
  const files = new Set(['C:\\bin\\claude', 'C:\\bin\\claude.CMD', '/usr/bin/claude']);
  const isFile = (p) => { if (!files.has(p)) throw new Error('ENOENT'); return true; };
  const win = createResolver({ isWin: true, env: { PATH: 'C:\\nada;C:\\bin', PATHEXT: '.EXE;.CMD' }, isFile });
  assert.equal(win.resolve('claude'), 'C:\\bin\\claude.CMD');
  assert.equal(win.which('nope'), false);
  const nix = createResolver({ isWin: false, env: { PATH: '/usr/bin' }, isFile });
  assert.equal(nix.resolve('claude'), '/usr/bin/claude');
  assert.equal(nix.resolve('/usr/bin/claude'), '/usr/bin/claude', 'una ruta se comprueba tal cual');
  assert.equal(nix.resolve('/no/claude'), null);
});

test('la clave de GitHub con Copilot: fuera de su entorno, y a los comandos por BASH_ENV; en Windows, sin ella', () => {
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

test('el servicio: Copilot sin fichero de MCP, con los servidores de la sesión y el guion de la clave; Claude con su fichero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-launchers-'));
  const codexHome = path.join(dir, 'codex');
  const launchers = createLaunchers({ workspace: dir, codexHome, mcpServer: '/app/mcp/index.js', execPath: '/app/node', isWin: false, env: { PATH: '/nope' }, platform: 'darwin' });
  assert.equal(fs.readFileSync(path.join(dir, '.repo-env.sh'), 'utf8'), BASH_ENV_SCRIPT);
  assert.deepEqual(launchers.list().map((l) => [l.id, l.native, l.available]), [['claude', false, false], ['copilot', true, false], ['codex', false, false]]);
  const copilot = launchers.prepare(launchers.byId('copilot'), 's1', [1], BASE, 'hola');
  assert.equal(copilot.cmd, 'copilot');
  assert.ok(copilot.args.includes('--headless'));
  assert.ok(!copilot.args.includes('hola'), 'el primer mensaje va por la sesión, no por argumentos');
  assert.deepEqual(copilot.mcp.knowledge.args, ['/app/mcp/index.js']);
  assert.equal(copilot.mcp.knowledge.env.SIA_ALLOWED_PROJECTS, '1');
  assert.equal(launchers.prepare(launchers.byId('copilot'), 's2', [], null).mcp, null);
  assert.equal(fs.readdirSync(dir).some((f) => f.startsWith('.mcp-')), false);
  const claude = launchers.prepare(launchers.byId('claude'), 's3', [1], BASE, 'hola');
  assert.deepEqual(claude.args.slice(0, 1), ['hola']);
  assert.ok(fs.existsSync(path.join(dir, '.mcp-claude-s3.json')));
  launchers.cleanup('s3');
  assert.ok(!fs.existsSync(path.join(dir, '.mcp-claude-s3.json')));
  // el entorno: con Copilot, la clave de repos aparte de su cuenta; con los demás, tal cual
  const chatEnv = { PATH: '/bin', GH_TOKEN: 'ghp_1', GITHUB_TOKEN: 'ghp_1' };
  const forCopilot = launchers.envFor(launchers.byId('copilot'), chatEnv);
  assert.deepEqual(forCopilot, { env: { PATH: '/bin', SIA_GH_TOKEN: 'ghp_1', BASH_ENV: path.join(dir, '.repo-env.sh') }, args: ['--bash-env', 'on'] });
  assert.deepEqual(launchers.envFor(launchers.byId('claude'), chatEnv), { env: chatEnv, args: [] });
  assert.deepEqual(launchers.spec('copilot', ['-x']), { cmd: 'copilot', args: ['-x'] });
  fs.rmSync(dir, { recursive: true, force: true });
});
