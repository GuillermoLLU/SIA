import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createCharts } from './charts.js';
import { createTabs } from './tabs.js';
import { data } from './fixture.js';
import { PRESETS, QUICK_PRESETS, presetRange, presetOf, prevRange, rangeLabel, periodLabel, cmpOptions, cmpRange } from './period.js';
import { companyPick, presetPick, comparePop, pickCompany, pickPreset } from './quick-bar.js';

// dos años cargados, con la foto el 11 de marzo de 2026 (como twoYears de period.test.js)
const twoYears = () => {
  const d = data(), year = 365 * 1440;
  d.meta.start = 2025; d.meta.first = 0; d.meta.last = 99800 + year; d.meta.snapshot += year;
  return createModel(d);
};
const apply = (m, k) => { m.setPeriod(...presetRange(m, k)); return periodLabel(m); };

test('las fechas rápidas: esta semana, este mes, el pasado, los últimos 3 meses, el año fiscal y todo; y cuál es la de ahora', () => {
  const m = twoYears();
  assert.deepEqual(PRESETS.map(([k, l]) => [k, l]), [['week', 'Esta semana'], ['month', 'Este mes'], ['prev', 'Mes pasado'], ['3m', 'Últimos 3 meses'], ['fy', 'Año fiscal'], ['all', 'Todo']]);
  // esta semana: del lunes a la foto (el 11 de marzo de 2026 es miércoles)
  assert.equal(apply(m, 'week'), '09/03/2026 – 11/03/2026');
  assert.equal(presetOf(m), 'week');
  assert.equal(rangeLabel(m, prevRange(m)), '06/03/2026 – 08/03/2026');   // el periodo anterior: los mismos días justo antes
  assert.equal(apply(m, 'month'), '01/03/2026 – 11/03/2026');
  assert.equal(presetOf(m), 'month');
  assert.equal(apply(m, 'prev'), '01/02/2026 – 28/02/2026');
  assert.equal(presetOf(m), 'prev');
  assert.equal(apply(m, '3m'), '01/01/2026 – 11/03/2026');
  assert.equal(apply(m, 'fy'), '01/02/2026 – 11/03/2026');
  assert.equal(presetOf(m), 'fy');
  m.resetPeriod();
  assert.equal(periodLabel(m), '01/03/2025 – 11/03/2026');   // el de partida: desde el mes de la abierta más antigua
  assert.equal(presetOf(m), null);
  assert.equal(apply(m, 'all'), '01/01/2025 – 11/03/2026');
  m.setPeriod(m.minuteOf(14, 3), m.minuteOf(14, 6));
  assert.equal(presetOf(m), null);
});

test('el periodo anterior: los mismos días justo antes; con meses enteros, los meses enteros de antes', () => {
  const m = twoYears();
  m.setPeriod(...presetRange(m, 'month'));   // del 1 al 11 de marzo (hasta la última carga): los 11 días de antes
  assert.equal(rangeLabel(m, prevRange(m)), '18/02/2026 – 28/02/2026');
  m.setPeriod(m.minuteOf(12, 1), m.minuteOf(14, 11));   // del 1 de enero al 10 de marzo, 69 días: los 69 de antes
  assert.equal(rangeLabel(m, prevRange(m)), '24/10/2025 – 31/12/2025');
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
  const m = twoYears(); m.setPeriod(...presetRange(m, 'month'));
  const o = cmpOptions(m);
  assert.deepEqual(o.slice(0, 7).map(([k, l]) => [k, l]), [['cur', 'Periodo actual'], ['prev', 'Periodo anterior'], ['p:week', 'Esta semana'], ['p:month', 'Este mes'], ['p:prev', 'Mes pasado'], ['p:3m', 'Últimos 3 meses'], ['p:fy', 'Año fiscal']]);
  assert.deepEqual(o.slice(7, 9).map(([k, l]) => [k, l]), [['m:14', 'mar 2026'], ['m:13', 'feb 2026']]);
  assert.equal(o.at(-1)[0], 'm:0');
  assert.equal(rangeLabel(m, cmpRange(m, 'm:13')), '01/02/2026 – 28/02/2026');
  assert.equal(rangeLabel(m, cmpRange(m, 'cur')), periodLabel(m));
  m.setPeriod(...presetRange(m, 'all'));
  assert.equal(cmpRange(m, 'prev'), null);   // nada antes de lo cargado
});

test('Resumen: fechas rápidas y «Comparar», en modo comparar: sin comparar, un periodo frente a otro o frente a T-Systems', () => {
  const m = twoYears(); m.S.sides = [{ company: 0 }, null]; m.setPeriod(...presetRange(m, 'month')); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  let html = tabs.render('resumen', m.rows());
  // la barra de arriba (quick-bar.js): la empresa, las fechas rápidas (en el panel del periodo) y «Comparar»; en la
  // pestaña, ya no
  const bar = () => companyPick(m) + presetPick(m, ui) + comparePop(m, ui);
  assert.doesNotMatch(html, /data-preset|data-res-pop/);
  // las fechas rápidas que se ofrecen: sin «Este mes» ni «Mes pasado» (se eligen en el calendario)
  for (const [k] of QUICK_PRESETS) assert.match(bar(), new RegExp(`data-preset="${k}"`));
  assert.deepEqual(QUICK_PRESETS.map(([k]) => k), ['week', '3m', 'fy', 'all']);
  assert.doesNotMatch(bar(), /data-preset="(month|prev)"/);
  // «Comparar», sin comparar: el botón solo, sin × ni ventana; su tooltip dice cómo se compara
  assert.match(comparePop(m, ui), /^<div class="mt-res-cmp"><button class="mt-btn " data-res-pop aria-pressed="false" data-tip="Compara lo que tienes marcado con lo siguiente que elijas: otra fecha rápida o un mes del calendario, o la otra empresa\.[^"]*">Comparar<\/button><\/div>$/);
  assert.doesNotMatch(bar(), /data-res-clear|data-res-popup|<select|data-res-apply/);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 0);
  // en el modo comparar (al pulsarlo): marcado, diciendo que se elija, con su × para cancelar
  ui.cmpPick = true;
  assert.match(comparePop(m, ui), /class="mt-btn mt-on mt-picking" data-res-pop aria-pressed="true" data-tip="Elige con qué comparar lo marcado: [^"]*">Comparar con… <small>elige<\/small><\/button><button class="mt-btn mt-x" data-res-clear title="Cancelar"/);
  // sin T-Systems en la vista (Equipo, Técnicas), no la ofrece
  assert.doesNotMatch(comparePop(m, ui, false), /otra empresa/);
  // en el modo comparar, lo siguiente que se elige se compara con lo marcado, como con Ctrl: una fecha rápida
  const ops = { off: () => { m.S.sides[1] = null; }, add: (c) => { m.S.sides[1] = { company: c }; } };
  assert.equal(pickPreset(m, ui, 'prev', ui.cmpPick, presetRange(m, 'prev'), ops), true);
  assert.deepEqual(ui.resCmp, { a: 'cur', b: 'p:prev' });
  assert.equal(periodLabel(m), '01/03/2026 – 11/03/2026');   // lo marcado no cambia
  ui.cmpPick = false;
  // un periodo frente a otro: en la pestaña, la evolución del backlog; en el informe (Del periodo), cada KPI con los dos
  ui.resCmp = { a: 'm:13', b: 'm:12' };
  html = tabs.render('resumen', m.rows());
  const report = () => tabs.render('resumen', m.rows(), { state: false });
  assert.match(bar(), /Comparar: <b>feb 2026 vs ene 2026<\/b><\/button><button class="mt-btn mt-x" data-res-clear title="Quitar la comparación"/);
  assert.equal((report().match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 5);
  assert.match(report(), /<span title="feb 2026">feb 2026<\/span>/);
  assert.match(report(), /<span title="ene 2026">ene 2026<\/span>/);
  assert.match(report(), /feb 2026 \(01\/02\/2026 – 28\/02\/2026\) frente a ene 2026 \(01\/01\/2026 – 31\/01\/2026\)/);
  // la corona: lo abierto ahora que se abrió hasta el final del periodo de arriba (si no hay nada, lo dice)
  assert.match(html, m.today().some((i) => m.OPEN[i] && m.C.rep[i] < m.S.d1) ? /<svg class="mt-donut"/ : /Sin incidencias abiertas/);
  assert.doesNotMatch(html, /undefined|NaN/);
  // Entrantes, en totales: la diferencia de entrantes y de resueltas, en unidades
  const inc = report().slice(report().indexOf('>Entrantes<'), report().indexOf('>MTTR<'));
  assert.match(inc, /<span title="feb 2026">feb 2026<\/span><b>\d+ <small class="mt-mut">· \d+ res\.<\/small><\/b>/);
  assert.match(inc, /<div class="mt-kpi-v [^"]*">(=|[+−]\d+) <small class="mt-mut">· (=|[+−]\d+) res\.<\/small><\/div>|<div class="mt-kpi-v mt-mut">—<\/div>/);
  // el backlog (en el informe: la pestaña ya no lo lleva), una línea por periodo, cada una desde su primer día; con el
  // selector de días, semanas o meses
  const evo = report().slice(report().indexOf('>Evolución del backlog</h3>'));
  assert.match(evo, /<span><i class="mt-c0"><\/i>feb 2026<\/span><span><i class="mt-c1"><\/i>ene 2026<\/span>/);
  assert.match(evo, /<polyline class="mt-line mt-s0"[\s\S]*<polyline class="mt-line mt-s1"/);
  assert.equal((evo.match(/<rect class="mt-hit"/g) || []).length, 31);   // los días del más largo (enero)
  assert.match(evo, /Día 1\nfeb 2026: \d+ pendientes \(1 feb 2026, al acabar el día\)\nene 2026: \d+ pendientes \(1 ene 2026, al acabar el día\)/);
  assert.match(evo, /Día 31\nfeb 2026: sin datos/);
  assert.match(evo, /data-evo-step="day" aria-pressed="true"/);
  assert.doesNotMatch(evo, /mt-pq\d/);   // sin las barras por prioridad
  // el enlace al Histórico, con las fechas del primer periodo (feb 2026)
  assert.doesNotMatch(html, /data-go="historico"/);   // el Histórico ya no está en ninguna vista
  ui.evoStep = 'week';
  assert.match(report(), /Semana 1\nfeb 2026: /);
  ui.evoStep = 'day';
  // el actual frente al anterior: el actual, lo de arriba (de partida, este mes: del 1 al 11 de marzo, frente a los mismos
  // días de febrero)
  ui.resCmp = { a: 'cur', b: 'prev' };
  assert.match(report(), /frente a Periodo anterior \(18\/02\/2026 – 28\/02\/2026\)/);   // los 11 días justo antes
  // el mismo periodo frente a T-Systems (el otro lado): manda sobre la de periodos
  m.S.sides[1] = { company: 1 }; m.refilter();
  html = tabs.render('resumen', m.rows());
  assert.match(bar(), /Comparar: <b>Indra vs T-Systems<\/b>/);
  assert.match(bar(), /data-res-clear/);   // también se quita con la ×
  // la corona, de cada lado (lo abierto ahora que se abrió hasta el final del periodo; sin nada abierto, lo dice)
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, m.today().some((i) => m.OPEN[i] && m.C.rep[i] < m.S.d1) ? 2 : 0);
  assert.match(html, /<i class="mt-sw mt-c1"><\/i>T-Systems<\/p>/);   // A vigilar, de cada lado
});

test('la barra de arriba: Indra | T-Systems y las fechas rápidas; Ctrl+clic en una segunda, comparar', () => {
  const m = twoYears(); m.S.sides = [{ company: 0 }, null]; m.setPeriod(...presetRange(m, 'month')); m.refilter();
  const ui = {};
  const ops = { off: () => { m.S.sides[1] = null; }, add: (c) => { m.S.sides[1] = { company: c }; } };
  const btn = (h, attr) => h.match(new RegExp(`<button class="mt-seg-b ([^"]*)" ${attr} aria-pressed="(true|false)"`)).slice(1);
  // de partida: Indra y este mes, marcados
  assert.deepEqual(btn(companyPick(m), 'data-qco="0"'), ['mt-on', 'true']);
  assert.deepEqual(btn(companyPick(m), 'data-qco="1"'), ['', 'false']);
  assert.doesNotMatch(presetPick(m, ui), /data-preset="month"/);   // este mes ya no es una fecha rápida
  // Ctrl+clic en T-Systems: Indra frente a T-Systems (T-Systems, con el color del otro lado); otra vez, deja de comparar
  assert.equal(pickCompany(m, ui, 1, true, ops), true);
  assert.deepEqual(m.S.sides, [{ company: 0 }, { company: 1 }]);
  assert.deepEqual(btn(companyPick(m), 'data-qco="1"'), ['mt-on mt-qb', 'true']);
  assert.match(comparePop(m, ui), /Comparar: <b>Indra vs T-Systems<\/b>/);
  assert.equal(pickCompany(m, ui, 1, true, ops), true);
  assert.equal(m.S.sides[1], null);
  assert.equal(pickCompany(m, ui, 0, true, ops), false);   // Ctrl+clic en la que se mira: nada
  // clic en T-Systems: mirar T-Systems, sin comparar
  assert.equal(pickCompany(m, ui, 1, false, ops), true);
  assert.deepEqual(m.S.sides, [{ company: 1 }, null]);
  assert.doesNotMatch(comparePop(m, ui), /value="tsys"/);   // mirando T-Systems, no se compara con ella misma
  m.S.sides = [{ company: 0 }, null];
  // Ctrl+clic en «Mes pasado»: el periodo de ahora frente al mes pasado (y no frente a T-Systems); otra vez, deja de comparar
  m.S.sides[1] = { company: 1 };
  assert.equal(pickPreset(m, ui, 'prev', true, presetRange(m, 'prev'), ops), true);
  assert.deepEqual(ui.resCmp, { a: 'cur', b: 'p:prev' });
  assert.equal(m.S.sides[1], null);
  assert.doesNotMatch(presetPick(m, ui), /data-preset="(month|prev)"/);   // sin sus botones: la comparación, en «Comparar»
  assert.match(comparePop(m, ui), /Comparar: <b>Periodo actual vs Mes pasado<\/b>/);
  assert.equal(pickPreset(m, ui, 'prev', true, presetRange(m, 'prev'), ops), true);
  assert.equal(ui.resCmp, null);
  assert.equal(pickPreset(m, ui, 'month', true, presetRange(m, 'month'), ops), false);   // Ctrl+clic en la de ahora: nada
  // clic en una fecha rápida: ese periodo, sin comparar periodos
  ui.resCmp = { a: 'cur', b: 'prev' };
  assert.equal(pickPreset(m, ui, 'month', false, presetRange(m, 'month'), ops), true);
  assert.equal(ui.resCmp, null);
  assert.equal(periodLabel(m), '01/03/2026 – 11/03/2026');
  // comparando periodos, el informe del Resumen lo enseña en sus KPIs
  ui.resCmp = { a: 'cur', b: 'p:prev' };
  const tabs = createTabs(m, createCharts(m, { exp: {}, sort: {} }), Object.assign(ui, { exp: {}, sort: {} }));
  m.refilter();
  assert.match(tabs.render('resumen', m.rows(), { state: false }), /<span title="Mes pasado">Mes pasado<\/span>/);
});

