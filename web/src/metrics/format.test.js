import test from 'node:test';
import assert from 'node:assert/strict';
import { span } from './format.js';

test('una duración en minutos, en horas o en días y horas', () => {
  assert.equal(span(null), '—');
  assert.equal(span(45), '45 min');
  assert.equal(span(54), '54 min');
  assert.equal(span(0.9 * 1440), '22 h');
  assert.equal(span(1.8 * 1440), '1 día 19 h');
  assert.equal(span(1439), '1 día');                // 23 h 59 min: se redondea a 24 h
  assert.equal(span(3 * 1440 + 20), '3 días');
  assert.equal(span(3.1 * 1440), '3 días 2 h');
});
