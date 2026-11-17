import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssuesService } from './service.js';
import { issuesRoutes } from './routes.js';
import { MAX_IMAGES } from './draft.js';

const issue = (id, o = {}) => ({ id, center: '100', text: id, priority: 'HIGH', status: 'ASSIGNED', assignee: '', prio: false,
  reported: '2026-10-01 10:00', modified: '', resolved: '', notes: 'detalle', changes: [], ...o });
const ISSUES = [issue('INC1'), issue('INC2', { prio: true }), issue('INC3', { assignee: 'ANA LOPEZ GARCIA', status: 'PENDING' })];
const WHO = { user: { id: 'u-ana', name: 'Ana López' }, accessToken: 'jwt' };

const setup = (claims = [], { issues = ISSUES, broken, transfers = [], rules = [], who = WHO } = {}) => {
  const calls = [];
  const platform = {
    rpc: async (jwt, fn, args) => {
      calls.push([fn, args]);
      if (fn === 'platform_issue_claims') return claims;
      if (fn === 'platform_my_issue_events') return [];
      if (fn === 'platform_list_rules') return rules;
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
    load: () => { loads.n++; return { taken: '2026-10-04T09:44:00.000Z', issues }; },
    importCsv: async (chunks, name) => { const got = [name]; for await (const c of chunks) got.push(c); imports.push(got); return { file: name, taken: 't', issues: 1 }; },
  };
  const store = new Map();
  const drafts = {
    get: (u, i) => store.get(`${u}/${i}`) ?? null,
    setText: (u, i, f) => { store.set(`${u}/${i}`, { ...store.get(`${u}/${i}`), ...f }); return 'at'; },
    addImage: (u, i, f) => { const d = { images: [], ...store.get(`${u}/${i}`) }; const n = (d.images.at(-1)?.n ?? 0) + 1; d.images = [...d.images, { n, name: f.name, type: f.type, size: f.data.length, data: f.data }]; store.set(`${u}/${i}`, d); return { at: 'at', n }; },
    getImage: (u, i, n) => store.get(`${u}/${i}`)?.images.find((im) => im.n === n) ?? null,
    dropImage: (u, i, n) => { const d = store.get(`${u}/${i}`); if (d) d.images = d.images.filter((im) => im.n !== n); return 'at'; },
    drop: (u, i) => { store.delete(`${u}/${i}`); },
    getEscalate: (u, i) => store.get(`esc:${u}/${i}`) ?? null,
    setEscalate: (u, i, f) => { store.set(`esc:${u}/${i}`, f); return 'at'; },
    dropEscalate: (u, i) => { store.delete(`esc:${u}/${i}`); },
  };
  const route = issuesRoutes(createIssuesService({ source, platform, drafts: broken === undefined ? drafts : broken, now: () => new Date('2026-10-04T12:00:00Z') }), { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
  const call = async (method, path, body, query = '') => {
    const res = {}, req = { method, body, setEncoding() {}, resume() {}, [Symbol.asyncIterator]: async function* () { yield body; } };
    await route(req, res, path, who, new URLSearchParams(query)); return res;
  };
  return { call, calls, loads, imports, store };
};

test('GET /: libres, la siguiente y mi mesa (responsable en Remedy o cogida en SIA)', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }]).call('GET', []);
  assert.equal(body.free, 1);
  assert.deepEqual(body.desk.map((i) => [i.id, i.claimed]), [['INC1', true], ['INC3', false]]);
  assert.equal(body.desk[0].notes, undefined);
  assert.equal(body.next.id, 'INC2');
  assert.equal(body.history.weeks.length, 12);
  assert.deepEqual(body.today, { resolved: 0, sga: 0, sisu: 0 });
});

test('GET /: la que me han traspasado sale marcada con de quién viene y el motivo', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }],
    { transfers: [{ issue_id: 'INC1', from_name: 'Luis', happened_at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' }] }).call('GET', []);
  assert.deepEqual(body.desk.find((i) => i.id === 'INC1').transferred, { from: 'Luis', at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' });
  assert.equal(body.desk.find((i) => i.id === 'INC3').transferred, undefined);
});

test('POST /next: manda la cola en orden de la regla y devuelve la que se lleva', async () => {
  const { call, calls } = setup();
  const r = await call('POST', ['next'], {});
  assert.deepEqual(r.body, { id: 'INC2' });
  assert.deepEqual(calls.at(-1), ['platform_claim_next_issue', { p_candidates: ['INC2', 'INC1'] }]);
});

test('la cola de cada uno, solo de sus orígenes: con SISU no le toca una de SGA', async () => {
  const issues = [...ISSUES, issue('INC4', { sisu: true, priority: 'LOW' })];
  const sisu = setup([], { issues, who: { ...WHO, user: { ...WHO.user, groups: ['SISU'] } } });
  const desk = (await sisu.call('GET', [])).body;
  assert.equal(desk.next.id, 'INC4');
  assert.equal(desk.free, 1, 'la cola cuenta solo lo que puede coger: lo de SISU');
  assert.deepEqual((await sisu.call('POST', ['next'], {})).body, { id: 'INC4' });
  assert.deepEqual(sisu.calls.at(-1), ['platform_claim_next_issue', { p_candidates: ['INC4'] }]);
  const none = setup([], { who: { ...WHO, user: { ...WHO.user, groups: [] } } });
  assert.equal((await none.call('GET', [])).body.next, null, 'sin conocimiento, ninguna');
});

test('la cola va en el orden de la regla de la persona (su rol o personalizada); sin regla, la básica', async () => {
  const rules = [{ id: 'r-sev', name: 'Criticidad', criteria: ['severity'], builtin: false }];
  const issues = [...ISSUES, issue('INC4', { priority: 'CRITICAL' })];
  const sev = setup([], { issues, rules, who: { ...WHO, user: { ...WHO.user, rule: 'r-sev' } } });
  assert.equal((await sev.call('GET', [])).body.next.id, 'INC4');
  assert.deepEqual((await sev.call('POST', ['next'], {})).body, { id: 'INC4' });
  const basic = setup([], { issues, rules });
  assert.equal((await basic.call('GET', [])).body.next.id, 'INC2');
  assert.deepEqual((await basic.call('POST', ['next'], { rule: 'r-sev' })).body, { id: 'INC2' });   // pedir otra regla no cambia la suya
});

test('GET /:id: el detalle completo, quién la tiene, las del mismo centro y su histórico en SIA', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López', claimed_at: '2026-10-06T08:00:00Z' }]).call('GET', ['INC1']);
  assert.equal(body.issue.notes, 'detalle');
  assert.deepEqual(body.issue.claimedBy, { id: 'u-ana', name: 'Ana López', at: '2026-10-06T08:00:00Z' });
  assert.deepEqual(body.sameCenter.map((i) => i.id), ['INC2', 'INC3']);
  assert.deepEqual(body.timeline.map((t) => [t.type, t.by, t.text]), [['note', 'Ana López', 'vieja'], ['note', 'Ana López', 'ojo'], ['note', 'Luis', 'ajena'], ['claimed', 'Ana López', undefined]]);
  assert.equal(body.timeline[1].byId, 'u-ana');
});

test('traspasar: a la base con el compañero, el motivo limpio y el origen de la issue; sin compañero válido o sin motivo, 400', async () => {
  const { call, calls, loads } = setup();
  loads.n = 0;
  assert.deepEqual((await call('POST', ['INC1', 'transfer'], { to: '11111111-1111-1111-1111-111111111111', comment: '  Lleva dos llamadas.  ' })).body, { ok: true });
  assert.deepEqual(calls.at(-1), ['platform_transfer_issue', { p_issue: 'INC1', p_to: '11111111-1111-1111-1111-111111111111', p_comment: 'Lleva dos llamadas.', p_origin: 'SGA' }]);
  assert.equal(loads.n, 1, 'la foto, para saber su origen');
  loads.n = 0;
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

// Resolver: INC4 es mía (responsable en Remedy), abierta y con todas las notas;
// INC5, mía pero ya resuelta; INC1, de nadie; INC6, mía pero sin diagnóstico.
const note = (tag) => ({ at: '2026-10-28 10:00', who: 'ANA', text: `[${tag}] hecho` });
const NOTES = ['SITUACION INICIAL', 'RECURRENCIA', 'ANTECEDENTES', 'ANALISIS', 'DIAGNOSTICO'].map(note);
const ANA = { assignee: 'ANA LOPEZ GARCIA', category: 'ECOM', worklog: NOTES };
const RES = [...ISSUES, issue('INC4', { ...ANA, status: 'IN_PROGRESS' }), issue('INC5', { ...ANA, status: 'RESOLVED' }), issue('INC6', { ...ANA, worklog: NOTES.slice(0, -1) })];
const SEND = { note: 'Se relanza', what: 'Se paró', how: 'Se relanzó', prevent: 'Corrección pedida', lang: 'es' };
const b64 = Buffer.from('hola').toString('base64');

test('borrador de Resolver: guardar, adjuntar y quitar el adjunto, siempre el mío; se borra al confirmar', async () => {
  const { call } = setup([], { issues: RES });
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft, null);
  assert.deepEqual((await call('PUT', ['INC4', 'draft'], { note: 'n', what: 'w', lang: 'en', extra: 'x' })).body, { at: 'at' });
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft, { note: 'n', what: 'w', how: '', prevent: '', lang: 'en', step: 1 });
  const up = await call('PUT', ['INC4', 'draft', 'file'], { name: 'cola.png', type: 'image/png', data: b64 });
  assert.deepEqual(up.body, { at: 'at', image: { n: 1, name: 'cola.png', type: 'image/png', size: 4 } });
  assert.equal((await call('PUT', ['INC4', 'draft', 'file'], { name: 'x.png' })).status, 400);
  assert.equal((await call('PUT', ['INC4', 'draft', 'file'], { name: 'x.txt', type: 'text/plain', data: b64 })).status, 400);   // solo imágenes
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft.images.map((im) => im.name), ['cola.png']);
  assert.deepEqual((await call('GET', ['INC4', 'draft', 'file', '1'])).body, { name: 'cola.png', type: 'image/png', data: b64 });
  assert.equal((await call('GET', ['INC4', 'draft', 'file', '2'])).status, 404);
  assert.equal((await call('GET', ['INC4', 'draft', 'file', 'x'])).status, 404);
  assert.equal((await call('DELETE', ['INC4', 'draft', 'file'])).status, 404);   // quitar es con número
  await call('DELETE', ['INC4', 'draft', 'file', '1']);
  assert.deepEqual((await call('GET', ['INC4', 'resolve'])).body.draft.images, []);
  assert.equal((await call('DELETE', ['INC4', 'draft'])).status, 404);   // no hay «descartar»: el borrador sigue
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft.note, 'n');
  assert.equal((await call('GET', ['../x', 'resolve'])).status, 404);
  assert.equal((await call('GET', ['INC4', 'draft'])).status, 404);   // el borrador se lee al abrir Resolver
});

test('borrador de Resolver: como mucho MAX_IMAGES imágenes; la siguiente, 400 y no entra', async () => {
  const { call, store } = setup([], { issues: RES });
  for (let i = 1; i <= MAX_IMAGES; i++) {
    assert.equal((await call('PUT', ['INC4', 'draft', 'file'], { name: `${i}.png`, type: 'image/png', data: b64 })).body.image.n, i);
  }
  const over = await call('PUT', ['INC4', 'draft', 'file'], { name: 'otra.png', type: 'image/png', data: b64 });
  assert.equal(over.status, 400);
  assert.deepEqual(over.body, { error: `Como mucho ${MAX_IMAGES} imágenes por resolución.` });
  assert.equal(store.get('u-ana/INC4').images.length, MAX_IMAGES);
  await call('DELETE', ['INC4', 'draft', 'file', '1']);   // al quitar una vuelve a caber otra
  assert.equal((await call('PUT', ['INC4', 'draft', 'file'], { name: 'otra.png', type: 'image/png', data: b64 })).status, 200);
});

test('borrador de Resolver: el paso llega del formulario como texto y vuelve al abrir, para retomarlo ahí', async () => {
  const { call } = setup([], { issues: RES });
  await call('PUT', ['INC4', 'draft'], { note: 'n', what: 'w', how: 'h', prevent: 'p', lang: 'es', step: '3' });
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft.step, 3);
  assert.equal((await call('PUT', ['INC4', 'draft'], { note: 'n', step: '9' })).status, 400);
});

test('abrir Resolver: lo que hay en Remedy y lo que falta lo calcula el bridge', async () => {
  const { call } = setup([], { issues: RES });
  const { check } = (await call('GET', ['INC4', 'resolve'])).body;
  assert.deepEqual(check.missing, []);
  assert.equal(check.draft.what.value, 'hecho');
  assert.deepEqual((await call('GET', ['INC6', 'resolve'])).body.check.missing, ['Diagnóstico']);
});

test('Resolver y su borrador, solo en una issue de la foto, mía y abierta: lo forzado no entra', async () => {
  const { call } = setup([], { issues: RES });
  for (const [method, path, body] of [['GET', ['IDX', 'resolve']], ['POST', ['IDX', 'resolve'], SEND], ['PUT', ['IDX', 'draft'], SEND], ['PUT', ['IDX', 'draft', 'file'], { name: 'a.png', type: 'image/png', data: b64 }]]) {
    for (const [id, status, error] of [['INC999', 404, 'Esa issue ya no está en la foto.'], ['INC1', 403, 'Solo puedes resolver tus issues.'], ['INC5', 409, 'Esta issue ya está resuelta o cerrada.']]) {
      const r = await call(method, path.map((x) => (x === 'IDX' ? id : x)), body);
      assert.deepEqual([method, path.at(-1), id, r.status, r.body.error], [method, path.at(-1), id, status, error]);
    }
  }
  // cogida en SIA por mí, aunque en Remedy no lleve mi nombre: sí
  assert.equal((await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }], { issues: RES }).call('PUT', ['INC1', 'draft'], SEND)).status, 200);
  // cogida por otra persona: no
  assert.equal((await setup([{ issue_id: 'INC1', user_id: 'u-luis', user_name: 'Luis' }], { issues: RES }).call('PUT', ['INC1', 'draft'], SEND)).status, 403);
});

test('confirmar Resolver: lo comprueba todo otra vez y, si cumple, borra el borrador', async () => {
  const { call } = setup([], { issues: RES });
  await call('PUT', ['INC4', 'draft'], SEND);
  // saltándose los pasos en devtools: sin diagnóstico, con un campo vacío, con datos que no son texto
  assert.deepEqual([(await call('POST', ['INC6', 'resolve'], SEND)).status], [409]);
  const empty = await call('POST', ['INC4', 'resolve'], { ...SEND, how: '  ' });
  assert.deepEqual([empty.status, empty.body.error], [400, 'Falta: ¿Cómo se ha resuelto?']);
  assert.equal((await call('POST', ['INC4', 'resolve'], { ...SEND, what: ['x'] })).status, 400);
  assert.equal((await call('POST', ['INC4', 'resolve'], { ...SEND, lang: 'xx' })).status, 400);
  assert.equal((await call('POST', ['INC4', 'resolve'], 'texto')).status, 400);
  assert.notEqual((await call('GET', ['INC4', 'resolve'])).body.draft, null);   // nada de eso borra el borrador
  assert.deepEqual((await call('POST', ['INC4', 'resolve'], SEND)).body, { ok: true, sent: false });
  assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft, null);
});

// Escalar: INC10 (crítica) sin mayor incidente; INC7, crítica y con él; INC5, Resuelta (por la causa raíz);
// INC3, Pendiente; INC6 sin [DIAGNOSTICO], que no se pide.
const MAJOR = { at: '2026-10-28 10:40', who: 'ANA', text: '[MAJOR INCIDENT] No' };
const ESC_ISSUES = [...RES, issue('INC7', { ...ANA, priority: 'CRITICAL', worklog: [...NOTES, MAJOR] }), issue('INC8', { ...ANA, priority: 'LOW', worklog: NOTES.slice(0, -1) }), issue('INC10', { ...ANA, priority: 'CRITICAL' }), issue('INC9', { ...ANA, status: 'RESOLVED', worklog: [...NOTES, MAJOR] })];
const ESC = { mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', step: '4' };

test('abrir Escalar: las notas que pide y las que faltan; el borrador va y vuelve, y se borra al escalar', async () => {
  const { call } = setup([], { issues: ESC_ISSUES });
  assert.deepEqual((await call('GET', ['INC10', 'escalate'])).body.check.missing, ['¿Es mayor incidente?']);
  assert.deepEqual((await call('GET', ['INC4', 'escalate'])).body.check.missing, []);   // alta: ya no lo pide
  assert.deepEqual((await call('GET', ['INC8', 'escalate'])).body.check.missing, []);   // baja y sin diagnóstico: vale
  assert.equal((await call('GET', ['INC8', 'escalate'])).body.check.analysis.text, 'hecho');
  assert.equal((await call('POST', ['INC10', 'escalate'], ESC)).status, 409);
  assert.deepEqual((await call('PUT', ['INC7', 'escalate', 'draft'], ESC)).body, { at: 'at' });
  assert.deepEqual((await call('GET', ['INC7', 'escalate'])).body.draft, { mode: 'escalate', dest: 'sisupac', destOther: '', linked: '', linkedOther: '', reason: 'Timeouts', jiraPriority: '', sent: '', mins: '', comment: '', step: 4 });
  assert.equal((await call('GET', ['INC7', 'resolve'])).body.draft, null);   // el de Resolver es otro
  assert.equal((await call('PUT', ['INC7', 'escalate', 'draft'], { step: '9' })).status, 400);
  assert.equal((await call('POST', ['INC7', 'escalate'], { ...ESC, reason: ' ' })).status, 400);
  assert.deepEqual((await call('POST', ['INC7', 'escalate'], ESC)).body, { ok: true, sent: false });
  assert.equal((await call('GET', ['INC7', 'escalate'])).body.draft, null);
  assert.deepEqual((await call('POST', ['INC9', 'escalate'], ESC)).body, { ok: true, sent: false });   // Resuelta: por la causa raíz
});

test('Escalar y su borrador, solo en una issue mía que no espere ya a un tercero', async () => {
  const { call } = setup([], { issues: ESC_ISSUES });
  for (const [method, path] of [['GET', ['IDX', 'escalate']], ['POST', ['IDX', 'escalate']], ['PUT', ['IDX', 'escalate', 'draft']]]) {
    for (const [id, status] of [['INC999', 404], ['INC1', 403]]) {
      assert.equal((await call(method, path.map((x) => (x === 'IDX' ? id : x)), ESC)).status, status);
    }
  }
  const pending = setup([], { issues: [...ESC_ISSUES.filter((i) => i.id !== 'INC3'), issue('INC3', { ...ANA, status: 'PENDING' })] });
  assert.deepEqual([(await pending.call('GET', ['INC3', 'escalate'])).status, (await pending.call('GET', ['INC3', 'escalate'])).body.error], [409, 'Esta issue ya espera a un tercero o está cerrada.']);
});


test('sin la BBDD de borradores, Resolver sigue: se abre sin borrador, se confirma y guardar da 503', async () => {
  const failing = { get: () => { throw new Error('disk'); }, setText: () => { throw new Error('disk'); }, addImage: () => { throw new Error('disk'); }, getImage: () => { throw new Error('disk'); }, dropImage: () => { throw new Error('disk'); }, drop: () => { throw new Error('disk'); } };
  for (const broken of [null, failing]) {
    const { call } = setup([], { issues: RES, broken });
    assert.equal((await call('GET', ['INC4', 'resolve'])).body.draft, null);
    const put = await call('PUT', ['INC4', 'draft'], SEND);
    assert.equal(put.status, 503);
    assert.match(put.body.error, /BBDD local de borradores/);
    assert.deepEqual((await call('POST', ['INC4', 'resolve'], SEND)).body, { ok: true, sent: false });
  }
});

test('quitar una imagen pasa la misma comprobación y no crea un borrador vacío', async () => {
  const { call, store } = setup([], { issues: RES });
  assert.equal((await call('DELETE', ['INC999', 'draft', 'file', '1'])).status, 404);
  assert.equal((await call('DELETE', ['INC1', 'draft', 'file', '1'])).status, 403);
  assert.equal((await call('DELETE', ['INC5', 'draft', 'file', '1'])).status, 409);
  assert.equal(store.size, 0);
});

test('POST /next: con el tope de en curso no coge otra (409) y la mesa lo dice', async () => {
  const mine = Array.from({ length: 5 }, (_, i) => issue(`M${i}`, { assignee: 'ANA LOPEZ GARCIA', status: 'IN_PROGRESS' }));
  const { call, calls } = setup([], { issues: [...ISSUES, ...mine] });
  const desk = await call('GET', []);
  assert.equal(desk.body.canTake, false);
  assert.equal(desk.body.maxDoing, 5);
  const r = await call('POST', ['next'], {});
  assert.equal(r.status, 409);
  assert.ok(!calls.some(([fn]) => fn === 'platform_claim_next_issue'));
});
