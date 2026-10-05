import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem } from './password.js';

test('passwordProblem: 12 o más, con los cuatro tipos de carácter', () => {
  assert.equal(passwordProblem('Corta-1'), 'La contraseña necesita 12 caracteres o más.');
  assert.match(passwordProblem('sinmayusculas-123'), /mayúsculas/);
  assert.match(passwordProblem('SinNumeros-abcdef'), /números/);
  assert.match(passwordProblem('SinSimbolos12345'), /símbolo/);
  assert.equal(passwordProblem('Buena-Clave-2026'), null);
  assert.ok(passwordProblem(undefined));
});
