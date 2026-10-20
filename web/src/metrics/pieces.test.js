import test from 'node:test';
import assert from 'node:assert/strict';
import { blockHead, blocksOf } from './pieces.js';

test('el título de un bloque abarca sus filas; la nota, escapada, debajo', () => {
  assert.equal(blockHead('Prioridad', '', 3), '<th class="mt-gl" rowspan="3">Prioridad</th>');
  assert.equal(blockHead('A & B', 'por <su> prioridad', 1), '<th class="mt-gl" rowspan="1">A &amp; B<small>por &lt;su&gt; prioridad</small></th>');
});

test('las filas se agrupan por sus cabeceras; las de antes de la primera, en un bloque sin título', () => {
  const a = { label: 'a' }, b = { label: 'b' }, c = { label: 'c' };
  assert.deepEqual(blocksOf([{ head: 'X', note: 'n' }, a, b, { head: 'Y' }, c]), [{ head: 'X', note: 'n', rows: [a, b] }, { head: 'Y', note: undefined, rows: [c] }]);
  assert.deepEqual(blocksOf([a, { head: 'Y' }, c]), [{ rows: [a] }, { head: 'Y', note: undefined, rows: [c] }]);
  assert.deepEqual(blocksOf([]), []);
});
