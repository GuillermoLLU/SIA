import test from 'node:test';
import assert from 'node:assert/strict';
import { slidBy, isSliding, veilOf, locksAtOnce, locksOnRelease } from './slide-lock.js';

test('slidBy: dentro del recorrido, sin ir hacia atrás', () => {
  assert.equal(slidBy(-5, 100), 0);
  assert.equal(slidBy(40, 100), 40);
  assert.equal(slidBy(150, 100), 100);
});

test('isSliding: un clic con el pulso movido no es arrastrar', () => {
  assert.equal(isSliding(4), false);
  assert.equal(isSliding(5), true);
});

test('veilOf: el velo está del todo justo donde soltar ya bloquea', () => {
  assert.equal(veilOf(0, 100), 0);
  assert.equal(veilOf(25, 100), 0.5);
  assert.equal(veilOf(50, 100), 1);
  assert.equal(veilOf(100, 100), 1);
});

test('bloquea al final sin soltar y, pasada la mitad, al soltar', () => {
  assert.equal(locksAtOnce(99, 100), false);
  assert.equal(locksAtOnce(100, 100), true);
  assert.equal(locksOnRelease(49, 100), false);
  assert.equal(locksOnRelease(50, 100), true);
});
