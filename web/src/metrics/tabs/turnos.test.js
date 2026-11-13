import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (shifts, d = data()) => {
  d.cols.sV[1] = [3];   // la 1 (de T-Systems, la mañana del día 1), a proveedor en su turno
  const m = createModel(d); m.S.sides = [{ company: 1 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, shifts }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  const at = html.indexOf('<h3>Entrantes frente a atendidas en su turno</h3>');
  return { html, at, card: html.slice(at, html.indexOf('<h3>Turno a turno</h3>')) };
};
const picked = (card) => [...card.matchAll(/<button class="mt-seg-b ([^"]*)" data-shk="(\d)"/g)].map((x) => [Number(x[2]), x[1].includes('mt-on')]);

test('Turnos: entrantes frente a atendidas en su turno, tras las cifras de arriba; de partida, los tres turnos juntos', () => {
  const { html, at, card } = render(undefined);
  assert.ok(at > html.indexOf('mt-kpis') && at < html.indexOf('<h3>Turno a turno</h3>'));
  assert.deepEqual(picked(card), [[0, true], [1, true], [2, true]]);
  assert.match(card, />Mañana <small>7 a 15 h<\/small><\/button>/);
  // T-Systems: entra 1, de mañana, y se atiende en su turno
  assert.match(card, /En el periodo: 1 entrantes · 1 atendidas en el turno en que entraron \(100 %\)/);
  assert.match(card, /todos los turnos\nEntraron: 1\nAtendidas en su turno: 1/);
  assert.doesNotMatch(card, /reinicia SIA/);
});

test('Turnos: los turnos elegidos, uno o varios juntos', () => {
  const tarde = render([1]).card;
  assert.deepEqual(picked(tarde), [[0, false], [1, true], [2, false]]);
  assert.match(tarde, /En el periodo: 0 entrantes/);
  const two = render([0, 2]).card;
  assert.match(two, /turnos de mañana \(7 a 15 h\) y noche \(23 a 7 h\)/);
  assert.match(two, /En el periodo: 1 entrantes · 1 atendidas/);
});

test('Turnos: sin los turnos de lo atendido (bridge de antes), lo dice', () => {
  const d = data(); delete d.cols.sR; delete d.cols.sV; delete d.cols.sC;
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  assert.match(html, /Faltan los turnos de lo atendido: reinicia SIA/);
});
