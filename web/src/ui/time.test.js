import test from 'node:test';
import assert from 'node:assert/strict';
import { ago } from './time.js';

const T = Date.UTC(2026, 9, 20, 12, 0, 0);
const min = (n) => T - n * 60000;

test('ago: tramos de minutos, horas y días; sin fecha, nunca', () => {
  assert.equal(ago(null, T), 'nunca');
  assert.equal(ago(min(0.4), T), 'ahora');
  assert.equal(ago(min(5), T), 'hace 5 min');
  assert.equal(ago(min(150), T), 'hace 3 h');
  assert.equal(ago(min(60 * 26), T), 'ayer');
  assert.equal(ago(min(60 * 24 * 12), T), 'hace 12 días');
  assert.match(ago(min(60 * 24 * 40), T), /2026/);
  assert.equal(ago(new Date(min(5)).toISOString(), T), 'hace 5 min', 'también una fecha ISO');
});
