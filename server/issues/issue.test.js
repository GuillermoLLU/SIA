import test from 'node:test';
import assert from 'node:assert/strict';
import { toIssue, statusChanges } from './issue.js';

const row = (o) => ({
  INCIDENTNUMBER: 'INC1', SUMMARY: '', PRIORITY: 'HIGH', STATUS: 'ASSIGNED', STATUSREASON: '', ASSIGNEE: '',
  ASSIGNEDGROUP: 'G', TAGS: '', REPORTEDDATE: '2026-10-01 08:00:12.000', LASTMODIFIEDDATE: '', LASTRESOLUTIONDATE: '',
  VENDORTICKETNUMBER: '', CHILDREQUEST: '', LINKREMEDY: '', AUDIT_DETAIL: '', ...o,
});

test('summary: código de centro aparte y sin la criticidad escrita a mano', () => {
  const i = toIssue(row({ SUMMARY: '100998 Alta ECOM ZARA ES13 EWMS - PO no cierra' }));
  assert.equal(i.center, '100998');
  assert.equal(i.text, 'ECOM ZARA ES13 EWMS - PO no cierra');
  assert.equal(toIssue(row({ SUMMARY: '100813 Crítica Sorter' })).text, 'Sorter');
  assert.equal(toIssue(row({ SUMMARY: '101117 ECOM ZARA TR 382' })).text, 'ECOM ZARA TR 382');
});

test('summary sin código: tal cual', () => {
  const i = toIssue(row({ SUMMARY: '[COMMS] 100362 Baja PAQUETERIA' }));
  assert.equal(i.center, '');
  assert.equal(i.text, '[COMMS] 100362 Baja PAQUETERIA');
});

test('tags: SISU y priorizada por negocio', () => {
  const i = toIssue(row({ TAGS: 'SIGLO_TIP_SOL=1; SISUINC;PRIO' }));
  assert.equal(i.sisu, true);
  assert.equal(i.prio, true);
  assert.equal(toIssue(row({ TAGS: 'SIGLO_TIP_SOL=1' })).sisu, false);
});

test('fechas al minuto', () => {
  assert.equal(toIssue(row({})).reported, '2026-10-01 08:00');
});

test('statusChanges: solo los cambios de estado', () => {
  const audit = '2026-09-30 04:27:46.000 - robot.siglo - Urgency: 2-High → 2-High | 2026-09-30 05:00:46.000 - X - Status: Assigned → In Progress | 2026-10-01 12:16:15.000 - Y - Status: In Progress → Resolved';
  assert.deepEqual(statusChanges(audit), [['2026-09-30 05:00', 'Assigned', 'In Progress'], ['2026-10-01 12:16', 'In Progress', 'Resolved']]);
  assert.deepEqual(statusChanges(''), []);
});
