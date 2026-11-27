import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftOf, slotNo, endOf, nextOf, slotsIn, carry, work } from './sisu-shifts.js';

// el minuto 0, lunes 5 de enero de 2026 a las 00:00 (el reloj del modelo: [día de la semana, 0 = lunes; hora])
const BASE = Date.UTC(2026, 0, 5), H = 60, D = 1440;
const clock = (min) => { const d = new Date(BASE + min * 6e4); return [(d.getUTCDay() + 6) % 7, d.getUTCHours()]; };
const model = (rows = []) => ({ clock, OPEN: rows.map((r) => r.open || 0), C: { rep: rows.map((r) => r.rep), ip: rows.map((r) => r.ip ?? -1), res: rows.map((r) => r.res ?? -1), as: rows.map((r) => r.as ?? 1) } });

test('el turno que recibe lo que entra: mañana de 7 a 14, tarde de 14 a 22; fuera de turno, el siguiente (el fin de semana, el lunes)', () => {
  const m = model(), at = (day, h, min = 0) => shiftOf(m, day * D + h * H + min);
  assert.deepEqual(at(0, 9), { day: 0, k: 0, out: false });        // lunes a las 9: la mañana
  assert.deepEqual(at(0, 14, 30), { day: 0, k: 1, out: false });   // de 14 a 15 se solapan: la tarde
  assert.deepEqual(at(0, 21, 59), { day: 0, k: 1, out: false });
  assert.deepEqual(at(0, 22), { day: 1, k: 0, out: true });        // de noche: la mañana del martes
  assert.deepEqual(at(1, 3), { day: 1, k: 0, out: true });         // de madrugada: la mañana de ese día
  assert.deepEqual(at(4, 23), { day: 7, k: 0, out: true });        // el viernes por la noche: el lunes
  assert.deepEqual(at(5, 12), { day: 7, k: 0, out: true });        // el sábado: el lunes
  assert.deepEqual(at(6, 20), { day: 7, k: 0, out: true });        // el domingo: el lunes
  assert.equal(slotNo({ day: 7, k: 1 }), 15);
});

test('cuándo acaba un turno y cuál le sigue', () => {
  const m = model();
  assert.equal(endOf({ day: 0, k: 0 }), 15 * H);   // la mañana acaba a las 15
  assert.equal(endOf({ day: 0, k: 1 }), 22 * H);   // la tarde, a las 22
  assert.deepEqual(nextOf(m, { day: 0, k: 0 }), { day: 0, k: 1 });
  assert.deepEqual(nextOf(m, { day: 0, k: 1 }), { day: 1, k: 0 });
  assert.deepEqual(nextOf(m, { day: 4, k: 1 }), { day: 7, k: 0 });   // tras la tarde del viernes, la mañana del lunes
});

test('cuántos turnos hay: uno de mañana y uno de tarde por día laborable', () => {
  const m = model();
  assert.deepEqual(slotsIn(m, 0, 7 * D), [5, 5]);         // una semana
  assert.deepEqual(slotsIn(m, 5 * D, 7 * D), [0, 0]);     // un fin de semana
  assert.deepEqual(slotsIn(m, 0, 14 * D), [10, 10]);
});

test('qué se queda para el turno siguiente: antes de que acabe su turno, en el siguiente, más tarde o sin empezar', () => {
  const m = model([
    { rep: 9 * H, ip: 3 * H },              // lunes 9:00, empezada a las 12: en su turno (la mañana)
    { rep: 13 * H, ip: 105 },               // 13:00, empezada a las 14:45: aún en su turno (la mañana acaba a las 15)
    { rep: 13 * H, ip: 4 * H },             // 13:00, empezada a las 17: en el siguiente (la tarde)
    { rep: 20 * H, ip: 12 * H },            // tarde, empezada el martes a las 8: en el siguiente (la mañana del martes)
    { rep: 5 * D + 10 * H, ip: 46 * H },    // sábado 10:00 → lunes; empezada el lunes a las 8: en su turno
    { rep: 9 * H },                         // sin empezar
  ]);
  assert.deepEqual(carry(m, [0, 1, 2, 3, 4, 5]), [[3, 1, 0, 1], [0, 1, 0, 0]]);
});

test('el trabajo de cada turno: acciones de quien las hace, en el turno en que ocurren', () => {
  const m = model([{ rep: 9 * H, ip: H, res: 3 * H, as: 1 }, { rep: 9 * H, ip: 2 * H, res: 4 * H, as: 1 }, { rep: 9 * H, ip: 2 * H, as: 2 }]);
  const w = work(m, [0, 1, 2], () => false, 3);
  assert.equal(w[0].turns, 1);
  assert.equal(w[0].resolved, 2);
  assert.equal(w[0].people, 1);   // solo la persona 1 llega a 3 acciones
  assert.equal(w[1].turns, 0);
});
