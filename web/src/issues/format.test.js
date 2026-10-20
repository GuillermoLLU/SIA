import test from 'node:test';
import assert from 'node:assert/strict';
import { LISTS, when, age, stamp, duration, since, weekBars } from './format.js';

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
