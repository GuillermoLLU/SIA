import test from 'node:test';
import assert from 'node:assert/strict';
import { revealPlan, HERO_STEPS, wantsSidebar, hurry, EDGE_PX } from './intro.js';

test('con la portada: el campo y luego la barra; con un chat vivo, la barra al momento', () => {
  assert.deepEqual(revealPlan('hero'), HERO_STEPS);
  assert.deepEqual(HERO_STEPS.map(([, c]) => c), ['asking', 'ready']);
  assert.deepEqual(revealPlan('chat'), [[0, 'ready']]);
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
