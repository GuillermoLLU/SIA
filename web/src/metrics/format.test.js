import test from 'node:test';
import assert from 'node:assert/strict';
import { dur } from './format.js';

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
