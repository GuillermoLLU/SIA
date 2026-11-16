import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionList, metaOf, pickMode, pickProjects, isIssueId, firstPrompt, PROMPT_MAX } from './sessions.js';

test('sessionList: lo que ve el cliente de cada sesión', () => {
  const sessions = new Map([['s1', { id: 's1', meta: { knowledge: 'auto', model: 'auto' }, ws: {} }], ['s2', { id: 's2', meta: { knowledge: 'auto', issue: 'INC1' }, ws: null }]]);
  assert.deepEqual(sessionList(sessions), [{ id: 's1', knowledge: 'auto', model: 'auto', attached: true }, { id: 's2', knowledge: 'auto', issue: 'INC1', attached: false }]);
});

test('metaOf: el modelo, el esfuerzo, los modelos y el que contesta; sin nada, vacíos', () => {
  assert.deepEqual(metaOf({ model: 'auto', models: [{ id: 'auto' }], modelVia: 'GPT' }), { model: 'auto', effort: null, modelVia: 'GPT', models: [{ id: 'auto' }] });
  assert.deepEqual(metaOf({}), { model: null, effort: null, modelVia: null, models: [] });
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
