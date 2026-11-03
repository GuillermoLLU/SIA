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

test('SLA y calidad: tras las cifras de arriba, ¿Empezamos a tiempo? (en qué se va el tiempo está en Resolución y escalados)', () => {
  for (const sides of [[{ company: 0 }, null], [{ company: 0 }, { company: 1 }]]) {
    const html = render(sides);
    assert.ok(html.indexOf('¿Empezamos a tiempo?') > html.indexOf('mt-kpis'));
    assert.doesNotMatch(html, /En qué se va el tiempo|mt-svc-time/);
  }
});
