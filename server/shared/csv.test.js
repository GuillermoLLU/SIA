import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, csvReader, isCsvName } from './csv.js';

const TEXT = '﻿A,B,C\r\n1,"dos, ""tres""","línea 1\nlínea 2"\r\n\r\n4,,\n"",x,""""\r\n';
const ROWS = [
  { A: '1', B: 'dos, "tres"', C: 'línea 1\nlínea 2' },
  { A: '4', B: '', C: '' },
  { A: '', B: 'x', C: '"' },
];

test('cabecera, comillas, "" y saltos de línea dentro de un campo', () => {
  assert.deepEqual(parseCsv(TEXT), ROWS);
});

test('sin salto final', () => {
  assert.deepEqual(parseCsv('A\nx'), [{ A: 'x' }]);
});

test('por trozos: da igual dónde corte cada uno', () => {
  for (let a = 0; a <= TEXT.length; a++) {
    for (let b = a; b <= TEXT.length; b++) {
      const rows = [];
      const r = csvReader((x) => rows.push(x));
      r.push(TEXT.slice(0, a)); r.push(TEXT.slice(a, b)); r.push(TEXT.slice(b));
      r.end();
      assert.deepEqual(rows, ROWS, `cortes en ${a} y ${b}`);
    }
  }
});

test('isCsvName: un nombre de fichero .csv, sin rutas', () => {
  assert.equal(isCsvName('issues_2026.csv'), true);
  assert.equal(isCsvName('Datos de Remedy.CSV'), true);
  for (const bad of ['', 'datos.xlsx', '../x.csv', 'a/b.csv', 'a\\b.csv', `${'x'.repeat(200)}.csv`]) assert.equal(isCsvName(bad), false, bad);
});
