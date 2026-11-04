import test from 'node:test';
import assert from 'node:assert/strict';
import { revealPlan, revealDesk, HERO_STEPS, wantsSidebar, hurry, startIntro, EDGE_PX } from './intro.js';

test('con la portada: el campo y luego la barra; con un chat vivo, la barra al momento', () => {
  assert.deepEqual(revealPlan('hero'), HERO_STEPS);
  assert.deepEqual(HERO_STEPS.map(([, c]) => c), ['asking', 'ready']);
  assert.deepEqual(revealPlan('chat'), [[0, 'ready']]);
});

test('la mesa: la barra entra ya y retiene la cascada; aunque el ratón la adelantara, retiene igual', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const start of [['booting'], ['asking', 'ready']]) {
    const classes = new Set(start);
    const body = { classList: { contains: (c) => classes.has(c), add: (...cs) => cs.forEach((c) => classes.add(c)), remove: (c) => classes.delete(c) } };
    revealDesk(body);
    assert.deepEqual([...classes].sort(), ['asking', 'nav-first', 'ready']);
    t.mock.timers.runAll();
    assert.deepEqual([...classes].sort(), ['asking', 'ready']);
  }
});

test('el ratón en la zona de la barra la adelanta', () => {
  assert.equal(wantsSidebar(10), true);
  assert.equal(wantsSidebar(EDGE_PX), false);
  assert.equal(wantsSidebar(-1), false);
});

test('adelantar: todas las fases a la vez, y solo una vez', () => {
  const classes = new Set(['booting']);
  const body = { classList: { contains: (c) => classes.has(c), add: (...cs) => cs.forEach((c) => classes.add(c)), remove: (c) => classes.delete(c) } };
  assert.equal(hurry(body), true);
  assert.deepEqual([...classes].sort(), ['asking', 'ready']);
  assert.equal(hurry(body), false);
});

const fakeBody = (...initial) => {
  const classes = new Set(initial);
  return { classes, classList: { contains: (c) => classes.has(c), add: (...cs) => cs.forEach((c) => classes.add(c)), remove: (c) => classes.delete(c) } };
};
const fakeDoc = () => {
  const listeners = new Set();
  return { listeners, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), move: (x) => [...listeners].forEach((fn) => fn({ clientX: x })) };
};

test('arrancar: el ratón en la zona de la barra lo adelanta y deja de escucharse', () => {
  const body = fakeBody(); const doc = fakeDoc();
  startIntro(body, doc);
  assert.equal(body.classes.has('booting'), true);
  doc.move(300);
  assert.equal(body.classes.has('booting'), true);
  doc.move(20);
  assert.deepEqual([...body.classes].sort(), ['asking', 'ready']);
  assert.equal(doc.listeners.size, 0);
});

test('arrancar: si las fases acaban solas, el siguiente movimiento retira el oyente sin tocar nada', () => {
  const body = fakeBody(); const doc = fakeDoc();
  startIntro(body, doc);
  body.classList.add('asking', 'ready'); body.classList.remove('booting'); // lo que hace reveal al final
  doc.move(20);
  assert.deepEqual([...body.classes].sort(), ['asking', 'ready']);
  assert.equal(doc.listeners.size, 0);
});
