import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { createCommon } from '../metrics/tabs/common.js';
import { data } from '../metrics/fixture.js';
import { servicePanel, NO_DATA } from './panel.js';

const DAY = 1440;
const render = (svc, period = [0, 3 * DAY], d = data()) => {
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {}, svc };
  return servicePanel(createCommon(m, createCharts(m, ui), ui))(period);
};
const cardOf = (html, title) => { const a = html.indexOf(`<h3>${title}`); return html.slice(a, html.indexOf('</section>', a)); };

test('todas las métricas del catálogo, con las comparaciones apagadas de partida (TC-01 de la #81)', () => {
  const html = render();
  assert.doesNotMatch(html, /undefined|NaN/);
  for (const t of ['Tiempo de acción (Tatt)', 'Tiempo de resolución medio (MTTR)', 'Calidad de las incidencias', 'Evolución de las incidencias', 'Uso de la IA', 'Escalados']) assert.ok(html.includes(`<h3>${t}`), t);
  for (const t of ['THesc', 'Tesc', 'Tesc-r', 'Auditoría', 'Reapertura']) assert.ok(html.includes(t), t);
  assert.match(html, /data-svc="prev" aria-pressed="false"/);
  assert.match(html, /data-svc="ts" aria-pressed="false"/);
  assert.doesNotMatch(html, />T-Systems<\/th>/);
});

test('Tatt: el plazo de cada prioridad, si se cumple y una fila por día (TC-02)', () => {
  const html = cardOf(render(), 'Tiempo de acción (Tatt)');
  assert.match(html, /<td>Crítica<\/td><td class="mt-num">0,25 h<\/td><td class="mt-num mt-svc-ok"[^>]*>✓ 100,0 %/);
  assert.match(html, /Día a día \(3 días\)/);
  assert.match(html, /<td>01\/01\/2026<\/td><td class="mt-num mt-svc-ok"[^>]*>✓ 100,0 %/);
});

test('sin objetivo: el uso de la IA no dice si se cumple (TC-03)', () => {
  assert.doesNotMatch(cardOf(render(), 'Uso de la IA'), /✓|✗|mt-svc-ok|mt-svc-ko/);
});

test('un día sin valor dice «sin datos» y un conteo sin incidencias, 0 (TC-10)', () => {
  const html = render(undefined, [0, 3 * DAY]);
  const mttr = cardOf(html, 'Tiempo de resolución medio (MTTR)');
  assert.match(mttr, new RegExp(`<td>02/01/2026</td><td class="mt-num mt-mut">${NO_DATA}</td>`));
  assert.match(cardOf(html, 'Evolución de las incidencias'), /<td>03\/01\/2026<\/td><td class="mt-num"[^>]*>0<\/td>/);
});

test('comparar: cada lado en su sitio, por separado, también en las cifras de arriba (TC-06)', () => {
  const prev = render({ prev: true, ts: false }, [0, 3 * DAY]);
  assert.match(prev, /<th colspan="2">Año anterior<\/th>/);
  assert.doesNotMatch(prev, /<th colspan="2">T-Systems<\/th>/);
  assert.match(prev, /<div class="mt-kpi-d">abiertas en el periodo · Año anterior: /);
  const both = render({ prev: true, ts: true }, [0, 3 * DAY]);
  assert.match(both, /<th colspan="2">Año anterior<\/th><th colspan="2">T-Systems<\/th>/);
  assert.match(both, /No hay datos del año anterior/);
  assert.match(render({ prev: false, ts: true }, [0, 3 * DAY]), /<th colspan="2">Indra<\/th><th colspan="2">T-Systems<\/th>/);
});

test('sin datos de Jira traídos, THesc lo dice y el resto de la vista sigue (TC-13)', () => {
  const d = data(); d.meta.jira = { at: null, tickets: 0, message: 'No se llega a Jira' };
  const html = render(undefined, [0, 3 * DAY], d);
  assert.match(html, /aún no se ha traído nada/);
  assert.match(cardOf(html, 'Escalados'), new RegExp(`THesc</td><td class="mt-num mt-mut">${NO_DATA}`));
  assert.match(html, /Jira: No se llega a Jira/);
  assert.match(cardOf(html, 'Tiempo de acción (Tatt)'), /✓ 100,0 %/);
});

test('sin tiempos en días: todos en horas', () => {
  const d = data(); d.cols.res[1] = 2000 + 5 * DAY;
  assert.doesNotMatch(render({ prev: true, ts: true }, [0, 3 * DAY], d), /\bdías?\b \d|\d+ días? <|\d+ días?\b(?! de)(?!\))/);
});
