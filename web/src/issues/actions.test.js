import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionForm, readAction, isComplete, pickField } from './actions.js';

test('las tres acciones (las notas van en el histórico)', () => {
  assert.deepEqual(Object.keys(ACTIONS), ['resolve', 'escalate', 'transfer']);
});

test('obligatorios: el primero que falte', () => {
  assert.deepEqual(readAction('resolve', { note: 'Se relanzó', what: '  ' }), { missing: '¿Qué ocurrió?' });
  assert.deepEqual(readAction('transfer', { to: 'u1' }), { missing: 'Motivo' });
  assert.deepEqual(readAction('transfer', { to: 'u1', comment: ' Lleva dos llamadas. ' }), { values: { to: 'u1', comment: 'Lleva dos llamadas.' } });
});

test('el botón de enviar empieza apagado y solo se enciende con todos los obligatorios', () => {
  assert.match(actionForm('transfer', 'INC1'), /type="submit"[^>]*disabled/);
  assert.equal(isComplete('transfer', { to: 'u1', comment: '  ' }), false);
  assert.equal(isComplete('transfer', { to: '', comment: 'motivo' }), false);
  assert.equal(isComplete('transfer', { to: 'u1', comment: 'motivo' }), true);
});

test('traspasar: el equipo en el selector propio, escapado; se queda en SIA, sin el aviso de Remedy', () => {
  const html = actionForm('transfer', 'INC1', [{ id: 'u1', name: 'Ana <x>' }]);
  assert.match(html, /<input type="hidden" name="to" value="">/);
  assert.match(html, /<li role="option" data-pick-opt="u1" aria-selected="false">Ana &lt;x&gt;<\/li>/);
  assert.match(actionForm('transfer', 'INC1', []), /data-pick-btn[^>]*disabled[^>]*>.*No hay más personas en Issues/);
  assert.doesNotMatch(html, /Aún no se envía a Remedy/);
  assert.match(actionForm('resolve', 'INC1'), /Aún no se envía a Remedy/);
});

test('el desplegable de la web: valor, grupos, lo elegido y escapado', () => {
  const html = pickField({ id: 'x', name: 'dest', value: 'b', placeholder: 'Elige', groups: [{ label: 'G <1>', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B & C' }] }] });
  assert.match(html, /<input type="hidden" name="dest" value="b">/);
  assert.match(html, /data-pick-btn[^>]*><span data-pick-label>B &amp; C<\/span>/);
  assert.match(html, /<li role="presentation" class="iss-pick-group">G &lt;1&gt;<\/li>/);
  assert.match(html, /data-pick-opt="b" aria-selected="true"/);
  assert.match(pickField({ id: 'x', attr: 'data-x', placeholder: 'Elige', groups: [{ options: [] }] }), /<input type="hidden" data-x value="">[\s\S]*class="iss-pick-ph">Elige</);
});
