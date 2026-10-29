import test from 'node:test';
import assert from 'node:assert/strict';
import { revealDelay, GREET_MS } from './intro.js';

test('con la portada se espera al saludo; con un chat vivo, nada que esperar', () => {
  assert.equal(revealDelay('hero'), GREET_MS);
  assert.equal(revealDelay('chat'), 0);
});
