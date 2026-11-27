import test from 'node:test';
import assert from 'node:assert/strict';
import { tabReportTitle, tabReportHead, humanList } from './tab-report.js';
import { createModel } from './model.js';
import { createCharts } from './charts.js';
import { createTabs } from './tabs.js';
import { faceTabs, FACES } from './faces.js';
import { data } from './fixture.js';

test('«Exportar PDF» de una pestaña: un título para personas, con lo que se compara o se mira y las pestañas', () => {
  assert.equal(tabReportTitle({ tabs: ['Resumen', 'Backlog'], versus: ['SISU', 'SGA'] }), 'Comparativa SISU vs. SGA: resumen y backlog');
  assert.equal(tabReportTitle({ tabs: ['Rendimiento equipos', 'Turnos'], subject: 'SISU' }), 'SISU: rendimiento equipos y turnos');
  assert.equal(tabReportTitle({ tabs: ['Resumen', 'SLA y calidad', 'Uso de la IA'], subject: 'Indra' }), 'Indra: resumen, SLA y calidad y uso de la IA');   // las siglas, tal cual
  assert.equal(tabReportTitle({ tabs: ['Turnos'], versus: ['ANA', 'LUIS'] }), 'Comparativa ANA vs. LUIS: turnos');
  assert.equal(tabReportTitle({ tabs: ['Turnos'] }), 'Turnos');
  assert.equal(humanList(['a', 'b', 'c']), 'a, b y c');
});

test('«Exportar PDF» de una pestaña: la cabecera, con lo que se mira, lo que se compara y los filtros', () => {
  const at = new Date(2026, 10, 20, 9, 5);
  const one = tabReportHead({ face: 'Servicio', tabs: ['Resumen'], period: '01/11/2026 – 20/11/2026', sides: ['Indra'], coverage: 'Datos desde…', generatedAt: at });
  assert.match(one, /<h1>Resumen<\/h1>/);   // sin título, el de las pestañas
  assert.match(tabReportHead({ title: 'Comparativa SISU vs. SGA: resumen y backlog', face: 'Servicio', tabs: ['Resumen', 'Backlog'], period: 'p', generatedAt: at }), /<h1>Comparativa SISU vs\. SGA: resumen y backlog<\/h1>/);
  assert.match(one, /<dt>Pestaña<\/dt><dd>Resumen<\/dd>/);
  assert.match(one, /<dt>Se mira<\/dt><dd>Indra<\/dd>/);
  assert.match(one, /<dt>Filtros<\/dt><dd>Ninguno<\/dd>/);
  assert.match(one, /<dt>Generado<\/dt><dd>20\/11\/2026 09:05<\/dd>/);
  const two = tabReportHead({ face: 'Equipo', tabs: ['Rendimiento equipos', 'Turnos'], period: 'p', sides: ['ANA', 'LUIS'], compare: 'SISU frente a SGA', filters: ['Prioridad: Alta', 'Búsqueda: <x>'], generatedAt: at });
  assert.match(two, /<dt>Pestañas<\/dt><dd>1. Rendimiento equipos, 2. Turnos<\/dd>/);
  assert.match(two, /<dt>Comparando<\/dt><dd>ANA frente a LUIS<\/dd>/);
  assert.match(two, /<dt>Comparando<\/dt><dd>SISU frente a SGA<\/dd>/);
  assert.match(two, /<dd>Prioridad: Alta · Búsqueda: &lt;x&gt;<\/dd>/);   // escapado
});

test('«Exportar PDF»: todas las pestañas de todas las vistas se pintan para el informe (sin la vista en vivo), con su vista', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  for (const f of FACES) for (const [k] of faceTabs(f.id)) {
    const html = tabs.render(k, m.rows(), { face: f.id });
    assert.ok(html.length > 100 && !/undefined|NaN/.test(html.replace(/data-tip="[^"]*"/g, '')), `${f.id} · ${k}`);
  }
});

test('la cabecera: con varias pestañas, numeradas en el orden en que salen', () => {
  const at = new Date(2026, 10, 20, 9, 0);
  assert.match(tabReportHead({ face: 'Servicio', tabs: ['Módulos y focos', 'Backlog', 'Resumen'], period: 'p', generatedAt: at }), /<dt>Pestañas<\/dt><dd>1\. Módulos y focos, 2\. Backlog, 3\. Resumen<\/dd>/);
  assert.match(tabReportHead({ face: 'Servicio', tabs: ['Resumen'], period: 'p', generatedAt: at }), /<dt>Pestaña<\/dt><dd>Resumen<\/dd>/);
});
