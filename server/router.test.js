import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from './router.js';

const call = async (url, { remoteAddress = '127.0.0.1', headers = {}, locked = false } = {}) => {
  const seen = [];
  const router = createRouter({
    ping: () => ({ sia: true }),
    base: {},
    auth: { context: async () => null },
    lock: { locked: () => locked },
    routes: { lock: (req, res) => { seen.push('lock'); res.end(); } },
  });
  const res = { status: 0, body: '', setHeader() {}, writeHead(s) { this.status = s; }, end(b) { this.body = b ?? ''; } };
  await router({ method: 'GET', url, headers, socket: { remoteAddress } }, res);
  return { status: res.status, seen };
};

test('cortafuegos: desde fuera de esta máquina, nada; ni el ping ni por un proxy', async () => {
  assert.equal((await call('/api/ping', { remoteAddress: '192.168.1.5' })).status, 403);
  assert.equal((await call('/api/lock', { remoteAddress: '192.168.1.5' })).status, 403);
  assert.equal((await call('/api/ping', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status, 403);
  assert.equal((await call('/api/ping')).status, 200);
});

test('el bridge no sirve la web ni tiene acceso remoto', async () => {
  assert.equal((await call('/')).status, 404);
  assert.equal((await call('/api/lan/status')).status, 401, 'sin sesión no llega a ninguna ruta');
});

test('con el candado echado, solo el candado y el ping; sin sesión, nada más', async () => {
  assert.deepEqual((await call('/api/lock', { locked: true })).seen, ['lock']);
  assert.equal((await call('/api/users', { locked: true })).status, 423);
  assert.equal((await call('/api/users')).status, 401);
});

test('sin la base cargada (bridge recién reiniciado con la web abierta), se carga la de quien llama y sigue', async () => {
  let kb = null; const seen = [];
  const router = createRouter({
    ping: () => ({ sia: true }),
    base: { current: () => kb, clientFor: () => ({}), permsFor: async () => ({ admin: true }), accessibleProjects: async () => [] },
    auth: { context: async () => ({ user: { id: 'u1', views: ['admin'] }, accessToken: 'jwt' }) },
    lock: { locked: () => false },
    routes: { projects: (req, res) => { seen.push('projects'); res.writeHead(200); res.end('{}'); } },
    ensureBase: async (token) => { seen.push(`ensure:${token}`); kb = { id: 'b1' }; },
  });
  const res = { status: 0, setHeader() {}, writeHead(s2) { this.status = s2; }, end() {} };
  await router({ method: 'GET', url: '/api/admin/check', headers: { 'x-sia-auth': 'tok' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.deepEqual(seen, ['ensure:tok', 'projects']);
  assert.equal(res.status, 200, 'no un 503 de «sin base»');
});

test('sin base: si la de quien llama tampoco carga, «sin base» (503); con la base ya cargada no se vuelve a pedir', async () => {
  const seen = [];
  const make = (kb) => createRouter({
    ping: () => ({ sia: true }),
    base: { current: () => kb, clientFor: () => ({}), permsFor: async () => ({ admin: true }), accessibleProjects: async () => [] },
    auth: { context: async () => ({ user: { id: 'u1', views: ['admin'] }, accessToken: 'jwt' }) },
    lock: { locked: () => false },
    routes: { projects: (req, res) => { seen.push('projects'); res.writeHead(200); res.end('{}'); } },
    ensureBase: async () => { seen.push('ensure'); },
  });
  const ask = async (router) => {
    const res = { status: 0, body: '', setHeader() {}, writeHead(s2) { this.status = s2; }, end(b) { this.body = b ?? ''; } };
    await router({ method: 'GET', url: '/api/admin/check', headers: { 'x-sia-auth': 'tok' }, socket: { remoteAddress: '127.0.0.1' } }, res);
    return res;
  };
  const lost = await ask(make(null));
  assert.equal(lost.status, 503);
  assert.equal(JSON.parse(lost.body).noDb, true);
  assert.deepEqual(seen, ['ensure']);
  seen.length = 0;
  assert.equal((await ask(make({ id: 'b1' }))).status, 200);
  assert.deepEqual(seen, ['projects']);
});
