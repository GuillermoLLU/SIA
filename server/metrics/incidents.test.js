import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, auditEvents, worklogEntries } from './incidents.js';

const inc = (o = {}) => ({ INCIDENTNUMBER: 'INC1', STATUS: 'ASSIGNED', LASTMODIFIEDDATE: '2026-03-01 10:00:00', ...o });

test('una incidencia nueva se da de alta', () => {
  assert.equal(decide(undefined, inc()), 'insert');
});

test('el CSV más reciente actualiza; el más antiguo no toca lo guardado', () => {
  assert.equal(decide(inc(), inc({ STATUS: 'CLOSED', LASTMODIFIEDDATE: '2026-03-02 09:00:00' })), 'update');
  assert.equal(decide(inc(), inc({ STATUS: 'CLOSED', LASTMODIFIEDDATE: '2026-02-28 09:00:00' })), 'keep');
});

test('misma fecha: se compara todo el contenido', () => {
  assert.equal(decide(inc(), inc()), 'same');
  assert.equal(decide(inc(), inc({ STATUS: 'CLOSED' })), 'update');
  assert.equal(decide(inc({ NUEVA: null }), inc({ NUEVA: '' })), 'same');
});

test('sin fecha de modificación es la más antigua', () => {
  assert.equal(decide(inc({ LASTMODIFIEDDATE: '' }), inc()), 'update');
  assert.equal(decide(inc(), inc({ LASTMODIFIEDDATE: '' })), 'keep');
});

test('AUDIT_DETAIL: fecha, quién, campo, antes y después', () => {
  const text = '2026-03-01 10:00:00.000 - ana - Status: ASSIGNED → IN_PROGRESS | 2026-03-01 11:00:00.000 - luis - Nota sin cambio de campo';
  assert.deepEqual(auditEvents(text), [
    { at: '2026-03-01 10:00:00.000', who: 'ana', field: 'Status', before: 'ASSIGNED', after: 'IN_PROGRESS' },
    { at: '2026-03-01 11:00:00.000', who: 'luis', field: '', before: '', after: 'Nota sin cambio de campo' },
  ]);
  assert.deepEqual(auditEvents(''), []);
});

test('WORKLOG_DETAIL: fecha, quién y comentario', () => {
  assert.deepEqual(worklogEntries('2026-03-01 10:00:00.000 - ana - Revisado | 2026-03-01 12:00:00.000 - luis - Resuelto'), [
    { at: '2026-03-01 10:00:00.000', who: 'ana', text: 'Revisado' },
    { at: '2026-03-01 12:00:00.000', who: 'luis', text: 'Resuelto' },
  ]);
});
