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

test('histórico en SIA: cogidas por semana y origen, sin las devueltas ni las traspasadas a otro; las recibidas cuentan pero no en «a tiempo»', () => {
  const NOW = new Date('2026-10-06T12:00:00');
  const issues = new Map([
    ['INC1', { sisu: true, priority: 'HIGH', reported: '2026-10-06 09:00' }],
    ['INC2', { sisu: false, priority: 'CRITICAL', reported: '2026-10-06 09:00' }],
    ['INC3', { sisu: false, priority: 'MEDIUM', reported: '2026-09-01 09:00' }],
    ['INC5', { sisu: true, priority: 'CRITICAL', reported: '2026-10-05 09:00' }],
    ['INC6', { sisu: false, priority: 'HIGH', reported: '2026-10-06 09:00' }],
  ]);
  const ev = (issue_id, action, at) => ({ issue_id, action, happened_at: new Date(at).toISOString() });
  const h = history([
    ev('INC1', 'claimed', '2026-10-06T10:00:00'),
    ev('INC2', 'claimed', '2026-10-06T10:00:00'),
    ev('INC3', 'claimed', '2026-09-30T10:00:00'),
    ev('INC4', 'claimed', '2026-10-06T11:00:00'),
    ev('INC4', 'released', '2026-10-06T11:05:00'),
    ev('INC5', 'received', '2026-10-06T11:10:00'),   // me la traspasaron: mía, pero tarde no es culpa mía
    ev('INC6', 'claimed', '2026-10-06T11:20:00'),
    ev('INC6', 'handed', '2026-10-06T11:30:00'),     // la traspasé: ya no cuenta
  ], issues, NOW, 3);
  assert.deepEqual(h.weeks, [{ week: '2026-09-21', sga: 0, sisu: 0 }, { week: '2026-09-28', sga: 1, sisu: 0 }, { week: '2026-10-05', sga: 1, sisu: 2 }]);
  assert.equal(h.claimedToday, 3);
  assert.equal(h.perWeek, 1.3);
  assert.equal(h.onTimePct, 50);
});

test('sin uso aún: vacío', () => {
  const h = history([], new Map(), new Date('2026-10-06T12:00:00'));
  assert.equal(h.weeks.length, 12);
  assert.equal(h.perWeek, 0);
  assert.equal(h.onTimePct, null);
});
