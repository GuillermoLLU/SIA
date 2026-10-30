import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_RULE, addCriterion, removeCriterion, placeCriterion, available, labelOf, draftOf } from './rule-editor.js';

const CATALOG = [{ id: 'a', label: 'A primero' }, { id: 'b', label: 'B primero' }, { id: 'c', label: 'C primero' }];
const rule = { id: null, name: 'R', criteria: ['a', 'b'] };

test('añadir y quitar criterios, sin repetir y sin mutar', () => {
  assert.deepEqual(addCriterion(rule, 'c').criteria, ['a', 'b', 'c']);
  assert.equal(addCriterion(rule, 'a'), rule);
  assert.deepEqual(removeCriterion(rule, 'a').criteria, ['b']);
  assert.deepEqual(rule.criteria, ['a', 'b']);
  assert.deepEqual(NEW_RULE, { id: null, name: '', criteria: [] });
});

test('colocar un criterio en un puesto, venga de fuera o de dentro; fuera de rango, a un extremo', () => {
  assert.deepEqual(placeCriterion(rule, 'c', 0).criteria, ['c', 'a', 'b']);
  assert.deepEqual(placeCriterion(rule, 'c', 1).criteria, ['a', 'c', 'b']);
  assert.deepEqual(placeCriterion(rule, 'c', 9).criteria, ['a', 'b', 'c']);
  assert.deepEqual(placeCriterion(rule, 'b', 0).criteria, ['b', 'a']);
  assert.deepEqual(placeCriterion(rule, 'a', -3).criteria, ['a', 'b']);
});

test('lo disponible es lo que no está en la regla; la etiqueta, del catálogo', () => {
  assert.deepEqual(available(CATALOG, rule).map((c) => c.id), ['c']);
  assert.equal(labelOf(CATALOG, 'b'), 'B primero');
  assert.equal(labelOf(CATALOG, 'zz'), 'zz');
});

test('el borrador de una regla de la base, listo para editar y aparte del original', () => {
  const r = { id: 'r-1', label: 'Urgencias', criteria: ['a'], builtin: false };
  const d = draftOf(r);
  assert.deepEqual(d, { id: 'r-1', name: 'Urgencias', criteria: ['a'] });
  d.criteria.push('b');
  assert.deepEqual(r.criteria, ['a']);
});
