import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { perShiftType, byHour, carryRows, clockMatrix } from './turns.js';

const model = () => { const m = createModel(data()); m.refilter(); return m; };
// la 1 entra el jueves 1 de enero a las 16:40 (tarde); la 3, el miércoles 11 de marzo a las 7:20 (mañana);
// la 4, el domingo 4 de enero a las 11:20 (mañana de fin de semana)

test('por tipo de turno: lo que entra en cada uno y cuántas por turno', () => {
  const m = model(), slots = m.periodSlots(), per = perShiftType(m, m.rows(), slots);
  assert.deepEqual(per.map((x) => x.n), [1, 1, 0, 1, 0, 0]);
  assert.equal(per[1].perTurn, 1 / slots[1]);
  assert.equal(per[2].perTurn, 0);
});

test('el día en 24 horas y el reloj semanal', () => {
  const m = model(), A = m.rows(), at = (i) => m.C.rep[i];
  const v = byHour(m, A, at);
  assert.deepEqual([v[16], v[7], v[11], v.reduce((a, b) => a + b, 0)], [1, 1, 1, 3]);
  const { hh, max } = clockMatrix(m, A, at);
  assert.deepEqual([hh[3][16], hh[2][7], hh[6][11], max], [1, 1, 1, 1]);
  assert.equal(clockMatrix(m, A, () => null).max, 1);
});

test('qué se queda para el turno siguiente: por turno, sumando laborables y fin de semana', () => {
  const m = model(), rows = carryRows(m, m.bySide(m.rows()), [0]);
  assert.deepEqual(rows, [{ label: 'Mañana', k: 0, f: 'tu:0', v: [0, 0, 0, 2] }, { label: 'Tarde', k: 0, f: 'tu:1', v: [1, 0, 0, 0] }, { label: 'Noche', k: 0, f: 'tu:2', v: [0, 0, 0, 0] }]);
});
