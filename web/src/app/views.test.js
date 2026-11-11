import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViews } from './views.js';

const el = () => {
  const classes = new Set();
  return { hidden: false, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) } };
};
const setup = () => {
  const views = { chat: el(), issues: el(), backlog: el(), metrics: el(), lab: el() };
  const dock = { issues: el(), backlog: el(), metrics: el() };
  const bar = [], entered = [], shown = [];
  const body = el();
  const v = createViews({
    views, dock, body,
    topbar: { show: (name, title, from) => bar.push({ name, title, from }) },
    panels: { backlog: { show: () => { shown.push('backlog'); return 'pintando'; } } },
    onShow: { chat: () => shown.push('chat') },
    enter: (e) => entered.push(Object.keys(views).find((k) => views[k] === e)),
  });
  return { v, views, dock, bar, entered, shown, body };
};

test('show: una vista a la vista, su icono del dock marcado y su nombre arriba', () => {
  const s = setup();
  assert.equal(s.v.show('backlog'), 'pintando', 'devuelve lo que tarda en pintarse el panel');
  assert.deepEqual(Object.entries(s.views).filter(([, e]) => !e.hidden).map(([k]) => k), ['backlog']);
  assert.equal(s.dock.backlog.classList.has('active'), true);
  assert.equal(s.dock.issues.classList.has('active'), false);
  assert.deepEqual(s.bar.at(-1), { name: 'backlog', title: 'Backlog', from: null });
  assert.equal(s.v.current(), 'backlog');
  s.v.show('metrics');
  assert.equal(s.dock.metrics.classList.has('active'), true);
  assert.equal(s.dock.backlog.classList.has('active'), false);
});

test('go: además, la entrada en cascada; show no la tiene', () => {
  const s = setup();
  s.v.show('issues');
  s.v.go('backlog');
  assert.deepEqual(s.entered, ['backlog']);
});

test('el Chat: sin dock y, arriba, volver a la vista de la que se vino; del editor de skills, a la de antes', () => {
  const s = setup();
  s.v.show('backlog');
  s.v.go('chat');
  assert.equal(s.body.classList.has('in-chat'), true);
  assert.deepEqual(s.shown, ['backlog', 'chat']);
  const from = s.bar.at(-1).from;
  assert.equal(from.title, 'Volver a Backlog');
  from.go();
  assert.equal(s.v.current(), 'backlog');
  assert.equal(s.body.classList.has('in-chat'), false);
  s.v.go('chat');
  s.v.go('lab');
  s.v.go('chat');
  assert.equal(s.bar.at(-1).from.title, 'Volver a Backlog', 'el editor de skills no es un destino');
});

test('abrir la app en el Chat: sin botón de volver', () => {
  const s = setup();
  s.v.show('chat');
  assert.equal(s.bar.at(-1).from, null);
});
