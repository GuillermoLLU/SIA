import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml, toText, chipHtml, withoutImage, imageTag } from './tag-editor.js';

// un DOM mínimo para toText: nodos de texto, fichas, br y bloques
const text = (v) => ({ nodeType: 3, nodeValue: v });
const el = (tagName, children = [], cls = '', n) => ({ nodeType: 1, tagName, childNodes: children, classList: { contains: (c) => c === cls }, dataset: { n } });
const chip = (n) => el('SPAN', [text(imageTag(n))], 'rv-chip', String(n));

test('texto → HTML: escapado y cada [imagenN] como ficha no editable y arrastrable', () => {
  assert.equal(toHtml('a <b> [imagen2] c'), `a &lt;b&gt; ${chipHtml(2)} c`);
  assert.equal(chipHtml(7), '<span class="rv-chip" contenteditable="false" draggable="true" data-n="7">[imagen7]</span>');
  assert.equal(toHtml(null), '');
});

test('HTML → texto: las fichas vuelven a [imagenN]; br y bloques, saltos de línea; lo demás, tal cual', () => {
  const root = el('DIV', [text('Ver '), chip(1), text(' ahora'), el('BR'), text('y'), el('DIV', [text('bloque'), chip(3)])]);
  assert.equal(toText(root), 'Ver [imagen1] ahora\ny\nbloque[imagen3]');
  assert.equal(toText(el('DIV', [el('DIV', [text('solo')])])), 'solo');   // el primer bloque no mete salto
  assert.equal(toText(el('DIV', [text('a '), chip(1), text('\u200B'), text('\u200Bb')])), 'a [imagen1]b');   // el apoyo del cursor no es texto
});

test('quitar una imagen del texto', () => {
  assert.equal(withoutImage('Ver [imagen1] y [imagen12] y [imagen1]', 1), 'Ver y [imagen12] y');
  assert.equal(withoutImage('fin [imagen2]\nmás', 2), 'fin\nmás');
});
