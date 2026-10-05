import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem } from './password.js';

test('passwordProblem: 6 o más caracteres, sin exigir tipos de carácter', () => {
  assert.equal(passwordProblem('corta'), 'La contraseña necesita 6 caracteres o más.');
  assert.equal(passwordProblem('sencilla'), null);
  assert.equal(passwordProblem('123456'), null);
  assert.ok(passwordProblem(undefined));
});
