import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSessions, chromeVisible, nextActive, isImageName, fileExt, toAsset, missingAssets, reconcile } from './sessions.js';

const local = (o) => ({ id: 1, remoteId: 's1', passive: false, linkLost: false, launched: true, assets: [], ...o });

test('chatSessions: fuera los chats de incidencias; la barra solo con un chat real', () => {
  assert.deepEqual(chatSessions([{ id: 'a' }, { id: 'b', issue: 'INC1' }]).map((r) => r.id), ['a']);
  assert.equal(chromeVisible([{ launched: false, passive: false }]), false);
  assert.equal(chromeVisible([{ launched: true }]), true);
  assert.equal(chromeVisible([{ passive: true }]), true);
  assert.equal(nextActive([1, 2, 3]), 3);
  assert.equal(nextActive([]), null);
});

test('adjuntos: imagen por extensión, URL del bridge y los que faltan', () => {
  assert.equal(isImageName('foto.JPG'), true);
  assert.equal(isImageName('log.txt'), false);
  assert.equal(fileExt('a.tar.gz'), 'GZ');
  assert.equal(fileExt('sinext'), 'SINEX');
  assert.deepEqual(toAsset({ name: 'a b.png', absPath: '/x' }, '/api'), { name: 'a b.png', absPath: '/x', url: '/api/uploads/a%20b.png', isImage: true });
  assert.deepEqual(missingAssets([{ name: 'a' }], [{ name: 'a' }, { name: 'b' }]).map((a) => a.name), ['b']);
});

test('reconcile: el chat ya no está en el bridge', () => {
  const { actions } = reconcile([local({ passive: true }), local({ id: 2, remoteId: 's2', linkLost: true }), local({ id: 3, remoteId: 's3' })], []);
  assert.deepEqual(actions, [{ id: 1, do: 'remove' }, { id: 2, do: 'dead' }, { id: 3, do: 'keep' }]);
});

test('reconcile: perdido el socket, vuelve solo si está libre o queda pasivo si lo tiene otro', () => {
  const { actions } = reconcile([local({ linkLost: true }), local({ id: 2, remoteId: 's2', linkLost: true })],
    [{ id: 's1', attached: false }, { id: 's2', attached: true }]);
  assert.deepEqual(actions.map((a) => a.do), ['reattach', 'passive']);
});

test('reconcile: los adjuntos nuevos del otro dispositivo llegan', () => {
  const { actions } = reconcile([local({ passive: true, assets: [{ name: 'a' }] })], [{ id: 's1', assets: [{ name: 'a' }, { name: 'b' }] }]);
  assert.deepEqual(actions, [{ id: 1, do: 'keep', assets: [{ name: 'b' }] }]);
});

test('reconcile: los chats nuevos de otro dispositivo se crean, salvo con un lanzamiento a medias', () => {
  const r = reconcile([local({ remoteId: null, launched: false })], [{ id: 's9' }, { id: 'i1', issue: 'INC1' }]);
  assert.deepEqual(r.create.map((x) => x.id), ['s9']);
  assert.equal(r.hold, false);
  const held = reconcile([local({ remoteId: null, launched: true })], [{ id: 's9' }]);
  assert.deepEqual([held.create, held.hold], [[], true]);
});

test('reconcile: un chat cerrado aquí que el bridge aún lista no vuelve como pasivo; los ya muertos se olvidan', () => {
  const r = reconcile([local({ remoteId: null, launched: false })], [{ id: 's1' }, { id: 's9' }], new Set(['s1', 's0']));
  assert.deepEqual(r.create.map((x) => x.id), ['s9']);
  assert.deepEqual([...r.killed], ['s1'], 's0 ya no está en el bridge');
  // cerrado aquí pero aún con sesión local (el exit no ha llegado): sigue en actions
  const still = reconcile([local({ remoteId: 's1' })], [{ id: 's1' }], new Set(['s1']));
  assert.deepEqual(still.actions.map((a) => a.do), ['keep']);
  assert.deepEqual(still.create, []);
});
