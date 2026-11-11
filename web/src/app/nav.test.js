import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsOf, canView, baseNav } from './nav.js';

const u = (views) => ({ views });

test('sin sesión (móvil emparejado) solo los Enlaces', () => {
  assert.deepEqual(viewsOf(null), ['links']);
  assert.equal(canView(null, 'lab'), false);
  assert.equal(canView(u(['lab']), 'lab'), true);
  assert.equal(canView({}, 'lab'), false);
});

test('baseNav: la vista de la persona y lo que abre la base', () => {
  const user = u(['lab', 'admin', 'links']);
  assert.deepEqual(baseNav(user, { perms: { lab: true, admin: false } }), { lab: true, admin: false, links: true });
  assert.deepEqual(baseNav(user, { perms: null }), { lab: false, admin: false, links: true }, 'con base pero sin clave: solo ver enlaces');
  assert.deepEqual(baseNav(user, null), { lab: false, admin: false, links: false }, 'sin base, nada');
  assert.deepEqual(baseNav(u([]), { perms: { lab: true, admin: true } }), { lab: false, admin: false, links: false });
});

test('cada panel, con su vista', () => {
  assert.equal(canView(u(['metrics']), 'metrics'), true);
  assert.equal(canView(u(['backlog']), 'metrics'), false);
});
