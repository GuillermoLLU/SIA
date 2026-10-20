import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './api.js';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const setup = (res, onReply) => {
  const calls = [];
  const api = createApi('/api', () => ({ 'X-SIA-Auth': 't' }), { onReply, fetch: async (url, init) => { calls.push([url, init]); return res; } });
  return { api, calls };
};

test('GET: sin cuerpo ni Content-Type, con la sesión; devuelve el JSON', async () => {
  const { api, calls } = setup(reply(200, { users: [] }));
  assert.deepEqual(await api('/users'), { users: [] });
  const [url, init] = calls[0];
  assert.equal(url, '/api/users');
  assert.deepEqual(init, { method: 'GET', headers: { 'X-SIA-Auth': 't' } });
});

test('con cuerpo: JSON por defecto, o tal cual con otro tipo', async () => {
  const { api, calls } = setup(reply(200, {}));
  await api('/users', { method: 'POST', body: { name: 'Ana' } });
  assert.equal(calls[0][1].body, '{"name":"Ana"}');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  await api('/metrics/csv', { method: 'POST', body: 'a;b', type: 'text/csv' });
  assert.equal(calls[1][1].body, 'a;b');
  assert.equal(calls[1][1].headers['Content-Type'], 'text/csv');
});

test('error del bridge: su texto y su estado; sin texto, el HTTP', async () => {
  await assert.rejects(setup(reply(409, { error: 'Ya existe.' })).api('/users'), (e) => e.message === 'Ya existe.' && e.status === 409);
  await assert.rejects(setup(reply(502, 'no es json')).api('/x'), (e) => e.message === 'HTTP 502');
});

test('onReply ve cada respuesta, también las que fallan', async () => {
  const seen = [];
  const { api } = setup(reply(401, { auth: true }), (s, d) => seen.push([s, d]));
  await assert.rejects(api('/me'));
  assert.deepEqual(seen, [[401, { auth: true }]]);
});
