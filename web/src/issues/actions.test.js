import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionForm, readAction, isComplete } from './actions.js';

test('las cuatro acciones', () => {
  assert.deepEqual(Object.keys(ACTIONS), ['resolve', 'escalate', 'note', 'transfer']);
});

test('obligatorios: el primero que falte', () => {
  assert.deepEqual(readAction('resolve', { resolution: '  ' }), { missing: 'Resolución' });
  assert.deepEqual(readAction('escalate', { to: 'Proveedor X', reason: '' }), { missing: 'Motivo' });
  assert.deepEqual(readAction('transfer', { to: 'u1' }), { missing: 'Motivo' });
  assert.deepEqual(readAction('transfer', { to: 'u1', comment: ' Lleva dos llamadas. ' }), { values: { to: 'u1', comment: 'Lleva dos llamadas.' } });
});

test('el botón de enviar empieza apagado y solo se enciende con todos los obligatorios', () => {
  assert.match(actionForm('transfer', 'INC1'), /type="submit"[^>]*disabled/);
  assert.equal(isComplete('transfer', { to: 'u1', comment: '  ' }), false);
  assert.equal(isComplete('transfer', { to: '', comment: 'motivo' }), false);
  assert.equal(isComplete('transfer', { to: 'u1', comment: 'motivo' }), true);
  assert.equal(isComplete('note', { note: 'x' }), true);
});

test('traspasar: el equipo en el desplegable, escapado; se queda en SIA, sin el aviso de Remedy', () => {
  const html = actionForm('transfer', 'INC1', [{ id: 'u1', name: 'Ana <x>' }]);
  assert.match(html, /<option value="u1">Ana &lt;x&gt;<\/option>/);
  assert.doesNotMatch(html, /Aún no se envía a Remedy/);
  assert.doesNotMatch(actionForm('note', 'INC1'), /Aún no se envía a Remedy/);
  assert.match(actionForm('resolve', 'INC1'), /Aún no se envía a Remedy/);
});
