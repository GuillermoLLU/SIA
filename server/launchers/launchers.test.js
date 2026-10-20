import test from 'node:test';
import assert from 'node:assert/strict';
import { launcherById, launcherArgs, promptArgs, spawnSpec } from './launchers.js';
import { mcpRename, mcpEnv, mcpConfig, codexProfile, codexProfileToml, tomlStr } from './mcp.js';
import { createResolver } from './resolve.js';

const BASE = { url: 'https://x.supabase.co', key: 'pk', tokens: ['t1', 't2'] };
const BIN = { execPath: '/app/node', server: '/app/mcp/index.js' };

test('launcherById: el pedido o el primero', () => {
  assert.equal(launcherById('codex').id, 'codex');
  assert.equal(launcherById('nope').id, 'claude');
});

test('argumentos por CLI: sin confirmaciones y con su MCP; Codex sin base, sin perfil', () => {
  assert.deepEqual(launcherArgs('claude', { mcpFile: '/w/m.json' }), ['--permission-mode', 'bypassPermissions', '--setting-sources', '', '--mcp-config', '/w/m.json']);
  assert.deepEqual(launcherArgs('copilot', { mcpFile: '/w/m.json' }), ['--allow-all', '--additional-mcp-config', '@/w/m.json']);
  assert.deepEqual(launcherArgs('codex', { profile: 'sia-s1' }), ['--dangerously-bypass-approvals-and-sandbox', '-p', 'sia-s1']);
  assert.deepEqual(launcherArgs('codex', { profile: null }), ['--dangerously-bypass-approvals-and-sandbox']);
});

test('primer mensaje según el agente', () => {
  assert.deepEqual(promptArgs('claude', 'hola'), ['hola']);
  assert.deepEqual(promptArgs('codex', 'hola'), ['hola']);
  assert.deepEqual(promptArgs('copilot', 'hola'), ['-i', 'hola']);
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

test('mcpConfig: el fichero de Claude y el de Copilot; sin base, sin servidores', () => {
  const env = { A: '1' };
  assert.deepEqual(mcpConfig('claude', env, BASE, BIN), { mcpServers: { knowledge: { command: '/app/node', args: ['/app/mcp/index.js'], env } } });
  assert.deepEqual(mcpConfig('copilot', env, BASE, BIN).mcpServers.knowledge, { type: 'local', command: '/app/node', args: ['/app/mcp/index.js'], tools: ['*'], env });
  assert.deepEqual(mcpConfig('claude', env, null, BIN), { mcpServers: {} });
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
