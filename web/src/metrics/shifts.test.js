import test from 'node:test';
import assert from 'node:assert/strict';
import { slotOf, weekendOf, typeOf, slotsIn, carry, shiftWork } from './shifts.js';

const BASE = Date.UTC(2026, 0, 1);   // jueves
const type = typeOf(weekendOf(BASE));
const at = (day, h, mm = 0) => day * 1440 + h * 60 + mm;   // minutos desde el 1 de enero (día 0)

test('cada instante cae en su turno: mañana de 7 a 15, tarde de 15 a 23, noche de 23 a 7 (el 1 de enero es laborable)', () => {
  assert.equal(type(slotOf(at(0, 7))), 0);
  assert.equal(type(slotOf(at(0, 14, 59))), 0);
  assert.equal(type(slotOf(at(0, 15))), 1);
  assert.equal(type(slotOf(at(0, 23))), 2);
  assert.equal(slotOf(at(1, 6, 59)), slotOf(at(0, 23)));   // la noche sigue hasta las 7 del día siguiente
  assert.equal(type(slotOf(at(0, 6, 59))), 2);             // antes de las 7 del 1 de enero: la noche anterior
});

test('un turno es de fin de semana si empieza en sábado o domingo', () => {
  assert.equal(type(slotOf(at(1, 23, 30))), 2);   // viernes por la noche: laborable
  assert.equal(type(slotOf(at(2, 8))), 3);        // sábado por la mañana
  assert.equal(type(slotOf(at(3, 23, 30))), 5);   // la noche del domingo
  assert.equal(type(slotOf(at(4, 6))), 5);        // el lunes a las 6, aún es la noche del domingo
  assert.equal(type(slotOf(at(4, 7))), 0);        // lunes por la mañana
});

test('cuántos turnos de cada tipo hay en un tramo de tiempo', () => {
  assert.deepEqual(slotsIn(at(0, 0), at(1, 0), type), [1, 1, 1, 0, 0, 0]);
  assert.deepEqual(slotsIn(at(0, 0), at(7, 0), type), [5, 5, 5, 2, 2, 2]);   // del jueves al miércoles
});

test('de lo que entra en cada turno: empezada en el mismo, en el siguiente, más tarde o nunca', () => {
  const C = { rep: [at(0, 8), at(0, 14), at(0, 8), at(0, 9)], ip: [60, 120, 2000, -1] };
  assert.deepEqual(carry([0, 1, 2, 3], C, type)[0], [1, 1, 1, 1]);
});

test('el trabajo de cada turno: personas activas y acciones por persona', () => {
  // en la mañana del 1 de enero, ANA (1) empieza tres issues y LUIS (2) una; ANA resuelve otra esa tarde
  const C = { rep: [at(0, 7), at(0, 8), at(0, 9), at(0, 10), at(0, 11)], ip: [5, 5, 5, 5, -1], res: [-1, -1, -1, -1, at(0, 16)], as: [1, 1, 1, 2, 1] };
  const w = shiftWork([0, 1, 2, 3, 4], C, () => false, type);
  assert.deepEqual([w[0].turns, w[0].actions, w[0].people, w[0].perPerson], [1, 4, 1, 3]);   // LUIS, con una sola acción, no cuenta como activo
  assert.deepEqual([w[1].turns, w[1].resolved, w[1].people], [1, 1, 0]);
  assert.equal(w[2].people, null);
});
