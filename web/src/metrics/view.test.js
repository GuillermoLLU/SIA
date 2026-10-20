import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, defaultColors, freeColor, dayOf, freeCompany, withoutSide, togglePerson, monthRange, filterKey } from './view.js';

test('colores: los dos de partida y el primero libre', () => {
  assert.deepEqual(defaultColors(), [COLORS[0][0], COLORS[1][0]]);
  assert.equal(freeColor(COLORS[0][0]), COLORS[1][0]);
  assert.equal(freeColor(COLORS[1][0]), COLORS[0][0]);
});

test('la fecha de carga, en UTC', () => {
  assert.equal(dayOf('2026-10-14T23:30:00Z'), '14 de oct');
  assert.equal(dayOf('2026-01-01T00:10:00Z'), '1 de ene');
});

test('la empresa libre para un lado nuevo: la primera que no tenga el otro', () => {
  assert.deepEqual(freeCompany({ company: 0 }), { company: 1 });
  assert.deepEqual(freeCompany({ company: 1 }), { company: 0 });
  assert.deepEqual(freeCompany({ people: new Set([1]) }), { company: 0 });
  assert.deepEqual(freeCompany(null), { company: 0 });
});

test('quitar un lado: queda el otro como A, con su color', () => {
  const sides = [{ company: 0 }, { company: 1 }], colors = ['a', 'b'];
  assert.deepEqual(withoutSide(sides, colors, 0), { sides: [{ company: 1 }, null], colors: ['b', 'a'] });
  assert.deepEqual(withoutSide(sides, colors, 1), { sides: [{ company: 0 }, null], colors: ['a', 'b'] });
});

test('marcar personas: se añaden y se quitan; sin ninguna, una empresa libre', () => {
  assert.deepEqual(togglePerson([{ company: 0 }, { company: 1 }], 0, 5), { people: new Set([5]) });
  assert.deepEqual(togglePerson([{ people: new Set([5]) }, { company: 1 }], 0, 7), { people: new Set([5, 7]) });
  assert.deepEqual(togglePerson([{ people: new Set([5]) }, { company: 1 }], 0, 5), { company: 0 });
});

test('el periodo entre dos meses, en cualquier orden, y las claves de los filtros', () => {
  assert.deepEqual(monthRange(4, 1), [1, 4]);
  assert.deepEqual(monthRange(2, 2), [2, 2]);
  assert.deepEqual(filterKey('mo:12'), ['mo', 12]);
  assert.deepEqual(filterKey('month:0'), ['month', 0]);
});
