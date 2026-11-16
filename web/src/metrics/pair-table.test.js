import test from 'node:test';
import assert from 'node:assert/strict';
import { pairTable } from './pair-table.js';
import { BETTER_MIN } from './rules.js';

const pct = (v) => `${Math.round(v * 100)} %`;
const share = ['% OK', (x) => x.v, pct, 'high', 'nota', (x) => x.n];
// el lado marcado (0, 1) o -1 en una tabla de una fila y un dato
const mark = (d, x, cls = 'mt-better') => {
  const tds = [...pairTable({ names: ['a', 'b'], first: '', defs: [d], rows: [{ label: 'r', x }] }).matchAll(/<td class="mt-num[^"]*"/g)].map((m) => m[0].includes(cls));
  return tds.indexOf(true);
};

test('se marca el lado que va mejor, si los dos tienen bastantes y no se ven iguales', () => {
  const x = (a, b, n = 20) => [{ v: a, n }, { v: b, n }];
  assert.equal(mark(share, x(0.5, 0.4)), 0);
  assert.equal(mark(share, x(0.4, 0.5)), 1);
  assert.equal(mark(['', share[1], pct, 'low', '', share[5]], x(0.4, 0.5)), 0);
  assert.equal(mark(share, x(0.501, 0.499)), -1);               // 50 % y 50 %: iguales al verse
  assert.equal(mark(share, x(0.5, 0.4, BETTER_MIN - 1)), -1);   // pocas para marcar
  assert.equal(mark(share, [{ v: null, n: 20 }, { v: 0.4, n: 20 }]), -1);
  assert.equal(mark(['', share[1], pct, null], x(0.5, 0.4)), -1); // sin un mejor, sin color
});

test('en ocre (warn), el más alto', () => {
  const warn = ['De antes', (x) => x.v, pct, 'warn'];
  assert.equal(mark(warn, [{ v: 0.3 }, { v: 0.1 }], 'mt-warn'), 0);
});

test('la tabla: leyenda, dos columnas por dato, grupos y bloques con el título a la izquierda', () => {
  const r = (label, a, b) => ({ label, x: [{ v: a, n: 50 }, { v: b, n: 50 }] });
  const html = pairTable({ names: ['Indra', 'T-Systems'], first: 'Corte', defs: [share, ['Issues', (x) => x.n, String]],
    groups: [['Cómo sale', 1], ['Volumen', 1]],
    rows: [{ head: 'Prioridad', note: 'por su prioridad', rows: [r('Alta', 0.6, 0.4), r('Baja', 0.2, 0.2)] }, { ...r('Todo', 0.5, 0.3), cls: 'mt-tot' }] });
  assert.match(html, /<span><i class="mt-c0"><\/i>Indra<\/span><span><i class="mt-c1"><\/i>T-Systems<\/span>/);
  assert.match(html, /<th colspan="2"><\/th><th colspan="2">Cómo sale<\/th><th colspan="2">Volumen<\/th>/);
  assert.match(html, /<th class="mt-gl" rowspan="2">Prioridad<small>por su prioridad<\/small><\/th>/);
  assert.equal((html.match(/mt-better/g) || []).length, 2);           // Alta y Todo; Baja, igual
  assert.match(html, /<tr class="mt-tot" ><td class="mt-r" colspan="2"/);
  assert.equal((html.match(/<td class="mt-num/g) || []).length, 3 * 2 * 2);
});

test('sin grupos, cada dato con su línea continua; con grupos, discontinua dentro del grupo', () => {
  const defs = [share, share, share];
  const rows = [{ label: 'x', x: [{ v: 1, n: 1 }, { v: 1, n: 1 }] }];
  const seps = (html) => [...html.matchAll(/<td class="mt-num (mt-[gm]sep)/g)].map((m) => m[1]);
  assert.deepEqual(seps(pairTable({ names: ['a', 'b'], first: '', defs, rows })), ['mt-gsep', 'mt-gsep', 'mt-gsep']);
  assert.deepEqual(seps(pairTable({ names: ['a', 'b'], first: '', defs, rows, groups: [['A', 2], ['B', 1]] })), ['mt-gsep', 'mt-msep', 'mt-gsep']);
});
