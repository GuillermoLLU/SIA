import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

test('Escalados en el informe: sin la pregunta, el selector ni la comparativa; la tabla por proyecto Jira, módulo y centro', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  for (const now of [true, false]) {
    ui.escNow = now;
    const app = tabs.render('escalados', m.rows()), rep = tabs.render('escalados', m.rows(), { inReport: true });
    assert.match(app, /class="mt-ask"/);
    assert.match(app, /data-esc-mode=/);
    assert.match(app, /data-esc-by=/);
    assert.doesNotMatch(rep, /class="mt-ask"|data-esc-mode=|data-esc-by=|Proyectos Jira frente a la media/);
    for (const d of ['vp', 'mo', 'ce']) assert.match(rep, new RegExp(`rs-${d}`), d);
    assert.match(rep, /Malos escalados/);
    assert.doesNotMatch(rep, /Sábana de incidencias/);   // nunca en un informe
    assert.match(app, /Sábana de incidencias/);
    assert.doesNotMatch(rep, /undefined|NaN/);
  }
});
