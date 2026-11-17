import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials } from './initials.js';

test('las iniciales: las dos primeras palabras (o partes con punto), en mayúsculas; sin nombre, «?»', () => {
  assert.equal(initials('Ana María López'), 'AM');
  assert.equal(initials('robot.siglo'), 'RS');
  assert.equal(initials('glucia'), 'G');
  assert.equal(initials('  '), '?');
  assert.equal(initials(null), '?');
});
