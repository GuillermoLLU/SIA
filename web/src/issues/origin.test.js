import test from 'node:test';
import assert from 'node:assert/strict';
import { originOf, knowsOrigin } from './origin.js';

test('originOf: SISU si viene de SISU, SGA si no', () => {
  assert.equal(originOf({ sisu: true }), 'SISU');
  assert.equal(originOf({ sisu: false }), 'SGA');
});

test('knowsOrigin: solo quien tiene el proyecto del origen, sin importar mayúsculas ni espacios; sin la lista, no se filtra', () => {
  assert.equal(knowsOrigin(['SISU'], { sisu: true }), true);
  assert.equal(knowsOrigin(['SISU'], { sisu: false }), false);
  assert.equal(knowsOrigin([' sga '], { sisu: false }), true);
  assert.equal(knowsOrigin([], { sisu: false }), false);
  assert.equal(knowsOrigin(undefined, { sisu: false }), true);
});
