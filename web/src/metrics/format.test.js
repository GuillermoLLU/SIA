import test from 'node:test';
import assert from 'node:assert/strict';
import { num, dec, pct, dur, dateOf, nice, title } from './format.js';

test('una duración en minutos: en minutos por debajo de una hora, en horas hasta 24 y en días y horas desde ahí', () => {
  assert.equal(dur(null), '—');
  assert.deepEqual([0, 15, 45, 54, 59.4].map(dur), ['0 min', '15 min', '45 min', '54 min', '59 min']);
  assert.deepEqual([59.6, 60, 90, 576, 600, 0.9 * 1440, 1409].map(dur), ['1 h', '1 h', '1,5 h', '9,6 h', '10 h', '22 h', '23 h']);
  assert.equal(dur(1439), '1 día');                // 23 h 59 min: redondea a un día
  assert.equal(dur(1440), '1 día');
  assert.equal(dur(1470), '1 día 30 min');         // sobra menos de una hora: en minutos
  assert.equal(dur(1.8 * 1440), '1 día 19 h');     // 43,2 h
  assert.equal(dur(4813), '3 días 8 h');
  assert.equal(dur(2 * 1440 + 23.7 * 60), '3 días');   // 23,7 h que sobran redondean al día siguiente
  assert.equal(dur(7 * 1440), '7 días');
});

test('cifras, decimales y porcentajes a la española', () => {
  assert.equal(num(12345.6), '12.346');
  assert.equal(dec(2), '2,0');
  assert.equal(dec(2.56), '2,6');
  assert.equal(pct(0.4567), '46 %');
  assert.equal(pct(0.4567, 1), '45,7 %');
});

test('fechas desde el 1 de enero, con la hora tal cual viene', () => {
  const base = Date.UTC(2026, 0, 1);
  assert.equal(dateOf(base, 0), '01/01 00:00');
  assert.equal(dateOf(base, 1440 + 65), '02/01 01:05');
});

test('lo que da Remedy en inglés, en español; lo desconocido, tal cual; lo vacío, «(sin dato)»', () => {
  assert.equal(nice('IN_PROGRESS'), 'En curso');
  assert.equal(nice('OTRO_ESTADO'), 'OTRO_ESTADO');
  assert.equal(nice(''), '(sin dato)');
  assert.equal(title('CLIENT_ACTION_REQUIRED'), 'Client action required');
  assert.equal(title(''), '(sin dato)');
});
