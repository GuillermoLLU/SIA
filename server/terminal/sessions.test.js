import test from 'node:test';
import assert from 'node:assert/strict';
import { appendBuffer, sessionList, pickMode, pickProjects, isIssueId, assetFrom, metaPatch, firstPrompt, PROMPT_MAX } from './sessions.js';

test('appendBuffer: acumula y, al pasar el tope, se queda con el 75 % final', () => {
  assert.equal(appendBuffer('ab', 'cd', 10), 'abcd');
  assert.equal(appendBuffer('a'.repeat(8), 'bbbbb', 10), 'aabbbbb');
});

test('sessionList: lo que ve el cliente de cada sesión', () => {
  const sessions = new Map([['s1', { id: 's1', meta: { launcher: 'claude', label: 'Chat 1' }, assets: [], ws: {} }], ['s2', { id: 's2', meta: { launcher: 'codex', label: 'x' }, assets: [{ name: 'a' }], ws: null }]]);
  assert.deepEqual(sessionList(sessions), [{ id: 's1', launcher: 'claude', label: 'Chat 1', assets: [], attached: true }, { id: 's2', launcher: 'codex', label: 'x', assets: [{ name: 'a' }], attached: false }]);
});

test('pickMode, pickProjects, isIssueId', () => {
  assert.equal(pickMode('demand'), 'demand');
  assert.equal(pickMode('otra'), 'auto');
  assert.deepEqual(pickProjects([1, 2, 3], [2, 9]), [2]);
  assert.deepEqual(pickProjects([1, 2], []), [1, 2]);
  assert.deepEqual(pickProjects([1, 2], null), [1, 2]);
  assert.equal(isIssueId('INC12'), true);
  assert.equal(isIssueId('x;drop'), false);
  assert.equal(firstPrompt('  ¿Qué hace la PDA?  '), '¿Qué hace la PDA?');
  assert.equal(firstPrompt('   '), null);
  assert.equal(firstPrompt(7), null);
  assert.equal(firstPrompt('a'.repeat(PROMPT_MAX + 5)).length, PROMPT_MAX);
});

test('assetFrom y metaPatch: acotados', () => {
  assert.deepEqual(assetFrom({ name: 'a'.repeat(100), absPath: '/p' }), { name: 'a'.repeat(80), absPath: '/p' });
  assert.equal(assetFrom({ name: 'a' }), null);
  const meta = { launcher: 'claude', label: 'Chat 1', color: '#fff' };
  assert.deepEqual(metaPatch(meta, { label: '  Mi chat largo '.repeat(5), color: 7 }), { ...meta, label: 'Mi chat largo   Mi chat largo   Mi chat ', color: null });
  assert.deepEqual(metaPatch(meta, { label: '  ', color: '#000' }), { ...meta, color: '#000' });
});
