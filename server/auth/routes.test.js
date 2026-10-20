import test from 'node:test';
import assert from 'node:assert/strict';
import { authRoutes } from './routes.js';

const setup = ({ login = async () => ({ token: 't1', user: { id: 'u' } }), context = async (t) => (t === 't1' ? { user: { id: 'u' }, accessToken: 'jwt' } : null) } = {}) => {
  const log = [];
  const auth = { login, context, logout: async (t) => log.push(['logout', t]), refreshProfile: (t) => log.push(['refreshProfile', t]) };
  const platform = { updateOwnPassword: async (jwt, p) => log.push(['updateOwnPassword', jwt, p]), rpc: async (jwt, fn) => log.push(['rpc', fn]) };
  const route = authRoutes(auth, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {}, onSession: async (t) => log.push(['onSession', t]), onLogout: async () => log.push(['onLogout']), platform });
  return { log, call: async (method, action, { token, body } = {}) => { const res = {}; await route({ method, headers: { 'x-sia-auth': token }, body }, res, action); return res; } };
};

test('me: con sesión, el perfil al día y lo asignado cargado; sin ella, 401', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET', 'me', { token: 't1' })).body, { user: { id: 'u' } });
  assert.deepEqual(s.log, [['onSession', 't1']]);
  assert.equal((await s.call('GET', 'me', { token: 'x' })).status, 401);
});

test('login: 401 con el motivo, 429 con la espera, 200 con el token', async () => {
  const bad = setup({ login: async () => ({ error: 'Email o contraseña incorrectos.' }) });
  assert.deepEqual((await bad.call('POST', 'login', { body: {} })).body, { error: 'Email o contraseña incorrectos.' });
  const wait = setup({ login: async () => ({ wait: 30 }) });
  const r = await wait.call('POST', 'login', { body: {} });
  assert.equal(r.status, 429);
  assert.equal(r.body.wait, 30);
  const ok = setup();
  assert.deepEqual((await ok.call('POST', 'login', { body: { email: 'a', password: 'b' } })).body, { token: 't1', user: { id: 'u' } });
  assert.deepEqual(ok.log, [['onSession', 't1']]);
});

test('password: valida, cambia en la plataforma, marca el cambio y refresca el perfil', async () => {
  const s = setup();
  assert.equal((await s.call('POST', 'password', { token: 'x', body: { password: 'Clave-Buena-2026!' } })).status, 401);
  assert.equal((await s.call('POST', 'password', { token: 't1', body: { password: '123' } })).status, 400);
  assert.deepEqual((await s.call('POST', 'password', { token: 't1', body: { password: 'Clave-Buena-2026!' } })).body, { ok: true });
  assert.deepEqual(s.log, [['updateOwnPassword', 'jwt', 'Clave-Buena-2026!'], ['rpc', 'platform_password_changed'], ['refreshProfile', 't1']]);
});

test('logout y la base caída', async () => {
  const s = setup();
  assert.deepEqual((await s.call('POST', 'logout', { token: 't1' })).body, { ok: true });
  assert.deepEqual(s.log, [['logout', 't1'], ['onLogout']]);
  const down = setup({ context: async () => { throw Object.assign(new Error('Sin conexión con la base de la instancia.'), { status: 503 }); } });
  assert.equal((await down.call('GET', 'me', { token: 't1' })).status, 503);
});
