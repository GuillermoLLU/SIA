import test from 'node:test';
import assert from 'node:assert/strict';
import { revealPlan } from './intro.js';

test('con la portada: el campo y luego la barra; con un chat vivo, la barra al momento', () => {
  assert.deepEqual(revealPlan('hero'), [[750, 'asking'], [1500, 'ready']]);
  assert.deepEqual(revealPlan('chat'), [[0, 'ready']]);
});
