import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsOf, canView, baseNav, panelNav, teamView } from './nav.js';

const u = (views) => ({ views });

test('las vistas de la persona; sin ninguna, nada', () => {
  assert.deepEqual(viewsOf(null), []);
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

test('panelNav y teamView: Equipo soporte con cualquiera de sus dos caras', () => {
  assert.equal(panelNav(u(['people']), 'work'), true);
  assert.equal(panelNav(u(['issues']), 'work'), false);
  assert.equal(panelNav(u(['metrics']), 'metrics'), true);
  assert.equal(teamView(u(['work', 'people'])), 'work');
  assert.equal(teamView(u(['people'])), 'users');
});
