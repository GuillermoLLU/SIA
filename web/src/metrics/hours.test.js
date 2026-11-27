import test from 'node:test';
import assert from 'node:assert/strict';
import { workMinutes } from './hours.js';

// el minuto 0, un lunes (dow0 = 1) a las 00:00; H: las horas en minutos; D: los días
const H = 60, D = 1440;

test('workMinutes: solo de lunes a viernes, de 7 a 22 h', () => {
  assert.equal(workMinutes(0, D, 1), 15 * H);                       // el lunes entero: 15 h
  assert.equal(workMinutes(6 * H, 8 * H, 1), H);                    // de 6 a 8: solo de 7 a 8
  assert.equal(workMinutes(21 * H, D + 8 * H, 1), 2 * H);           // de 21 h a las 8 del día siguiente: 21–22 y 7–8
  assert.equal(workMinutes(22 * H, D + 7 * H, 1), 0);               // la noche, nada
  assert.equal(workMinutes(5 * D, 7 * D, 1), 0);                    // sábado y domingo, nada
  assert.equal(workMinutes(4 * D + 20 * H, 7 * D + 8 * H, 1), 3 * H); // del viernes a las 20 al lunes a las 8: 2 h + 1 h
  assert.equal(workMinutes(0, 7 * D, 1), 5 * 15 * H);               // una semana entera: 75 h
  assert.equal(workMinutes(0, D, 6), 0);                            // si el minuto 0 es sábado, ese día no cuenta
  assert.equal(workMinutes(10 * H, 10 * H, 1), 0);
  assert.equal(workMinutes(10 * H, 9 * H, 1), 0);
});
