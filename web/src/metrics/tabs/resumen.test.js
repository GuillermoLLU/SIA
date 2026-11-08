import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';
import { mttrOf } from '../resolution.js';
import { iaStats } from '../ia.js';
import { dur, pct } from '../format.js';
import { periodLabel } from '../period.js';
import { dayBuckets, bucketTicks } from '../plot.js';

const setup = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} };
  return { m, tabs: createTabs(m, createCharts(m, ui), ui) };
};
const kpiOf = (html, label) => html.match(new RegExp(`<div class="mt-kpi-l"[^>]*>${label}</div><div class="mt-kpi-v[^"]*">([^<]*)<`))?.[1];

test('Resumen: la corona de Foto de hoy (lo abierto ahora) y, del periodo, MTTR, %IQA y uso de la IA', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  const html = tabs.render('resumen', m.rows()), hoy = tabs.render('hoy', m.rows());
  const ring = (h) => { const a = h.indexOf('<h3>En qué estado está</h3>'); return h.slice(a, h.indexOf('</section>', a)); };
  assert.equal(ring(html), ring(hoy));   // la misma corona, con lo de ahora
  assert.ok(html.indexOf('En qué estado está') < html.indexOf('>MTTR<'));
  const A = m.rows();
  assert.equal(kpiOf(html, 'MTTR'), dur(mttrOf(m, A).mttr));
  assert.equal(kpiOf(html, '%IQA'), '—');   // aún sin datos
  assert.equal(kpiOf(html, 'Uso de la IA'), pct(iaStats(A, m.C).share, 1));
  assert.match(html, /tarea #55/);
  // las fechas, arriba y fuera de las tarjetas (abren el calendario de arriba); en la misma fila, la corona (s4) y, a su
  // derecha, los KPIs (s8); abajo del todo, el backlog de cada día, en barras por prioridad y sin selector de vista
  const bar = html.slice(html.indexOf('<div class="mt-res-bar">'), html.indexOf('<section'));
  assert.match(bar, new RegExp(`<button class="mt-btn mt-res-dates" data-calendar[^>]*>${periodLabel(m).replace(/[/]/g, '\/')}</button>`));
  const cards = [...html.matchAll(/<section class="mt-card mt-(s\d+)[^"]*"><h3>([^<]*)<\/h3>/g)].map((x) => [x[1], x[2]]);
  assert.deepEqual(cards, [['s4', 'En qué estado está'], ['s8', 'Del periodo'], ['s12', 'Evolución del backlog']]);
  const evo = html.slice(html.indexOf('<h3>Evolución del backlog</h3>'));
  assert.match(evo, /<rect class="mt-pq\d"/);   // barras apiladas por prioridad
  assert.match(evo, /Tendencia/);
  assert.doesNotMatch(evo, /data-evo=/);
  assert.equal((html.match(/data-calendar/g) || []).length, 1);
  // de partida, el año fiscal en curso: desde el 1 de febrero (o desde lo primero cargado)
  m.resetPeriod();
  assert.equal(m.S.d0, Math.max(m.MIN_D, m.minuteOf(m.LASTM - (((m.LASTM - 1) % 12) + 12) % 12)));
  assert.doesNotMatch(html, /Quién tiene qué|Sábana de incidencias|undefined|NaN/);   // eso, en Foto de hoy
  // los KPIs son del periodo; la corona, no
  const empty = tabs.render('resumen', []);
  assert.equal(kpiOf(empty, 'MTTR'), '—');
  assert.equal(ring(empty), ring(html));
});

test('el backlog del Resumen, por días, semanas o meses: cada barra, lo abierto al acabar su tramo', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  m.setPeriod(m.MIN_D, m.END_D);
  const ui = { exp: {}, sort: {} }, t = createTabs(m, createCharts(m, ui), ui);
  const evo = () => { const h = t.render('resumen', m.rows()); return h.slice(h.indexOf('<h3>Evolución del backlog</h3>')); };
  const bars = (h) => (h.match(/<rect class="mt-hit"/g) || []).length;
  const days = Math.round((m.END_D - m.S.d0) / 1440);
  let h = evo();
  assert.match(h, /data-evo-step="day" aria-pressed="true"/);
  assert.equal(bars(h), days);
  ui.evoStep = 'week';
  h = evo();
  assert.match(h, /data-evo-step="week" aria-pressed="true"/);
  assert.equal(bars(h), dayBuckets(m, days, 'week').length);
  assert.match(h, /Semana del /);
  assert.match(h, /a la semana/);
  ui.evoStep = 'month';
  h = evo();
  assert.equal(bars(h), dayBuckets(m, days, 'month').length);
  assert.match(h, /al acabar el mes \(hasta la última carga\)/);   // el último, incompleto
  assert.doesNotMatch(h, /undefined|NaN/);
  ui.evoStep = 'week';
  assert.match(t.render('historico', m.rows()), /data-evo-step="week" aria-pressed="true"/);   // también en el Histórico
});

test('los tramos: semanas de lunes a domingo y meses, con los extremos incompletos', () => {
  const m = createModel(data());   // 2026: el 1 de enero, jueves
  m.setPeriod(0, 40 * 1440);
  const w = dayBuckets(m, 40, 'week');
  assert.deepEqual(w.slice(0, 2), [{ from: 0, to: 3 }, { from: 4, to: 10 }]);   // jue–dom; el lunes 5, una nueva
  assert.deepEqual(w.at(-1), { from: 39, to: 39 });                              // el lunes 9 de febrero, solo
  assert.deepEqual(dayBuckets(m, 40, 'month'), [{ from: 0, to: 30 }, { from: 31, to: 39 }]);
  assert.equal(dayBuckets(m, 40, 'day').length, 40);
  assert.deepEqual(bucketTicks(m, dayBuckets(m, 40, 'month'), 'month').map((x) => x.label), ['ene', 'feb']);
});

test('Resumen, comparando: la corona de cada lado y cada KPI con los dos lados', () => {
  const { m, tabs } = setup([{ company: 0 }, { company: 1 }]);
  const html = tabs.render('resumen', m.rows());
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 2);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co"/g) || []).length, 3);
  assert.match(html, /<section class="mt-card mt-s12 [^"]*"><h3>Del periodo<\/h3>/);   // comparando, debajo de la corona
  assert.match(html.slice(html.indexOf('<h3>Evolución del backlog</h3>')), /<polyline class="mt-line mt-s0"[\s\S]*<polyline class="mt-line mt-s1"/);   // una línea por lado
  assert.doesNotMatch(html, /undefined|NaN/);
});
