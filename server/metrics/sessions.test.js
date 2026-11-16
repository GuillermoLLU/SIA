import test from 'node:test';
import assert from 'node:assert/strict';
import { turnsOf, sessionsOf } from './sessions.js';

const H = 60;

test('lo que vale una sesión: entera desde 3 h o 30 acciones; más corta, su fracción; de más de 12 h, en turnos de 8 h', () => {
  assert.equal(turnsOf(7, 3), 1);
  assert.equal(turnsOf(3, 2), 1);
  assert.equal(turnsOf(12, 2), 1);
  assert.equal(turnsOf(1, 30), 1);
  assert.equal(turnsOf(2, 5), 2 / 8);
  assert.equal(turnsOf(0, 1), 0.5 / 8);     // una sola acción: media hora
  assert.equal(turnsOf(0.25, 29), 0.5 / 8);
  assert.equal(turnsOf(17, 5), 2);          // round(17 / 8)
  assert.equal(turnsOf(21, 5), 3);          // round(21 / 8)
});

test('las acciones a menos de 6 h forman una sesión; a 6 h o más, otra; da igual el orden', () => {
  const s = sessionsOf([23 * H, 8 * H, 15 * H, 10 * H]);
  assert.deepEqual(s, [[8 * H, 15 * H, 1], [23 * H, 23 * H, 0.5 / 8]]);   // 7 h con 3 acciones y una suelta, 8 h después
  assert.equal(sessionsOf([0, 6 * H - 1]).length, 1);
  assert.equal(sessionsOf([0, 6 * H]).length, 2);
});

test('sin acciones, sin sesiones', () => {
  assert.deepEqual(sessionsOf([]), []);
});
