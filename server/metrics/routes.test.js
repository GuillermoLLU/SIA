import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsRoutes } from './routes.js';

const setup = (store) => {
  const route = metricsRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }) });
  return async (method, path, query = '') => {
    const req = { method, setEncoding() {}, resume() {}, [Symbol.asyncIterator]: async function* () { yield 'csv'; } };
    const res = {};
    await route(req, res, path, new URLSearchParams(query));
    return res;
  };
};

test('GET /: los datos guardados, o null', async () => {
  assert.deepEqual((await setup({ load: () => null })('GET', [])).body, { data: null });
  assert.deepEqual((await setup({ load: () => ({ meta: 1 }) })('GET', [])).body, { data: { meta: 1 } });
});

test('POST /csv: carga el cuerpo con el nombre del fichero', async () => {
  let got;
  const call = setup({ importCsv: async (body, name) => { got = [name]; for await (const c of body) got.push(c); return { rows: 1 }; } });
  const res = await call('POST', ['csv'], 'name=issues_2026.csv');
  assert.deepEqual([res.status, res.body], [200, { meta: { rows: 1 } }]);
  assert.deepEqual(got, ['issues_2026.csv', 'csv']);
});

test('POST /csv: sin nombre .csv, 400; un CSV que no vale, su error', async () => {
  const call = setup({ importCsv: async () => { throw Object.assign(new Error('le falta X'), { status: 400 }); } });
  assert.equal((await call('POST', ['csv'], 'name=datos.xlsx')).status, 400);
  assert.equal((await call('POST', ['csv'], 'name=../x.csv')).status, 400);
  assert.deepEqual((await call('POST', ['csv'], 'name=a.csv')).body, { error: 'le falta X' });
});

test('lo demás, 404; un fallo inesperado, 500 sin detalles', async () => {
  assert.equal((await setup({})('GET', ['otra'])).status, 404);
  assert.deepEqual((await setup({ load: () => { throw new Error('disco'); } })('GET', [])).body, { error: 'Error interno.' });
});
