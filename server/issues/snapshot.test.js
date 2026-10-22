import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshot, REQUIRED } from './snapshot.js';

const row = (id, status, group, reported, modified, resolved = '') =>
  Object.fromEntries(REQUIRED.map((c) => [c, { INCIDENTNUMBER: id, STATUS: status, ASSIGNEDGROUP: group, REPORTEDDATE: reported, LASTMODIFIEDDATE: modified, LASTRESOLUTIONDATE: resolved, PRIORITY: 'LOW' }[c] || '']));
const NOW = () => new Date('2026-10-22T09:00:00');

test('cuentan las abiertas del grupo y las resueltas o cerradas en la semana anterior a la foto', () => {
  const s = createSnapshot({ now: NOW });
  [row('INC1', 'ASSIGNED', 'AYS SOPORTE', '2026-10-20 09:00:00', '2026-10-20 09:00:00'),
    row('INC2', 'PENDING', 'AYS SOPORTE', '2026-09-01 08:00:00', '2026-10-21 13:10:00'),
    row('INC3', 'RESOLVED', 'AYS SOPORTE', '2026-10-15 08:00:00', '2026-10-16 08:00:00', '2026-10-16 08:00:00'),
    row('INC4', 'CLOSED', 'AYS SOPORTE', '2026-10-01 08:00:00', '2026-10-02 08:00:00', '2026-10-02 08:00:00'),
    row('INC5', 'CANCELLED', 'AYS SOPORTE', '2026-10-20 08:00:00', '2026-10-20 08:00:00', '2026-10-20 08:00:00'),
    row('INC6', 'ASSIGNED', ' AYS SOPORTE ', '2026-10-19 08:00:00', '2026-10-19 08:00:00'),
    row('INC7', 'ASSIGNED', 'OTRO GRUPO', '2026-10-21 10:00:00', '2026-10-21 10:00:00')].forEach(s.add);
  const { taken, issues } = s.build();
  assert.equal(taken, new Date('2026-10-21T13:10:00').toISOString());
  assert.deepEqual(issues.map((i) => i.id), ['INC1', 'INC2', 'INC3', 'INC6']);
});

test('la hora de la foto es la del dato más reciente, también si es una resolución', () => {
  const s = createSnapshot({ now: NOW });
  s.add(row('INC1', 'ASSIGNED', 'AYS SOPORTE', '2026-10-20 09:00:00', '2026-10-20 09:00:00'));
  s.add(row('INC2', 'RESOLVED', 'AYS SOPORTE', '2026-10-20 08:00:00', '2026-10-20 08:00:00', '2026-10-21 18:30:00'));
  assert.equal(s.build().taken, new Date('2026-10-21T18:30:00').toISOString());
});

test('sin las columnas de la consulta, o sin issues del grupo: error con estado 400', () => {
  assert.throws(() => createSnapshot({ now: NOW }).add({ A: '1' }), (e) => e.status === 400 && /le falta INCIDENTNUMBER/.test(e.message));
  const s = createSnapshot({ now: NOW });
  s.add(row('INC1', 'ASSIGNED', 'OTRO', '2026-10-20 09:00:00', '2026-10-20 09:00:00'));
  assert.throws(() => s.build(), (e) => e.status === 400 && /grupo AYS SOPORTE/.test(e.message));
});
