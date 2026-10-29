import test from 'node:test';
import assert from 'node:assert/strict';
import { toIssue, statusChanges, worklog } from './issue.js';

const row = (o) => ({
  INCIDENTNUMBER: 'INC1', SUMMARY: '', PRIORITY: 'HIGH', STATUS: 'ASSIGNED', STATUSREASON: '', ASSIGNEE: '',
  ASSIGNEDGROUP: 'G', TAGS: '', REPORTEDDATE: '2026-10-01 08:00:12.000', LASTMODIFIEDDATE: '', LASTRESOLUTIONDATE: '',
  NOTES: '', CATEGORIZATIONTIER1: '', CATEGORIZATIONTIER2: '', CATEGORIZATIONTIER3: '', RESOLUTION: '', VENDORTICKETNUMBER: '', CHILDREQUEST: '', LINKREMEDY: '', AUDIT_DETAIL: '', ...o,
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

test('categoría por niveles, sin huecos', () => {
  assert.equal(toIssue(row({ CATEGORIZATIONTIER1: 'ECOM ZARA ES13', CATEGORIZATIONTIER2: 'EWMS' })).category, 'ECOM ZARA ES13 › EWMS');
});

test('worklog: notas en orden, al minuto, sin la columna no hay ninguna', () => {
  const text = '2026-10-22 20:24:05.000 - RICARDOEB - [ANALISIS] Verificamos | 2026-10-22 20:23:22.000 - RICARDOEB - [SITUACION INICIAL] Indican que no';
  assert.deepEqual(worklog(text), [
    { at: '2026-10-22 20:23', who: 'RICARDOEB', text: '[SITUACION INICIAL] Indican que no' },
    { at: '2026-10-22 20:24', who: 'RICARDOEB', text: '[ANALISIS] Verificamos' },
  ]);
  assert.deepEqual(toIssue(row({})).worklog, []);
});

test('worklog: dos notas del mismo minuto, en su orden real aunque el CSV traiga primero la nueva', () => {
  const text = '2026-10-22 20:24:50.000 - ANA - [DIAGNOSTICO] El bueno | 2026-10-22 20:24:05.000 - ANA - [DIAGNOSTICO] El viejo';
  assert.deepEqual(worklog(text).map((n) => n.text), ['[DIAGNOSTICO] El viejo', '[DIAGNOSTICO] El bueno']);
});

test('worklog: las notas del método, enteras; las automáticas, recortadas', () => {
  const long = 'x'.repeat(5000);
  const [auto, method] = worklog(`2026-10-22 20:25:00.000 - ANA - [RESOLUCION] ${long} | 2026-10-22 20:24:00.000 - REMEDY - ${long}`);
  assert.deepEqual([auto.text.length, method.text.length], [1000, 5000 + '[RESOLUCION] '.length]);
});
