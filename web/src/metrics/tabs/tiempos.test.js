import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

test('en el informe Análisis de tiempos: sin la pregunta y con los dos desgloses, por módulo y por centro; la pestaña, con el suyo', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const tab = tabs.render('tiempos', m.rows()), rep = tabs.render('tiempos', m.rows(), { inReport: true });
  assert.match(tab, /class="mt-ask"/);
  assert.ok(tab.includes('<h3>Por módulo') && !tab.includes('<h3>Por centro'), 'la pestaña, solo el desglose elegido');
  assert.doesNotMatch(rep, /class="mt-ask"/);
  assert.ok(rep.includes('<h3>Por módulo') && rep.includes('<h3>Por centro'), 'el informe, los dos');
  for (const s of ['En qué se va el tiempo', 'Problemas comunes']) assert.ok(rep.includes(s), s);
  assert.ok(!rep.includes('Sábana de incidencias') && tab.includes('Sábana de incidencias'), 'la sábana, en la pestaña y nunca en el informe');
  assert.equal(tabs.render('tiempos', m.rows()), tab, 'volver a la pestaña la deja como estaba');
});
