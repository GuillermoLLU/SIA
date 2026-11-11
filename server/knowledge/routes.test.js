import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeRoutes } from './routes.js';

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const WHO = { user: { id: U1 }, accessToken: 'jwt', token: 'tok' };   // token: el local de la sesión, como lo pasa el router

const setup = ({ problems = [] } = {}) => {
  const log = [];
  const knowledge = {
    base: async () => ({ id: 'b', name: 'Base', groups: [] }),
    setProjects: async (jwt, id, ids) => log.push(['setProjects', id, ids]),
    copy: async (jwt, id, from) => log.push(['copy', id, from]),
  };
  const route = knowledgeRoutes(knowledge, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {}, onChange: async (who) => log.push(['onChange', who.token]), syncKeys: async (jwt, id) => { log.push(['syncKeys', id]); return problems; } });
  return { log, call: async (method, path, body) => { const res = {}; await route({ method, body }, res, path, WHO); return res; } };
};

test('la base y asignar proyectos: claves al día y lo asignado recargado', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET', ['base'])).body, { base: { id: 'b', name: 'Base', groups: [] } });
  assert.deepEqual((await s.call('PUT', ['people', U1, 'projects'], { projects: ['g1'] })).body, { ok: true });
  assert.deepEqual(s.log, [['setProjects', U1, ['g1']], ['syncKeys', U1], ['onChange', 'tok']]);   // lo asignado, de quien llama
  assert.equal((await s.call('PUT', ['people', 'x', 'projects'], {})).status, 404);
});

test('copiar de otra persona: exige un id válido; los problemas de claves llegan como aviso', async () => {
  const s = setup({ problems: ['no deja'] });
  assert.equal((await s.call('POST', ['people', U1, 'copy'], { from: 'nope' })).status, 400);
  const r = await s.call('POST', ['people', U1, 'copy'], { from: U2 });
  assert.equal(r.body.ok, true);
  assert.match(r.body.warning, /no deja/);
  assert.deepEqual(s.log[0], ['copy', U1, U2]);
});
