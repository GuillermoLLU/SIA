import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (svc, d = data()) => {
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {}, svc }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('servicio', m.rows());
};

test('en la pestaña no queda ningún tiempo en días', () => {
  const d = data();
  d.cols.res[1] = 2000 + 5 * 1440;   // la de T-Systems tarda 5 días
  assert.doesNotMatch(render({ prev: true, ts: true }, d), /\bdías?\b \d|\d+ días?\b/);
});

test('sin la gráfica de en qué se va el tiempo: está en SLA y calidad', () => {
  const html = render({ prev: true, ts: true });
  assert.doesNotMatch(html, /mt-svc-times|En qué se va el tiempo/);
  assert.match(html, /¿Cumplimos los SLA\?/);
});
