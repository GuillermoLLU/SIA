import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsRoutes } from './routes.js';

const setup = (store) => {
  const route = metricsRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({}) });
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

test('GET /ready: si se puede actualizar, ok; si falta la VPN, 503 con su code para que la web lo explique', async () => {
  assert.deepEqual((await setup({ ready: async () => {} })('GET', ['ready'])).body, { ok: true });
  const res = await setup({ ready: async () => { throw Object.assign(new Error('Sin VPN.'), { status: 503, code: 'vpn' }); } })('GET', ['ready']);
  assert.deepEqual([res.status, res.body], [503, { error: 'Sin VPN.', code: 'vpn' }]);
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

test('lo demás, 404 (también leer el CSV por GET); un fallo inesperado, 500 sin detalles', async () => {
  assert.equal((await setup({})('GET', ['otra'])).status, 404);
  assert.equal((await setup({})('GET', ['csv'])).status, 404);
  assert.deepEqual((await setup({ load: () => { throw new Error('disco'); } })('GET', [])).body, { error: 'Error interno.' });
});

test('POST /csv: solo ficheros .csv, y el cuerpo va al importador', async () => {
  const got = [];
  const store = { importCsv: async (chunks, name) => { got.push(name); return { meta: { file: name }, counts: {} }; } };
  const route = metricsRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }) });
  const fake = () => ({ method: 'POST', resume() {}, setEncoding() {} });
  const ok = {};
  await route(fake(), ok, ['csv'], null, new URLSearchParams('name=issues.csv'));
  assert.equal(ok.status, 200);
  assert.deepEqual(got, ['issues.csv']);
  const bad = {};
  await route(fake(), bad, ['csv'], null, new URLSearchParams('name=x.txt'));
  assert.equal(bad.status, 400);
});

test('GET /sql: el SQL del periodo; fechas que no valen, 400', async () => {
  const route = metricsRoutes({}, { json: (res, status, body) => Object.assign(res, { status, body }) });
  const ok = {};
  await route({ method: 'GET' }, ok, ['sql'], null, new URLSearchParams('from=2026-01-01&to=2026-01-31'));
  assert.equal(ok.status, 200);
  assert.match(ok.body.sql, /REPORTEDDATE < TO_TIMESTAMP_NTZ\('2026-02-01 00:00:00.000'/);
  const bad = {};
  await route({ method: 'GET' }, bad, ['sql'], null, new URLSearchParams('from=2026-01-31&to=2026-01-01'));
  assert.equal(bad.status, 400);
});

test('POST /update: con { from, to } es la primera carga del periodo; un periodo que no vale, 400', async () => {
  const got = [];
  const store = { update: async (range) => { got.push(range); return { meta: {}, counts: {} }; } };
  const route = metricsRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({ from: '2026-03-01', to: '2026-03-31' }) });
  const ok = {};
  await route({ method: 'POST' }, ok, ['update']);
  assert.equal(ok.status, 200);
  assert.deepEqual(got, [{ from: '2026-03-01', to: '2026-03-31' }]);
  const bad = metricsRoutes({ update: async () => { throw Object.assign(new Error('Periodo no válido'), { status: 400 }); } }, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({}) });
  const res = {};
  await bad({ method: 'POST' }, res, ['update']);
  assert.deepEqual([res.status, res.body], [400, { error: 'Periodo no válido' }]);
});

test('POST /clear: borra lo guardado en este ordenador', async () => {
  const route = metricsRoutes({ clear: () => ({ cleared: true }) }, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({}) });
  const res = {};
  await route({ method: 'POST' }, res, ['clear']);
  assert.deepEqual(res.body, { cleared: true });
});
