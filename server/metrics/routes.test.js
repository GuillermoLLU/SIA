import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsRoutes } from './routes.js';

const setup = (store) => {
  const route = metricsRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }) });
  return async (method, path) => {
    const res = {};
    await route({ method }, res, path);
    return res;
  };
};

test('GET /: los datos guardados, o null', async () => {
  assert.deepEqual((await setup({ load: () => null })('GET', [])).body, { data: null });
  assert.deepEqual((await setup({ load: () => ({ meta: 1 }) })('GET', [])).body, { data: { meta: 1 } });
});

test('GET /progress: por dónde va la actualización, o null', async () => {
  assert.deepEqual((await setup({ progress: () => null })('GET', ['progress'])).body, { progress: null });
  const p = { phase: 'download', done: 3, total: 10 };
  assert.deepEqual((await setup({ progress: () => p })('GET', ['progress'])).body, { progress: p });
});

test('POST /update: actualiza desde Snowflake y devuelve meta y cuentas', async () => {
  const res = await setup({ update: async () => ({ meta: { rows: 1 }, counts: { inserted: 1 } }) })('POST', ['update']);
  assert.deepEqual([res.status, res.body], [200, { meta: { rows: 1 }, counts: { inserted: 1 } }]);
});

test('POST /update: sin configurar, 400; Snowflake no responde, 503 con su explicación', async () => {
  const failing = (status, message) => setup({ update: async () => { throw Object.assign(new Error(message), { status }); } });
  assert.deepEqual((await failing(400, 'Configura tu usuario')('POST', ['update'])).body, { error: 'Configura tu usuario' });
  const res = await failing(503, 'No se llega a Snowflake')('POST', ['update']);
  assert.deepEqual([res.status, res.body], [503, { error: 'No se llega a Snowflake' }]);
});

test('lo demás, 404 (también la carga de CSV, que ya no existe); un fallo inesperado, 500 sin detalles', async () => {
  assert.equal((await setup({})('GET', ['otra'])).status, 404);
  assert.equal((await setup({})('POST', ['csv'])).status, 404);
  assert.deepEqual((await setup({ load: () => { throw new Error('disco'); } })('GET', [])).body, { error: 'Error interno.' });
});
