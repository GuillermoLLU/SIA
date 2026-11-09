import test from 'node:test';
import assert from 'node:assert/strict';
import { backlogRoutes } from './routes.js';

const UUID = '11111111-1111-1111-1111-111111111111';
const WHO = { user: { id: 'u-1' }, accessToken: 'jwt' };

const setup = () => {
  const calls = [];
  const backlog = {
    list: async (who, rule) => { calls.push(['list', rule]); return { taken: 't', rule: rule || 'basic', rules: [], issues: [] }; },
    people: async () => [{ id: UUID, name: 'Ana' }],
    get: async (who, id) => { calls.push(['get', id]); return id === 'INC1' ? { issue: { id }, claimedBy: null } : null; },
    assign: async (who, id, to) => { calls.push(['assign', id, to]); },
    rules: async () => ({ criteria: [], rules: [] }),
    saveRule: async (who, id, body) => { calls.push(['save', id, body]); return body.name ? { id: id || 'new' } : { error: 'Ponle un nombre a la regla.' }; },
    deleteRule: async (who, id) => { calls.push(['delete', id]); },
  };
  const route = backlogRoutes(backlog, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
  const call = async (method, path, body, query = '') => { const res = {}; await route({ method, body }, res, path, WHO, new URLSearchParams(query)); return res; };
  return { call, calls };
};

test('GET /: la cola con la regla pedida', async () => {
  const { call, calls } = setup();
  const res = await call('GET', [], null, 'rule=r-1');
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [['list', 'r-1']]);
  assert.equal((await call('GET', [])).body.rule, 'basic');
});

test('el equipo y una incidencia entera (404 si no está en la foto)', async () => {
  const { call } = setup();
  assert.deepEqual((await call('GET', ['people'])).body, { people: [{ id: UUID, name: 'Ana' }] });
  assert.equal((await call('GET', ['INC1'])).status, 200);
  assert.deepEqual(await call('GET', ['INC9']), { status: 404, body: { error: 'Esa incidencia ya no está en la foto.' } });
  assert.equal((await call('GET', ['loquesea'])).status, 404);
});

test('asignar: exige a quién, y se lo pasa al servicio', async () => {
  const { call, calls } = setup();
  assert.deepEqual(await call('POST', ['INC1', 'assign'], { to: 'nadie' }), { status: 400, body: { error: 'Elige a quién asignarla.' } });
  assert.deepEqual(await call('POST', ['INC1', 'assign'], { to: UUID }), { status: 200, body: { ok: true } });
  assert.deepEqual(calls.at(-1), ['assign', 'INC1', UUID]);
});

test('reglas: listar, crear (400 si no vale), cambiar y borrar', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET', ['rules'])).status, 200);
  assert.deepEqual(await call('POST', ['rules'], { name: '', criteria: ['age'] }), { status: 400, body: { error: 'Ponle un nombre a la regla.' } });
  assert.deepEqual(await call('POST', ['rules'], { name: 'Urgencias', criteria: ['age'] }), { status: 200, body: { id: 'new' } });
  assert.deepEqual(await call('PUT', ['rules', UUID], { name: 'Urgencias 2', criteria: ['age'] }), { status: 200, body: { id: UUID } });
  assert.equal((await call('PUT', ['rules', 'no-es-uuid'], { name: 'x', criteria: ['age'] })).status, 404);
  assert.deepEqual(await call('DELETE', ['rules', UUID]), { status: 200, body: { ok: true } });
  assert.deepEqual(calls.filter((c) => c[0] === 'delete'), [['delete', UUID]]);
});
