import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsOf, canView, baseNav, firstView, destinations, showsDock, dockItems, usesTopbar, viewTitle, nextBackTo } from './nav.js';

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

test('cada panel, con su vista', () => {
  assert.equal(canView(u(['metrics']), 'metrics'), true);
  assert.equal(canView(u(['backlog']), 'metrics'), false);
});

test('dockItems: los iconos que lleva cada uno, cada uno a su vista; Métricas, directo a ella', () => {
  assert.deepEqual(dockItems(u(['issues', 'backlog', 'metrics', 'chat'])), [
    { key: 'issues', icon: 'issues', view: 'issues' }, { key: 'backlog', icon: 'backlog', view: 'backlog' }, { key: 'metrics', icon: 'metrics', view: 'metrics' }]);
  assert.deepEqual(dockItems(u(['work', 'people'])), [], 'Equipo soporte no es una vista aparte: es una pestaña de Métricas');
});

test('firstView: la primera del dock antes que el Chat; si no, el Chat; sin ninguno, el aviso', () => {
  assert.equal(firstView(u(['issues', 'links'])), 'issues');
  assert.equal(firstView(u(['backlog', 'chat'])), 'backlog');
  assert.equal(firstView(u(['chat', 'backlog', 'metrics'])), 'backlog');
  assert.equal(firstView(u(['chat', 'metrics'])), 'metrics');
  assert.equal(firstView(u(['chat', 'work'])), 'chat', 'work ya no abre nada');
  assert.equal(firstView(u(['chat', 'links'])), 'chat');
  assert.equal(firstView(u([])), 'none');
});

test('showsDock: solo con más de un destino', () => {
  assert.deepEqual(destinations(u(['chat', 'metrics', 'issues', 'work', 'backlog'])), ['issues', 'backlog', 'metrics']);
  assert.equal(showsDock(u(['backlog', 'chat'])), false);
  assert.equal(showsDock(u(['issues', 'chat', 'links', 'lab'])), false);
  assert.equal(showsDock(u(['metrics', 'chat'])), false);
  assert.equal(showsDock(u(['work', 'metrics'])), false);
  assert.equal(showsDock(u(['issues', 'backlog'])), true);
});

test('usesTopbar: la mesa, con el Chat y los enlaces como mucho', () => {
  assert.equal(usesTopbar(u(['issues'])), true);
  assert.equal(usesTopbar(u(['issues', 'chat', 'links'])), true);
  assert.equal(usesTopbar(u(['issues', 'metrics'])), false);
  assert.equal(usesTopbar(u(['links'])), false);
});


test('baseNav linksEdit: la vista y el permiso de la clave, los dos', () => {
  const access = (links) => ({ perms: { links } });
  assert.equal(baseNav(u(['links']), access(true)).linksEdit, true);
  assert.equal(baseNav(u(['links']), access(false)).linksEdit, false);
  assert.equal(baseNav(u(['issues']), access(true)).linksEdit, false);
  assert.equal(baseNav(u(['links']), null).linksEdit, false);
});

test('viewTitle: el nombre de cada sección para la barra de arriba; una que no existe, nada', () => {
  assert.equal(viewTitle('issues'), 'Mesa de trabajo');
  assert.equal(viewTitle('backlog'), 'Backlog');
  assert.equal(viewTitle('chat'), 'Chat');
  assert.equal(viewTitle('metrics'), 'Métricas');
  assert.equal(viewTitle('lab'), 'Skills');
  assert.equal(viewTitle('nope'), '');
});

test('nextBackTo: desde el Chat se vuelve a la vista de la que se vino', () => {
  assert.equal(nextBackTo(null, 'backlog', 'chat'), 'backlog', 'al entrar al Chat desde el Backlog');
  assert.equal(nextBackTo('backlog', 'chat', 'chat'), 'backlog', 'volver a enseñar el Chat no cambia nada');
  assert.equal(nextBackTo('backlog', 'lab', 'chat'), 'backlog', 'del editor de skills se vuelve a la de antes: no es un destino');
  assert.equal(nextBackTo('backlog', 'chat', 'issues'), 'backlog', 'fuera del Chat no importa');
  assert.equal(nextBackTo(null, null, 'chat'), null, 'abrir la app en el Chat: no hay a dónde volver');
});
