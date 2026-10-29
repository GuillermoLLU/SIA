import test from 'node:test';
import assert from 'node:assert/strict';
import { editProblem, canEdit, EDIT_WINDOW_MS } from './notes.js';

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
