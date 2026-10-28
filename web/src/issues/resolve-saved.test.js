import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolveSaved } from './resolve-saved.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('guardar, recuperar y descartar el borrador de una issue', () => {
  const saved = createResolveSaved(memory());
  assert.equal(saved.get('INC1'), null);
  assert.equal(saved.set('INC1', { what: 'Se paró', how: '', extra: 'x' }, '2026-10-28 15:20'), true);
  assert.deepEqual(saved.get('INC1'), { at: '2026-10-28 15:20', what: 'Se paró', how: '' });
  assert.equal(saved.get('INC2'), null);
  saved.drop('INC1');
  assert.equal(saved.get('INC1'), null);
});

test('sin almacenamiento (privado, bloqueado), no falla', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const saved = createResolveSaved(broken);
  assert.equal(saved.get('INC1'), null);
  assert.equal(saved.set('INC1', { what: 'x' }, 'a'), false);
  saved.drop('INC1');
});
