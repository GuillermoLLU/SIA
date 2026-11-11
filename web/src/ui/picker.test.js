import test from 'node:test';
import assert from 'node:assert/strict';
import { pickerHtml, peoplePicker, pickClick } from './picker.js';

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

test('en una barra, del ancho de lo elegido; una opción deshabilitada se marca', () => {
  const html = pickerHtml({ id: 'x', name: 'y', inline: true, groups: [{ options: [{ value: 'a', label: 'A', disabled: true }] }] });
  assert.match(html, /class="pick inline"/);
  assert.match(html, /data-pick-opt="a" aria-selected="false" aria-disabled="true"/);
});

// lo mínimo del DOM para una opción dentro de su selector
const fakeOption = ({ disabled = false } = {}) => {
  const events = [];
  const field = { value: '', dispatchEvent: (e) => events.push(e) };
  const label = { textContent: '', classList: { remove: () => {} } };
  const attrs = { 'aria-disabled': disabled ? 'true' : null };
  const pick = { querySelector: (s) => (s.includes('hidden') ? field : label), querySelectorAll: () => [] };
  const opt = { dataset: { pickOpt: 'v1' }, textContent: 'Uno', getAttribute: (a) => attrs[a], closest: (s) => (s === '[data-pick]' ? pick : null) };
  const t = { closest: (s) => (s === '[data-pick-opt]' ? opt : null) };
  return { t, field, events, root: { querySelectorAll: () => [] } };
};

test('elegir: el campo toma el valor y lanza «input», como si se tecleara', () => {
  const { t, field, events, root } = fakeOption();
  assert.equal(pickClick(root, t), true);
  assert.equal(field.value, 'v1');
  assert.deepEqual(events.map((e) => [e.type, e.bubbles]), [['input', true]]);
});

test('una opción deshabilitada no se elige', () => {
  const { t, field, events, root } = fakeOption({ disabled: true });
  assert.equal(pickClick(root, t), true);
  assert.equal(field.value, '');
  assert.equal(events.length, 0);
});
