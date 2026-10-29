import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssuesService } from './service.js';
import { issuesRoutes } from './routes.js';

const issue = (id, o = {}) => ({ id, center: '100', text: id, priority: 'HIGH', status: 'ASSIGNED', assignee: '', prio: false,
  reported: '2026-10-01 10:00', modified: '', resolved: '', notes: 'detalle', changes: [], ...o });
const ISSUES = [issue('INC1'), issue('INC2', { prio: true }), issue('INC3', { assignee: 'ANA LOPEZ GARCIA', status: 'PENDING' })];
const WHO = { user: { id: 'u-ana', name: 'Ana López' }, accessToken: 'jwt' };

const setup = (claims = [], transfers = []) => {
  const calls = [];
  const platform = {
    rpc: async (jwt, fn, args) => {
      calls.push([fn, args]);
      if (fn === 'platform_issue_claims') return claims;
      if (fn === 'platform_my_issue_events') return [];
      if (fn === 'platform_issue_teammates') return [{ id: 'u-ana', name: 'Ana López' }, { id: 'u-luis', name: 'Luis' }];
      if (fn === 'platform_claim_next_issue') return args.p_candidates[0] ?? null;
      if (fn === 'platform_issue_events') return args.p_issue === 'INC1' ? [{ id: 1, action: 'claimed', actor_name: 'Ana López', from_name: null, to_name: 'Ana López', happened_at: '2026-10-06T08:00:00+00:00' }] : [];
      if (fn === 'platform_issue_notes') return args.p_issue === 'INC1' ? [
        { id: 5, author_id: 'u-ana', author_name: 'Ana López', kind: 'note', body: 'ojo', created_at: '2026-10-04T09:00:00+00:00', edited_at: null },
        { id: 6, author_id: 'u-luis', author_name: 'Luis', kind: 'note', body: 'ajena', created_at: '2026-10-04T09:30:00+00:00', edited_at: null },
        { id: 7, author_id: 'u-ana', author_name: 'Ana López', kind: 'note', body: 'vieja', created_at: '2026-10-01T09:00:00+00:00', edited_at: null },
      ] : [];
      if (fn === 'platform_add_issue_note') return 9;
      if (fn === 'platform_my_transfers') return transfers;
      return null;
    },
  };
  const loads = { n: 0 };
  const imports = [];
  const source = {
    load: () => { loads.n++; return { taken: '2026-10-04T09:44:00.000Z', issues: ISSUES }; },
    importCsv: async (chunks, name) => { const got = [name]; for await (const c of chunks) got.push(c); imports.push(got); return { file: name, taken: 't', issues: 1 }; },
  };
  const route = issuesRoutes(createIssuesService({ source, platform, now: () => new Date('2026-10-04T12:00:00Z') }), { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
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

test('GET /: la que me han traspasado sale marcada con de quién viene y el motivo', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }],
    [{ issue_id: 'INC1', from_name: 'Luis', happened_at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' }]).call('GET', []);
  assert.deepEqual(body.desk.find((i) => i.id === 'INC1').transferred, { from: 'Luis', at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' });
  assert.equal(body.desk.find((i) => i.id === 'INC3').transferred, undefined);
});

test('POST /next: manda la cola en orden de la regla y devuelve la que se lleva', async () => {
  const { call, calls } = setup();
  const r = await call('POST', ['next'], { rule: 'basic' });
  assert.deepEqual(r.body, { id: 'INC2' });
  assert.deepEqual(calls.at(-1), ['platform_claim_next_issue', { p_candidates: ['INC2', 'INC1'] }]);
});

test('GET /:id: el detalle completo, quién la tiene, las del mismo centro y su histórico en SIA', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López', claimed_at: '2026-10-06T08:00:00Z' }]).call('GET', ['INC1']);
  assert.equal(body.issue.notes, 'detalle');
  assert.deepEqual(body.issue.claimedBy, { id: 'u-ana', name: 'Ana López', at: '2026-10-06T08:00:00Z' });
  assert.deepEqual(body.sameCenter.map((i) => i.id), ['INC2', 'INC3']);
  assert.deepEqual(body.timeline.map((t) => [t.type, t.by, t.text]), [['note', 'Ana López', 'vieja'], ['note', 'Ana López', 'ojo'], ['note', 'Luis', 'ajena'], ['claimed', 'Ana López', undefined]]);
  assert.equal(body.timeline[1].byId, 'u-ana');
});

test('traspasar: a la base con el compañero y el motivo limpio; sin compañero válido o sin motivo, 400', async () => {
  const { call, calls, loads } = setup();
  loads.n = 0;
  assert.deepEqual((await call('POST', ['INC1', 'transfer'], { to: '11111111-1111-1111-1111-111111111111', comment: '  Lleva dos llamadas.  ' })).body, { ok: true });
  assert.deepEqual(calls.at(-1), ['platform_transfer_issue', { p_issue: 'INC1', p_to: '11111111-1111-1111-1111-111111111111', p_comment: 'Lleva dos llamadas.' }]);
  const n = calls.length;
  assert.equal((await call('POST', ['INC1', 'transfer'], { to: '11111111-1111-1111-1111-111111111111', comment: '   ' })).status, 400);
  assert.equal((await call('POST', ['INC1', 'transfer'], { to: '11111111-1111-1111-1111-111111111111' })).status, 400);
  assert.equal((await call('POST', ['INC1', 'transfer'], { to: 'luis', comment: 'motivo' })).status, 400);
  assert.equal((await call('POST', ['INC1', 'transfer'], { to: '11111111-1111-1111-1111-111111111111', comment: 5 })).status, 400);
  assert.equal(calls.length, n, 'nada llega a la base sin compañero y motivo');
  assert.equal(loads.n, 0);
});

test('notas: añadir devuelve el id; vacía, 400; el histórico, aparte', async () => {
  const { call, calls } = setup();
  assert.deepEqual((await call('POST', ['INC1', 'notes'], { body: ' El centro confirma. ' })).body, { id: 9 });
  assert.deepEqual(calls.at(-1), ['platform_add_issue_note', { p_issue: 'INC1', p_body: 'El centro confirma.' }]);
  assert.equal((await call('POST', ['INC1', 'notes'], { body: '   ' })).status, 400);
  assert.equal((await call('POST', ['INC1', 'notes'], {})).status, 400);
  const { body } = await call('GET', ['INC1', 'timeline']);
  assert.deepEqual(body.timeline.map((t) => t.type), ['note', 'note', 'note', 'claimed']);
  assert.deepEqual((await call('GET', ['INC2', 'timeline'])).body, { timeline: [] });
});

test('editar una nota: la propia reciente va a la base; la ajena o la de hace más de 24 h, 403 con el motivo; vacía 400; id raro 404', async () => {
  const { call, calls } = setup();
  assert.deepEqual((await call('PUT', ['INC1', 'notes', '5'], { body: ' corregida ' })).body, { ok: true });
  assert.deepEqual(calls.at(-1), ['platform_edit_issue_note', { p_note: 5, p_body: 'corregida' }]);
  const n = calls.length;
  const ajena = await call('PUT', ['INC1', 'notes', '6'], { body: 'x' });
  assert.equal(ajena.status, 403); assert.match(ajena.body.error, /tus propias notas/);
  const vieja = await call('PUT', ['INC1', 'notes', '7'], { body: 'x' });
  assert.equal(vieja.status, 403); assert.match(vieja.body.error, /24 horas/);
  assert.equal((await call('PUT', ['INC1', 'notes', '99'], { body: 'x' })).status, 403);
  assert.equal((await call('PUT', ['INC1', 'notes', '5'], { body: '  ' })).status, 400);
  assert.equal((await call('PUT', ['INC1', 'notes', 'abc'], { body: 'x' })).status, 404);
  assert.equal(calls.filter((c) => c[0] === 'platform_edit_issue_note').length, 1, 'solo la válida llega a la base');
  assert.ok(calls.length > n);
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
