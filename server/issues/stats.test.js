import test from 'node:test';
import assert from 'node:assert/strict';
import { today, history, weekOf } from './stats.js';

test('hoy: resueltas del día por origen', () => {
  const desk = [
    { status: 'RESOLVED', resolved: '2026-10-04 10:00', sisu: true },
    { status: 'RESOLVED', resolved: '2026-10-04 09:00', sisu: false },
    { status: 'RESOLVED', resolved: '2026-10-03 09:00', sisu: false },
    { status: 'PENDING', resolved: '', sisu: false },
  ];
  assert.deepEqual(today(desk, '2026-10-04'), { resolved: 2, sga: 1, sisu: 1 });
});

test('semana: su lunes', () => {
  assert.equal(weekOf(new Date('2026-10-06T10:00:00')), '2026-10-05');
  assert.equal(weekOf(new Date('2026-10-04T10:00:00')), '2026-09-28');
});

test('histórico en SIA: cogidas por semana y origen, sin las devueltas', () => {
  const NOW = new Date('2026-10-06T12:00:00');
  const issues = new Map([
    ['INC1', { sisu: true, priority: 'HIGH', reported: '2026-10-06 09:00' }],
    ['INC2', { sisu: false, priority: 'CRITICAL', reported: '2026-10-06 09:00' }],
    ['INC3', { sisu: false, priority: 'MEDIUM', reported: '2026-09-01 09:00' }],
  ]);
  const ev = (issue_id, action, at) => ({ issue_id, action, happened_at: new Date(at).toISOString() });
  const h = history([
    ev('INC1', 'issue.claimed', '2026-10-06T10:00:00'),
    ev('INC2', 'issue.claimed', '2026-10-06T10:00:00'),
    ev('INC3', 'issue.claimed', '2026-09-30T10:00:00'),
    ev('INC4', 'issue.claimed', '2026-10-06T11:00:00'),
    ev('INC4', 'issue.released', '2026-10-06T11:05:00'),
  ], issues, NOW, 3);
  assert.deepEqual(h.weeks, [{ week: '2026-09-21', sga: 0, sisu: 0 }, { week: '2026-09-28', sga: 1, sisu: 0 }, { week: '2026-10-05', sga: 1, sisu: 1 }]);
  assert.equal(h.claimedToday, 2);
  assert.equal(h.perWeek, 1);
  assert.equal(h.onTimePct, 50);
});

test('sin uso aún: vacío', () => {
  const h = history([], new Map(), new Date('2026-10-06T12:00:00'));
  assert.equal(h.weeks.length, 12);
  assert.equal(h.perWeek, 0);
  assert.equal(h.onTimePct, null);
});
