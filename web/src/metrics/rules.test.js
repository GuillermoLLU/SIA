import test from 'node:test';
import assert from 'node:assert/strict';
import { clearlyWorse, trendDelta, shade, shadeSoft, isLate, monthTrend, MTTR_TARGET } from './rules.js';

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

test('la tendencia de un mes frente al anterior: la flecha, según si mejora; la cifra del MTTR, por su umbral', () => {
  // mejor si sube (% dentro de SLA, uso de la IA): la flecha, verde si sube y roja si baja; la cifra, sin color
  assert.deepEqual(monthTrend(0.8, 0.7, { better: 'high' }), { dir: 'up', cls: 'good', value: '' });
  assert.deepEqual(monthTrend(0.6, 0.7, { better: 'high' }), { dir: 'down', cls: 'bad', value: '' });
  assert.deepEqual(monthTrend(0.7, 0.7, { better: 'high' }), { dir: 'eq', cls: '', value: '' });
  // sin el mes anterior o sin cifra: sin flecha
  assert.deepEqual(monthTrend(0.7, null, { better: 'high' }), { dir: null, cls: '', value: '' });
  assert.deepEqual(monthTrend(null, 0.7, { better: 'high' }), { dir: null, cls: '', value: '' });
  // sin «mejor» (las entrantes): flecha sin color
  assert.deepEqual(monthTrend(120, 100), { dir: 'up', cls: '', value: '' });
  // la cifra, frente a la media (ref): mejor o peor según qué es mejor; igual, o sin «mejor», sin color
  assert.equal(monthTrend(0.8, null, { better: 'high', ref: 0.7 }).value, 'good');
  assert.equal(monthTrend(0.6, 0.5, { better: 'high', ref: 0.7 }).value, 'bad');
  assert.equal(monthTrend(50 * 60, null, { better: 'low', ref: 60 * 60 }).value, 'good');   // el MTTR, por debajo de la media
  assert.equal(monthTrend(70 * 60, null, { better: 'low', ref: 60 * 60 }).value, 'bad');
  assert.equal(monthTrend(0.7, null, { better: 'high', ref: 0.7 }).value, '');
  assert.equal(monthTrend(120, 100, { ref: 90 }).value, '');   // las entrantes
  // la media del MTTR, frente al umbral: verde por debajo de 69 h y roja por encima
  assert.equal(MTTR_TARGET, 69 * 60);
  const mttr = { better: 'low', target: MTTR_TARGET };
  assert.deepEqual(monthTrend(60 * 60, 50 * 60, mttr), { dir: 'up', cls: 'bad', value: 'good' });     // sube, pero por debajo
  assert.deepEqual(monthTrend(80 * 60, 90 * 60, mttr), { dir: 'down', cls: 'good', value: 'bad' });   // baja, pero por encima
  assert.deepEqual(monthTrend(60 * 60, null, mttr), { dir: null, cls: '', value: 'good' });           // sin el anterior: la cifra, igual
  assert.deepEqual(monthTrend(MTTR_TARGET, 70 * 60, mttr), { dir: 'down', cls: 'good', value: '' });  // justo en el umbral: sin color
});
