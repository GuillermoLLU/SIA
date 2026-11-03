import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('sla', m.rows());
};
const times = (html) => html.slice(html.indexOf('¿En qué se va el tiempo?'), html.indexOf('¿Empezamos a tiempo?'));

test('SLA y calidad: en qué se va el tiempo, lo primero tras las cifras de arriba (sin comparar y comparando)', () => {
  for (const sides of [[{ company: 0 }, null], [{ company: 0 }, { company: 1 }]]) {
    const html = render(sides), at = html.indexOf('¿En qué se va el tiempo?');
    assert.ok(at > html.indexOf('mt-kpis') && at < html.indexOf('¿Empezamos a tiempo?'));
  }
});

test('SLA y calidad: en qué se va el tiempo, con las dos barras y una fila por barra para lo que se mira', () => {
  const html = times(render([{ company: 0 }, null]));
  assert.equal((html.match(/class="mt-svc-time"/g) || []).length, 2);
  assert.deepEqual([...html.matchAll(/<span class="mt-svc-who">([^<]*)<\/span>/g)].map((x) => x[1]), ['Indra', 'Indra']);
  // Indra, sin escalar: la crítica (60 min) y la baja (100 min) resueltas
  assert.match(html, /<b>1,3 h<\/b>/);
});

test('SLA y calidad, comparando: una fila por cada lado de arriba', () => {
  const html = times(render([{ company: 0 }, { company: 1 }]));
  assert.deepEqual([...html.matchAll(/<span class="mt-svc-who">([^<]*)<\/span>/g)].map((x) => x[1]), ['Indra', 'T-Systems', 'Indra', 'T-Systems']);
});
