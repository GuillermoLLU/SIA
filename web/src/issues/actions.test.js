import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionForm, readAction, isComplete, actionsFor, chaseNote, chaseTarget } from './actions.js';

test('las acciones (las notas van en Seguimiento; la llamada, también como nota)', () => {
  assert.deepEqual(Object.keys(ACTIONS), ['resolve', 'escalate', 'call', 'transfer', 'chase']);
});

test('actionsFor: pendiente de un tercero, reclamarle; traspasar y devolver, solo si es mía en SIA', () => {
  assert.deepEqual(actionsFor({ status: 'PENDING' }, true), ['chase', 'transfer']);
  assert.deepEqual(actionsFor({ status: 'PENDING' }, false), ['chase'], 'asignada en Remedy pero sin coger en SIA: la base no deja traspasarla');
  assert.deepEqual(actionsFor({ status: 'IN_PROGRESS' }, true), ['resolve', 'escalate', 'call', 'transfer', 'release']);
  assert.deepEqual(actionsFor({ status: 'ASSIGNED' }, false), ['resolve', 'escalate', 'call'], 'llamar al centro, aunque no sea mía');
});

test('reclamar respuesta: la nota dice a quién se reclama; si el motivo no lo dice, «al tercero»', () => {
  assert.equal(chaseNote({ reason: 'THIRD_PARTY_VENDOR_ACTION_REQD' }, '¿Hay novedades?'), 'Reclamado a Proveedor: ¿Hay novedades?');
  assert.equal(chaseNote({ reason: 'ESCALATED_ACCORDING_TO_PROCEDURE' }, '¿Algo?'), 'Reclamado al tercero: ¿Algo?');
  assert.equal(chaseTarget({ reason: '' }), 'al tercero');
});

test('reclamar al tercero: el mensaje es obligatorio', () => {
  assert.deepEqual(readAction('chase', { message: '  ' }), { missing: 'Qué le reclamas' });
  assert.deepEqual(readAction('chase', { message: ' ¿Hay novedades? ' }), { values: { message: '¿Hay novedades?' } });
});

test('obligatorios: el primero que falte', () => {
  assert.deepEqual(readAction('resolve', { note: 'Se relanzó', what: '  ' }), { missing: '¿Qué ha ocurrido?' });
});

test('el botón de enviar empieza apagado y solo se enciende con todos los obligatorios', () => {
  assert.match(actionForm('chase', 'INC1'), /type="submit"[^>]*disabled/);
  assert.equal(isComplete('chase', { message: '  ' }), false);
  assert.equal(isComplete('chase', { message: '¿Hay novedades?' }), true);
});

test('reclamar: su ventana, con el aviso de que aún no llega a Remedy', () => {
  const html = actionForm('chase', 'INC<1>');
  assert.match(html, /<h3>Reclamar respuesta<\/h3><span>INC&lt;1&gt;<\/span>/);
  assert.match(html, /<textarea id="iss-f-message" name="message" rows="5"><\/textarea>/);
  assert.match(html, /Aún no se envía a Remedy/);
});
