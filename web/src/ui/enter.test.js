import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playEnter } from './enter.js';

const fake = () => {
  const classes = new Set();
  const el = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, offsetWidth: 0 };
  const observers = [];
  class Observer { constructor(fn) { this.fn = fn; this.on = false; observers.push(this); } observe() { this.on = true; } disconnect() { this.on = false; } }
  const pending = [];
  const timers = { setTimeout: (f, ms) => { pending.push({ f, ms, live: true }); return pending.length; }, clearTimeout: (id) => { if (id) pending[id - 1].live = false; } };
  const opts = { Observer, timers, reduced: () => false };
  return { el, classes, observers, pending, opts };
};

test('entra en cascada y se quita sola al acabar', () => {
  const f = fake();
  playEnter(f.el, { ...f.opts, ms: 1000 });
  assert.ok(f.classes.has('view-enter'));
  assert.equal(f.pending[0].ms, 1000);
  f.pending[0].f();
  assert.ok(!f.classes.has('view-enter'));
  assert.equal(f.observers[0].on, false);
});

test('si la vista se repinta mientras entra, la cascada se corta (lo nuevo sale quieto)', () => {
  const f = fake();
  playEnter(f.el, f.opts);
  f.observers[0].fn();
  assert.ok(!f.classes.has('view-enter'));
  assert.equal(f.pending[0].live, false, 'y su temporizador, fuera');
});

test('volver a la misma vista mientras entra: la anterior se cancela y empieza otra', () => {
  const f = fake();
  playEnter(f.el, f.opts);
  playEnter(f.el, f.opts);
  assert.equal(f.observers[0].on, false);
  assert.equal(f.pending[0].live, false);
  assert.ok(f.classes.has('view-enter'));
  assert.equal(f.observers[1].on, true);
});

test('con menos movimiento pedido por el sistema, sin cascada', () => {
  const f = fake();
  playEnter(f.el, { ...f.opts, reduced: () => true });
  assert.ok(!f.classes.has('view-enter'));
  assert.equal(f.observers.length, 0);
});
