import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { situations, late, isOld, orphansIn, watchList, pendingCells, backlogFigures } from './backlog.js';

const model = (d = data(), sides) => { const m = createModel(d); if (sides) m.S.sides = sides; m.refilter(); return m; };

test('fuera de plazo y con más de 15 días, issue a issue', () => {
  const m = model();
  assert.deepEqual([0, 2, 3].map(late(m)), [false, true, false]);   // la 3: abierta, sin empezar y con 200 min > 2 h
  assert.deepEqual([0, 2].map(isOld(m)), [true, false]);
});

test('lo pendiente: su situación, lo que conviene vigilar y lo que no tiene a nadie', () => {
  const m = model();
  const op = m.rows().filter((i) => m.OPEN[i]);
  assert.deepEqual(op, [2]);
  assert.deepEqual(situations(m).map((x) => op.filter(x.test).length), [0, 1, 0, 0, 0, 0]);   // sin tocar
  assert.deepEqual(watchList(m).map(([l, t]) => [l, op.filter(t).length]), [['Fuera de plazo', 1], ['Con más de 15 días', 0], ['Escaladas', 0], ['Críticas', 0], ['PRIO', 0]]);
  assert.deepEqual(orphansIn(m), []);
  const d = data(); d.cols.st[4] = 2; d.cols.sc[4] = 1;   // la 5, abierta en SGA y sin nadie
  assert.deepEqual(orphansIn(model(d)), [4]);
});

test('comparando: el lado con menos antigüedad va mejor; iguales al redondear, ninguno', () => {
  const d = data(); d.cols.st[1] = 2;   // la 2 (T-Systems), abierta desde enero
  const m = model(d, [{ company: 0 }, { company: 1 }]), op = m.rows().filter((i) => m.OPEN[i]);
  const { v, main, old } = pendingCells(m, m.bySide(op), [1, 1], false, { test: () => true, better: 'low' });
  assert.ok(Math.abs(v[0].age - 200 / 1440) < 1e-9);
  assert.deepEqual([main, old], [-1, 0]);   // el 100 % en los dos (iguales); en antigüedad, Indra
});

test('comparando: las celdas de una fila de lo pendiente y las cifras de arriba', () => {
  const m = model(data(), [{ company: 0 }, { company: 1 }]), A = m.rows(), T = m.bySide(A), op = A.filter((i) => m.OPEN[i]);
  const { v, main, old } = pendingCells(m, m.bySide(op), [1, 1], false, { test: late(m), better: 'low' });
  assert.deepEqual([v[0].c, v[0].sh, v[1].c, v[1].sh, v[1].age], [1, 1, 0, null, null]);
  assert.deepEqual([main, old], [-1, -1]);   // al otro lado no le queda nada: sin con qué comparar
  const P = T.map((l) => l.filter((i) => m.OPEN[i]));
  const { part, age, stock } = backlogFigures(m, T, P, [1, 1], false, 10);
  assert.deepEqual(part(late(m)), [{ n: 1, v: 1 }, { n: 0, v: null }]);
  assert.deepEqual(age.map((x) => x.n), [1, 0]);
  assert.deepEqual(stock, [{ n: 3, v: 1 / (3 / 10) }, { n: 1, v: 0 }]);   // días de entrada acumulados
});
