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

test('Escalados: los proyectos elegidos filtran las cifras, los proyectos y la sábana; sin elegir, todo', () => {
  const d = data();
  d.dict.vproj = ['', 'SGA', 'ITS'];
  d.cols.fl = d.cols.fl.map((x) => x | 131072);
  d.cols.vt = d.cols.vt.map(() => 1);
  d.cols.vp = d.cols.vp.map((_, i) => (i % 2 ? 2 : 1));
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const kpiN = (h) => h.match(/Incidencias escaladas<\/div><div class="mt-kpi-v">(\d+)/)[1];
  const sheetRows = (h) => (h.slice(h.indexOf('Sábana de incidencias')).match(/<td class="mt-subj"/g) || []).length;
  const all = tabs.render('escalados', m.rows());
  const total = Number(kpiN(all));
  assert.ok(total > 0);
  assert.equal(sheetRows(all), total);
  assert.equal(ui.escSheet.list.length, total);
  assert.doesNotMatch(all, /data-jc-clear/);
  ui.jiraPick = [1];
  const one = tabs.render('escalados', m.rows());
  assert.match(one, /data-jc-clear/);
  assert.ok(Number(kpiN(one)) < total);
  assert.equal(sheetRows(one), Number(kpiN(one)));
  assert.ok(ui.escSheet.list.every((i) => m.C.vp[i] === 1));
  assert.match(one, /<td>SGA<\/td>/);
  assert.doesNotMatch(one.slice(one.indexOf('Sábana de incidencias')), /<td>ITS<\/td>/);
  assert.doesNotMatch(one, /undefined|NaN/);
});

test('Malos escalados: con su motivo, abiertos o cerrados, y filtrados por los proyectos elegidos', () => {
  const d = data();
  d.dict.vproj = ['', 'SGA', 'ITS'];
  d.cols.vt = d.cols.vt.map(() => 1);
  d.cols.vp = d.cols.vp.map((_, i) => (i % 2 ? 2 : 1));
  d.cols.fl = d.cols.fl.map((x, i) => x | (i === 0 ? 2097152 | 4194304 : i === 1 ? 2097152 | 8388608 : i === 2 ? 2097152 | 4194304 | 8388608 : 0));
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const card = (h) => h.slice(h.indexOf('<h3>Malos escalados</h3>'), h.indexOf('</section>', h.indexOf('<h3>Malos escalados</h3>')));
  const all = card(tabs.render('escalados', m.rows()));
  assert.match(all, /<td>Descartado en Jira<\/td>/);
  assert.match(all, /<th>Equipo original → final<\/th>/);
  assert.match(all, /<td>Pendiente de actualizar<\/td>/);
  assert.doesNotMatch(all, /data-export/);
  assert.doesNotMatch(all, /undefined|NaN/);
  const shown = m.rows().filter((i) => m.C.fl[i] & 2097152).length;
  assert.match(all, new RegExp(`${shown} incidencias`));
  ui.jiraPick = [1];
  const one = card(tabs.render('escalados', m.rows()));
  assert.doesNotMatch(one, /<td>Cambió de equipo<\/td>/);
  assert.match(one, /<td>SGA<\/td>/);
  ui.jiraPick = [];
  assert.match(tabs.render('escalados', []), /Ningún mal escalado con estos filtros/);
});

test('¿Qué escalamos y a quién?: una tabla de los proyectos Jira de lo escalado y resuelto, como la de los módulos', () => {
  const d = data();
  d.cols.fl[0] |= 131072;   // la crítica de Indra (resuelta, TEC: SGA-1), escalada
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui), html = tabs.render('escalados', m.rows());
  const at = html.indexOf('¿Qué escalamos y a quién?'), card = html.slice(html.indexOf('<table class="mt-sc">', at), html.indexOf('</table>', at));
  const top = html.slice(0, html.indexOf('<table class="mt-sc">'));
  for (const label of ['Incidencias escaladas', 'THesc medio', 'Tesc medio', 'Tiempo total medio']) assert.ok(top.includes(label), label);
  const jc = html.slice(html.indexOf('Proyectos Jira frente a la media'), html.indexOf('<table class="mt-sc">'));
  assert.match(jc, /data-jc="1" aria-pressed="false"/);      // de partida, solo la media
  assert.doesNotMatch(jc, /class="mt-c0"/);
  assert.equal((jc.match(/class="mt-jc-panel"/g) || []).length, 3);
  for (const label of ['THesc medio', 'Tesc medio', 'Tiempo total medio', 'Media global']) assert.ok(jc.includes(label), label);
  assert.doesNotMatch(jc, /undefined|NaN/);
  ui.jiraPick = [1];
  const added = tabs.render('escalados', m.rows());
  assert.match(added, /data-jc="1" aria-pressed="true"/);
  assert.equal((added.match(/class="mt-jc-d ">0 %</g) || []).length, 1);   // solo el proyecto: es el único, igual que la media en el tiempo total; sin THesc ni Tesc, nada
  assert.equal((added.match(/class="mt-jc-row"/g) || []).length, 6);   // la media y el proyecto, en las tres gráficas
  assert.doesNotMatch(html, /Unas veces se escala|Un mismo ticket/);
  assert.match(html, /<h3>Malos escalados<\/h3>/);
  const res = tabs.render('resolucion', m.rows());
  assert.doesNotMatch(res, /¿Qué escalamos y a quién\?|Proyectos Jira|Malos escalados/);
  assert.match(res, /¿Qué módulos tardan más\?/);
  assert.match(card, /<th rowspan="2" class="mt-sc-title">Proyectos Jira<\/th>/);
  assert.match(card, /data-f="vp:1"><th class="mt-r" title="SGA">SGA<\/th>/);
  assert.match(card, /Todo lo escalado a Jira/);
  assert.doesNotMatch(card, /\(sin clave Jira\)/);
});
