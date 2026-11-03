import test from 'node:test';
import assert from 'node:assert/strict';
import { createJira, madrid, movesOf, BATCH } from './jira.js';

const CONFIG = () => ({ baseUrl: 'https://jira.example.com/jira/', token: 'tok' });
// fetch falso: responde con los tickets que tiene de las claves de la JQL (o de la clave sola) y apunta cada URL.
// moved: clave antigua → nueva (la búsqueda la da con la nueva; pedida sola, Jira la sigue).
const fakeFetch = (known, status = 200, moved = {}) => {
  const urls = [];
  const fn = async (url, { headers }) => {
    urls.push({ url, auth: headers.Authorization });
    const single = /\/issue\/([^?]+)/.exec(url);
    if (single) {
      const k = moved[decodeURIComponent(single[1])] || decodeURIComponent(single[1]);
      return known[k] ? { ok: true, status: 200, json: async () => ({ key: k, fields: known[k], changelog: url.includes('expand=changelog') ? known[k].changelog : undefined }) } : { ok: false, status: 404, json: async () => ({}) };
    }
    const keys = decodeURIComponent(new URL(url).searchParams.get('jql')).match(/\(([^)]*)\)/)[1].split(',').map((k) => moved[k] || k);
    const issues = keys.filter((k) => known[k]).map((k) => ({ key: k, fields: known[k], changelog: url.includes('expand=changelog') ? known[k].changelog : undefined }));
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
  assert.equal(fetch.urls.length, 2 + BATCH, 'dos lotes y, una a una, las que no salieron');
  assert.ok(fetch.urls[0].url.startsWith('https://jira.example.com/jira/rest/api/2/search?jql='));
  assert.ok(fetch.urls[0].url.includes('validateQuery=warn'));
  assert.equal(fetch.urls[0].auth, 'Bearer tok');
  assert.deepEqual(seen, [BATCH, BATCH + 1]);
  assert.deepEqual(found, [{ key: 'SGA-1', created: '2026-02-03 10:00:00', resolved: '', status: 'Open', moves: null }]);
  assert.equal(missing.length, BATCH);
});

test('un ticket movido de proyecto: la búsqueda lo da con su clave nueva; pedido solo, se guarda con la que tienen las issues', async () => {
  const fetch = fakeFetch({ 'SISUSTOCKG-7': { created: '2026-02-03T10:00:00.000+0100', resolutiondate: '2026-02-04T10:00:00.000+0100', status: { name: 'Cerrada' } } }, 200, { 'SISUSTOCK-7': 'SISUSTOCKG-7' });
  const { found, missing } = await createJira({ config: CONFIG, fetch }).tickets(['SISUSTOCK-7', 'REJ-6']);
  assert.deepEqual(found.map((t) => t.key).sort(), ['SISUSTOCK-7', 'SISUSTOCKG-7']);
  assert.deepEqual(missing, ['REJ-6']);
});

test('sin configurar: 400 con lo que hay que hacer; token rechazado: lo dice', async () => {
  await assert.rejects(createJira({ config: () => ({ baseUrl: '', token: '' }), fetch: fakeFetch({}) }).tickets(['A-1']), (e) => e.status === 400 && /Credenciales → Jira/.test(e.message));
  await assert.rejects(createJira({ config: CONFIG, fetch: fakeFetch({}, 401) }).tickets(['A-1']), /rechazado el token/);
});

test('movesOf: cuenta los cambios de proyecto y de equipo de uno a otro; ponerle equipo por primera vez, no', () => {
  const h = (...items) => ({ histories: [{ items }] });
  assert.equal(movesOf(h({ field: 'Key', fromString: 'SISUSTOCK-5200', toString: 'SISUSTOCKG-3384' }, { field: 'project', fromString: 'AP-Sisu Stock', toString: 'MT-Sisu Stock Gest' })), 1);
  assert.equal(movesOf(h({ field: 'Equipo Asignado', fromString: 'Soporte Courier', toString: 'Desarrollo Courier' })), 1);
  assert.equal(movesOf(h({ field: 'Equipos Logística', fromString: null, toString: 'Talos' }, { field: 'Plans Equipos Logística', fromString: null, toString: 'Talos' })), 0);
  assert.equal(movesOf(h({ field: 'assignee', fromString: 'ana', toString: 'luis' }, { field: 'status', fromString: 'Open', toString: 'Closed' })), 0);
  assert.equal(movesOf(null), 0);
});

test('con historial solo las claves que se piden así; sin él, moves null (no se sabe)', async () => {
  const changelog = { histories: [{ items: [{ field: 'Equipo Asignado', fromString: 'A', toString: 'B' }] }] };
  const fetch = fakeFetch({ 'A-1': { created: '2026-02-03T10:00:00.000+0100', status: { name: 'Open' }, changelog }, 'A-2': { created: '2026-02-03T10:00:00.000+0100', status: { name: 'Open' }, changelog } });
  const { found } = await createJira({ config: CONFIG, fetch }).tickets(['A-1', 'A-2'], { history: new Set(['A-1']) });
  assert.deepEqual(found.map((t) => [t.key, t.moves]).sort(), [['A-1', 1], ['A-2', null]]);
  assert.deepEqual(fetch.urls.map((u) => u.url.includes('expand=changelog')), [true, false]);
});
