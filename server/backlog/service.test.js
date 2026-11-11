import test from 'node:test';
import assert from 'node:assert/strict';
import { createBacklogService } from './service.js';

const issue = (id, over = {}) => ({ id, center: '000123', text: `Incidencia ${id}`, priority: 'MEDIUM', status: 'ASSIGNED', reason: '', prio: false, sisu: false,
  assignee: '', reported: '2026-10-20 09:00', modified: '2026-10-20 09:00', resolved: '', notes: 'x', ...over });
const NOW = () => new Date('2026-10-29T10:00:00');
const service = (issues, claims = []) => createBacklogService({
  source: { load: () => ({ taken: '2026-10-29T08:00:00.000Z', issues }) },
  platform: { rpc: async (jwt, fn) => (fn === 'platform_issue_claims' ? claims : []) },
  now: NOW,
});

test('solo lo libre: ni con responsable en Remedy ni cogida en SIA; en el orden de la regla', async () => {
  const issues = [
    issue('INC1', { priority: 'LOW' }),
    issue('INC2', { assignee: 'ANA LOPEZ' }),
    issue('INC3', { priority: 'CRITICAL' }),
    issue('INC4'),
    issue('INC5', { status: 'PENDING' }),
  ];
  const { taken, rule, rules, issues: out } = await service(issues, [{ issue_id: 'INC4', user_id: 'u1' }]).list({ accessToken: 'jwt' });
  assert.equal(taken, '2026-10-29T08:00:00.000Z');
  assert.deepEqual(out.map((i) => i.id), ['INC3', 'INC1']);
  assert.equal(rule, 'basic');
  assert.deepEqual(rules, [{ id: 'basic', label: 'Regla básica' }]);
});

test('una regla desconocida: la básica', async () => {
  assert.equal((await service([issue('INC1')]).list({ accessToken: 'jwt' }, 'nope')).rule, 'basic');
});

test('las reglas: el catálogo de criterios y la básica (más las de la base)', async () => {
  const { criteria, rules } = await service([]).rules({ accessToken: 'jwt' });
  assert.deepEqual(criteria.map((c) => c.id), ['recent', 'prio', 'month', 'severity', 'critical', 'high', 'medium', 'low', 'age', 'sisu', 'sga']);
  assert.deepEqual(rules.map((r) => [r.id, r.builtin]), [['basic', true]]);
});

test('guardar una regla: lo que no vale se dice, lo que vale va a la base', async () => {
  const calls = [];
  const s = createBacklogService({ source: { load: () => ({ taken: null, issues: [] }) }, platform: { rpc: async (jwt, fn, args) => { calls.push([fn, args]); return fn === 'platform_save_rule' ? 'uuid-1' : []; } }, now: NOW });
  assert.deepEqual(await s.saveRule({ accessToken: 'jwt' }, null, { name: ' ', criteria: ['prio'] }), { error: 'Ponle un nombre a la regla.' });
  assert.deepEqual(await s.saveRule({ accessToken: 'jwt' }, null, { name: 'Urgencias', criteria: [] }), { error: 'Añade al menos un criterio.' });
  assert.deepEqual(await s.saveRule({ accessToken: 'jwt' }, null, { name: 'Urgencias', criteria: ['prio', 'prio'] }), { error: 'Un criterio no se repite.' });
  assert.deepEqual(await s.saveRule({ accessToken: 'jwt' }, null, { name: ' Urgencias ', criteria: ['severity', 'age'] }), { id: 'uuid-1' });
  assert.deepEqual(calls.at(-1), ['platform_save_rule', { p_rule: null, p_name: 'Urgencias', p_criteria: ['severity', 'age'] }]);
});

test('cada fila va en breve (sin notas ni worklog) y sin marca de cogida', async () => {
  const [row] = (await service([issue('INC1')]).list({ accessToken: 'jwt' })).issues;
  assert.deepEqual(Object.keys(row).sort(), ['center', 'id', 'modified', 'prio', 'priority', 'reason', 'reported', 'resolved', 'sisu', 'status', 'text']);
});

test('sin foto, nada que repartir', async () => {
  const s = createBacklogService({ source: { load: () => ({ taken: null, issues: [] }) }, platform: { rpc: async () => [] }, now: NOW });
  const r = await s.list({ accessToken: 'jwt' });
  assert.deepEqual([r.taken, r.issues], [null, []]);
});

test('asignar: a la base con el origen de la issue, que solo deja dársela a quien tiene ese conocimiento', async () => {
  const calls = [];
  const backlog = createBacklogService({
    source: { load: () => ({ taken: 't', issues: [issue('INC1', { sisu: true }), issue('INC2')] }) },
    platform: { rpc: async (jwt, fn, args) => { calls.push([fn, args]); return null; } },
    now: NOW,
  });
  await backlog.assign({ accessToken: 'jwt' }, 'INC1', 'u-ana');
  await backlog.assign({ accessToken: 'jwt' }, 'INC2', 'u-ana');
  assert.deepEqual(calls, [
    ['platform_assign_issue', { p_issue: 'INC1', p_to: 'u-ana', p_origin: 'SISU' }],
    ['platform_assign_issue', { p_issue: 'INC2', p_to: 'u-ana', p_origin: 'SGA' }],
  ]);
});

test('el backlog de cada uno: solo lo de sus orígenes; el detalle de otro origen, como si no existiera', async () => {
  const issues = [issue('INC1', { sisu: true }), issue('INC2'), issue('INC3', { sisu: true })];
  const sisu = { user: { groups: ['SISU'] }, accessToken: 'jwt' };
  assert.deepEqual((await service(issues).list(sisu)).issues.map((i) => i.id).sort(), ['INC1', 'INC3']);
  assert.equal(await service(issues).get(sisu, 'INC2'), null);
  assert.equal((await service(issues).get(sisu, 'INC1')).issue.id, 'INC1');
  assert.equal((await service(issues).list({ user: { groups: [] }, accessToken: 'jwt' })).issues.length, 0);
  assert.equal((await service(issues).list({ accessToken: 'jwt' })).issues.length, 3);   // sin la lista de proyectos, no se filtra
});
