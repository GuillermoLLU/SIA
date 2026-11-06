import test from 'node:test';
import assert from 'node:assert/strict';
import { crossfade } from './crossfade.js';

test('sin soporte de view transitions: cambia directamente', () => {
  let changed = 0;
  crossfade(() => { changed++; }, { doc: {}, reduced: () => false });
  assert.equal(changed, 1);
});

test('con menos movimiento: cambia directamente aunque haya soporte', () => {
  let changed = 0, transitions = 0;
  const doc = { startViewTransition: () => { transitions++; } };
  crossfade(() => { changed++; }, { doc, reduced: () => true });
  assert.deepEqual([changed, transitions], [1, 0]);
});

test('con soporte: el cambio va dentro de la transición', () => {
  const order = [];
  const doc = { startViewTransition: (fn) => { order.push('transition'); fn(); } };
  crossfade(() => order.push('change'), { doc, reduced: () => false });
  assert.deepEqual(order, ['transition', 'change']);
});
