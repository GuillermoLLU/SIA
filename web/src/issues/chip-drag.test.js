import test from 'node:test';
import assert from 'node:assert/strict';
import { mountChipDrag, hasFiles } from './chip-drag.js';

globalThis.Image ??= class { };   // en el navegador, la imagen vacía que sustituye a la copia pegada al ratón

// Lo justo del DOM: una raíz que guarda sus manejadores y un documento con su body.
const fakeEl = (o = {}) => { const cls = new Set(); return { cls, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, ...o }; };
const setup = () => {
  const on = {}, body = [];
  const root = { addEventListener: (t, fn) => { on[t] = fn; }, removeEventListener: (t, fn) => { if (on[t] === fn) delete on[t]; } };
  const doc = { body: { append: (x) => body.push(x) }, createElement: () => fakeEl({ hidden: false, style: {}, remove() { this.removed = true; } }) };
  const drag = mountChipDrag(root, doc);
  return { on, caret: body[0], drag };
};
const dt = (types = []) => { const data = {}; return { types, data, setData: (k, v) => { data[k] = v; }, getData: (k) => data[k] ?? '', setDragImage() {} }; };
const target = (map) => ({ closest: (sel) => map[sel] ?? null });

test('arrastrar la miniatura de una imagen: lleva su [imagenN], se copia y se atenúa', () => {
  const { on } = setup();
  const fig = fakeEl({ dataset: { img: '3' } }), d = dt();
  on.dragstart({ target: target({ '[data-img]': fig }), dataTransfer: d });
  assert.equal(d.data['text/plain'], '[imagen3]');
  assert.equal(d.effectAllowed, 'copy');
  assert.equal(fig.cls.has('dragging'), true);
});

test('arrastrar una ficha del texto: se mueve; sobre un editor, la línea marca dónde caerá', () => {
  const { on, caret } = setup();
  const chip = fakeEl({ dataset: { n: '1' } }), d = dt();
  on.dragstart({ target: target({ '.rv-chip': chip }), dataTransfer: d });
  assert.deepEqual([d.data['text/plain'], d.effectAllowed], ['[imagen1]', 'move']);
  const ed = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
  let prevented = false;
  on.dragover({ target: target({ '.rv-ed': ed }), dataTransfer: d, preventDefault: () => { prevented = true; }, clientX: 0, clientY: 0 });
  assert.deepEqual([prevented, d.dropEffect, caret.hidden, caret.style.left], [true, 'move', false, '110px']);   // editor vacío: al principio
  on.dragend({ target: target({ '.rv-chip, [data-img]': chip }) });
  assert.deepEqual([chip.cls.has('dragging'), caret.hidden], [false, true]);
});

test('los archivos del sistema no son fichas: los atiende cada asistente', () => {
  const { on, caret } = setup();
  assert.equal(hasFiles({ dataTransfer: { types: ['Files'] } }), true);
  assert.equal(hasFiles({ dataTransfer: { types: ['text/plain'] } }), false);
  let prevented = false;
  on.dragover({ target: target({ '.rv-ed': {} }), dataTransfer: dt(['Files']), preventDefault: () => { prevented = true; } });
  assert.deepEqual([prevented, caret.hidden], [false, true]);
  on.drop({ target: target({ '.rv-ed': {} }), dataTransfer: dt(['Files']), preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
});

test('desmontarlo quita sus manejadores y la línea', () => {
  const { on, caret, drag } = setup();
  assert.deepEqual(Object.keys(on).sort(), ['dragend', 'dragleave', 'dragover', 'dragstart', 'drop']);
  drag.dispose();
  assert.deepEqual(Object.keys(on), []);
  assert.equal(caret.removed, true);
});
