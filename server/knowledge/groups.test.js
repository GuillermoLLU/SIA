import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { groupId, toGroups, publicGroups, pickGroups } from './groups.js';

test('groupId: la misma huella que platform.token_id (sha256 hex del token)', () => {
  assert.equal(groupId('tok-soporte-n1-secreto'), createHash('sha256').update('tok-soporte-n1-secreto').digest('hex'));
});

test('toGroups: con id, ordenados por nombre; filas rotas fuera; publicGroups sin tokens', () => {
  const g = toGroups([{ token: 'tb', name: 'Nivel 2' }, { token: 'ta', name: 'Nivel 1' }, { name: 'sin token' }, null]);
  assert.deepEqual(g.map((x) => x.name), ['Nivel 1', 'Nivel 2']);
  assert.equal(g[0].id, groupId('ta'));
  assert.ok(!JSON.stringify(publicGroups(g)).includes('"ta"'));
  assert.deepEqual(Object.keys(publicGroups(g)[0]), ['id', 'name']);
});

test('pickGroups: ids → nombre y token; repetidos una vez; un id ajeno, error', () => {
  const g = toGroups([{ token: 'ta', name: 'Nivel 1' }, { token: 'tb', name: 'Nivel 2' }]);
  assert.deepEqual(pickGroups(g, [groupId('tb'), groupId('tb')]), { groups: [{ name: 'Nivel 2', token: 'tb' }] });
  assert.deepEqual(pickGroups(g, []), { groups: [] });
  assert.match(pickGroups(g, ['otro']).error, /ya no existe/);
});
