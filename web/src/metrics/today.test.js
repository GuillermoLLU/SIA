import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { todayLists } from './today.js';

const model = (d = data()) => { const m = createModel(d); m.refilter(); return m; };

test('lo abierto hoy en listas para actuar y lo abierto de cada persona, con lo que lleva parado', () => {
  const d = data(); d.cols.lm = [1100, 5000, 99900, 5100, 6001];
  const t = todayLists(model(d));
  assert.deepEqual(t.op, [2]);
  assert.deepEqual([t.crit, t.prioList, t.lateList, t.vendor, t.client, t.staleList, t.orphan, t.all], [[], [], [2], [], [], [], [], [2]]);
  assert.equal(t.idle(2), 100);
  assert.deepEqual([t.late(2), t.stale(2), t.waits(2), t.one, t.people], [true, false, '', false, false]);
  assert.equal(t.cols.length, 11);
  assert.deepEqual(t.who, [{ k: 1, v: [1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0] }]);
  assert.deepEqual(t.tot, [1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
});

test('sin el último cambio de cada issue (datos viejos), no hay lista de paradas ni su columna', () => {
  const t = todayLists(model());
  assert.equal(t.lm, undefined);
  assert.equal(t.idle(2), null);
  assert.deepEqual(t.staleList, []);
  assert.equal(t.cols.length, 10);
});

test('la foto no mira el periodo, y lo sin asignar solo cuenta mirando al equipo', () => {
  const d = data(); d.cols.st[4] = 2; d.cols.sc[4] = 1;   // la 5, abierta en SGA y sin nadie
  const m = model(d); m.S.from = m.S.to = 1; m.refilter();   // febrero, sin nada
  assert.deepEqual(todayLists(m).op, [2]);
  assert.deepEqual(todayLists(m).orphan, [4]);
  m.S.sides = [{ people: new Set([1]) }, null]; m.refilter();
  assert.deepEqual(todayLists(m).orphan, []);
  assert.equal(todayLists(m).one, true);
});
