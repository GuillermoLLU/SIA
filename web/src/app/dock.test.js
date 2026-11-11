import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountDock, IDLE_MS } from './dock.js';

const fake = () => {
  const on = new Map();
  const classes = new Set();
  const el = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    hover: false, matches: () => el.hover, contains: () => false,
    addEventListener: (t, f) => on.set(`dock:${t}`, f), removeEventListener: (t) => on.delete(`dock:${t}`),
  };
  const doc = { addEventListener: (t, f) => on.set(`doc:${t}`, f), removeEventListener: (t) => on.delete(`doc:${t}`) };
  const pending = [];
  const timers = { setTimeout: (f, ms) => { pending.push([f, ms]); return pending.length; }, clearTimeout: (id) => { if (id) pending[id - 1] = null; } };
  return { el, doc, timers, on, pending, classes };
};

test('al hacer scroll se atenúa y vuelve sola pasado el rato', () => {
  const f = fake();
  mountDock(f.el, { doc: f.doc, timers: f.timers });
  f.on.get('doc:scroll')({ target: {} });
  assert.ok(f.classes.has('dim'));
  const [fn, ms] = f.pending.at(-1);
  assert.equal(ms, IDLE_MS);
  fn();
  assert.ok(!f.classes.has('dim'));
});

test('con el ratón encima no se atenúa, y al entrar se recupera', () => {
  const f = fake();
  mountDock(f.el, { doc: f.doc, timers: f.timers });
  f.el.hover = true;
  f.on.get('doc:scroll')({ target: {} });
  assert.ok(!f.classes.has('dim'));
  f.el.hover = false;
  f.on.get('doc:scroll')({ target: {} });
  f.on.get('dock:mouseenter')();
  assert.ok(!f.classes.has('dim'));
  assert.equal(f.pending.filter(Boolean).length, 0);
});

test('dispose quita los oyentes', () => {
  const f = fake();
  mountDock(f.el, { doc: f.doc, timers: f.timers })();
  assert.equal(f.on.size, 0);
});
