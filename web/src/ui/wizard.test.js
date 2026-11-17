import test from 'node:test';
import assert from 'node:assert/strict';
import { slideStep, flashEmpty, fadeOut, runPhases, FLASH_MS, FADE_MS, PHASE_MS } from './wizard.js';

// Un elemento falso: clases, hijos, eventos y lo justo de cada pieza.
const el = (o = {}) => {
  const cls = new Set(), on = {};
  const node = {
    hidden: false, textContent: '', children: [], focused: false, removed: false, offsetWidth: 1,
    cls, classList: { contains: (c) => cls.has(c), add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), replace: (a, b) => cls.delete(a) && cls.add(b) },
    addEventListener: (type, fn) => { on[type] = fn; }, fire: (type) => on[type]?.(),
    append: (c) => node.children.push(c), remove: () => { node.removed = true; },
    focus: () => { node.focused = true; },
    ...o,
  };
  return node;
};

test('slideStep: el nuevo entra por el lado del que viene y el anterior sale por el otro', () => {
  const s1 = el(), s2 = el({ hidden: true });
  const f = { querySelector: (q) => (q.includes('"1"') ? s1 : s2), querySelectorAll: () => [s1, s2] };
  slideStep(f, 1, 2, false);
  assert.deepEqual([[...s2.cls], [...s1.cls], s1.hidden], [['in-fwd'], ['out-fwd'], false]);
  s1.fire('animationend');
  assert.deepEqual([[...s1.cls], s1.hidden], [[], true]);
  slideStep(f, 2, 1, false);
  assert.deepEqual([[...s1.cls], [...s2.cls]], [['in-back'], ['out-back']]);
  slideStep(f, 1, 2, true);   // con el movimiento reducido, sin animación
  assert.deepEqual([[...s1.cls], [...s2.cls]], [[], []]);
  // se vuelve al 1 antes de que acabe su salida: su animación de entrada no lo oculta
  slideStep(f, 2, 1, false);
  slideStep(f, 1, 2, false);
  slideStep(f, 2, 1, false);
  s1.hidden = false;
  s1.fire('animationend');
  assert.equal(s1.hidden, false);
});

test('flashEmpty: el campo parpadea con el aviso en su caja, y todo se va solo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = el();
  const box = el({ ownerDocument: { createElement: () => el() }, querySelector: () => old });
  const field = el();
  flashEmpty(field, box, 'Elige el equipo para seguir');
  assert.equal(old.removed, true);   // el aviso de antes, fuera
  const note = box.children[0];
  assert.deepEqual([note.className, note.textContent, field.cls.has('blink'), field.focused], ['rv-ed-note', 'Elige el equipo para seguir', true, true]);
  t.mock.timers.tick(FLASH_MS);
  assert.deepEqual([note.removed, field.cls.has('blink')], [true, false]);
});

test('fadeOut: se difumina, se oculta al acabar y entrega su temporizador', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const x = el(), timers = [];
  const gone = fadeOut(x, (id) => timers.push(id));
  assert.deepEqual([x.cls.has('leaving'), x.hidden, timers.length], [true, false, 1]);
  t.mock.timers.tick(FADE_MS);
  await gone;
  assert.deepEqual([x.cls.has('leaving'), x.hidden], [false, true]);
});

test('runPhases: marca las fases una a una y se para si la ventana se va', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const phases = [el(), el()], title = el(), list = el({ children: phases });
  Object.defineProperty(list, 'innerHTML', { set: () => {} });
  const loader = { querySelector: (q) => (q === '[data-loader-title]' ? title : list) };
  let alive = true;
  const done = runPhases(loader, 'Escalando la incidencia', '<li>…</li><li>…</li>', { alive: () => alive, track: () => {} });
  assert.deepEqual([title.textContent, [...phases[0].cls], [...phases[1].cls]], ['Escalando la incidencia', ['doing'], []]);
  t.mock.timers.tick(PHASE_MS);
  assert.deepEqual([[...phases[0].cls], [...phases[1].cls]], [['done'], ['doing']]);
  t.mock.timers.tick(PHASE_MS);
  await done;
  assert.deepEqual([...phases[1].cls], ['done']);
  // cerrada a mitad: no sigue marcando
  const again = [el(), el()];
  const list2 = el({ children: again });
  Object.defineProperty(list2, 'innerHTML', { set: () => {} });
  alive = true;
  runPhases({ querySelector: (q) => (q === '[data-loader-title]' ? el() : list2) }, 't', '', { alive: () => alive, track: () => {} });
  alive = false;
  t.mock.timers.tick(PHASE_MS);
  assert.deepEqual([[...again[0].cls], [...again[1].cls]], [['doing'], []]);
});
