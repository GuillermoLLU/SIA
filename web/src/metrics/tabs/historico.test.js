import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs, TABS } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('historico', m.rows());
};
const cut = (html, from) => { const a = html.indexOf(from); return html.slice(a, html.indexOf('</section>', a)); };

test('el orden de las pestañas: Resumen, Foto de hoy, Escalados, Pendiente de cliente, Entrantes, Análisis tiempos, Calidad, Uso de la IA e Histórico; luego, el resto', () => {
  assert.deepEqual(TABS.slice(0, 9).map(([k, l]) => [k, l]), [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['escalados', 'Escalados'],
    ['cliente', 'Pendiente de cliente'], ['entrada', 'Entrantes'], ['tiempos', 'Análisis tiempos'], ['calidad', 'Calidad'], ['ia', 'Uso de la IA'], ['historico', 'Histórico']]);
  assert.deepEqual(TABS[9], ['sla', 'SLAs']);   // detrás del Histórico
  assert.equal(new Set(TABS.map(([k]) => k)).size, TABS.length);   // ninguna repetida
});

test('Histórico: lo recibido en el periodo, un bloque por pregunta y su evolución mes a mes', () => {
  const html = render([{ company: 0 }, null]);
  assert.match(html, /¿Cómo ha ido en el periodo\?/);
  assert.equal((html.match(/<section class="mt-card mt-ans">/g) || []).length, 6);
  // ¿Qué tenemos?, con sus cifras (Indra: 3 recibidas, 1 pendiente fuera de plazo) y los botones a Entrada y Backlog
  const have = cut(html, '¿Qué tenemos?');
  for (const l of ['Recibidas', 'Entran al día', 'Pendientes', 'Fuera de plazo']) assert.match(have, new RegExp(`<span>${l}</span>`));
  assert.match(have, /<span>Recibidas<\/span><b>3<\/b>/);
  assert.match(have, /data-go="entrada"[^>]*>Entrantes →<\/button><button class="mt-go" data-go="backlog">Backlog →/);   // lo de Foto de hoy, en Backlog
  assert.match(html, /<h3>Evolución mes a mes<\/h3>/);
  // y lo primero, antes de los bloques, la evolución del backlog día a día
  const ev = html.indexOf('<h3>Evolución del backlog</h3>');
  assert.ok(ev > 0 && ev < html.indexOf('mt-answers'));
  assert.equal(html.indexOf('<section'), html.lastIndexOf('<section', ev));
  // sin lo de ahora, que está en el Resumen
  assert.doesNotMatch(html, /¿Cómo está el backlog ahora\?|mt-donut|class="mt-seg"/);
});

test('¿Qué tenemos?: al día, las que pasaron a Resuelta, a Pendiente de proveedor y a Pendiente de cliente en el periodo', () => {
  const d = data();
  d.cols.eV[0] = Array.from({ length: 35 }, (_, k) => k);                   // 35 días de 70: 0,5 al día
  d.cols.eC[0] = [...Array.from({ length: 70 }, (_, k) => k), 100, 100];    // 70 de 70 (lo de fuera del periodo no cuenta): 1,0
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, have = cut(createTabs(m, createCharts(m, ui), ui).render('historico', m.rows()), '¿Qué tenemos?');
  assert.doesNotMatch(have, /Cerramos al día/);
  assert.match(have, /<span>Entran al día<\/span><b>[^<]*<\/b><\/div><div [^>]*><span>Resueltas al día<\/span><b>0,0<\/b>.*<span>Escaladas a proveedor al día<\/span><b>0,5<\/b>.*<span>Pendientes de cliente al día<\/span><b>1,0<\/b>/s);
});

test('Histórico, comparando: cada cifra con la diferencia con el otro lado', () => {
  const html = render([{ company: 0 }, { company: 1 }]);
  assert.match(cut(html, '¿Qué tenemos?'), /<span>Recibidas<\/span><b>3<\/b><b class="mt-diff [^"]*" data-cmp="3¦\+200 %¦1¦">\+2<\/b>/);
});

test('en el informe Resumen básico: lo que añade al Resumen, sin la pregunta, sin la evolución del backlog ni las cifras que ya dan sus KPIs', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const full = tabs.render('historico', m.rows()), rep = tabs.render('historico', m.rows(), { inReport: true });
  // en la pestaña, todo
  for (const s of ['class="mt-ask"', 'Evolución del backlog', '<span>Recibidas</span>', '<span>Empezadas dentro del SLA</span>', '<span>Con alguna marca de IA</span>']) assert.ok(full.includes(s), s);
  // en el informe, ni la pregunta ni lo repetido
  for (const s of ['class="mt-ask"', 'Evolución del backlog', '<span>Recibidas</span>', '<span>Empezadas dentro del SLA</span>', '<span>Con alguna marca de IA</span>']) assert.ok(!rep.includes(s), s);
  // y lo demás, igual
  for (const s of ['¿Qué tenemos?', '<span>Entran al día</span>', '<span>Media de resolución</span>', '<span>Primera actuación, de media</span>', '<span>De las resueltas, con IA</span>', '<span>Empezadas en el turno en que entran</span>', 'Incidencias recibidas']) assert.ok(rep.includes(s), s);
  // y volver a la pestaña la deja como estaba
  assert.equal(tabs.render('historico', m.rows()), full);
});
