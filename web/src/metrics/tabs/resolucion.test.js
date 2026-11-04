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

test('¿Qué escalamos y a quién?: una tabla de los proyectos Jira de lo escalado y resuelto, como la de los módulos', () => {
  const d = data();
  d.cols.fl[0] |= 131072;   // la crítica de Indra (resuelta, TEC: SGA-1), escalada
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('resolucion', m.rows());
  const at = html.indexOf('¿Qué escalamos y a quién?'), card = html.slice(html.indexOf('<table class="mt-sc">', at), html.indexOf('</table>', at));
  assert.ok(at > html.indexOf('¿Qué módulos tardan más?'));
  assert.match(card, /<th rowspan="2" class="mt-sc-title">Proyectos Jira<\/th>/);
  assert.match(card, /data-f="vp:1"><th class="mt-r" title="SGA">SGA<\/th>/);
  assert.match(card, /Todo lo escalado a Jira/);
  assert.doesNotMatch(card, /\(sin clave Jira\)/);
});
