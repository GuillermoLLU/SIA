import test from 'node:test';
import assert from 'node:assert/strict';
import { revealPlan, HERO_STEPS } from './intro.js';

test('con la portada: el campo y luego la barra; con un chat vivo, la barra al momento', () => {
  assert.deepEqual(revealPlan('hero'), HERO_STEPS);
  assert.deepEqual(HERO_STEPS.map(([, c]) => c), ['asking', 'ready']);
  assert.deepEqual(revealPlan('chat'), [[0, 'ready']]);
});
