import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { situations, late, isOld, orphansIn, watchList, pendingCells, backlogFigures, backlogByDay, trendOf, flowByDay, flowByShift } from './backlog.js';

const model = (d = data(), sides) => { const m = createModel(d); if (sides) m.S.sides = sides; m.refilter(); return m; };

test('fuera de plazo y con más de 15 días, incidencia a incidencia', () => {
  const m = model();
  assert.deepEqual([0, 2, 3].map(late(m)), [false, true, false]);   // la 3: abierta, sin empezar y con 200 min > 2 h
  assert.deepEqual([0, 2].map(isOld(m)), [true, false]);
});

test('lo pendiente: su situación, lo que conviene vigilar y lo que no tiene a nadie', () => {
  const m = model();
  const op = m.rows().filter((i) => m.OPEN[i]);
  assert.deepEqual(op, [2]);
  assert.deepEqual(situations(m).map((x) => op.filter(x.test).length), [0, 1, 0, 0, 0, 0]);   // sin tocar
  assert.deepEqual(watchList(m).map(([l, t]) => [l, op.filter(t).length]), [['Fuera de plazo', 1], ['Sin tocar', 1], ['Con más de 15 días', 0], ['Escaladas', 0], ['Mal escaladas', 0], ['Reabiertas', 0], ['Críticas', 0], ['PRIO', 0]]);
  // una pendiente con algún Jira descartado o que pasó de un equipo a otro: mal escalada, y filtra por esa marca
  const d3 = data(); d3.cols.fl[2] |= 2097152;
  const m3 = model(d3), op3 = m3.rows().filter((i) => m3.OPEN[i]), mis = watchList(m3).find(([l]) => l === 'Mal escaladas');
  assert.deepEqual([op3.filter(mis[1]).length, mis[3], m3.DIMS.mx.get(2)], [1, 'mx:1', 1]);
  // una pendiente que volvió de Resuelta a abierta cuenta en Reabiertas y filtra por esa marca de calidad
  const d2 = data(); d2.cols.fl[2] |= 512;
  const m2 = model(d2), op2 = m2.rows().filter((i) => m2.OPEN[i]), reop = watchList(m2).find(([l]) => l === 'Reabiertas');
  assert.deepEqual([op2.filter(reop[1]).length, reop[3]], [1, 'q:0']);
  assert.equal(m2.DIMS.q.label(0), 'Reabierta');
  assert.deepEqual(orphansIn(m), []);
  const d = data(); d.cols.st[4] = 2; d.cols.sc[4] = 1;   // la 5, abierta en SGA y sin nadie
  assert.deepEqual(orphansIn(model(d)), [4]);
});

test('comparando: el lado con menos antigüedad va mejor; iguales al redondear, ninguno', () => {
  const d = data(); d.cols.st[1] = 2;   // la 2 (T-Systems), abierta desde enero
  const m = model(d, [{ company: 0 }, { company: 1 }]), op = m.rows().filter((i) => m.OPEN[i]);
  const { v, main, old } = pendingCells(m, m.bySide(op), [1, 1], false, { test: () => true, better: 'low' });
  assert.equal(v[0].age, 200);   // en minutos (la vista la enseña en horas)
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

test('el backlog al acabar cada día: abierta desde que entra hasta que se resuelve; cancelada sin resolver, hasta su último cambio', () => {
  const d = data();
  // la 1 (crítica) entra el día 0 y se resuelve el 1; la 3 (media) sigue abierta desde el 69; la 4 (baja) entra el 3 y se resuelve el 3
  Object.assign(d.cols, { rep: [100, 2000, 99800, 3 * 1440 + 10, 6000], res: [1440 + 5, 5000, -1, 3 * 1440 + 20, 6001] });
  const m = model(d), all = [0, 2, 3];
  assert.deepEqual(backlogByDay(m, all, 0, 4), [1, 0, 0, 0]);   // la 4 entra y sale el mismo día: no queda al acabarlo
  assert.deepEqual(backlogByDay(m, all, 68 * 1440, 2), [0, 1]);  // la 3, desde su día
  d.cols.st[0] = 1; d.cols.res[0] = -1; d.cols.lm = [2 * 1440 + 1, -1, -1, -1, -1];   // la 1, cancelada (cerrada sin resolver) el día 2
  assert.deepEqual(backlogByDay(model(d), [0], 0, 4), [1, 1, 0, 0]);
});


test('SISU o SGA por el módulo: los de la lista del equipo son SISU; el resto, SGA', () => {
  const m = model();
  // EWMS (1) es de SGA; PACKING (2), de SISU
  assert.deepEqual([0, 1].map((i) => m.DIMS.ss.label(m.DIMS.ss.get(i))), ['SGA', 'SISU']);
});

test('la línea de tendencia: mínimos cuadrados, el valor en el primer punto y cuánto cambia por punto', () => {
  assert.deepEqual(trendOf([10, 8, 6, 4]), { a: 10, b: -2 });
  const { a, b } = trendOf([5, 7, 5, 7]);
  assert.ok(Math.abs(a - 5.4) < 1e-9 && Math.abs(b - 0.4) < 1e-9);   // media 6 en x = 1,5: 6 − 0,4 × 1,5
  assert.deepEqual(trendOf([3]), { a: 3, b: 0 });
  assert.deepEqual(trendOf([]), { a: 0, b: 0 });
});

test('entrantes frente a atendidas, por día: lo que entra y, de eso, lo atendido el mismo día (resuelta, a proveedor, a cliente)', () => {
  const d = data();
  Object.assign(d.cols, { eV: [[], [1], [], [], []], eC: [[], [2], [], [], []] });   // la 2 pasa a proveedor el día 1 y a cliente el 2
  const m = model(d);
  // entran: la 1 el día 0, la 2 el 1, la 4 el 3 y la 5 el 4; la 1, la 4 y la 5 se resuelven el día que entran; la 2, no
  // (el 3), pero pasa a proveedor el día que entra (el 1); que luego pase a cliente (el 2) no cuenta: no es su día
  assert.deepEqual(flowByDay(m, [0, 1, 3, 4], 0, 5), { inc: [1, 1, 0, 1, 1], res: [1, 0, 0, 1, 1], ven: [0, 1, 0, 0, 0], cli: [0, 0, 0, 0, 0], bkl: [0, 0, 1, 1, 0] });
  // del backlog: la 2, que entró el 1, pasa a cliente el 2 y se resuelve el 3 (los demás eventos son del día en que entraron)
  // fuera de los días que se piden, no cuenta
  assert.deepEqual(flowByDay(m, [0, 1], 2 * 1440, 2), { inc: [0, 0], res: [0, 0], ven: [0, 0], cli: [0, 0], bkl: [1, 1] });
  // resuelta y a proveedor el mismo día: una vez, como resuelta; lo atendido nunca pasa de lo que entra
  d.cols.eV[0] = [0]; d.cols.eC[0] = [0];
  assert.deepEqual(flowByDay(model(d), [0], 0, 1), { inc: [1], res: [1], ven: [0], cli: [0], bkl: [0] });
});

test('lo atendido del backlog, solo de los tipos que se miran', () => {
  const d = data();
  Object.assign(d.cols, { eV: [[], [1], [], [], []], eC: [[], [2], [], [], []] });   // la 2 (entra el 1): cliente el 2, resuelta el 3
  const m = model(d);
  assert.deepEqual(flowByDay(m, [1], 0, 5, ['res']).bkl, [0, 0, 0, 1, 0]);
  assert.deepEqual(flowByDay(m, [1], 0, 5, ['cli']).bkl, [0, 0, 1, 0, 0]);
  assert.deepEqual(flowByDay(m, [1], 0, 5, []).bkl, [0, 0, 0, 0, 0]);
});

test('por turno: lo que entra en cada turno y, de eso, lo atendido en el mismo turno; la noche, del día en que empieza', () => {
  const d = data();
  // abiertas: la 0 a las 16:40 del día 0 (tarde), la 1 a las 9:20 del 1 y la 3 a las 11:20 del 3 (mañana), la 4 a las
  // 4:00 del 4 (la noche que empieza el día 3 a las 23:00)
  d.cols.sR[3] = [9];    // resuelta en su turno (el 9: la mañana del día 3)
  d.cols.sV[1] = [3];    // a proveedor en su turno
  d.cols.sR[4] = [12];   // resuelta, pero en el turno siguiente
  const m = model(d), L = [0, 1, 3, 4];
  assert.deepEqual(flowByShift(m, L, 0, 5, [0]), { inc: [0, 1, 0, 1, 0], res: [0, 0, 0, 1, 0], ven: [0, 1, 0, 0, 0], cli: [0, 0, 0, 0, 0], bkl: [0, 0, 0, 0, 0] });
  assert.deepEqual(flowByShift(m, L, 0, 5, [1]).inc, [1, 0, 0, 0, 0]);
  assert.deepEqual(flowByShift(m, L, 0, 5, [2]), { inc: [0, 0, 0, 1, 0], res: [0, 0, 0, 0, 0], ven: [0, 0, 0, 0, 0], cli: [0, 0, 0, 0, 0], bkl: [0, 0, 0, 0, 0] });
});

test('por turno, varios juntos: se suman', () => {
  const d = data();
  d.cols.sR[3] = [9];
  const f = flowByShift(model(d), [0, 1, 3, 4], 0, 5, [0, 2]);
  assert.deepEqual([f.inc, f.res], [[0, 1, 0, 2, 0], [0, 0, 0, 1, 0]]);
});
