import test from 'node:test';
import assert from 'node:assert/strict';
import { editProblem, canEdit, EDIT_WINDOW_MS, noteInput } from './notes.js';

const note = (o = {}) => ({ id: 1, author_id: 'u-ana', created_at: '2026-10-29T10:00:00+00:00', ...o });
const at = (iso) => new Date(iso);

test('la propia, dentro de las 24 h: se puede', () => {
  assert.equal(editProblem(note(), 'u-ana', at('2026-10-29T12:00:00Z')), null);
  assert.equal(canEdit(note(), 'u-ana', at('2026-10-30T09:59:59Z')), true);
});

test('la de otro, nunca; la propia, pasadas 24 h, tampoco; una que no existe, menos', () => {
  assert.match(editProblem(note(), 'u-luis', at('2026-10-29T12:00:00Z')), /tus propias notas/);
  assert.match(editProblem(note(), 'u-ana', at('2026-10-30T10:00:01Z')), /24 horas/);
  assert.equal(canEdit(note(), 'u-ana', new Date(at('2026-10-29T10:00:00Z').getTime() + EDIT_WINDOW_MS + 1)), false);
  assert.match(editProblem(null, 'u-ana'), /ya no existe/);
});

test('una nota nueva: con texto; interna y sin etiqueta si no se dice; la visibilidad y la etiqueta, de las que hay', () => {
  assert.deepEqual(noteInput({ body: '  Revisado.  ' }), { body: 'Revisado.', visibility: 'internal', tag: null });
  assert.deepEqual(noteInput({ body: 'Llamar mañana', visibility: 'private', tag: 'CALLKO' }), { body: 'Llamar mañana', visibility: 'private', tag: 'CALLKO' });
  assert.deepEqual(noteInput({ body: 'x', visibility: 'public', tag: '' }), { body: 'x', visibility: 'public', tag: null });
  assert.match(noteInput({ body: '   ' }).error, /Escribe la nota/);
  assert.match(noteInput({}).error, /Escribe la nota/);
  assert.match(noteInput({ body: 'x', visibility: 'secreta' }).error, /privada, interna o pública/);
  assert.match(noteInput({ body: 'x', tag: 'analisis' }).error, /etiqueta/);
});
