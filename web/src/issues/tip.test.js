import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipPlace } from './tip.js';

const box = { width: 200, height: 60 };
const view = { width: 1000 };

test('va encima del icono, centrada, cuando cabe', () => {
  const r = tipPlace({ top: 300, bottom: 316, left: 500, width: 16 }, box, view);
  assert.deepEqual(r, { top: 232, left: 408, above: true });
});

test('si la fila está arriba del todo, va debajo', () => {
  const r = tipPlace({ top: 40, bottom: 56, left: 500, width: 16 }, box, view);
  assert.deepEqual(r, { top: 64, left: 408, above: false });
});

test('no se sale por los lados de la ventana', () => {
  assert.equal(tipPlace({ top: 300, bottom: 316, left: 20, width: 16 }, box, view).left, 8);
  assert.equal(tipPlace({ top: 300, bottom: 316, left: 980, width: 16 }, box, view).left, 792);
});
