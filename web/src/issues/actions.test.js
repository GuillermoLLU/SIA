import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionForm, readAction } from './actions.js';

test('las cuatro acciones', () => {
  assert.deepEqual(Object.keys(ACTIONS), ['resolve', 'escalate', 'note', 'transfer']);
});

test('obligatorios: el primero que falte', () => {
  assert.deepEqual(readAction('resolve', { resolution: '  ' }), { missing: 'Resolución' });
  assert.deepEqual(readAction('escalate', { to: 'Proveedor X', reason: '' }), { missing: 'Motivo' });
  assert.deepEqual(readAction('transfer', { to: 'u1' }), { values: { to: 'u1', comment: '' } });
});

test('traspasar: el equipo en el desplegable, escapado; se queda en SIA, sin el aviso de Remedy', () => {
  const html = actionForm('transfer', 'INC1', [{ id: 'u1', name: 'Ana <x>' }]);
  assert.match(html, /<option value="u1">Ana &lt;x&gt;<\/option>/);
  assert.doesNotMatch(html, /Aún no se envía a Remedy/);
  assert.doesNotMatch(actionForm('note', 'INC1'), /Aún no se envía a Remedy/);
  assert.match(actionForm('resolve', 'INC1'), /Aún no se envía a Remedy/);
});
