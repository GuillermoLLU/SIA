import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCopilotAuth, statusOf, usageOf, parseLogin } from './copilot-auth.js';
import { providersRoutes } from './routes.js';
import { frame, createFrameReader } from '../chats/copilot.js';

// procesos de mentira: el runtime (--headless, con Content-Length), el servidor ACP (--acp, un JSON por línea) y `copilot login`
const fakeSpawn = (answer, { missing = false } = {}) => {
  const procs = [];
  const spawn = (cmd, args) => {
    const p = new EventEmitter();
    Object.assign(p, { cmd, args, sent: [], killed: false, stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: new EventEmitter() });
    p.kill = () => { p.killed = true; };
    const framed = args.includes('--headless');
    const read = framed ? createFrameReader() : null;
    const push = (o) => p.stdout.emit('data', framed ? frame(o) : `${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);
    p.stdin.write = (data) => {
      for (const m of (framed ? read(data) : String(data).split('\n').filter(Boolean).map((l) => JSON.parse(l)))) {
        p.sent.push(m);
        const r = answer(m.method, m.params, args);
        queueMicrotask(() => (r instanceof Error ? push({ id: m.id, error: { message: r.message } }) : push({ id: m.id, result: r ?? {} })));
      }
    };
    if (missing) queueMicrotask(() => p.emit('error', new Error('spawn copilot ENOENT')));
    procs.push(p);
    return p;
  };
  return { spawn, procs };
};
const auth = (f, extra = {}) => createCopilotAuth({ spec: (args) => ({ cmd: 'C:\\cmd.exe', args: ['/c', 'copilot.cmd', ...args] }), env: () => ({ PATH: '/bin' }), spawn: f.spawn, ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));
const QUOTA = { quotaSnapshots: {
  chat: { isUnlimitedEntitlement: false, entitlementRequests: 200, usedRequests: 30, remainingPercentage: 85, resetDate: '2026-12-01T00:00:00.000Z' },
  premium_interactions: { isUnlimitedEntitlement: false, entitlementRequests: 0, usedRequests: 0, remainingPercentage: 0 },
} };

test('lo que enseña la tarjeta: el usuario, por qué vía y lo gastado del cupo que tenga tope', () => {
  const now = Date.parse('2026-11-12T00:00:00Z');
  assert.deepEqual(statusOf({ isAuthenticated: true, authType: 'user', login: 'ana' }, QUOTA, now), {
    ok: true, loggedIn: true, login: 'ana', via: null, usage: { usedPercent: 15, used: 30, total: 200, resetsAt: Date.parse('2026-12-01T00:00:00.000Z') },
  });
  assert.equal(statusOf({ isAuthenticated: true, authType: 'gh-cli', login: 'ana' }, null).via, 'la sesión de gh');
  assert.deepEqual(statusOf({ isAuthenticated: false }), { ok: true, loggedIn: false, login: null, via: null, usage: null });
  // un plan de pago: manda el cupo de peticiones premium; sin tope, no hay barra; una fecha pasada no se enseña
  const paid = { quotaSnapshots: { chat: { isUnlimitedEntitlement: true, entitlementRequests: 0 }, premium_interactions: { isUnlimitedEntitlement: false, entitlementRequests: 300, usedRequests: 150, remainingPercentage: 50, resetDate: '2026-11-01T00:00:00Z' } } };
  assert.deepEqual(usageOf(paid, now), { usedPercent: 50, used: 150, total: 300, resetsAt: null });
  assert.equal(usageOf({ quotaSnapshots: { chat: { isUnlimitedEntitlement: true } } }), null);
  assert.equal(usageOf(null), null);
});

test('el código del login, de lo que imprime el CLI', () => {
  assert.deepEqual(parseLogin('To authenticate, visit https://github.com/login/device and enter code AB12-CD34\nWaiting for authorization...'), { url: 'https://github.com/login/device', code: 'AB12-CD34' });
  assert.deepEqual(parseLogin('Starting…'), { url: null, code: null });
});

test('el estado pregunta al runtime (lanzado como diga spec, sin sus MCP) y cierra el proceso', async () => {
  const f = fakeSpawn((m) => (m === 'connect' ? { protocolVersion: 3 } : m === 'auth.getStatus' ? { isAuthenticated: true, authType: 'user', login: 'ana' } : m === 'account.getQuota' ? QUOTA : {}));
  const st = await auth(f).status();
  assert.deepEqual([st.loggedIn, st.login, st.usage.usedPercent], [true, 'ana', 15]);
  assert.equal(f.procs[0].cmd, 'C:\\cmd.exe');
  assert.deepEqual(f.procs[0].args.slice(0, 2), ['/c', 'copilot.cmd']);
  assert.ok(f.procs[0].args.includes('--headless') && f.procs[0].args.includes('--stdio'));
  assert.deepEqual(f.procs[0].sent.map((m) => m.method), ['connect', 'auth.getStatus', 'account.getQuota']);
  assert.equal(f.procs[0].killed, true);
});

test('sin sesión no se pide la cuota; sin Copilot instalado, lo dice', async () => {
  const f = fakeSpawn((m) => (m === 'auth.getStatus' ? { isAuthenticated: false } : {}));
  assert.deepEqual(await auth(f).status(), { ok: true, loggedIn: false, login: null, via: null, usage: null });
  assert.equal(f.procs[0].sent.some((m) => m.method === 'account.getQuota'), false);
  assert.deepEqual(await auth(fakeSpawn(() => ({}), { missing: true })).status(), { ok: false, loggedIn: false, error: 'Copilot no está instalado en este ordenador.' });
});

test('el login: el código y la dirección, y al autorizar en la web, hecho', async () => {
  const f = fakeSpawn(() => ({}));
  const a = auth(f);
  const wait = a.login();
  await tick();
  assert.deepEqual(f.procs[0].args.slice(2), ['login', '--device-code']);
  f.procs[0].stdout.emit('data', 'To authenticate, visit https://github.com/login/device and enter code AB12-CD34\n');
  assert.deepEqual(await wait, { running: true, ok: false, error: null, url: 'https://github.com/login/device', code: 'AB12-CD34' });
  assert.equal((await a.login()).code, 'AB12-CD34'); // otro clic con uno en marcha: el mismo
  assert.equal(f.procs.length, 1);
  f.procs[0].emit('exit', 0);
  assert.deepEqual(a.progress(), { running: false, ok: true, error: null, url: 'https://github.com/login/device', code: 'AB12-CD34' });
});

test('el login que falla lo dice; cancelarlo mata el proceso sin darlo por error suyo', async () => {
  const f = fakeSpawn(() => ({}));
  const a = auth(f);
  const w1 = a.login(); await tick();
  f.procs[0].stdout.emit('data', 'visit https://github.com/login/device and enter code AAAA-BBBB\n');
  await w1;
  f.procs[0].stderr.emit('data', 'Error: the device code has expired\n');
  f.procs[0].emit('exit', 1);
  assert.equal(a.progress().error, 'Error: the device code has expired');
  const w2 = a.login(); await tick();
  f.procs[1].stdout.emit('data', 'visit https://github.com/login/device and enter code CCCC-DDDD\n');
  await w2;
  assert.deepEqual(a.cancel(), { running: false, ok: false, error: 'Cancelado.', url: 'https://github.com/login/device', code: 'CCCC-DDDD' });
  assert.equal(f.procs[1].killed, true);
  f.procs[1].emit('exit', null); // el proceso muere después: sigue «Cancelado»
  assert.equal(a.progress().error, 'Cancelado.');
});

test('cerrar sesión: por su servidor ACP, saludo y `logout`', async () => {
  const f = fakeSpawn(() => ({}));
  assert.deepEqual(await auth(f).logout(), { ok: true });
  assert.deepEqual(f.procs[0].args.slice(2), ['--acp', '--stdio']);
  assert.deepEqual(f.procs[0].sent.map((m) => m.method), ['initialize', 'logout']);
  assert.equal(f.procs[0].killed, true);
  const bad = fakeSpawn((m) => (m === 'logout' ? new Error('Method not found') : {}));
  assert.deepEqual(await auth(bad).logout(), { ok: false, error: 'Method not found' });
});

test('un login que termina bien lo avisa; uno que falla o se cancela, no', async () => {
  const f = fakeSpawn(() => ({}));
  let logins = 0;
  const a = auth(f, { onLogin: () => { logins += 1; } });
  const code = (i) => f.procs[i].stdout.emit('data', 'visit https://github.com/login/device and enter code AAAA-BBBB\n');
  const w1 = a.login(); await tick(); code(0); await w1;
  f.procs[0].emit('exit', 1);
  const w2 = a.login(); await tick(); code(1); await w2;
  a.cancel(); f.procs[1].emit('exit', 0);
  assert.equal(logins, 0);
  const w3 = a.login(); await tick(); code(2); await w3;
  f.procs[2].emit('exit', 0);
  assert.equal(logins, 1);
});

test('las rutas: estado, login (arrancar y cómo va), cancelar y cerrar sesión; lo demás, 404', async () => {
  const calls = [];
  const copilot = { status: async () => ({ ok: true, loggedIn: true }), login: async () => ({ running: true, code: 'A-B' }), progress: () => ({ running: false }), cancel: () => ({ running: false, error: 'Cancelado.' }), logout: async () => ({ ok: true }) };
  const routes = providersRoutes(copilot, { json: (res, code, body) => calls.push([code, body]) });
  await routes({ method: 'GET' }, {}, ['copilot']);
  await routes({ method: 'POST' }, {}, ['copilot', 'login']);
  await routes({ method: 'GET' }, {}, ['copilot', 'login']);
  await routes({ method: 'POST' }, {}, ['copilot', 'cancel']);
  await routes({ method: 'POST' }, {}, ['copilot', 'logout']);
  await routes({ method: 'GET' }, {}, ['codex']);
  await routes({ method: 'DELETE' }, {}, ['copilot']);
  assert.deepEqual(calls, [[200, { ok: true, loggedIn: true }], [200, { running: true, code: 'A-B' }], [200, { running: false }], [200, { running: false, error: 'Cancelado.' }], [200, { ok: true }], [404, { error: 'no encontrado' }], [404, { error: 'no encontrado' }]]);
});
