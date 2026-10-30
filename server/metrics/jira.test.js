import test from 'node:test';
import assert from 'node:assert/strict';
import { createJira, madrid, BATCH } from './jira.js';

const CONFIG = () => ({ baseUrl: 'https://jira.example.com/jira/', token: 'tok' });
// fetch falso: responde con los tickets que tiene de las claves de la JQL y apunta cada URL.
const fakeFetch = (known, status = 200) => {
  const urls = [];
  const fn = async (url, { headers }) => {
    urls.push({ url, auth: headers.Authorization });
    const keys = decodeURIComponent(new URL(url).searchParams.get('jql')).match(/\(([^)]*)\)/)[1].split(',');
    const issues = keys.filter((k) => known[k]).map((k) => ({ key: k, fields: known[k] }));
    return { ok: status === 200, status, json: async () => ({ issues }) };
  };
  fn.urls = urls;
  return fn;
};

test('madrid: la hora de Jira, en hora de Madrid y sin zona, como las de Remedy', () => {
  assert.equal(madrid('2026-02-03T10:15:30.000+0100'), '2026-02-03 10:15:30');
  assert.equal(madrid('2026-07-03T08:00:00.000+0000'), '2026-07-03 10:00:00');   // verano: +2
  assert.equal(madrid(null), '');
});

test('tickets: por lotes, con el token, y las claves que Jira no conoce como no encontradas', async () => {
  const keys = Array.from({ length: BATCH + 1 }, (_, n) => `SGA-${n + 1}`);
  const fetch = fakeFetch({ 'SGA-1': { created: '2026-02-03T10:00:00.000+0100', resolutiondate: null, status: { name: 'Open' } } });
  const seen = [];
  const { found, missing } = await createJira({ config: CONFIG, fetch }).tickets(keys, { onBatch: (n) => seen.push(n) });
  assert.equal(fetch.urls.length, 2);
  assert.ok(fetch.urls[0].url.startsWith('https://jira.example.com/jira/rest/api/2/search?jql='));
  assert.ok(fetch.urls[0].url.includes('validateQuery=warn'));
  assert.equal(fetch.urls[0].auth, 'Bearer tok');
  assert.deepEqual(seen, [BATCH, BATCH + 1]);
  assert.deepEqual(found, [{ key: 'SGA-1', created: '2026-02-03 10:00:00', resolved: '', status: 'Open' }]);
  assert.equal(missing.length, BATCH);
});

test('sin configurar: 400 con lo que hay que hacer; token rechazado: lo dice', async () => {
  await assert.rejects(createJira({ config: () => ({ baseUrl: '', token: '' }), fetch: fakeFetch({}) }).tickets(['A-1']), (e) => e.status === 400 && /Credenciales → Jira/.test(e.message));
  await assert.rejects(createJira({ config: CONFIG, fetch: fakeFetch({}, 401) }).tickets(['A-1']), /rechazado el token/);
});
