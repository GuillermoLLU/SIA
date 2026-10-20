import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_TEMPLATE, cleanSkillId, groupName, scopeOptions, isReadOnly, scopeLabel, cleanPath, filesList } from './lab.js';

test('cleanSkillId: kebab-case en minúsculas, o nada', () => {
  assert.equal(cleanSkillId('Knowledge-FAQ'), 'knowledge-faq');
  assert.equal(cleanSkillId('a'), null);
  assert.equal(cleanSkillId('con espacios'), null);
  assert.equal(cleanSkillId('-empieza'), null);
});

test('la plantilla lleva el id como name y como título', () => {
  const t = SKILL_TEMPLATE('mi-skill');
  assert.match(t, /^---\nname: mi-skill\n/);
  assert.match(t, /\n# mi-skill\n/);
});

test('groupName: nunca el token; sin nombre conocido, «otro proyecto»', () => {
  const groups = [{ token: 't1', name: 'SGA' }];
  assert.equal(groupName(groups, 't1'), 'SGA');
  assert.equal(groupName(groups, 't9', 'Viejo'), 'Viejo');
  assert.equal(groupName(groups, 't9'), 'otro proyecto');
  assert.equal(scopeLabel(groups, { scope: 't9', scopeName: null }), 'proyecto eliminado');
  assert.equal(scopeLabel(groups, { scope: null }), 'Común');
});

test('scopeOptions: Común solo para el dueño; sin valor válido, el primer proyecto', () => {
  const groups = [{ token: 't1', name: 'SGA' }, { token: 't2', name: 'SISU' }];
  const owner = scopeOptions(groups, null, true);
  assert.equal(owner.options[0].disabled, false);
  assert.equal(owner.value, '');
  const agent = scopeOptions(groups, null, false);
  assert.equal(agent.options[0].disabled, true);
  assert.equal(agent.value, 't1');
  assert.equal(scopeOptions(groups, 't2', false).value, 't2');
  assert.equal(scopeOptions([], null, false).value, '');
});

test('isReadOnly: una común publicada solo la toca el dueño', () => {
  assert.equal(isReadOnly({ isDraft: false, scope: null, isOwner: false }), true);
  assert.equal(isReadOnly({ isDraft: true, scope: null, isOwner: false }), false);
  assert.equal(isReadOnly({ isDraft: false, scope: 't1', isOwner: false }), false);
  assert.equal(isReadOnly({ isDraft: false, scope: null, isOwner: true }), false);
});

test('ficheros: rutas sin barras iniciales y la lista para publicar', () => {
  assert.equal(cleanPath('//phases/01.md'), 'phases/01.md');
  assert.deepEqual(filesList(new Map([['SKILL.md', 'a']])), [{ path: 'SKILL.md', content: 'a' }]);
});
