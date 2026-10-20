import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fold, svg } from './html.js';

test('esc: nada que se cuele como HTML, ni en atributos', () => {
  assert.equal(esc('<b class="x">a & b</b>'), '&lt;b class=&quot;x&quot;&gt;a &amp; b&lt;/b&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(3), '3');
});

test('fold: sin acentos y en minúsculas', () => {
  assert.equal(fold('Logística ÁÉÍÓÚ'), 'logistica aeiou');
  assert.equal(fold(undefined), '');
});

test('svg: los trazos dentro del marco común, con grosor y tamaño opcionales', () => {
  assert.equal(svg('<path d="M1 1"/>'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1"/></svg>');
  assert.match(svg('', { width: 1.5, size: 38 }), /width="38" height="38".*stroke-width="1.5"/);
});
