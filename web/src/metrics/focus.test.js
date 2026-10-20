import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { centreExtra, problemExtra, owners } from './focus.js';

test('la ficha de un centro: el módulo que más le falla y sus major incidents', () => {
  const d = data(); d.cols.fl[0] = 256;
  const m = createModel(d), st = {};
  centreExtra(m)(st, [0, 2, 3]);
  assert.deepEqual(st, { top: { label: 'EWMS', share: 2 / 3 }, mi: 1 });
  centreExtra(m)(st, []);
  assert.deepEqual(st, { top: null, mi: 0 });
});

test('la ficha de un problema: en cuántos centros pasa y si se cierra siempre igual (solo de un problema)', () => {
  const m = createModel(data()), st = {};
  problemExtra(m)(st, [0]);
  assert.deepEqual(st, { nce: 1, same: 1 });
  problemExtra(m)(st, [0, 3]);   // problemas distintos: no se mide; la 4 no tiene centro
  assert.deepEqual(st, { nce: 1, same: null });
});

test('quién lleva cada módulo: personas, cuántas suman el 80 % y las que más llevan', () => {
  const m = createModel(data()); m.refilter();
  assert.deepEqual(owners(m, m.rows()), [
    { k: 1, n: 2, people: 1, n80: 1, top: [{ k: 1, n: 2 }] },
    { k: 2, n: 1, people: 1, n80: 1, top: [{ k: 1, n: 1 }] },
  ]);
  assert.deepEqual(owners(m, [4]), []);   // sin responsable, no cuenta
});
