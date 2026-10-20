import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { monthSeries, lineScale, dayScale, scorecardOrder, shownRows, heatCounts, matrixCounts, groupMax, LINE_MIN } from './plot.js';

const BOX = { W: 100, H: 50, L: 10, R: 10, T: 5, B: 5 };

test('las series por mes: un mes con menos de 10 issues no se pinta', () => {
  const m = createModel(data()); m.refilter();
  assert.deepEqual(monthSeries(m, m.rows(), (s) => s.n, [0]), [[null, null, null]]);
  assert.equal(LINE_MIN, 10);
});

test('la escala de una gráfica: el máximo con un 10 % de aire, los puntos repartidos y el eje al revés', () => {
  const { max, x, y } = lineScale([2, null, 8], 3, BOX);
  assert.ok(Math.abs(max - 8.8) < 1e-9);
  assert.deepEqual([x(0), x(3)], [10, 90]);
  assert.deepEqual([y(0), y(max)], [45, 5]);
  assert.equal(lineScale([null], 1, BOX).max, 1e-9 * 1.1);
});

test('la escala del día: cada hora en el centro de su franja y las franjas de los turnos', () => {
  const { max, x, edge, band } = dayScale([{ v: [0, 5] }, { v: [1, 0] }], BOX);
  assert.ok(Math.abs(max - 5.5) < 1e-9);
  assert.ok(Math.abs(x(0) - (10 + 0.5 * 80 / 24)) < 1e-9);
  assert.deepEqual([edge(0), edge(24)], [10, 90]);
  assert.deepEqual(band(0, 12), { x: 10, width: 40 });
});

test('el orden de una ficha: lo que tiene pocas issues va al final al ordenar por cómo se atiende', () => {
  const rows = [{ k: 'a', n: 50, v: 1 }, { k: 'b', n: 5, v: 9 }, { k: 'c', n: 50, v: 3 }, { k: 'd', n: 50, v: 3 }];
  const by = (dir, rated) => [...rows].sort(scorecardOrder((r) => r.v, dir, rated)).map((r) => r.k);
  assert.deepEqual(by(-1, true), ['c', 'd', 'a', 'b']);   // b, con 5 issues, al final aunque tenga el valor más alto
  assert.deepEqual(by(-1, false), ['b', 'c', 'd', 'a']);  // el volumen no es «cómo se atiende»: cuenta
  assert.deepEqual(by(1, true), ['a', 'c', 'd', 'b']);
});

test('las filas que se ven: las marcadas primero y siempre; «Resto», las de fuera; abierta, todas', () => {
  const rows = ['a', 'b', 'c', 'd'].map((k) => ({ k }));
  assert.deepEqual(shownRows(rows, () => false, 2, false), { shown: rows.slice(0, 2), any: false, rest: rows.slice(2), more: true });
  const s = shownRows(rows, (r) => r.k === 'd', 2, false);
  assert.deepEqual([s.shown.map((r) => r.k), s.any, s.rest.map((r) => r.k)], [['d', 'a'], true, ['b', 'c']]);
  assert.deepEqual(shownRows(rows, () => false, 2, true), { shown: rows, any: false, rest: [], more: true });
  assert.equal(shownRows(rows, () => false, 9, false).more, false);
});

test('los recuentos de un mapa de calor, por lado, y su máximo', () => {
  const R = [{ k: 1 }, { k: 2 }], Cc = [{ k: 'x' }], SIDE = [0, 1, 0];
  const keysR = (i) => [[1], [1, 2], [3]][i], keysC = () => ['x'];
  const { mt, max } = heatCounts(R, Cc, [0, 1, 2], keysR, keysC, SIDE);
  assert.deepEqual(mt, [[[1, 1, 0]], [[0, 1, 0]]]);
  assert.equal(max, 2);
});

test('los recuentos de una tabla de condiciones y el máximo de cada bloque', () => {
  const even = { label: 'pares', test: (i) => i % 2 === 0 }, big = { label: 'grandes', test: (i) => i > 2 }, all = { label: 'todas', test: () => true };
  const rowsDef = [{ head: 'A' }, even, big, { head: 'B' }, all];
  const rows = rowsDef.filter((r) => !r.head);
  const { cnt, rt } = matrixCounts(rows, [{ test: (i) => i < 2 }], [0, 1, 2, 3, 4], [0, 0, 0, 1, 1]);
  assert.deepEqual(rt, [[2, 1, 0], [0, 2, 0], [3, 2, 0]]);
  assert.deepEqual(cnt.map((c) => c[0]), [[1, 0, 0], [0, 0, 0], [2, 0, 0]]);
  const gm = groupMax(rowsDef, cnt, (r) => rows.indexOf(r));
  assert.deepEqual([gm.get(even), gm.get(big), gm.get(all)], [1, 1, 2]);
  assert.deepEqual([...groupMax([even, all], cnt, (r) => rows.indexOf(r)).values()], [2, 2]);   // sin cabeceras, un solo bloque
  assert.equal(groupMax([{ head: 'vacío' }, { head: 'B' }, all], cnt, (r) => rows.indexOf(r)).get(all), 2);   // un bloque sin filas no estorba
});
