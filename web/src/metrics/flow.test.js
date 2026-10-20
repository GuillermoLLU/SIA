import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { flowUnits, closedInPeriod, ledger, monthVsPrev } from './flow.js';

const model = (o = {}) => { const m = createModel(data()); Object.assign(m.S, o); m.refilter(); return m; };

test('los tramos: los meses del periodo o, con un solo mes, sus días; el mes en curso, hasta la foto', () => {
  assert.deepEqual(flowUnits(model()).map((u) => u.label), ['ene', 'feb', 'mar*']);
  assert.equal(flowUnits(model({ from: 0, to: 0 })).length, 31);
  assert.equal(flowUnits(model({ from: 2, to: 2 })).length, 11);   // la foto es el 11 de marzo
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
  const m = model({ from: 0, to: 0 }), { units, per, day } = ledger(m, m.rows());
  assert.equal(day, true);
  assert.equal(units.length, 32);
  assert.equal(units[31].after, true);
  assert.deepEqual([per[0][32].out, per[0][32].open], [2, 0]);   // las dos de enero, resueltas; nada de enero sigue abierto
});

test('lo cerrado dentro del periodo, se abriera cuando se abriera, y el último mes completo frente al anterior', () => {
  const m = model();
  assert.deepEqual(closedInPeriod(m)[0], [0, 3]);
  assert.deepEqual(closedInPeriod(model({ from: 2, to: 2 }))[0], []);
  const [month, sides] = monthVsPrev(m);
  assert.equal(month, 1);   // febrero (marzo está a medias)
  assert.deepEqual(sides[0], { n: 2, v: -1 });
  assert.equal(monthVsPrev(model({ from: 2, to: 2 })), null);
});
