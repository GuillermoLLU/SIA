import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPerms, planKeys, keyName } from './person-keys.js';

const person = (views, knowledge = [{ base_id: 'b1', groups: [{ id: 'g' }] }], active = true) => ({ email: 'paula@x.com', active, views, knowledge });
const none = { lab: false, admin: false, links: false, invite: false };

test('keyPerms: solo las vistas que son permiso en la base', () => {
  assert.deepEqual(keyPerms(person(['links', 'people', 'lab'])), ['lab', 'links']);
  assert.deepEqual(keyPerms(person(['people', 'knowledge'])), []);
  assert.deepEqual(keyPerms(person(['links'], [], false)), [], 'desactivada: nada');
});

test('crea la clave en las bases que ve, con sus permisos', () => {
  const plan = planKeys(person(['links', 'lab']), new Set(['b1']), new Map());
  assert.deepEqual(plan, [{ baseId: 'b1', action: 'create', perms: { ...none, lab: true, links: true } }]);
  assert.equal(keyName(person([])), 'SIA · paula@x.com');
});

test('pone al día la que ya tiene', () => {
  const plan = planKeys(person(['admin']), new Set(['b1']), new Map([['b1', 'k1']]));
  assert.deepEqual(plan, [{ baseId: 'b1', action: 'update', key: 'k1', perms: { ...none, admin: true } }]);
});

test('la quita si ya no ve la base, si pierde las vistas o si se desactiva', () => {
  const cur = new Map([['b1', 'k1']]);
  const rm = [{ baseId: 'b1', action: 'remove', key: 'k1' }];
  assert.deepEqual(planKeys(person(['links'], []), new Set(['b1']), cur), rm);
  assert.deepEqual(planKeys(person(['people']), new Set(['b1']), cur), rm);
  assert.deepEqual(planKeys(person(['links'], undefined, false), new Set(['b1']), cur), rm);
});

test('sin la clave de la instancia en esa base no se puede crear', () => {
  assert.deepEqual(planKeys(person(['links']), new Set(), new Map()), []);
});
