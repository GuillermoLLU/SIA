import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSessions, nextActive, uploadUrl, reconcile } from './sessions.js';

test('chatSessions: los de una issue no cuentan en el Chat; nextActive: la última', () => {
  assert.deepEqual(chatSessions([{ id: 's1' }, { id: 's2', issue: 'INC1' }]), [{ id: 's1' }]);
  assert.deepEqual(chatSessions(null), []);
  assert.equal(nextActive([1, 2, 3]), 3);
  assert.equal(nextActive([]), null);
});

test('uploadUrl: la URL del adjunto en el bridge, con el nombre escapado', () => {
  assert.equal(uploadUrl('http://localhost:1', '1-foto ok.png'), 'http://localhost:1/uploads/1-foto%20ok.png');
});

const local = (extra) => ({ id: 1, remoteId: 's1', launched: true, passive: false, linkLost: false, ...extra });

test('reconcile: lo que hay que hacer con cada sesión según la lista del bridge', () => {
  // viva y enganchada: nada
  assert.deepEqual(reconcile([local()], [{ id: 's1', attached: true }]).actions, [{ id: 1, do: 'keep' }]);
  // perdimos el socket y está libre: volver solo; si la tiene otro, pasiva
  assert.deepEqual(reconcile([local({ linkLost: true })], [{ id: 's1', attached: false }]).actions, [{ id: 1, do: 'reattach' }]);
  assert.deepEqual(reconcile([local({ linkLost: true })], [{ id: 's1', attached: true }]).actions, [{ id: 1, do: 'passive' }]);
  // ya no está en el bridge: pasiva fuera, con el socket perdido muerta, enganchada se deja (su exit la cierra)
  assert.deepEqual(reconcile([local({ passive: true })], []).actions, [{ id: 1, do: 'remove' }]);
  assert.deepEqual(reconcile([local({ linkLost: true })], []).actions, [{ id: 1, do: 'dead' }]);
  assert.deepEqual(reconcile([local()], []).actions, [{ id: 1, do: 'keep' }]);
  // la portada no representa un chat
  assert.deepEqual(reconcile([{ id: 9, remoteId: null, launched: false }], []).actions, []);
});

test('reconcile: los chats remotos que aquí faltan se crean como pasivos, salvo con uno a medio abrir o cerrado aquí', () => {
  const r = reconcile([local()], [{ id: 's1', attached: true }, { id: 's2', attached: true }, { id: 's3', issue: 'INC1' }]);
  assert.deepEqual(r.create.map((x) => x.id), ['s2']); // el de la issue no cuenta
  assert.equal(r.hold, false);
  const opening = reconcile([{ id: 2, remoteId: null, launched: true, passive: false }], [{ id: 's9' }]);
  assert.equal(opening.hold, true);
  assert.deepEqual(opening.create, []);
  const closed = reconcile([], [{ id: 's1' }, { id: 's2' }], new Set(['s1', 'gone']));
  assert.deepEqual(closed.create.map((x) => x.id), ['s2']);
  assert.deepEqual([...closed.killed], ['s1']); // los que ya murieron del todo salen de la lista
});
