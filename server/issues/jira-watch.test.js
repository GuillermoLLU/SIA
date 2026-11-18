import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiraWatch } from './jira-watch.js';

const source = { load: () => ({ issues: [{ id: 'INC1', status: 'PENDING', vendorTicket: 'SISUPAC-1' }] }) };
const now = () => new Date('2026-11-17T10:30:00Z');

test('el vigía mira los Jira pendientes y guarda su estado y cuándo', async () => {
  const asked = [];
  const jira = { states: async (keys) => { asked.push(keys); return new Map([['SISUPAC-1', { state: 'resolved' }]]); } };
  const watch = createJiraWatch({ source, jira, now });
  assert.equal(watch.checkedAt(), null);
  await watch.check();
  assert.deepEqual(asked, [['SISUPAC-1']]);
  assert.equal(watch.states().get('SISUPAC-1').state, 'resolved');
  assert.equal(watch.checkedAt(), '2026-11-17T10:30:00.000Z');
});

test('el vigía: dos a la vez hacen una sola consulta', async () => {
  let calls = 0;
  const watch = createJiraWatch({ source, jira: { states: async () => { calls++; return new Map(); } }, now });
  await Promise.all([watch.check(), watch.check()]);
  assert.equal(calls, 1);
});

test('el vigía: si Jira falla, se queda con lo último y lo anota', async () => {
  const logs = [];
  let fail = false;
  const jira = { states: async () => { if (fail) throw new Error('sin red'); return new Map([['SISUPAC-1', { state: 'open' }]]); } };
  const watch = createJiraWatch({ source, jira, now, log: (m) => logs.push(m) });
  await watch.check();
  fail = true;
  await watch.check();
  assert.equal(watch.states().get('SISUPAC-1').state, 'open');
  assert.deepEqual(logs, ['[sia] no se pudo mirar Jira: sin red']);
});
