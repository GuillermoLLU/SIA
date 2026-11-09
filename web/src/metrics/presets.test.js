import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createCharts } from './charts.js';
import { createTabs } from './tabs.js';
import { data } from './fixture.js';
import { PRESETS, presetRange, presetOf, prevRange, rangeLabel, periodLabel, cmpOptions, cmpRange } from './period.js';

// dos años cargados, con la foto el 11 de marzo de 2026 (como twoYears de period.test.js)
const twoYears = () => {
  const d = data(), year = 365 * 1440;
  d.meta.start = 2025; d.meta.first = 0; d.meta.last = 99800 + year; d.meta.snapshot += year;
  return createModel(d);
};
const apply = (m, k) => { m.setPeriod(...presetRange(m, k)); return periodLabel(m); };

test('las fechas rápidas: este mes, el pasado, los últimos 3 meses, el año fiscal y todo; y cuál es la de ahora', () => {
  const m = twoYears();
  assert.deepEqual(PRESETS.map(([k, l]) => [k, l]), [['month', 'Este mes'], ['prev', 'Mes pasado'], ['3m', 'Últimos 3 meses'], ['fy', 'Año fiscal'], ['all', 'Todo']]);
  assert.equal(apply(m, 'month'), '01/03/2026 – 11/03/2026');
  assert.equal(presetOf(m), 'month');
  assert.equal(apply(m, 'prev'), '01/02/2026 – 28/02/2026');
  assert.equal(presetOf(m), 'prev');
  assert.equal(apply(m, '3m'), '01/01/2026 – 11/03/2026');
  assert.equal(apply(m, 'fy'), '01/02/2026 – 11/03/2026');
  assert.equal(presetOf(m), 'fy');
  m.resetPeriod();
  assert.equal(presetOf(m), 'fy');   // el de partida
  assert.equal(apply(m, 'all'), '01/01/2025 – 11/03/2026');
  m.setPeriod(m.minuteOf(14, 3), m.minuteOf(14, 6));
  assert.equal(presetOf(m), null);
});

test('el periodo anterior: los mismos días del mes de antes, los meses enteros de antes o los días justo antes', () => {
  const m = twoYears();
  m.setPeriod(...presetRange(m, 'month'));   // del 1 al 11 de marzo
  assert.equal(rangeLabel(m, prevRange(m)), '01/02/2026 – 11/02/2026');
  m.setPeriod(...presetRange(m, 'prev'));    // febrero entero
  assert.equal(rangeLabel(m, prevRange(m)), '01/01/2026 – 31/01/2026');
  m.setPeriod(m.minuteOf(12), m.minuteOf(14));   // enero y febrero
  assert.equal(rangeLabel(m, prevRange(m)), '01/11/2025 – 31/12/2025');
  m.setPeriod(m.minuteOf(14, 5), m.minuteOf(14, 10));   // del 5 al 9 de marzo: los 5 días de antes
  assert.equal(rangeLabel(m, prevRange(m)), '28/02/2026 – 04/03/2026');
  m.setPeriod(...presetRange(m, 'all'));
  assert.equal(prevRange(m), null);   // nada antes de lo cargado
});

test('los periodos que se comparan: el actual, el anterior, las fechas rápidas y cada mes, del más reciente', () => {
  const m = twoYears(); m.resetPeriod();
  const o = cmpOptions(m);
  assert.deepEqual(o.slice(0, 6).map(([k, l]) => [k, l]), [['cur', 'Periodo actual'], ['prev', 'Periodo anterior'], ['p:month', 'Este mes'], ['p:prev', 'Mes pasado'], ['p:3m', 'Últimos 3 meses'], ['p:fy', 'Año fiscal']]);
  assert.deepEqual(o.slice(6, 8).map(([k, l]) => [k, l]), [['m:14', 'mar 2026'], ['m:13', 'feb 2026']]);
  assert.equal(o.at(-1)[0], 'm:0');
  assert.equal(rangeLabel(m, cmpRange(m, 'm:13')), '01/02/2026 – 28/02/2026');
  assert.equal(rangeLabel(m, cmpRange(m, 'cur')), periodLabel(m));
  m.setPeriod(...presetRange(m, 'all'));
  assert.equal(cmpRange(m, 'prev'), null);   // nada antes de lo cargado
});

test('Resumen: fechas rápidas y «Comparar», con su pop-up: sin comparar, un periodo frente a otro o frente a T-Systems', () => {
  const m = twoYears(); m.S.sides = [{ company: 0 }, null]; m.resetPeriod(); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  let html = tabs.render('resumen', m.rows());
  const bar = (h) => h.slice(h.indexOf('<div class="mt-res-bar">'), h.indexOf('<section'));
  const pop = (h) => h.slice(h.indexOf('<div class="mt-pop mt-res-pop"'), h.indexOf('<section'));
  for (const [k] of PRESETS) assert.match(bar(html), new RegExp(`data-preset="${k}"`));
  assert.match(bar(html), /data-preset="fy" aria-pressed="true"/);
  // el botón, sin comparar y sin ×; el pop-up, cerrado, sin «Sin comparar»: marcada la de periodos y, de partida, el
  // actual frente al anterior
  assert.match(bar(html), /<button class="mt-btn " data-res-pop aria-haspopup="true" aria-expanded="false">Comparar<\/button>/);
  assert.match(pop(html), /data-res-popup hidden/);
  assert.doesNotMatch(pop(html), /value="none"|Sin comparar/);
  assert.match(pop(html), /value="periods" checked/);
  assert.doesNotMatch(bar(html), /data-res-clear/);
  assert.match(pop(html), /<select data-res-a[^>]*><option value="cur" selected/);
  assert.doesNotMatch(pop(html).slice(0, pop(html).indexOf('data-res-b')), /value="prev"/);   // el primero, sin el anterior
  assert.match(pop(html), /<select data-res-b[^>]*><option value="prev" selected/);
  assert.match(pop(html), /value="tsys"/);
  assert.match(pop(html), /data-res-apply/);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 0);
  ui.resPop = true;
  assert.doesNotMatch(pop(tabs.render('resumen', m.rows())), /data-res-popup hidden/);
  // un periodo frente a otro: cada KPI con los dos; solo los KPIs
  ui.resPop = false; ui.resCmp = { a: 'm:13', b: 'm:12' };
  html = tabs.render('resumen', m.rows());
  assert.match(bar(html), /Comparar: <b>feb 2026 vs ene 2026<\/b><\/button><button class="mt-btn mt-x" data-res-clear title="Quitar la comparación"/);
  assert.match(pop(html), /value="periods" checked/);
  assert.match(pop(html), /<option value="m:13" selected/);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 4);
  assert.match(html, /<span title="feb 2026">feb 2026<\/span>/);
  assert.match(html, /<span title="ene 2026">ene 2026<\/span>/);
  assert.match(html, /feb 2026 \(01\/02\/2026 – 28\/02\/2026\) frente a ene 2026 \(01\/01\/2026 – 31\/01\/2026\)/);
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 1);
  assert.doesNotMatch(html, /undefined|NaN/);
  // Entrantes, en totales: la diferencia de entrantes y de resueltas, en unidades
  const inc = html.slice(html.indexOf('>Entrantes<'), html.indexOf('>MTTR<'));
  assert.match(inc, /<span title="feb 2026">feb 2026<\/span><b>\d+ <small class="mt-mut">· \d+ res\.<\/small><\/b>/);
  assert.match(inc, /<div class="mt-kpi-v [^"]*">(=|[+−]\d+) <small class="mt-mut">· (=|[+−]\d+) res\.<\/small><\/div>|<div class="mt-kpi-v mt-mut">—<\/div>/);
  // el backlog, una línea por periodo, cada una desde su primer día; con el selector de días, semanas o meses
  const evo = html.slice(html.indexOf('<h3>Evolución del backlog</h3>'));
  assert.match(evo, /<span><i class="mt-c0"><\/i>feb 2026<\/span><span><i class="mt-c1"><\/i>ene 2026<\/span>/);
  assert.match(evo, /<polyline class="mt-line mt-s0"[\s\S]*<polyline class="mt-line mt-s1"/);
  assert.equal((evo.match(/<rect class="mt-hit"/g) || []).length, 31);   // los días del más largo (enero)
  assert.match(evo, /Día 1\nfeb 2026: \d+ pendientes \(1 feb 2026, al acabar el día\)\nene 2026: \d+ pendientes \(1 ene 2026, al acabar el día\)/);
  assert.match(evo, /Día 31\nfeb 2026: sin datos/);
  assert.match(evo, /data-evo-step="day" aria-pressed="true"/);
  assert.doesNotMatch(evo, /mt-pq\d/);   // sin las barras por prioridad
  // el enlace al Histórico, con las fechas del primer periodo (feb 2026)
  assert.match(evo, new RegExp(`data-go="historico" data-go-evo="backlog" data-period="${m.minuteOf(13)}:${m.minuteOf(14)}"`));
  ui.evoStep = 'week';
  assert.match(tabs.render('resumen', m.rows()), /Semana 1\nfeb 2026: /);
  ui.evoStep = 'day';
  // el actual frente al anterior: el actual, lo de arriba
  ui.resCmp = { a: 'cur', b: 'prev' };
  html = tabs.render('resumen', m.rows());
  assert.match(html, /frente a Periodo anterior \(01\/12\/2025 – 11\/01\/2026\)/);
  // el mismo periodo frente a T-Systems (el otro lado): manda sobre la de periodos
  m.S.sides[1] = { company: 1 }; m.refilter();
  html = tabs.render('resumen', m.rows());
  assert.match(bar(html), /Comparar: <b>Indra vs T-Systems<\/b>/);
  assert.match(pop(html), /value="tsys" checked/);
  assert.match(bar(html), /data-res-clear/);   // también se quita con la ×
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 2);
  assert.match(html, /<span title="T-Systems">T-Systems<\/span>/);
});
