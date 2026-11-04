import test from 'node:test';
import assert from 'node:assert/strict';
import { createToast, pressStartedIn } from './dom.js';

const fakeEl = () => { const cls = new Set(); return { hidden: true, textContent: '', cls, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } }; };

test('toast: un éxito, sin la marca de error; toast.error, con ella; y se esconde solo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const el = fakeEl();
  const toast = createToast(el);
  toast.error('Solo puedes resolver tus issues.');
  assert.deepEqual([el.textContent, el.hidden, el.cls.has('error')], ['Solo puedes resolver tus issues.', false, true]);
  toast('Devuelta a la cola.');
  assert.deepEqual([el.textContent, el.cls.has('error')], ['Devuelta a la cola.', false]);
  t.mock.timers.tick(3500);
  assert.equal(el.hidden, true);
});

test('pressStartedIn: recuerda dónde empezó la última pulsación', () => {
  let press;
  const root = { addEventListener: (type, fn) => { assert.equal(type, 'mousedown'); press = fn; } };
  const pressed = pressStartedIn(root, (t) => t === 'dentro');
  assert.equal(pressed(), false);
  press({ target: 'dentro' });
  assert.equal(pressed(), true);
  press({ target: 'fuera' });
  assert.equal(pressed(), false);
});
