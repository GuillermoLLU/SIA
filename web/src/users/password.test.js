import test from 'node:test';
import assert from 'node:assert/strict';
import { strongPassword } from './password.js';

test('5-5 del alfabeto sin caracteres ambiguos', () => {
  assert.match(strongPassword(), /^[A-HJ-NP-Za-km-z2-9]{5}-[A-HJ-NP-Za-km-z2-9]{5}$/);
});

test('cada número elige una letra del alfabeto, en orden', () => {
  assert.equal(strongPassword((n) => Array.from({ length: n }, (_, i) => i)), 'ABCDE-FGHJK');
});
