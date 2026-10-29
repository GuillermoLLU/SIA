import test from 'node:test';
import assert from 'node:assert/strict';
import { createBacklogService } from './service.js';

const issue = (id, over = {}) => ({ id, center: '000123', text: `Issue ${id}`, priority: 'MEDIUM', status: 'ASSIGNED', reason: '', prio: false, sisu: false,
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
  assert.deepEqual(rules.map((r) => r.id), ['basic', 'oldest', 'severity']);
});

test('con otra regla, su orden; una desconocida, la básica', async () => {
  const issues = [issue('INC1', { priority: 'LOW', reported: '2026-10-01 09:00' }), issue('INC2', { priority: 'CRITICAL', reported: '2026-10-20 09:00' })];
  assert.deepEqual((await service(issues).list({ accessToken: 'jwt' }, 'oldest')).issues.map((i) => i.id), ['INC1', 'INC2']);
  assert.deepEqual((await service(issues).list({ accessToken: 'jwt' }, 'severity')).issues.map((i) => i.id), ['INC2', 'INC1']);
  assert.equal((await service(issues).list({ accessToken: 'jwt' }, 'nope')).rule, 'basic');
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
