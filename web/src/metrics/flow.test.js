import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { closedInPeriod, ledger, monthVsPrev } from './flow.js';

// el periodo en minutos desde el 1 de enero de 2026: de un día (mes, día) a otro
const at = (mo, d) => (Date.UTC(2026, mo, d) - Date.UTC(2026, 0, 1)) / 6e4;
const model = (period) => { const m = createModel(data()); if (period) m.setPeriod(...period); m.refilter(); return m; };
const JAN = [at(0, 1), at(1, 1)], MAR = [at(2, 1), at(3, 1)];

const units = (m) => ledger(m, m.rows()).units.filter((u) => !u.after);

test('los tramos: los meses del periodo o, si es de un mes o menos, sus días; el mes en curso, hasta la foto', () => {
  assert.deepEqual(units(model()).map((u) => u.label), ['ene', 'feb', 'mar*']);
  assert.equal(units(model(JAN)).length, 31);
  assert.equal(units(model(MAR)).length, 11);   // la foto es el 11 de marzo
});

test('un periodo que no es de meses enteros: el primer y el último mes, solo lo que cae dentro; hasta un mes, por días', () => {
  const m = model([at(0, 15), at(2, 5)]), u = units(m);
  assert.deepEqual(u.map((x) => x.label), ['ene', 'feb', 'mar*']);
  assert.deepEqual([u[0].from, u[2].to], [at(0, 15), at(2, 5)]);
  const days = units(model([at(0, 15), at(1, 10)]));   // del 15 de enero al 9 de febrero
  assert.equal(days.length, 26);
  assert.deepEqual([days[0].label, days[17].label], ['15 ene', '1 feb']);
});

test('el libro mayor cuadra: lo recibido cada mes, qué ha sido de ello y lo que quedaba abierto al cierre', () => {
  const { units, per, day } = ledger(model(), model().rows());
  assert.equal(day, false);
  assert.deepEqual(units.map((u) => u.f), ['month:0', 'month:1', 'month:2']);
  const [ene, feb, mar, tot] = per[0];
  assert.deepEqual(ene, { in: 2, closed: 2, still: 0, same: 2, out: 2, prev: 0, open: 0, old: 0 });
  assert.deepEqual(feb, { in: 0, closed: 0, still: 0, same: 0, out: 0, prev: 0, open: 0, old: 0 });
  assert.deepEqual(mar, { in: 1, closed: 0, still: 1, same: 0, out: 0, prev: 0, open: 1, old: 0 });
  assert.deepEqual(tot, { in: 3, closed: 2, still: 1, same: 2, out: 2, prev: 0, open: 1, old: 0 });
  assert.ok(per[1].every((x) => x.in === 0));   // sin segundo lado
});

test('si el periodo acaba antes de la foto, un tramo más hasta hoy; con un mes, día a día', () => {
  const m = model(JAN), { units, per, day } = ledger(m, m.rows());
  assert.equal(day, true);
  assert.equal(units.length, 32);
  assert.equal(units[31].after, true);
  assert.deepEqual([per[0][32].out, per[0][32].open], [2, 0]);   // las dos de enero, resueltas; nada de enero sigue abierto
});

test('lo cerrado dentro del periodo, se abriera cuando se abriera, y el último mes completo frente al anterior', () => {
  const m = model();
  assert.deepEqual(closedInPeriod(m)[0], [0, 3]);
  assert.deepEqual(closedInPeriod(model(MAR))[0], []);
  const [month, sides] = monthVsPrev(m);
  assert.equal(month, 1);   // febrero (marzo está a medias)
  assert.deepEqual(sides[0], { n: 2, v: -1 });
  assert.equal(monthVsPrev(model(MAR)), null);
  assert.equal(monthVsPrev(model([at(1, 1), at(1, 15)])), null);   // media quincena: ningún mes entero
});
