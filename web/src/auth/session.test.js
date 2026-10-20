import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession } from './session.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const setup = (responses) => {
  const calls = [];
  const local = memory(), session = memory();
  const fetch = async (url, init) => { calls.push([url.replace('/api', ''), init]); return responses.shift(); };
  return { s: createAuthSession('/api', { fetch, local, session }), calls, local, session };
};

test('login con «mantener»: el token a localStorage y el email recordado; sin marcar, a la ventana', async () => {
  const { s, local, session } = setup([reply(200, { token: 'tok', user: { email: 'ana@x.com' } })]);
  assert.deepEqual(await s.login('ana@x.com', 'p', true), { user: { email: 'ana@x.com' } });
  assert.equal(local.getItem('sia-auth'), 'tok');
  assert.equal(session.getItem('sia-auth'), null);
  assert.equal(s.lastEmail(), 'ana@x.com');
  assert.deepEqual(s.headers(), { 'X-SIA-Auth': 'tok' });

  const t = setup([reply(200, { token: 'tok2', user: { email: 'b@x.com' } })]);
  await t.s.login('b@x.com', 'p', false);
  assert.equal(t.session.getItem('sia-auth'), 'tok2');
  assert.equal(t.local.getItem('sia-auth'), null);
});

test('login rechazado: el texto del bridge o el de serie; sin bridge, lanza', async () => {
  assert.deepEqual(await setup([reply(401, { error: 'Mal.' })]).s.login('a', 'b', true), { error: 'Mal.' });
  assert.deepEqual(await setup([reply(500, {})]).s.login('a', 'b', true), { error: 'No se pudo iniciar sesión.' });
  const { s } = setup([]);
  await assert.rejects(s.login('a', 'b', true));
});

test('current: sin token no pregunta; con 401 olvida el token; otro fallo sube', async () => {
  const none = setup([]);
  assert.equal(await none.s.current(), null);
  assert.equal(none.calls.length, 0);

  const gone = setup([reply(401, {})]);
  gone.local.setItem('sia-auth', 'viejo');
  assert.equal(await gone.s.current(), null);
  assert.equal(gone.local.getItem('sia-auth'), null);

  const down = setup([reply(503, { error: 'sin base' })]);
  down.session.setItem('sia-auth', 't');
  await assert.rejects(down.s.current(), /sin base/);
});

test('logout: avisa al bridge y olvida el token aunque falle', async () => {
  const { s, local } = setup([]);
  local.setItem('sia-auth', 't');
  await assert.rejects(s.logout());
  assert.equal(local.getItem('sia-auth'), null);
});
