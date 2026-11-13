import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { whoHas } from './today.js';

const model = (d = data()) => { const m = createModel(d); m.refilter(); return m; };

test('quién tiene qué: lo abierto de cada persona en sus columnas, con su total y lo que lleva parado', () => {
  const d = data(); d.cols.lm = [1100, 5000, 99900, 5100, 6001];
  const t = whoHas(model(d));
  assert.deepEqual(t.op, [2]);
  assert.equal(t.cols.length, 11);
  assert.deepEqual(t.who, [{ k: 1, v: [1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0] }]);
  assert.deepEqual(t.tot, [1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
});

test('sin el último cambio de cada incidencia (datos viejos), sin la columna de lo parado', () => {
  assert.equal(whoHas(model()).cols.length, 10);
});

test('lo de ahora no mira el periodo', () => {
  const m = model(); m.setPeriod(m.minuteOf(1), m.minuteOf(2)); m.refilter();   // febrero, sin nada
  assert.deepEqual(whoHas(m).op, [2]);
});
