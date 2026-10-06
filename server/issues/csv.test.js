import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './csv.js';

test('cabecera, comillas, "" y saltos de línea dentro de un campo', () => {
  const rows = parseCsv('﻿A,B,C\r\n1,"dos, ""tres""","línea 1\nlínea 2"\r\n\r\n4,,\n');
  assert.deepEqual(rows, [
    { A: '1', B: 'dos, "tres"', C: 'línea 1\nlínea 2' },
    { A: '4', B: '', C: '' },
  ]);
});

test('sin salto final', () => {
  assert.deepEqual(parseCsv('A\nx'), [{ A: 'x' }]);
});
