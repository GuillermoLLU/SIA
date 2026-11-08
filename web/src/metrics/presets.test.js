import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createCharts } from './charts.js';
import { createTabs } from './tabs.js';
import { data } from './fixture.js';
import { PRESETS, presetRange, presetOf, prevRange, rangeLabel, periodLabel } from './period.js';

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

test('Resumen: fechas rápidas arriba y comparar con el periodo anterior o con T-Systems', () => {
  const m = twoYears(); m.S.sides = [{ company: 0 }, null]; m.resetPeriod(); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  let html = tabs.render('resumen', m.rows());
  const bar = (h) => h.slice(h.indexOf('<div class="mt-res-bar">'), h.indexOf('<section'));
  for (const [k] of PRESETS) assert.match(bar(html), new RegExp(`data-preset="${k}"`));
  assert.match(bar(html), /data-preset="fy" aria-pressed="true"/);
  assert.match(bar(html), /data-res-cmp="none" aria-pressed="true"/);
  assert.match(bar(html), /data-res-cmp="tsys" aria-pressed="false"/);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co"/g) || []).length, 0);
  // con el periodo anterior: cada KPI con el periodo y el anterior; solo los KPIs
  ui.resCmp = 'prev';
  html = tabs.render('resumen', m.rows());
  assert.match(bar(html), /data-res-cmp="prev" aria-pressed="true"/);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co"/g) || []).length, 3);
  assert.match(html, /<span title="Periodo">Periodo<\/span>/);
  assert.match(html, /<span title="Anterior">Anterior<\/span>/);
  assert.match(html, /frente a 01\/12\/2025 – 11\/01\/2026/);   // del 1 de febrero al 11 de marzo → del 1 de diciembre al 11 de enero
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 1);
  assert.doesNotMatch(html, /undefined|NaN/);
  // con T-Systems (el otro lado): T-Systems marcado y el periodo anterior, apagado
  m.S.sides[1] = { company: 1 }; m.refilter();
  html = tabs.render('resumen', m.rows());
  assert.match(bar(html), /data-res-cmp="tsys" aria-pressed="true"/);
  assert.match(bar(html), /data-res-cmp="prev" aria-pressed="false"/);
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 2);
  assert.match(html, /<span title="T-Systems">T-Systems<\/span>/);
});
