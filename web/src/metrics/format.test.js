import test from 'node:test';
import assert from 'node:assert/strict';
import { num, dec, pct, dur, dateOf, nice, title } from './format.js';

test('una duración en minutos, en horas o en días y horas', () => {
  assert.equal(dur(null), '—');
  assert.equal(dur(45), '45 min');
  assert.equal(dur(54), '54 min');
  assert.equal(dur(0.9 * 1440), '22 h');
  assert.equal(dur(1.8 * 1440), '1 día 19 h');
  assert.equal(dur(1439), '1 día');                // 23 h 59 min: se redondea a 24 h
  assert.equal(dur(3 * 1440 + 20), '3 días');
  assert.equal(dur(3.1 * 1440), '3 días 2 h');
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
