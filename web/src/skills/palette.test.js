import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSkills, clampIndex, skillOrder, finderOrder } from './palette.js';

const SKILLS = [
  { id: 'knowledge-add', label: 'Nutrir conocimiento', description: 'Guarda entries', category: 'data' },
  { id: 'jira-access', label: 'Jira', description: 'Tickets', category: 'data' },
];

test('filterSkills: sin acentos ni mayúsculas, sobre etiqueta, descripción, id y categoría; vacío devuelve todo', () => {
  assert.deepEqual(filterSkills(SKILLS, 'NUTRICIÓN').map((s) => s.id), []);
  assert.deepEqual(filterSkills(SKILLS, 'nutrir').map((s) => s.id), ['knowledge-add']);
  assert.deepEqual(filterSkills(SKILLS, 'jira-acc').map((s) => s.id), ['jira-access']);
  assert.equal(filterSkills(SKILLS, '  data ').length, 2);
  assert.equal(filterSkills(SKILLS, '').length, 2);
});

test('clampIndex: dentro de la lista, o 0 si está vacía', () => {
  assert.equal(clampIndex(5, 2), 1);
  assert.equal(clampIndex(-1, 2), 0);
  assert.equal(clampIndex(3, 0), 0);
});

test('las órdenes que se teclean en el CLI', () => {
  assert.equal(skillOrder('jira-access'), 'Ejecuta la skill jira-access: lee skills/jira-access/SKILL.md y sigue sus instrucciones estrictamente.');
  assert.match(finderOrder('  busca "esto" '), /busca esta funcionalidad: "busca 'esto'"\.$/);
});
