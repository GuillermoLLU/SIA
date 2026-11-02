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
