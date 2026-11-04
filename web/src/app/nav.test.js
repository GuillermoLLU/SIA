import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsOf, canView, baseNav, panelNav, teamView, firstView, usesTopbar, crossesTo } from './nav.js';

const u = (views) => ({ views });

test('las vistas de la persona; sin ninguna, nada', () => {
  assert.deepEqual(viewsOf(null), []);
  assert.equal(canView(null, 'lab'), false);
  assert.equal(canView(u(['lab']), 'lab'), true);
  assert.equal(canView({}, 'lab'), false);
});

test('baseNav: la vista de la persona y lo que abre la base', () => {
  const user = u(['lab', 'admin', 'links']);
  assert.deepEqual(baseNav(user, { perms: { lab: true, admin: false } }), { lab: true, admin: false, links: true, linksEdit: false });
  assert.deepEqual(baseNav(user, { perms: null }), { lab: false, admin: false, links: true, linksEdit: false }, 'con base pero sin clave: solo ver enlaces');
  assert.deepEqual(baseNav(user, null), { lab: false, admin: false, links: false, linksEdit: false }, 'sin base, nada');
  assert.deepEqual(baseNav(u([]), { perms: { lab: true, admin: true } }), { lab: false, admin: false, links: false, linksEdit: false });
});

test('panelNav y teamView: Equipo soporte con cualquiera de sus dos caras', () => {
  assert.equal(panelNav(u(['people']), 'work'), true);
  assert.equal(panelNav(u(['issues']), 'work'), false);
  assert.equal(panelNav(u(['metrics']), 'metrics'), true);
  assert.equal(teamView(u(['work', 'people'])), 'work');
  assert.equal(teamView(u(['people'])), 'users');
});

test('firstView: abre la mesa de trabajo a quien la tiene; si no, el Chat', () => {
  assert.equal(firstView(u(['issues', 'links'])), 'issues');
  assert.equal(firstView(u(['links'])), 'chat');
});

test('usesTopbar: la mesa, con el Chat y los enlaces como mucho', () => {
  assert.equal(usesTopbar(u(['issues'])), true);
  assert.equal(usesTopbar(u(['issues', 'chat', 'links'])), true);
  assert.equal(usesTopbar(u(['issues', 'metrics'])), false);
  assert.equal(usesTopbar(u(['links'])), false);
});

test('crossesTo: la mesa y el Chat entran con el cruce; lo demás, no', () => {
  assert.equal(crossesTo('chat'), true);
  assert.equal(crossesTo('issues'), true);
  assert.equal(crossesTo('metrics'), false);
});

test('baseNav linksEdit: la vista y el permiso de la clave, los dos', () => {
  const access = (links) => ({ perms: { links } });
  assert.equal(baseNav(u(['links']), access(true)).linksEdit, true);
  assert.equal(baseNav(u(['links']), access(false)).linksEdit, false);
  assert.equal(baseNav(u(['issues']), access(true)).linksEdit, false);
  assert.equal(baseNav(u(['links']), null).linksEdit, false);
});
