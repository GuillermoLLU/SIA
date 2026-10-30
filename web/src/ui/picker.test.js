import test from 'node:test';
import assert from 'node:assert/strict';
import { pickerHtml, peoplePicker } from './picker.js';

test('el desplegable de la web: valor, grupos, lo elegido y escapado', () => {
  const html = pickerHtml({ id: 'x', name: 'dest', value: 'b', placeholder: 'Elige', groups: [{ label: 'G <1>', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B & C' }] }] });
  assert.match(html, /<input type="hidden" name="dest" value="b">/);
  assert.match(html, /data-pick-btn[^>]*><span data-pick-label>B &amp; C<\/span>/);
  assert.match(html, /<li role="presentation" class="pick-group">G &lt;1&gt;<\/li>/);
  assert.match(html, /data-pick-opt="b" aria-selected="true"/);
  assert.match(pickerHtml({ id: 'x', name: 'y', placeholder: 'Elige', groups: [{ options: [] }] }), /<input type="hidden" name="y" value="">[\s\S]*class="pick-ph">Elige</);
});

test('el de personas: sin elegir, con la lista; sin nadie, deshabilitado y con el motivo', () => {
  const html = peoplePicker({ id: 'p', name: 'to', people: [{ id: 'u1', name: 'Ana <x>' }], empty: 'Nadie' });
  assert.match(html, /class="pick-ph">Elige a quién</);
  assert.match(html, /<li role="option" data-pick-opt="u1" aria-selected="false">Ana &lt;x&gt;<\/li>/);
  assert.match(peoplePicker({ id: 'p', name: 'to', people: [], empty: 'Nadie' }), /data-pick-btn[^>]*disabled[^>]*>.*class="pick-ph">Nadie</);
});
