import test from 'node:test';
import assert from 'node:assert/strict';
import { clearlyWorse, trendDelta, shade, shadeSoft, isLate } from './rules.js';

test('claramente peor: un 15 % o más y, en los porcentajes, al menos un punto', () => {
  assert.equal(clearlyWorse(0.2, 0.1, 'low'), true);
  assert.equal(clearlyWorse(0.1, 0.2, 'high'), true);
  assert.equal(clearlyWorse(0.11, 0.1, 'low'), false);       // un 10 %: no
  assert.equal(clearlyWorse(0.007, 0.005, 'low'), false);    // un 40 %, pero 0,2 puntos: no
  assert.equal(clearlyWorse(120, 100, 'low'), true);         // en tiempos no hay regla del punto
  assert.equal(clearlyWorse(0.2, 0.1, null), false);         // sin un sentido mejor
  assert.equal(clearlyWorse(null, 0.1, 'low'), false);
});

test('variación de 90 días: nada con pocas incidencias; sube o baja desde un 10 %', () => {
  assert.equal(trendDelta({ now: 10, prev: 14 }), null);
  assert.deepEqual(trendDelta({ now: 20, prev: 10 }), { d: 1, dir: 'up' });
  assert.deepEqual(trendDelta({ now: 10, prev: 20 }), { d: -0.5, dir: 'down' });
  assert.deepEqual(trendDelta({ now: 21, prev: 20 }), { d: 0.05, dir: 'flat' });
  assert.deepEqual(trendDelta({ now: 20, prev: 0 }), { d: 1, dir: 'up' });
});

test('intensidad: 0 sin valor; el máximo, 100; la suavizada levanta lo pequeño', () => {
  assert.equal(shade(0, 10), 0);
  assert.equal(shade(10, 10), 100);
  assert.equal(shade(5, 10), 53);
  assert.equal(shadeSoft(10, 10), 100);
  assert.ok(shadeSoft(1, 10) > shade(1, 10));
});

test('fuera de plazo: abierta, sin pasar a En curso y pasado el SLA', () => {
  assert.equal(isLate(1, -1, 45, 60), true);
  assert.equal(isLate(1, -1, 45, 30), false);   // aún en plazo
  assert.equal(isLate(1, 10, 45, 60), false);   // ya empezó
  assert.equal(isLate(0, -1, 45, 60), false);   // cerrada
  assert.equal(isLate(1, -1, -1, 60), false);   // sin SLA
});
