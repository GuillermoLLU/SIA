import test from 'node:test';
import assert from 'node:assert/strict';
import { jiraConfig, ghMask, addGithubKey, removeGithubKey, toggleGithubKey } from './credentials.js';

test('jiraConfig: sin barra final ni espacios', () => {
  assert.deepEqual(jiraConfig(' https://jira.x.com/jira// ', ' t '), { baseUrl: 'https://jira.x.com/jira', token: 't' });
});

test('ghMask: principio y final, o puntos si es corto', () => {
  assert.equal(ghMask('ghp_abcdefghijklmnop'), 'ghp_abc…mnop');
  assert.equal(ghMask('corto'), '••••');
});

test('addGithubKey: vacía o repetida no entra; sin nombre, Clave N; la primera queda activa', () => {
  const none = { keys: [], activeId: null };
  assert.deepEqual(addGithubKey(none, { name: '', token: ' ', id: 'a' }), { error: 'pega el token' });
  const one = addGithubKey(none, { name: '', token: 'tok1', id: 'a' });
  assert.deepEqual(one.keys, [{ id: 'a', name: 'Clave 1', token: 'tok1' }]);
  assert.equal(one.activeId, 'a');
  assert.match(one.message, /^añadida: Clave 1 \(activa\)/);
  assert.deepEqual(addGithubKey(one, { name: 'x', token: 'tok1', id: 'b' }), { error: 'esa clave ya está guardada' });
  const two = addGithubKey(one, { name: 'Trabajo', token: 'tok2', id: 'b' });
  assert.equal(two.activeId, 'a');
  assert.equal(two.message, 'añadida: Trabajo');
});

test('removeGithubKey y toggleGithubKey', () => {
  const st = { keys: [{ id: 'a', name: 'A', token: '1' }, { id: 'b', name: 'B', token: '2' }], activeId: 'a' };
  const rm = removeGithubKey(st, 'a');
  assert.deepEqual([rm.keys.map((k) => k.id), rm.activeId], [['b'], null]);
  assert.equal(rm.message, 'quitada: A — no queda ninguna activa');
  assert.equal(removeGithubKey(st, 'b').message, 'quitada: B');
  assert.equal(toggleGithubKey(st, 'b').activeId, 'b');
  assert.equal(toggleGithubKey(st, 'a').activeId, null);
  assert.match(toggleGithubKey(st, 'a').message, /^sin clave activa/);
});
