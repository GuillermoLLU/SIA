import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssuesService } from './service.js';
import { issuesRoutes } from './routes.js';

const issue = (id, o = {}) => ({ id, center: '100', text: id, priority: 'HIGH', status: 'ASSIGNED', assignee: '', prio: false,
  reported: '2026-10-01 10:00', modified: '', resolved: '', notes: 'detalle', changes: [], ...o });
const ISSUES = [issue('INC1'), issue('INC2', { prio: true }), issue('INC3', { assignee: 'ANA LOPEZ GARCIA', status: 'PENDING' })];
const WHO = { user: { id: 'u-ana', name: 'Ana López' }, accessToken: 'jwt' };

const setup = (claims = [], issues = ISSUES) => {
  const calls = [];
  const platform = {
    rpc: async (jwt, fn, args) => {
      calls.push([fn, args]);
      if (fn === 'platform_issue_claims') return claims;
      if (fn === 'platform_my_issue_events') return [];
      if (fn === 'platform_issue_teammates') return [{ id: 'u-ana', name: 'Ana López' }, { id: 'u-luis', name: 'Luis' }];
      if (fn === 'platform_claim_next_issue') return args.p_candidates[0] ?? null;
      return null;
    },
  };
  const loads = { n: 0 };
  const imports = [];
  const source = {
    load: () => { loads.n++; return { taken: '2026-10-04T09:44:00.000Z', issues }; },
    importCsv: async (chunks, name) => { const got = [name]; for await (const c of chunks) got.push(c); imports.push(got); return { file: name, taken: 't', issues: 1 }; },
  };
  const store = new Map();
  const drafts = {
    get: (u, i) => store.get(`${u}/${i}`) ?? null,
    setText: (u, i, f) => { store.set(`${u}/${i}`, { ...store.get(`${u}/${i}`), ...f }); return 'at'; },
    setFile: (u, i, f) => { store.set(`${u}/${i}`, { ...store.get(`${u}/${i}`), file: f && f.name }); return 'at'; },
    drop: (u, i) => { store.delete(`${u}/${i}`); },
  };
  const route = issuesRoutes(createIssuesService({ source, platform, drafts }), { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
  const call = async (method, path, body, query = '') => {
    const res = {}, req = { method, body, setEncoding() {}, resume() {}, [Symbol.asyncIterator]: async function* () { yield body; } };
    await route(req, res, path, WHO, new URLSearchParams(query)); return res;
  };
  return { call, calls, loads, imports };
};

test('GET /: libres, reglas y mi mesa (responsable en Remedy o cogida en SIA)', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }]).call('GET', []);
  assert.equal(body.free, 1);
  assert.deepEqual(body.rules, [{ id: 'basic', label: 'Regla básica' }]);
  assert.deepEqual(body.desk.map((i) => [i.id, i.claimed]), [['INC1', true], ['INC3', false]]);
  assert.equal(body.desk[0].notes, undefined);
  assert.equal(body.next.id, 'INC2');
  assert.equal(body.history.weeks.length, 12);
  assert.deepEqual(body.today, { resolved: 0, sga: 0, sisu: 0 });
});

test('POST /next: manda la cola en orden de la regla y devuelve la que se lleva', async () => {
  const { call, calls } = setup();
  const r = await call('POST', ['next'], { rule: 'basic' });
  assert.deepEqual(r.body, { id: 'INC2' });
  assert.deepEqual(calls.at(-1), ['platform_claim_next_issue', { p_candidates: ['INC2', 'INC1'] }]);
});

test('GET /:id: el detalle completo, quién la tiene y las del mismo centro', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López', claimed_at: '2026-10-06T08:00:00Z' }]).call('GET', ['INC1']);
  assert.equal(body.issue.notes, 'detalle');
  assert.deepEqual(body.issue.claimedBy, { id: 'u-ana', name: 'Ana López', at: '2026-10-06T08:00:00Z' });
  assert.deepEqual(body.sameCenter.map((i) => i.id), ['INC2', 'INC3']);
});

test('ids raros: 404; devolver: a la base, sin leer la foto', async () => {
  const { call, calls, loads } = setup();
  assert.equal((await call('GET', ['x;drop'])).status, 404);
  assert.equal((await call('GET', ['INC9'])).status, 404);
  loads.n = 0;
  assert.deepEqual((await call('POST', ['INC1', 'release'])).body, { ok: true });
  assert.deepEqual(calls.at(-1), ['platform_release_issue', { p_issue: 'INC1' }]);
  assert.equal(loads.n, 0);
});

test('GET /teammates: el equipo de Issues sin mí, sin leer la foto; un fallo de la base, con su estado', async () => {
  const { call, loads } = setup();
  assert.deepEqual((await call('GET', ['teammates'])).body, { teammates: [{ id: 'u-luis', name: 'Luis' }] });
  assert.equal(loads.n, 0);
  const broken = issuesRoutes({ desk: async () => { throw Object.assign(new Error('sin red'), { status: 503 }); } }, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async () => ({}) });
  const res = {}; await broken({ method: 'GET' }, res, [], WHO);
  assert.deepEqual([res.status, res.body], [503, { error: 'sin red' }]);
});

test('POST /csv: carga el cuerpo con el nombre del fichero; sin nombre .csv, 400', async () => {
  const { call, imports } = setup();
  assert.deepEqual((await call('POST', ['csv'], 'csv', 'name=issues_2026.csv')).body, { meta: { file: 'issues_2026.csv', taken: 't', issues: 1 } });
  assert.deepEqual(imports, [['issues_2026.csv', 'csv']]);
  assert.equal((await call('POST', ['csv'], 'csv', 'name=datos.xlsx')).status, 400);
  assert.equal((await call('POST', ['csv'], 'csv', 'name=../x.csv')).status, 400);
  assert.equal(imports.length, 1);
});

// Resolver: INC4 es mía (responsable en Remedy), abierta y con todas las notas;
// INC5, mía pero ya resuelta; INC1, de nadie; INC6, mía pero sin diagnóstico.
const note = (tag) => ({ at: '2026-10-28 10:00', who: 'ANA', text: `[${tag}] hecho` });
const NOTES = ['SITUACION INICIAL', 'ANTECEDENTES', 'ANALISIS', 'DIAGNOSTICO'].map(note);
const ANA = { assignee: 'ANA LOPEZ GARCIA', category: 'ECOM', worklog: NOTES };
const RES = [...ISSUES, issue('INC4', { ...ANA, status: 'IN_PROGRESS' }), issue('INC5', { ...ANA, status: 'RESOLVED' }), issue('INC6', { ...ANA, worklog: NOTES.slice(0, 3) })];
const SEND = { note: 'Se relanza', what: 'Se paró', how: 'Se relanzó', prevent: 'Corrección pedida', lang: 'es' };
const b64 = Buffer.from('hola').toString('base64');

test('borrador de Resolver: guardar, adjuntar, quitar el adjunto y descartar, siempre el mío', async () => {
  const { call } = setup([], RES);
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft, null);
  assert.deepEqual((await call('PUT', ['INC4', 'draft'], { note: 'n', what: 'w', lang: 'en', extra: 'x' })).body, { at: 'at' });
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft, { note: 'n', what: 'w', how: '', prevent: '', lang: 'en' });
  const up = await call('PUT', ['INC4', 'draft', 'file'], { name: 'cola.png', type: 'image/png', data: b64 });
  assert.deepEqual(up.body, { at: 'at', file: { name: 'cola.png', type: 'image/png', size: 4 } });
  assert.equal((await call('PUT', ['INC4', 'draft', 'file'], { name: 'x.png' })).status, 400);
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft.file, 'cola.png');
  await call('DELETE', ['INC4', 'draft', 'file']);
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft.file, null);
  assert.deepEqual((await call('DELETE', ['INC4', 'draft'])).body, { ok: true });
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft, null);
  assert.equal((await call('GET', ['../x', 'resolve'])).status, 404);
  assert.equal((await call('GET', ['INC4', 'draft'])).status, 404);   // el borrador se lee al abrir Resolver
});

test('abrir Resolver: lo que hay en Remedy y lo que falta lo calcula el bridge', async () => {
  const { call } = setup([], RES);
  const { check } = (await call('GET', ['INC4', 'resolve'])).body;
  assert.deepEqual(check.missing, []);
  assert.equal(check.draft.what.value, 'hecho');
  assert.deepEqual((await call('GET', ['INC6', 'resolve'])).body.check.missing, ['Diagnóstico']);
});

test('Resolver y su borrador, solo en una issue de la foto, mía y abierta: lo forzado no entra', async () => {
  const { call } = setup([], RES);
  for (const [method, path, body] of [['GET', ['IDX', 'resolve']], ['POST', ['IDX', 'resolve'], SEND], ['PUT', ['IDX', 'draft'], SEND], ['PUT', ['IDX', 'draft', 'file'], { name: 'a.txt', data: b64 }]]) {
    for (const [id, status, error] of [['INC999', 404, 'Esa issue ya no está en la foto.'], ['INC1', 403, 'Solo puedes resolver tus issues.'], ['INC5', 409, 'Esta issue ya está resuelta o cerrada.']]) {
      const r = await call(method, path.map((x) => (x === 'IDX' ? id : x)), body);
      assert.deepEqual([method, path.at(-1), id, r.status, r.body.error], [method, path.at(-1), id, status, error]);
    }
  }
  // cogida en SIA por mí, aunque en Remedy no lleve mi nombre: sí
  assert.equal((await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }], RES).call('PUT', ['INC1', 'draft'], SEND)).status, 200);
  // cogida por otra persona: no
  assert.equal((await setup([{ issue_id: 'INC1', user_id: 'u-luis', user_name: 'Luis' }], RES).call('PUT', ['INC1', 'draft'], SEND)).status, 403);
});

test('confirmar Resolver: lo comprueba todo otra vez y, si cumple, borra el borrador', async () => {
  const { call } = setup([], RES);
  await call('PUT', ['INC4', 'draft'], SEND);
  // saltándose los pasos en devtools: sin diagnóstico, con un campo vacío, con datos que no son texto
  assert.deepEqual([(await call('POST', ['INC6', 'resolve'], SEND)).status], [409]);
  const empty = await call('POST', ['INC4', 'resolve'], { ...SEND, how: '  ' });
  assert.deepEqual([empty.status, empty.body.error], [400, 'Falta: ¿Cómo se resolvió?']);
  assert.equal((await call('POST', ['INC4', 'resolve'], { ...SEND, what: ['x'] })).status, 400);
  assert.equal((await call('POST', ['INC4', 'resolve'], { ...SEND, lang: 'xx' })).status, 400);
  assert.equal((await call('POST', ['INC4', 'resolve'], 'texto')).status, 400);
  assert.notEqual((await call('GET', ['INC4', 'resolve'])).body.draft, null);   // nada de eso borra el borrador
  assert.deepEqual((await call('POST', ['INC4', 'resolve'], SEND)).body, { ok: true, sent: false });
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft, null);
});

