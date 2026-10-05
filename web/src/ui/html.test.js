import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fold } from './html.js';

test('esc: nada que se cuele como HTML, ni en atributos', () => {
  assert.equal(esc('<b class="x">a & b</b>'), '&lt;b class=&quot;x&quot;&gt;a &amp; b&lt;/b&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(3), '3');
});

test('fold: sin acentos y en minúsculas', () => {
  assert.equal(fold('Logística ÁÉÍÓÚ'), 'logistica aeiou');
  assert.equal(fold(undefined), '');
});
