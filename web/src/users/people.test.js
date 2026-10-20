import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsText, initials, knOf, filterChips, matchesFilter, validFilter, listRows, roleName, toggled } from './people.js';

const person = (o) => ({ id: 'u1', name: 'Ana López', email: 'ana@x.com', active: true, role_id: 'r1', knowledge: [{ groups: [{ id: 'g1' }] }], ...o });

test('viewsText: el Chat siempre, el resto en una frase', () => {
  assert.equal(viewsText([]), 'Solo el Chat');
  assert.equal(viewsText(['lab']), 'Chat y Laboratorio');
  assert.equal(viewsText(['links', 'lab']), 'Chat, Enlaces rápidos y Laboratorio');
});

test('initials y knOf', () => {
  assert.equal(initials('Ana María López'), 'AM');
  assert.equal(initials('  '), '?');
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
