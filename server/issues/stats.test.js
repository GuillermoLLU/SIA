import test from 'node:test';
import assert from 'node:assert/strict';
import { deskStats, lastDays, median } from './stats.js';

const r = (reported, resolved, sisu = false) => ({ status: 'RESOLVED', reported, resolved, sisu });

test('últimos días, también al cruzar de mes', () => {
  assert.deepEqual(lastDays('2026-10-02', 4), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

test('mediana', () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('resueltas por día, hoy, semana y tiempo típico', () => {
  const desk = [
    r('2026-10-04 08:00', '2026-10-04 10:00', true),
    r('2026-10-03 08:00', '2026-10-03 09:00'),
    r('2026-09-20 08:00', '2026-09-20 11:00'),
    { status: 'PENDING', reported: '2026-10-01 08:00', resolved: '' },
  ];
  const s = deskStats(desk, [], '2026-10-04', { days: 3 });
  assert.equal(s.resolvedToday, 1);
  assert.equal(s.resolvedWeek, 2);
  assert.equal(s.medianResolutionMin, 120);
  assert.deepEqual(s.resolvedTodayBy, { sga: 0, sisu: 1 });
  assert.deepEqual(s.perDay.map(({ day, count, sga, sisu }) => [day, count, sga, sisu]), [['2026-10-02', 0, 0, 0], ['2026-10-03', 1, 1, 0], ['2026-10-04', 1, 0, 1]]);
  assert.equal(s.perDay[2].hours[10], 1);
  assert.equal(s.perDay[1].hours[9], 1);
  assert.equal(s.perDay[2].hours.reduce((a, b) => a + b), 1);
});

test('cogidas hoy en SIA (hora real, no la de la foto)', () => {
  const s = deskStats([], [{ claimed_at: new Date().toISOString() }, { claimed_at: '2020-01-01T10:00:00Z' }], '2026-10-04');
  assert.equal(s.claimedToday, 1);
  assert.equal(s.medianResolutionMin, null);
});
