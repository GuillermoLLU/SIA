import test from 'node:test';
import assert from 'node:assert/strict';
import { LISTS, when, whenIso, whenLabel, newestFirst, snapshotInfo, age, stamp, duration, since, weekBars } from './format.js';

const NOW = new Date('2026-10-04T11:44:00');

test('listas de la mesa por estado', () => {
  const tab = (status) => LISTS.find((t) => t.test({ status }))?.key;
  assert.equal(tab('ASSIGNED'), 'doing');
  assert.equal(tab('IN_PROGRESS'), 'doing');
  assert.equal(tab('PENDING'), 'waiting');
  assert.equal(tab('RESOLVED'), 'resolved');
});

test('fechas y antigüedad', () => {
  assert.equal(stamp(NOW), '2026-10-04 11:44');
  assert.equal(when('2026-10-04 11:44'), '04/10 11:44');
  assert.equal(when(''), '—');
  assert.equal(age('2026-10-04 11:14', NOW), '30 min');
  assert.equal(age('2026-10-04 08:44', NOW), '3 h');
  assert.equal(age('2026-10-01 11:44', NOW), '3 d');
  assert.equal(duration(-5), '0 min');
});

test('seguimiento: lo que más tiempo lleva sin moverse, arriba', () => {
  const w = LISTS.find((l) => l.key === 'waiting');
  const list = [{ id: 'a', modified: '2026-10-03 10:00' }, { id: 'b', modified: '2026-09-20 10:00' }];
  assert.deepEqual(list.sort(w.sort).map((i) => i.id), ['b', 'a']);
});

test('since: el tiempo que toca a cada lista', () => {
  const i = { reported: '2026-10-04 11:14', modified: '2026-10-04 08:44', resolved: '2026-10-04 11:00' };
  assert.equal(since(i, 'doing', NOW), 'hace 30 min');
  assert.equal(since(i, 'waiting', NOW), 'sin moverse 3 h');
  assert.equal(since(i, 'resolved', NOW), '04/10 11:00');
});

test('weekBars: alturas sobre el máximo, nunca por debajo de 5', () => {
  const [a, b] = weekBars([{ week: 'w1', sga: 2, sisu: 0 }, { week: 'w2', sga: 6, sisu: 4 }]);
  assert.deepEqual([a.total, a.sgaPct, a.sisuPct], [2, 20, 0]);
  assert.deepEqual([b.total, b.sgaPct, b.sisuPct], [10, 60, 40]);
  assert.equal(weekBars([{ week: 'w', sga: 1, sisu: 0 }])[0].sgaPct, 20);
});

test('una fecha ISO de la base sale en hora local con el formato de la mesa', () => {
  assert.equal(whenIso('2026-10-29T10:12:42+00:00'), when(stamp(new Date('2026-10-29T10:12:42+00:00'))));
  assert.match(whenIso('2026-10-29T10:12:42+00:00'), /^29\/10 \d\d:12$/);
});

test('la foto de Remedy: al día si es de hoy; si no, avisa', () => {
  const now = new Date('2026-10-29T12:00:00');
  assert.deepEqual(snapshotInfo('2026-10-29T09:30:00', now), { text: `Datos de Remedy del ${when(stamp(new Date('2026-10-29T09:30:00')))}`, stale: false });
  assert.equal(snapshotInfo('2026-10-21T10:09:00', now).stale, true);
  assert.equal(snapshotInfo('2026-10-28T23:59:00', now).stale, true);
});

test('cuándo, frente a hoy: HOY con la hora; otro día, la fecha; otro año, con el año; también con fechas de Remedy', () => {
  const now = new Date('2026-10-29T12:00:00');
  assert.equal(whenLabel('2026-10-29T01:05:00', now), 'HOY 01:05');
  assert.equal(whenLabel('2026-10-28T23:30:00', now), '28/10 23:30');
  assert.equal(whenLabel('2026-10-06T10:05:00', now), '06/10 10:05');
  assert.equal(whenLabel('2025-12-31T10:05:00', now), '31/12/2025 10:05');
  assert.equal(whenLabel('2026-10-29 09:10', now), 'HOY 09:10');
  assert.equal(whenLabel('', now), '—');
  assert.equal(whenLabel('no es fecha', now), '—');
  const l = [1, 2, 3];
  assert.deepEqual(newestFirst(l), [3, 2, 1]);
  assert.deepEqual(l, [1, 2, 3]);
});
