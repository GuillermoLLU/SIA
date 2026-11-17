import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsText, knOf, filterChips, matchesFilter, validFilter, listRows, roleName, toggled, ruleOf, basicRule, personDraft, draftWithRole, draftWithView, draftWithRule, personPatch, hasChanges } from './people.js';

const person = (o) => ({ id: 'u1', name: 'Ana López', email: 'ana@x.com', active: true, role_id: 'r1', knowledge: [{ groups: [{ id: 'g1' }] }], ...o });

test('viewsText: las vistas en una frase, el Chat como una más', () => {
  assert.equal(viewsText([]), 'Ninguna vista');
  assert.equal(viewsText(['lab']), 'Laboratorio');
  assert.equal(viewsText(['chat', 'links', 'lab']), 'Chat, Enlaces rápidos y Laboratorio');
});

test('knOf', () => {
  assert.deepEqual(knOf(person()), ['g1']);
  assert.deepEqual(knOf({}), []);
});

test('filtros: fijos y uno por rol; el de un rol borrado vuelve a todas', () => {
  const roles = [{ id: 'r1', name: 'Agente' }];
  assert.deepEqual(filterChips(roles).map(([f]) => f), ['all', 'r1', 'custom', 'none', 'off']);
  assert.equal(validFilter('r1', roles), 'r1');
  assert.equal(validFilter('r9', roles), 'all');
  assert.equal(validFilter('off', roles), 'off');
});

test('matchesFilter: desactivadas, sin conocimiento, personalizadas y por rol', () => {
  assert.equal(matchesFilter(person({ active: false }), 'off'), true);
  assert.equal(matchesFilter(person(), 'off'), false);
  assert.equal(matchesFilter(person({ knowledge: [] }), 'none'), true);
  assert.equal(matchesFilter(person({ role_id: null }), 'custom'), true);
  assert.equal(matchesFilter(person(), 'r1'), true);
  assert.equal(matchesFilter(person(), 'r2'), false);
});

test('listRows: filtro y búsqueda por nombre o email', () => {
  const people = [person(), person({ id: 'u2', name: 'Luis', email: 'luis@x.com', role_id: null })];
  assert.deepEqual(listRows(people, 'all', 'lu').map((p) => p.id), ['u2']);
  assert.deepEqual(listRows(people, 'custom', '').map((p) => p.id), ['u2']);
  assert.deepEqual(listRows(people, 'r1', 'ana@').map((p) => p.id), ['u1']);
});

test('roleName y toggled', () => {
  const roles = [{ id: 'r1', name: 'Agente' }];
  assert.equal(roleName(roles, person()), 'Agente');
  assert.equal(roleName(roles, person({ role_id: null })), 'Personalizado');
  assert.deepEqual(toggled(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggled(['a'], 'b'), ['a', 'b']);
});

test('ruleOf: la regla de cada cual o, sin ella (o borrada), la básica', () => {
  const rules = [{ id: 'r-b', label: 'Regla básica', builtin: true }, { id: 'r-u', label: 'Urgencias', builtin: false }];
  assert.equal(ruleOf(rules, person({ rule_id: 'r-u' })).label, 'Urgencias');
  assert.equal(ruleOf(rules, person({ rule_id: null })).label, 'Regla básica');
  assert.equal(ruleOf(rules, person({ rule_id: 'r-borrada' })).label, 'Regla básica');
  assert.equal(basicRule([{ id: 'x', label: 'Única', builtin: false }]).id, 'x');   // sin básica en la base: la primera
  assert.equal(basicRule([]), null);
});

test('la ficha en borrador: elegir rol trae sus vistas y su regla; tocar una vista o la regla lo deja personalizado', () => {
  const p = person({ role_id: 'r1', views: ['issues'], rule_id: null });
  const d = personDraft(p);
  assert.deepEqual(d, { role_id: 'r1', views: ['issues'], rule_id: null, active: true, kn: ['g1'] });
  assert.deepEqual(draftWithRole(d, { id: 'r2', views: ['lab'], rule_id: 'x' }), { ...d, role_id: 'r2', views: ['lab'], rule_id: 'x' });
  assert.deepEqual(draftWithView(d, 'lab'), { ...d, role_id: null, views: ['issues', 'lab'] });
  assert.deepEqual(draftWithRule(d, 'r-u'), { ...d, role_id: null, rule_id: 'r-u' });
});

test('personPatch: solo lo que cambia, de una vez', () => {
  const rules = [{ id: 'r-b', label: 'Regla básica', builtin: true }, { id: 'r-u', label: 'Urgencias', builtin: false }];
  const p = person({ role_id: 'r1', views: ['issues'], rule_id: null });
  const d = personDraft(p);
  assert.equal(hasChanges(personPatch(p, d, rules)), false);
  assert.deepEqual(personPatch(p, draftWithRole(d, { id: 'r2', views: ['lab'], rule_id: null }), rules), { user: { role: 'r2' }, projects: null });
  // de un rol a personalizado: sus vistas y su regla
  assert.deepEqual(personPatch(p, draftWithView(d, 'lab'), rules), { user: { views: ['issues', 'lab'], rule: 'r-b' }, projects: null });
  assert.deepEqual(personPatch(p, { ...d, active: false, kn: [] }, rules), { user: { active: false }, projects: [] });
  // ya personalizada: solo lo que cambia
  const c = person({ role_id: null, views: ['issues'], rule_id: 'r-b' });
  assert.deepEqual(personPatch(c, draftWithRule(personDraft(c), 'r-u'), rules), { user: { rule: 'r-u' }, projects: null });
  assert.deepEqual(personPatch(c, draftWithView(personDraft(c), 'issues'), rules), { user: { views: [] }, projects: null });
});
