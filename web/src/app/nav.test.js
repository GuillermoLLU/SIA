import test from 'node:test';
import assert from 'node:assert/strict';
import { viewsOf, canView, baseNav, firstView, destinations, showsDock, dockItems, dockOf, usesTopbar, hubBoxes, hubTarget, inHub, viewTitle, nextBackTo, iconOf } from './nav.js';

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

test('dockItems: los iconos que lleva cada uno; Métricas, directo a su cara si solo tiene una', () => {
  assert.deepEqual(dockItems(u(['issues', 'backlog', 'work', 'metrics'])), [
    { key: 'issues', icon: 'issues', view: 'issues' }, { key: 'backlog', icon: 'backlog', view: 'backlog' }, { key: 'hub', icon: 'metrics', view: 'hub' }]);
  assert.deepEqual(dockItems(u(['issues', 'metrics'])).at(-1), { key: 'hub', icon: 'metrics', view: 'metrics' });
  assert.deepEqual(dockItems(u(['chat', 'people'])), [], 'la gestión de personas no es una cara de Métricas');
});

test('hubTarget y dockOf: a dónde lleva el icono de Métricas y qué icono se marca en cada vista', () => {
  assert.equal(hubTarget(u(['work', 'metrics'])), 'hub');
  assert.equal(hubTarget(u(['work'])), 'work');
  for (const v of ['hub', 'work', 'metrics']) assert.equal(dockOf(v), 'hub', v);
  assert.equal(dockOf('backlog'), 'backlog');
  assert.equal(dockOf('chat'), 'chat');
});

test('firstView: la primera del dock antes que el Chat; si no, el Chat; sin ninguno, Métricas', () => {
  assert.equal(firstView(u(['issues', 'links'])), 'issues');
  assert.equal(firstView(u(['backlog', 'chat'])), 'backlog');
  assert.equal(firstView(u(['chat', 'backlog', 'metrics'])), 'backlog');
  assert.equal(firstView(u(['chat', 'metrics'])), 'metrics');
  assert.equal(firstView(u(['chat', 'work', 'metrics'])), 'hub');
  assert.equal(firstView(u(['chat', 'links'])), 'chat');
  assert.equal(firstView(u([])), 'hub');
});

test('showsDock: solo con más de un destino (cada cara de Métricas cuenta)', () => {
  assert.deepEqual(destinations(u(['chat', 'metrics', 'issues', 'work', 'backlog'])), ['issues', 'backlog', 'work', 'metrics']);
  assert.equal(showsDock(u(['backlog', 'chat'])), false);
  assert.equal(showsDock(u(['issues', 'chat', 'links', 'lab'])), false);
  assert.equal(showsDock(u(['metrics', 'chat'])), false);
  assert.equal(showsDock(u(['work', 'metrics'])), true);
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

test('hubBoxes: una caja por cara de Métricas que se tenga, Equipo y Servicio; el Backlog va aparte', () => {
  assert.deepEqual(hubBoxes(u(['backlog', 'metrics', 'work'])).map((h) => h.label), ['Equipo', 'Servicio']);
  assert.deepEqual(hubBoxes(u(['backlog'])), []);
  assert.deepEqual(hubBoxes(u(['people'])), []);   // la gestión del equipo va en Configuración
  assert.deepEqual(hubBoxes(u(['issues'])), []);
});

test('inHub: el icono de Métricas se marca con el selector y con cualquiera de sus caras', () => {
  for (const v of ['hub', 'work', 'metrics']) assert.equal(inHub(v), true, v);
  for (const v of ['chat', 'issues', 'backlog', 'lab', 'users']) assert.equal(inHub(v), false, v);
});

test('viewTitle: el nombre de cada sección para la barra de arriba; una que no existe, nada', () => {
  assert.equal(viewTitle('issues'), 'Mesa de trabajo');
  assert.equal(viewTitle('backlog'), 'Backlog');
  assert.equal(viewTitle('chat'), 'Chat');
  assert.equal(viewTitle('hub'), 'Métricas');
  assert.equal(viewTitle('work'), 'Métricas del equipo');
  assert.equal(viewTitle('metrics'), 'Métricas del servicio');
  assert.equal(viewTitle('lab'), 'Skills');
  assert.equal(viewTitle('nope'), '');
});

test('nextBackTo e iconOf: desde el Chat se vuelve a la vista de la que se vino, con su icono', () => {
  assert.equal(nextBackTo(null, 'backlog', 'chat'), 'backlog', 'al entrar al Chat desde el Backlog');
  assert.equal(nextBackTo('backlog', 'chat', 'chat'), 'backlog', 'volver a enseñar el Chat no cambia nada');
  assert.equal(nextBackTo('backlog', 'lab', 'chat'), 'backlog', 'del editor de skills se vuelve a la de antes: no es un destino');
  assert.equal(nextBackTo('backlog', 'chat', 'issues'), 'backlog', 'fuera del Chat no importa');
  assert.equal(nextBackTo(null, null, 'chat'), null, 'abrir la app en el Chat: no hay a dónde volver');
  assert.equal(iconOf('hub'), 'metrics');
  assert.equal(iconOf('work'), 'work');
});
