import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline } from './timeline.js';

const EVENTS = [
  { id: 1, action: 'claimed', actor_name: 'Ana', from_name: null, to_name: 'Ana', happened_at: '2026-10-29T08:00:00+00:00' },
  { id: 2, action: 'transferred', actor_name: 'Ana', from_name: 'Ana', to_name: 'Luis', happened_at: '2026-10-29T09:00:00+00:00' },
  { id: 3, action: 'released', actor_name: 'Luis', from_name: 'Luis', to_name: null, happened_at: '2026-10-29T11:00:00+00:00' },
];
const NOTES = [
  { id: 7, author_id: 'u1', author_name: 'Ana', kind: 'transfer', body: 'Lleva dos llamadas.', created_at: '2026-10-29T09:00:00+00:00', edited_at: null },
  { id: 8, author_id: 'u2', author_name: 'Luis', kind: 'note', body: 'El centro confirma.', created_at: '2026-10-29T10:00:00+00:00', edited_at: '2026-10-29T10:30:00+00:00' },
];

test('movimientos y notas en una sola lista, por tiempo; el motivo del traspaso va dentro de su movimiento', () => {
  const t = timeline(EVENTS, NOTES);
  assert.deepEqual(t.map((x) => `${x.at.slice(11, 16)} ${x.type}${x.kind ? `/${x.kind}` : ''}`),
    ['08:00 claimed', '09:00 transferred', '10:00 note/note', '11:00 released']);
});

test('cada entrada con lo que la pantalla necesita', () => {
  const [claimed, transferred, note] = timeline(EVENTS, NOTES);
  assert.deepEqual(claimed, { at: '2026-10-29T08:00:00+00:00', type: 'claimed', by: 'Ana', from: null, to: 'Ana' });
  assert.deepEqual(transferred, { at: '2026-10-29T09:00:00+00:00', type: 'transferred', by: 'Ana', from: 'Ana', to: 'Luis', text: 'Lleva dos llamadas.' });
  assert.equal(note.edited, '2026-10-29T10:30:00+00:00');
});

test('una nota de traspaso sin su movimiento (otra hora u otra persona) se queda como nota', () => {
  const t = timeline(EVENTS, [{ id: 9, author_name: 'Luis', kind: 'transfer', body: 'x', created_at: '2026-10-29T09:00:00+00:00', edited_at: null }]);
  assert.equal(t.filter((x) => x.type === 'note').length, 1);
  assert.equal(t.find((x) => x.type === 'transferred').text, undefined);
});

test('sin nada, lista vacía; una persona borrada sale sin nombre', () => {
  assert.deepEqual(timeline(), []);
  assert.equal(timeline([{ action: 'claimed', actor_name: null, to_name: null, happened_at: 'x' }])[0].by, null);
});

test('dos traspasos de la misma persona en el mismo instante: el primero lleva el primer motivo; el otro motivo queda como nota; nada se muta', () => {
  const events = [
    { action: 'transferred', actor_name: 'Ana', from_name: 'Ana', to_name: 'Luis', happened_at: '2026-10-29T09:00:00+00:00' },
    { action: 'transferred', actor_name: 'Ana', from_name: 'Ana', to_name: 'Eva', happened_at: '2026-10-29T09:00:00+00:00' },
  ];
  const notes = [
    { id: 1, author_name: 'Ana', kind: 'transfer', body: 'uno', created_at: '2026-10-29T09:00:00+00:00', edited_at: null },
    { id: 2, author_name: 'Ana', kind: 'transfer', body: 'dos', created_at: '2026-10-29T09:00:00+00:00', edited_at: null },
  ];
  const t = timeline(events, notes);
  assert.equal(t.filter((x) => x.type === 'transferred' && x.text === 'uno').length, 1);
  assert.equal(t.filter((x) => x.type === 'note').length, 1);
  assert.equal(events[0].text, undefined);
});
