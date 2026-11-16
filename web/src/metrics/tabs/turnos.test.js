import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { createCommon } from './common.js';
import { evolutionOf } from './evolucion.js';
import { data } from '../fixture.js';

const render = (shifts, d = data()) => {
  d.cols.sV[1] = [3];   // la 1 (de T-Systems, la mañana del día 1), a proveedor en su turno
  const m = createModel(d); m.S.sides = [{ company: 1 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, shifts }, ch = createCharts(m, ui);
  // la gráfica ya no está en la pestaña Turnos: se prueba la pieza (evolucion.js, byShift)
  return { card: evolutionOf(createCommon(m, ch, ui)).byShift(m.rows()) };
};
const picked = (card) => [...card.matchAll(/<button class="mt-seg-b ([^"]*)" data-shk="(\d)"/g)].map((x) => [Number(x[2]), x[1].includes('mt-on')]);

test('Turnos: arriba del todo, las cifras por turno; luego, el día en 24 horas, qué se queda para el siguiente y la prioridad; sin entrantes frente a atendidas', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  const cards = [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((x) => x[1]);
  assert.deepEqual(cards.slice(0, 3), ['El día en 24 horas', '¿Qué se queda para el turno siguiente?', 'Prioridad por turno']);
  assert.ok(html.indexOf('mt-kpis') < html.indexOf('<h3>El día en 24 horas</h3>'));
  assert.match(html.slice(html.indexOf('mt-kpis')), /^mt-kpis">[\s\S]*?Entran de mañana/);
  assert.doesNotMatch(html, /Entrantes frente a atendidas/);
});

test('entrantes frente a atendidas en su turno (la pieza): de partida, los tres turnos juntos', () => {
  const { card } = render(undefined);
  assert.deepEqual(picked(card), [[0, true], [1, true], [2, true]]);
  assert.match(card, />Mañana <small>7 a 15 h<\/small><\/button>/);
  // T-Systems: entra 1, de mañana, y se atiende en su turno
  assert.match(card, /En el periodo: 1 entrantes · 1 atendidas en el turno en que entraron \(100 %\)/);
  assert.match(card, /todos los turnos\nEntraron: 1\nAtendidas en su turno: 1/);
  assert.doesNotMatch(card, /reinicia SIA/);
});

test('entrantes frente a atendidas (la pieza): los turnos elegidos, uno o varios juntos', () => {
  const tarde = render([1]).card;
  assert.deepEqual(picked(tarde), [[0, false], [1, true], [2, false]]);
  assert.match(tarde, /En el periodo: 0 entrantes/);
  const two = render([0, 2]).card;
  assert.match(two, /turnos de mañana \(7 a 15 h\) y noche \(23 a 7 h\)/);
  assert.match(two, /En el periodo: 1 entrantes · 1 atendidas/);
});

test('entrantes frente a atendidas (la pieza): sin los turnos de lo atendido (bridge de antes), lo dice', () => {
  const d = data(); delete d.cols.sR; delete d.cols.sV; delete d.cols.sC;
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {} }, html = evolutionOf(createCommon(m, createCharts(m, ui), ui)).byShift(m.rows());
  assert.match(html, /Faltan los turnos de lo atendido: reinicia SIA/);
});
