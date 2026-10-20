import test from 'node:test';
import assert from 'node:assert/strict';
import { installAutoLock } from './auto-lock.js';

// un documento de mentira: visibilidad y eventos, sin navegador
const fakeDoc = () => {
  const handlers = {};
  return {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => { (handlers[ev] ||= []).push(fn); },
    fire: (ev) => (handlers[ev] || []).forEach((fn) => fn()),
  };
};
const setup = ({ graceMs = 1000, idleMs = 5000 } = {}) => {
  const doc = fakeDoc();
  let t = 10_000; // un reloj que no empieza en cero: hiddenAt = 0 significa «no estaba oculto»
  const sent = [], gated = [];
  installAutoLock({ lockUrl: '/lock', gate: () => gated.push(t), beacon: (u) => sent.push(u), graceMs, idleMs, doc, now: () => t });
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); };
  const show = () => { doc.visibilityState = 'visible'; doc.fire('visibilitychange'); };
  return { doc, sent, gated, hide, show, at: (ms) => { t = ms; } };
};

test('volver dentro del margen: ni aviso ni puerta', () => {
  const s = setup();
  s.hide(); s.at(10_500); s.show();
  assert.deepEqual([s.sent, s.gated], [[], []]);
});

test('volver pasado el margen (el navegador estaba congelado): aviso y puerta', () => {
  const s = setup();
  s.hide(); s.at(11_500); s.show();
  assert.deepEqual(s.sent, ['/lock']);
  assert.deepEqual(s.gated, [11_500]);
});

test('en segundo plano con el navegador vivo: el aviso sale al agotar el margen; al volver, la puerta sin repetirlo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  s.hide();
  t.mock.timers.tick(1000);
  assert.deepEqual(s.sent, ['/lock']);
  s.show();
  assert.deepEqual(s.sent, ['/lock']);
  assert.equal(s.gated.length, 1);
});

test('sin tocar la pantalla: la puerta al cumplirse idleMs; cada toque lo reinicia', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup({ idleMs: 5000 });
  t.mock.timers.tick(4000);
  s.doc.fire('pointerdown');
  t.mock.timers.tick(4000);
  assert.equal(s.gated.length, 0);
  t.mock.timers.tick(1000);
  assert.equal(s.gated.length, 1);
  assert.deepEqual(s.sent, ['/lock']);
});
