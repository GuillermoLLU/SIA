import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

// En Servicio y en Equipo (ui.periodOnly: metrics-view.js), solo lo de las fechas de arriba: sin «Abiertas ahora / Del
// periodo», aunque se viniera de lo abierto ahora. En Técnicas, el selector se queda.
test('Servicio y Equipo: Módulos y focos, Escalados y SLA y calidad, sin el selector de abiertas ahora y solo del periodo', () => {
  const m = createModel(data()); m.refilter();
  const MODE = /data-(mod|esc|sla)-mode=/;
  const ui = { exp: {}, sort: {}, modNow: true, escNow: true, slaNow: true, periodOnly: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  for (const t of ['modulos', 'escalados', 'slaq']) {
    const html = tabs.render(t, m.rows(), { face: 'servicio', live: true });
    assert.doesNotMatch(html, MODE, t);
    assert.doesNotMatch(html, /Abiertas ahora|undefined|NaN/, t);
  }
  ui.periodOnly = false;   // Técnicas
  for (const t of ['modulos', 'escalados']) assert.match(tabs.render(t, m.rows(), { face: 'tecnicas', live: true }), MODE, t);
});
