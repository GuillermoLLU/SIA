import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPerms, planKeys, keyName, keysWarning, orphanKeys } from './person-keys.js';

const person = (views, active = true) => ({ email: 'paula@x.com', active, views });
const none = { lab: false, admin: false, links: false };

test('keyPerms: solo las vistas que son permiso en la base', () => {
  assert.deepEqual(keyPerms(person(['links', 'people', 'lab'])), ['lab', 'links']);
  assert.deepEqual(keyPerms(person(['people'])), []);
  assert.deepEqual(keyPerms(person(['admin', 'lab'])), [], 'con Administración, la del dueño');
  assert.deepEqual(keyPerms(person(['links'], false)), [], 'desactivada: nada');
});

test('crea la clave en la base, con sus permisos (aunque no tenga grupos)', () => {
  const plan = planKeys(person(['links', 'lab']), new Set(['b1']), new Map());
  assert.deepEqual(plan, [{ baseId: 'b1', action: 'create', perms: { ...none, lab: true, links: true } }]);
  assert.equal(keyName(person([])), 'SIA · paula@x.com');
});

test('pone al día la que ya tiene', () => {
  const plan = planKeys(person(['links']), new Set(['b1']), new Map([['b1', 'k1']]));
  assert.deepEqual(plan, [{ baseId: 'b1', action: 'update', key: 'k1', perms: { ...none, links: true } }]);
});

test('la quita si pierde las vistas, si se desactiva o si la base ya no está', () => {
  const cur = new Map([['b1', 'k1']]);
  const rm = [{ baseId: 'b1', action: 'remove', key: 'k1' }];
  assert.deepEqual(planKeys(person(['people']), new Set(['b1']), cur), rm);
  assert.deepEqual(planKeys(person(['links'], false), new Set(['b1']), cur), rm);
  assert.deepEqual(planKeys(person(['links']), new Set(), cur), rm);
});

test('sin la clave de la instancia en esa base no se puede crear', () => {
  assert.deepEqual(planKeys(person(['links']), new Set(), new Map()), []);
});

test('keysWarning: aviso solo si hubo problemas', () => {
  assert.deepEqual(keysWarning([]), {});
  assert.match(keysWarning(['la base no responde']).warning, /la base no responde/);
});

test('orphanKeys: solo las de SIA que la instancia no conoce', () => {
  const inBase = [{ key: 'k1', name: 'SIA · ana@x.com' }, { key: 'k2', name: 'SIA · borrada@x.com' }, { key: 'k3', name: 'Owner' }, { key: 'k4', name: 'Editores' }];
  assert.deepEqual(orphanKeys(inBase, new Set(['k1'])), ['k2']);
});
