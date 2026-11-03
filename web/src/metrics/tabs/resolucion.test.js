import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('resolucion', m.rows());
};
// la tarjeta de las dos barras, dentro de «¿En qué se va el tiempo?»
const times = (html) => { const a = html.indexOf('<h3>En qué se va el tiempo</h3>'); return html.slice(a, html.indexOf('</section>', a)); };

test('Resolución y escalados: en qué se va el tiempo, arriba del todo (antes de las cifras), sin comparar y comparando', () => {
  for (const sides of [[{ company: 0 }, null], [{ people: new Set([1]) }, { company: 0 }]]) {
    const html = render(sides), card = html.indexOf('<h3>En qué se va el tiempo</h3>');
    assert.ok(card > 0 && card < html.indexOf('mt-kpis'));
    assert.equal(html.indexOf('<section'), html.lastIndexOf('<section', card));
  }
});

test('Resolución y escalados: en qué se va el tiempo, con las dos barras y una fila por barra para lo que se mira', () => {
  const html = times(render([{ company: 0 }, null]));
  assert.equal((html.match(/class="mt-svc-time"/g) || []).length, 2);
  assert.deepEqual([...html.matchAll(/<span class="mt-svc-who">([^<]*)<\/span>/g)].map((x) => x[1]), ['Indra', 'Indra']);
  // Indra, sin escalar: la crítica (60 min) y la baja (100 min) resueltas
  assert.match(html, /<b>1,3 h<\/b>/);
});

test('Resolución y escalados, comparando una persona con su equipo: una fila por cada lado en cada barra', () => {
  const html = times(render([{ people: new Set([1]) }, { company: 0 }]));
  assert.equal((html.match(/<span class="mt-svc-who">/g) || []).length, 4);
  assert.match(html, /<span class="mt-svc-who">Indra<\/span>/);
});
