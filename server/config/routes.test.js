import test from 'node:test';
import assert from 'node:assert/strict';
import { configRoutes } from './routes.js';

const setup = (cfg = {}) => {
  const store = { read: () => cfg, patch: (c) => { cfg = { ...cfg, ...c }; } };
  const route = configRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body, version: '1.2.3' });
  return { call: async (method, body) => { const res = {}; await route({ method, body }, res); return res; }, cfg: () => cfg };
};

test('GET: Jira, GitHub, Snowflake y la versión; nunca sesiones ni candado', async () => {
  const { call } = setup({ jira: { baseUrl: 'u' }, github: { keys: [] }, snowflake: { user: 'ana' }, sessions: [1], lock: {} });
  assert.deepEqual((await call('GET')).body, { jira: { baseUrl: 'u' }, github: { keys: [] },
    snowflake: { user: 'ana', role: 'R_SGA_USERS', warehouse: 'COMMON_USERS_WH' }, version: '1.2.3' });
});

test('PUT: solo lo que viene, saneado; lo desconocido no se guarda', async () => {
  const s = setup({ sessions: [1] });
  await s.call('PUT', { jira: { baseUrl: ' j ' }, snowflake: { user: ' ana ' }, theme: { id: 'dark' } });
  assert.deepEqual(s.cfg(), { sessions: [1], jira: { baseUrl: 'j', token: '' }, snowflake: { user: 'ana', role: 'R_SGA_USERS', warehouse: 'COMMON_USERS_WH' } });
});

test('PUT de Snowflake: cambia el usuario y deja el rol y el warehouse tal como están en la configuración', async () => {
  const s = setup({ snowflake: { user: 'ana', role: 'R_OTRO', warehouse: 'WH_OTRO' } });
  await s.call('PUT', { snowflake: { user: 'luis', role: 'R_NUEVO', warehouse: 'WH_NUEVO' } });
  assert.deepEqual(s.cfg().snowflake, { user: 'luis', role: 'R_OTRO', warehouse: 'WH_OTRO' }, 'lo que llegue de rol y warehouse no cuenta');
});

test('PUT de Snowflake con null: no revienta; queda sin usuario y con el rol y el warehouse de antes', async () => {
  const s = setup({ snowflake: { user: 'ana', role: 'R_OTRO', warehouse: 'WH_OTRO' } });
  assert.equal((await s.call('PUT', { snowflake: null })).status, 200);
  assert.deepEqual(s.cfg().snowflake, { user: '', role: 'R_OTRO', warehouse: 'WH_OTRO' });
});
