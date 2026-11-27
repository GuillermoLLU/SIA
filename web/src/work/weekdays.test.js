import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayAverages } from './weekdays.js';

const DAY = 1440;
const dowOf = (min) => Math.floor(min / DAY) % 7;   // el minuto 0, en lunes

test('la media de cada día de la semana divide entre todos los de ese tipo del periodo, con actividad o sin ella', () => {
  const w = weekdayAverages({ in: [0, 10, 7 * DAY], out: [DAY] }, [0, 14 * DAY], dowOf);
  assert.deepEqual(w[0], { days: 2, in: 1.5, out: 0 });   // dos lunes, con tres nuevas entre los dos
  assert.deepEqual(w[1], { days: 2, in: 0, out: 0.5 });   // dos martes, y solo uno con una resuelta
});

test('un día de la semana que no cae en el periodo no tiene media', () => {
  const w = weekdayAverages({ in: [0], out: [] }, [0, 2 * DAY], dowOf);
  assert.deepEqual(w.map((x) => x.days), [1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(w[0], { days: 1, in: 1, out: 0 });
  assert.deepEqual(w[2], { days: 0, in: null, out: null });
});
