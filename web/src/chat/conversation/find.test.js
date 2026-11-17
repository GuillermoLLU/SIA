import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetsOf } from './find.js';

test('offsetsOf: todas las posiciones, sin distinguir mayúsculas', () => {
  assert.deepEqual(offsetsOf('Hola, hola y HOLA', 'hola'), [0, 6, 13]);
  assert.deepEqual(offsetsOf('abcabc', 'bc'), [1, 4]);
});

test('offsetsOf: si pasar a minúsculas cambia el largo, se busca tal cual (sin romper los desplazamientos)', () => {
  assert.deepEqual(offsetsOf('İstanbul abc', 'abc'), [9]);
  assert.deepEqual(offsetsOf('İstanbul ABC', 'abc'), []);
});

test('offsetsOf: sin solapar y sin consulta', () => {
  assert.deepEqual(offsetsOf('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(offsetsOf('lo que sea', ''), []);
  assert.deepEqual(offsetsOf('', 'x'), []);
});
