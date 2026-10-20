import test from 'node:test';
import assert from 'node:assert/strict';
import { usersRoutes } from './routes.js';

const U1 = '11111111-1111-1111-1111-111111111111', R1 = '22222222-2222-2222-2222-222222222222';
const WHO = { user: { id: U1, name: 'Ana' }, accessToken: 'jwt', token: 'local' };

const setup = ({ keyProblems = [], assignFails = false } = {}) => {
  const log = [];
  const users = {
    list: async (jwt) => { log.push(['list', jwt]); return [{ id: U1 }]; },
    create: async (jwt, u) => { log.push(['create', u]); return { id: 'u-new', email: u.email }; },
    update: async (jwt, id, patch) => log.push(['update', id, patch]),
    remove: async (jwt, id) => log.push(['remove', id]),
    roles: async () => [{ id: R1 }],
    saveRole: async (jwt, id, role) => { log.push(['saveRole', id, role]); return id || 'r-new'; },
    removeRole: async (jwt, id) => log.push(['removeRole', id]),
  };
  const deps = {
    json: (res, status, body) => Object.assign(res, { status, body }),
    readBody: async (req) => req.body || {},
    assignKnowledge: async (jwt, id, ids) => { log.push(['assign', id, ids]); if (assignFails) throw new Error('sin base'); },
    syncKeys: async (jwt, id, opts) => { log.push(['syncKeys', id, opts]); return keyProblems; },
    refreshProfile: (t) => log.push(['refreshProfile', t]),
  };
  const route = usersRoutes(users, deps);
  return { log, call: async (method, path, body) => { const res = {}; await route({ method, body }, res, path, WHO); return res; } };
};

test('alta: crea, asigna sus proyectos y pone sus claves al día; si asignar falla, avisa sin deshacer', async () => {
  const s = setup();
  const r = await s.call('POST', [], { email: 'a@x', name: 'A', password: 'p', role: R1, projects: ['g1'] });
  assert.deepEqual(r.body, { user: { id: 'u-new', email: 'a@x' } });
  assert.deepEqual(s.log.map((l) => l[0]), ['create', 'assign', 'syncKeys']);
  const f = setup({ assignFails: true });
  assert.match((await f.call('POST', [], { email: 'a@x', projects: ['g1'] })).body.warning, /sin base/);
  const k = setup({ keyProblems: ['no deja'] });
  assert.match((await k.call('POST', [], { email: 'a@x' })).body.warning, /clave de poder/);
});

test('editar: solo cambios de acceso sincronizan claves; el propio perfil se refresca; ids raros, 404', async () => {
  const s = setup();
  assert.deepEqual((await s.call('PUT', [U1], { name: 'Ana B' })).body, { ok: true });
  assert.deepEqual(s.log, [['update', U1, { name: 'Ana B', role: undefined, views: undefined, active: undefined, password: undefined }], ['refreshProfile', 'local']]);
  s.log.length = 0;
  await s.call('PUT', ['33333333-3333-3333-3333-333333333333'], { views: ['links'] });
  assert.deepEqual(s.log.map((l) => l[0]), ['update', 'syncKeys']);
  assert.equal((await s.call('PUT', ['nope'], {})).status, 404);
  assert.equal((await s.call('GET', [])).body.users.length, 1);
});

test('borrar: primero sus claves fuera de la base, luego la persona', async () => {
  const s = setup();
  await s.call('DELETE', [U1]);
  assert.deepEqual(s.log, [['syncKeys', U1, { drop: true }], ['remove', U1]]);
});

test('roles: listar, crear, guardar (claves de todos al día) y borrar', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET', ['roles'])).body, { roles: [{ id: R1 }] });
  assert.deepEqual((await s.call('POST', ['roles'], { name: 'Agente', views: ['issues'] })).body, { id: 'r-new' });
  assert.deepEqual((await s.call('PUT', ['roles', R1], { name: 'Agente', views: [] })).body, { ok: true });
  assert.deepEqual(s.log.at(-1), ['syncKeys', null, undefined]);
  assert.equal((await s.call('PUT', ['roles', 'x'], {})).status, 404);
  assert.deepEqual((await s.call('DELETE', ['roles', R1])).body, { ok: true });
});

test('un error de la base llega con su estado', async () => {
  const route = usersRoutes({ list: async () => { throw Object.assign(new Error('Solo un administrador.'), { status: 403 }); } }, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({}) });
  const res = {}; await route({ method: 'GET' }, res, [], WHO);
  assert.deepEqual([res.status, res.body], [403, { error: 'Solo un administrador.' }]);
});
