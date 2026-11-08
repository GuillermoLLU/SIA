import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionForm, readAction, isComplete, actionsFor } from './actions.js';

test('las acciones (las notas van en el histórico)', () => {
  assert.deepEqual(Object.keys(ACTIONS), ['resolve', 'escalate', 'transfer', 'chase']);
});

test('actionsFor: pendiente de un tercero, reclamarle; traspasar y devolver, solo si es mía en SIA', () => {
  assert.deepEqual(actionsFor({ status: 'PENDING' }, true), ['chase', 'transfer']);
  assert.deepEqual(actionsFor({ status: 'PENDING' }, false), ['chase'], 'asignada en Remedy pero sin coger en SIA: la base no deja traspasarla');
  assert.deepEqual(actionsFor({ status: 'IN_PROGRESS' }, true), ['resolve', 'escalate', 'transfer', 'release']);
  assert.deepEqual(actionsFor({ status: 'ASSIGNED' }, false), ['resolve', 'escalate']);
});

test('reclamar al tercero: el mensaje es obligatorio', () => {
  assert.deepEqual(readAction('chase', { message: '  ' }), { missing: 'Qué le reclamas' });
  assert.deepEqual(readAction('chase', { message: ' ¿Hay novedades? ' }), { values: { message: '¿Hay novedades?' } });
});

test('obligatorios: el primero que falte', () => {
  assert.deepEqual(readAction('resolve', { note: 'Se relanzó', what: '  ' }), { missing: '¿Qué ha ocurrido?' });
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
