import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs, TABS } from '../tabs.js';
import { data } from '../fixture.js';
import { mttrOf } from '../resolution.js';
import { iaStats } from '../ia.js';
import { dur, pct } from '../format.js';
import { periodLabel } from '../period.js';
import { dayBuckets, bucketTicks } from '../plot.js';
import { DAY } from '../rules.js';

const setup = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} };
  return { m, tabs: createTabs(m, createCharts(m, ui), ui) };
};
const kpiOf = (html, label) => html.match(new RegExp(`<div class="mt-kpi-l"[^>]*>${label}</div><div class="mt-kpi-v[^"]*">([^<]*)<`))?.[1];

test('Resumen: la corona (lo abierto ahora que se abrió hasta el final del periodo) y, del periodo, MTTR, %IQA y uso de la IA', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  const html = tabs.render('resumen', m.rows()), hoy = tabs.render('hoy', m.rows());
  const ring = (h) => { const a = h.indexOf('>En qué estado está</h3>'); return h.slice(a, h.indexOf('</section>', a)); };
  // el Resumen lleva la corona de Foto de hoy, por fechas (sus selectores, en la barra de arriba): lo abierto ahora que se
  // abrió hasta el final del periodo (aquí llega a hoy: todo lo abierto), que no filtra: al pincharla, lleva a Backlog;
  // lo demás de Foto de hoy (el backlog de ahora, quién tiene qué, la sábana), en Backlog
  assert.doesNotMatch(html, /mt-hoy-picks|data-only="(ss|pr):/);
  // la corona, con su selector SISU / SGA (los dos, de partida): es el filtro de toda la página (S.f.ss)
  assert.match(ring(html), /<div class="mt-seg mt-seg-sm mt-dn-sys" role="group" aria-label="SISU o SGA"><button class="mt-seg-b mt-on" data-ring-sys="0" aria-pressed="true"[^>]*>SISU<\/button><button class="mt-seg-b mt-on" data-ring-sys="1" aria-pressed="true"[^>]*>SGA<\/button><\/div>/);
  const totalOf = (h) => Number(ring(h).match(/<tr class="mt-dn-sum"[^>]*><th>Incidencias<\/th><td class="mt-num"><b>(\d+)<\/b>/)?.[1] ?? 0);
  const open0 = m.today().filter((i) => m.OPEN[i] && m.SIDE[i] === 0);
  for (const k of [0, 1]) {
    m.S.f.ss = new Set([k]); m.refilter();
    const n = open0.filter((i) => m.DIMS.ss.get(i) === k).length, h2 = tabs.render('resumen', m.rows());
    assert.ok(m.rows().every((i) => m.DIMS.ss.get(i) === k));   // toda la página, no solo la corona
    if (n) assert.equal(totalOf(h2), n); else assert.ok(!/mt-dn-sum/.test(ring(h2)) || totalOf(h2) === 0);
    assert.match(ring(h2), new RegExp(`data-ring-sys="${k}" aria-pressed="true"`));
    assert.match(ring(h2), new RegExp(`data-ring-sys="${1 - k}" aria-pressed="false"`));
    delete m.S.f.ss; m.refilter();
  }
  assert.match(html, /<h3 data-tip="Lo abierto ahora que se abrió hasta el final del periodo elegido \(también antes de él\), por su estado\.">En qué estado está<\/h3><div/);
  // la corona no filtra: la tarjeta entera lleva a Backlog
  assert.doesNotMatch(ring(html), /data-f2?="sit:/);
  assert.match(html, /<section class="mt-card mt-s4 +mt-go-card" data-go="backlog" role="button"[^>]*><h3[^>]*>En qué estado está<\/h3>/);
  assert.doesNotMatch(html, /data-go="hoy"/);
  assert.match(ring(hoy), /data-f2?="sit:/);   // en el informe (Foto de hoy), sí filtra
  for (const x of ['¿Cómo está el backlog ahora?', 'Lo pendiente en detalle', 'Quién tiene qué', 'Sábana de incidencias']) assert.ok(!html.includes(`>${x}</h`), x);
  // sin enlaces: ni «Ver … →» ni botones que lleven a otra pestaña en todo el Resumen; ni explicaciones a la vista
  assert.doesNotMatch(html, /class="mt-go"|mt-kpi-go|mt-dn-go|→<\/button>/);
  assert.doesNotMatch(html, /class="mt-sub"/);
  // junto a la corona, en su propia tarjeta y de lo mismo que ella: A vigilar (un clic filtra), sin las escaladas ni las
  // mal escaladas; ya sin la antigüedad media
  const watch = html.slice(html.indexOf('>A vigilar</h3>'), html.indexOf('</section>', html.indexOf('>A vigilar</h3>')));
  assert.match(html, /<section class="mt-card mt-s3 [^"]*"><h3 data-tip="Dentro de lo de la corona[^"]*">A vigilar<\/h3><section class="mt-st mt-st-watch">/);
  assert.match(watch, /<div class="mt-st-item mt-clk" data-f2?="[^"]+"[^>]*><span>Fuera de plazo<\/span><b>\d+<\/b><\/div>/);
  assert.deepEqual([...watch.matchAll(/<span>([^<]*)<\/span>/g)].map((x) => x[1]), ['Fuera de plazo', 'Sin tocar', 'Con más de 15 días', 'Reabiertas', 'Críticas', 'PRIO']);
  assert.doesNotMatch(html, /Antigüedad media/);
  // Del periodo ya no está en la pestaña (sus cifras, mes a mes, en la tabla de debajo); sí en el informe, con sus cifras
  assert.doesNotMatch(html, />Del periodo</);
  const rep = tabs.render('resumen', m.rows(), { state: false }), A = m.rows();
  assert.equal(kpiOf(rep, 'MTTR'), dur(mttrOf(m, A).mttr));
  assert.equal(kpiOf(rep, '% dentro de SLA'), pct(m.stats(A).sla));
  assert.equal(kpiOf(rep, '%IQA'), '—');   // aún sin datos
  assert.equal(kpiOf(rep, 'Uso de la IA'), pct(iaStats(A, m.C).share, 1));
  assert.match(rep, /tarea #55/);
  // Entrantes (el primer KPI): las que entraron en el periodo y, debajo, cuántas de esas están resueltas
  const solvedN = A.filter((i) => m.DIMS.tb.get(i) < 8).length;
  assert.equal(kpiOf(rep, 'Entrantes'), String(A.length));
  assert.match(rep, new RegExp(`<div class="mt-kpi-d">${solvedN} resueltas \\(${pct(solvedN / A.length)}\\)</div>`));
  assert.ok(rep.indexOf('>Entrantes<') < rep.indexOf('>MTTR<'));
  // las fechas, arriba y fuera de las tarjetas (abren el calendario de arriba); en la misma fila, la corona (s4) y, a su
  // derecha, los KPIs (s8); abajo del todo, el backlog de cada día, en barras por prioridad y sin selector de vista
  // las fechas y «Comparar» ya no están en la pestaña: van arriba del todo, en la barra de Métricas (quick-bar.js)
  assert.doesNotMatch(html, /mt-res-bar|data-preset|data-calendar|data-res-pop/);
  const cards = [...html.matchAll(/<section class="mt-card mt-(s\d+)[^"]*"[^>]*><h3[^>]*>([^<]*)<\/h3>/g)].map((x) => [x[1], x[2]]);
  // todo en una pantalla: arriba, la corona, A vigilar y el último mes del periodo; debajo, Mes a mes
  assert.deepEqual(cards.slice(0, 4), [['s4', 'En qué estado está'], ['s3', 'A vigilar'], ['s5', 'Abiertas por prioridad'], ['s12', 'Mes a mes']]);
  assert.match(html, /<h3[^>]*>mar <small class="mt-mut">· el último mes del periodo<\/small><\/h3>/);
  assert.ok(html.indexOf('>A vigilar</h3>') < html.indexOf('el último mes del periodo') && html.indexOf('el último mes del periodo') < html.indexOf('>Mes a mes</h3>'));
  assert.doesNotMatch(html, /Evolución del backlog|class="mt-ask"/);   // sin la evolución ni la pregunta de arriba
  // el último mes del periodo (aquí, marzo: sus días hasta la foto): incidencias, MTTR, % dentro de SLA, %IQA y uso de
  // la IA de lo recibido en él; la tarjeta entera lleva a SLA y calidad
  const last = html.slice(html.indexOf('el último mes del periodo'), html.indexOf('>Mes a mes</h3>'));
  assert.match(html, /<section class="mt-card mt-s5 +mt-go-card" data-go="slaq" role="button"/);
  const mar = m.rows().filter((i) => m.C.rep[i] >= m.minuteOf(2));
  assert.equal(kpiOf(last, 'Incidencias'), String(mar.length));
  assert.equal(kpiOf(last, 'MTTR'), mar.length ? dur(mttrOf(m, mar).mttr) : '—');
  assert.equal(kpiOf(last, '%IQA'), '—');
  assert.equal(kpiOf(last, 'Uso de la IA'), pct(iaStats(mar, m.C).share, 1));
  for (const x of ['% dentro de SLA']) assert.match(last, new RegExp(`>${x}</div>`));
  // debajo, en su propia tarjeta (en la misma columna), lo abierto de la corona por prioridad, en barras horizontales;
  // un clic en una filtra toda la página por esa prioridad
  assert.match(html, /<div class="mt-s5 mt-stackcol"><section class="mt-card mt-s5 +mt-go-card" data-go="slaq"[\s\S]*?<\/section><section class="mt-card mt-s5 [^"]*"><h3[^>]*>Abiertas por prioridad<\/h3><div class="mt-hb mt-lm-prio">/);
  const openP = m.today().filter((i) => m.OPEN[i] && m.SIDE[i] === 0 && m.C.rep[i] < m.S.d1);
  const prio = [...last.matchAll(/data-f="pr:(\d+)"[^>]*><span class="mt-hb-x">([^<]*)<\/span>[\s\S]*?<span class="mt-hb-v">([^<]*)<\/span>/g)].map((x) => [Number(x[1]), x[2], Number(x[3])]);
  assert.deepEqual(prio, m.PRIOS.map((p) => [p, m.DIMS.pr.label(p), openP.filter((i) => m.C.pr[i] === p).length]));
  assert.match(tabs.render('historico', m.rows()), /<svg viewBox="0 0 1240 250" class="mt-svg">/);
  // la tarjeta entera lleva al Histórico con estas mismas fechas, en la vista del backlog
  // la evolución ya no lleva al Histórico (no está en ninguna vista)
  assert.doesNotMatch(html, /data-go="historico"/);
  m.resetPeriod();
  // de partida, desde el mes de la abierta más antigua de Indra
  const oldest = Math.min(...m.today().filter((i) => m.OPEN[i] && m.TEAM[i] === 0).map((i) => m.C.rep[i]));
  assert.equal(m.S.d0, Math.max(m.MIN_D, m.minuteOf(m.monthAt(oldest))));
  assert.doesNotMatch(html, /undefined|NaN/);
  // los KPIs son del periodo; la corona, de lo abierto ahora que se abrió hasta su final (aunque fuera antes de él)
  const empty = tabs.render('resumen', []);
  assert.equal(kpiOf(tabs.render('resumen', [], { state: false }), 'MTTR'), '—');   // el informe
  assert.equal(ring(empty), ring(html));   // aunque en el periodo no entrara nada, lo abierto de antes cuenta
  const total = (h) => Number(ring(h).match(/<tr class="mt-dn-sum"[^>]*><th>Incidencias<\/th><td class="mt-num"><b>(\d+)<\/b>/)[1]);
  assert.equal(total(html), m.today().filter((i) => m.OPEN[i]).length);
  // el último día, solo: también la 3 (abierta, se abrió ese día); con el periodo empezando más tarde, igual
  m.setPeriod(m.END_D - DAY, m.END_D); m.refilter();
  assert.equal(total(tabs.render('resumen', m.rows())), total(html));
  // un periodo que acaba antes de que se abriera la 3 (la única abierta): nada abierto hasta entonces
  m.setPeriod(m.MIN_D, m.END_D - DAY); m.refilter();
  assert.match(ring(tabs.render('resumen', m.rows())), /<p class="mt-none-open">Sin incidencias abiertas<\/p>/);
  assert.doesNotMatch(ring(tabs.render('resumen', m.rows())), /mt-donut/);
  m.setPeriod(m.MIN_D, m.END_D); m.refilter();
});

test('el backlog de Backlog, por días, semanas o meses: cada barra, lo abierto al acabar su tramo', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  m.setPeriod(m.MIN_D, m.END_D);
  const ui = { exp: {}, sort: {} }, t = createTabs(m, createCharts(m, ui), ui);
  const evo = () => { const h = t.render('backlog', m.rows()); return h.slice(h.indexOf('>Evolución del backlog</h3>')); };   // ya en Backlog
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

test('Resumen, comparando: la corona de cada lado, A vigilar y la antigüedad de cada uno; en el informe, cada KPI con los dos lados', () => {
  const { m, tabs } = setup([{ company: 0 }, { company: 1 }]);
  const html = tabs.render('resumen', m.rows());
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 2);
  // A vigilar, un cuadro por lado con su nombre, a media fila (al lado, la evolución); sin la antigüedad media
  const watch = html.slice(html.indexOf('>A vigilar</h3>'), html.indexOf('el último mes del periodo'));
  assert.equal((watch.match(/class="mt-st mt-st-watch"/g) || []).length, 2);
  assert.match(watch, /<i class="mt-sw mt-c0"><\/i>Indra<\/p>[\s\S]*<i class="mt-sw mt-c1"><\/i>T-Systems<\/p>/);
  assert.match(html, /<section class="mt-card mt-s6 [^"]*"><h3[^>]*>A vigilar<\/h3>/);
  assert.match(html, /<section class="mt-card mt-s6 +mt-go-card" data-go="slaq"/);   // el último mes, a media fila
  assert.doesNotMatch(html, /Antigüedad media/);
  // en el informe (Del periodo): Entrantes, en totales: de cada lado sus entrantes y sus resueltas; la diferencia, en
  // unidades (sin mejor ni peor)
  const rep = tabs.render('resumen', m.rows(), { state: false });
  assert.equal((rep.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 5);
  const inc = rep.slice(rep.indexOf('>Entrantes<'), rep.indexOf('>MTTR<'));
  assert.match(inc, /<span title="Indra">Indra<\/span><b>3 <small class="mt-mut">· 2 res\.<\/small><\/b>/);
  assert.match(inc, /<span title="T-Systems">T-Systems<\/span><b>1 <small class="mt-mut">· 1 res\.<\/small><\/b>/);
  assert.match(inc, /<div class="mt-kpi-v mt-diff">\+2 <small class="mt-mut">· \+1 res\.<\/small><\/div>/);
  assert.doesNotMatch(inc, /%|pts|good|bad/);
  assert.doesNotMatch(html, />Del periodo<|mt-kpi-go/);
  assert.equal((html.slice(html.indexOf('el último mes del periodo'), html.indexOf('>Mes a mes</h3>')).match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 5);   // el último mes, de cada lado
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('Análisis tiempos y Calidad: pestañas nuevas, vacías por ahora; IA pasa a llamarse Uso de la IA', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  const label = (k) => TABS.find(([x]) => x === k)?.[1];
  assert.equal(label('tiempos'), 'Análisis tiempos');
  assert.equal(label('calidad'), 'Calidad');
  assert.equal(label('cliente'), 'Pendiente de cliente');   // ya con contenido: cliente.test.js
  assert.equal(label('ia'), 'Uso de la IA');
  for (const k of ['calidad']) {   // Análisis tiempos ya tiene contenido: resolucion.test.js
    const html = tabs.render(k, m.rows());
    assert.match(html, /<h3>En construcción<\/h3>/);
    assert.match(html, /class="mt-ask"/);
    assert.doesNotMatch(html, /undefined|NaN/);
  }
});

test('Resumen sin la corona (el informe con datos históricos): los KPIs a todo el ancho y la evolución del backlog', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  const html = tabs.render('resumen', m.rows(), { state: false });
  assert.doesNotMatch(html, /En qué estado está/);
  assert.match(html, /<section class="mt-card mt-s12[^"]*"><h3>Del periodo/);
  assert.doesNotMatch(tabs.render('resumen', m.rows()), />Del periodo</);   // en la pestaña, A vigilar y la antigüedad media
  // en el informe, sin clics ni tooltips nuevos: la explicación de la tarjeta, debajo del título
  assert.match(html, /<h3>Del periodo<\/h3><p class="mt-sub">Lo recibido en el periodo elegido arriba\.<\/p>/);
  assert.doesNotMatch(html, /data-go=/);
  assert.match(html, />MTTR</);
});

test('Estado de SLAs (el informe): Atendidas en SLA, lo del periodo, las incidencias y, por técnico, la calidad y la IA', () => {
  const all = ['inc', 'res', 'mttr', 'iqa', 'sla', 'ia'];
  const labels = (h) => [...h.matchAll(/<div class="mt-kpi-l"[^>]*>([^<]*)</g)].map((x) => x[1]);
  const one = setup([{ company: 0 }, null]);
  const h = one.tabs.render('resumen', one.m.rows(), { slas: all });
  assert.deepEqual(labels(h), ['Incidencias', '% de resueltas', 'MTTR', '% dentro de SLA', 'Calidad (%IQA)', 'Uso de la IA']);
  // arriba del todo, Del periodo; Atendidas en SLA, aparte (part 'sla': el informe la pone tras los tiempos)
  assert.ok(h.indexOf('<h3>Del periodo</h3>') < h.indexOf('<section', h.indexOf('<section') + 1));
  assert.doesNotMatch(h, /<h3>Atendidas en SLA/);
  const slaPart = one.tabs.render('resumen', one.m.rows(), { slas: all, part: 'sla' });
  assert.deepEqual([...slaPart.matchAll(/<h3>([^<]*)/g)].map((x) => x[1].trim()), ['Atendidas en SLA']);
  assert.equal(kpiOf(h, '% dentro de SLA'), pct(one.m.stats(one.m.rows()).sla));
  const A = one.m.rows();
  assert.equal(kpiOf(h, 'Incidencias'), String(A.length));
  assert.equal(kpiOf(h, 'MTTR'), dur(mttrOf(one.m, A).mttr));
  assert.match(slaPart, new RegExp(`<h3>Atendidas en SLA <small class="mt-mut">· todas: ${pct(one.m.stats(A).sla)}</small>`));
  assert.doesNotMatch(h, /En qué estado está|Evolución del backlog|undefined|NaN/);
  // arriba: Atendidas en SLA (por SLA, módulo, centro y mes), las cifras del periodo y las incidencias (por módulo,
  // centro y mes); ninguna tarjeta más de % de resueltas, MTTR ni IA por módulo o centro
  assert.doesNotMatch(h, /Detalle por SLA|<table/);
  const cardOf = (x, l) => { const a = x.indexOf(`<h3>${l}`); return a < 0 ? '' : x.slice(a, x.indexOf('</section>', a)); };
  const h4 = (card) => [...card.matchAll(/<h4>([^<]*)</g)].map((x) => x[1].replace(/ \(.*/, '').trim());
  assert.deepEqual(h4(cardOf(slaPart, 'Atendidas en SLA <small')), ['Por SLA', 'Por módulo', 'Por centro', 'Por mes']);
  assert.deepEqual(h4(cardOf(h, 'Incidencias <small')), ['Por módulo', 'Por centro', 'Por mes']);
  assert.equal((cardOf(h, 'Incidencias <small').match(/class="mt-vb-col"/g) || []).length, new Set(A.map((i) => one.m.MONTH[i])).size);
  for (const l of ['% de resueltas <small', 'MTTR <small', 'Uso de la IA <small', 'Calidad (%IQA)</h3>']) assert.equal(cardOf(h, l), '', l);
  const sla = cardOf(slaPart, 'Atendidas en SLA <small');
  for (const p of one.m.PRIOS) assert.match(sla, new RegExp(`<span class="mt-hb-x" title="${one.m.slaLabel(p)}">`));
  assert.ok(h.indexOf('<h3>Del periodo</h3>') < h.indexOf('<h3>Incidencias <small'));
  // y, aparte (part 'people'), la calidad y el uso de la IA, por técnico y por nada más
  const ppl = one.tabs.render('resumen', A, { slas: all, part: 'people' });
  assert.deepEqual([...ppl.matchAll(/<h3>([^<]*)/g)].map((x) => x[1].trim()), ['Calidad por técnico', 'Uso de la IA por día']);
  assert.deepEqual(h4(cardOf(ppl, 'Calidad por técnico')), ['Reabiertas', 'Devueltas a la cola']);
  const techs = one.m.group('as', A).filter((g) => g.k).map((g) => one.m.DIMS.as.label(g.k));
  for (const n of techs) assert.match(cardOf(ppl, 'Calidad por técnico'), new RegExp(`title="${n}"`), n);
  // el uso de la IA, una línea a través de los días del periodo, sin nada por técnico
  const iaDay = cardOf(ppl, 'Uso de la IA por día');
  assert.match(iaDay, /<polyline class="mt-line mt-s0"/);
  for (const n of techs) assert.doesNotMatch(iaDay, new RegExp(`title="${n}"`), n);
  assert.doesNotMatch(ppl, /Por módulo|Por centro|Por mes|Por SLA|undefined|NaN/);
  assert.equal(one.tabs.render('resumen', A, { slas: ['sla', 'mttr'], part: 'people' }).includes('<h3>'), false, 'sin calidad ni IA marcadas, nada');
  const two2 = one.tabs.render('resumen', A, { slas: ['sla', 'mttr'] });
  assert.deepEqual(labels(two2), ['MTTR', '% dentro de SLA']);
  assert.doesNotMatch(two2, /<h4>Por SLA<\/h4>/, 'Por SLA, solo en Atendidas en SLA (part sla)');
  assert.equal(one.tabs.render('resumen', A, { slas: ['mttr'], part: 'sla' }).includes('<h3>'), false, 'sin SLA marcado, nada');
  const two = setup([{ company: 0 }, { company: 1 }]);
  const c = two.tabs.render('resumen', two.m.rows(), { slas: all });
  assert.equal((c.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 6);
  // comparando, sin módulos ni centros (no trabajamos con los mismos): las incidencias, por mes, con una columna de cada
  // lado; Atendidas en SLA, por SLA (una barra de cada lado) y por mes
  assert.deepEqual(h4(cardOf(c, 'Incidencias <small')), ['Por mes']);
  assert.match(cardOf(c, 'Incidencias <small'), /<i class="mt-c0"[\s\S]*<i class="mt-c1"/);
  const cs = two.tabs.render('resumen', two.m.rows(), { slas: all, part: 'sla' });
  assert.deepEqual(h4(cardOf(cs, 'Atendidas en SLA <small')), ['Por SLA', 'Por mes']);
  const row = cardOf(cs, 'Atendidas en SLA <small').match(/<span class="mt-hb-track">[\s\S]*?<\/span>\s*<span class="mt-hb-v">/)[0];
  assert.match(row, /<i class="mt-c0"[\s\S]*<i class="mt-c1"/);
  // y sin nada por técnico
  // frente a T-Systems, nada por técnico: solo el uso de la IA por día, una línea por lado
  const cp = two.tabs.render('resumen', two.m.rows(), { slas: all, part: 'people' });
  assert.deepEqual([...cp.matchAll(/<h3>([^<]*)/g)].map((x) => x[1].trim()), ['Uso de la IA por día']);
  assert.match(cp, /<polyline class="mt-line mt-s0"[\s\S]*<polyline class="mt-line mt-s1"/);
  assert.doesNotMatch(cp, /undefined|NaN/);
  assert.doesNotMatch(c, /undefined|NaN/);
});

test('un periodo frente a otro (los informes): las cifras de los dos y la diferencia; el más largo, en su media', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  m.setPeriod(m.MIN_D, m.END_D); m.refilter();
  const all = [m.MIN_D, m.END_D], half = [m.MIN_D, m.MIN_D + Math.round((m.END_D - m.MIN_D) / 2 / 1440) * 1440];
  const html = tabs.render('resumen', m.rows(), { vsPeriod: { a: { label: 'Mitad', range: half }, b: { label: 'Todo', range: all } } });
  assert.match(html, /<h3>Mitad frente a Todo<\/h3>/);
  const labels = [...html.matchAll(/<div class="mt-kpi-l"[^>]*>([^<]*)</g)].map((x) => x[1]);
  assert.deepEqual(labels, ['Incidencias (media)', '% de resueltas', 'MTTR', '% dentro de SLA', 'Calidad (%IQA)', 'Uso de la IA']);
  // Todo dura el doble: sus incidencias, a la mitad (su media para la duración de Mitad)
  const inAll = m.today().filter((i) => m.SIDE[i] === 0 && m.C.rep[i] >= all[0] && m.C.rep[i] < all[1]).length;
  const side = (name) => html.match(new RegExp(`<span title="${name}">${name}</span><b>([^<]*)</b>`))[1];
  const want = inAll * ((half[1] - half[0]) / (all[1] - all[0]));
  assert.equal(Number(side('Todo').replace(',', '.')), Number.isInteger(want) ? want : Math.round(want * 10) / 10);
  assert.match(html, /Las incidencias de Todo, en su media para la duración de Mitad/);
  // de la misma duración, sin media
  const same = tabs.render('resumen', m.rows(), { vsPeriod: { a: { label: 'A', range: half }, b: { label: 'B', range: half } } });
  assert.match(same, />Incidencias</);
  assert.doesNotMatch(same, /en su media|undefined|NaN/);
});

test('un periodo frente a otro, frente a T-Systems: una tarjeta por empresa, cada una con sus dos periodos', () => {
  const { m, tabs } = setup([{ company: 0 }, { company: 1 }]);
  const r = [m.MIN_D, m.END_D];
  const html = tabs.render('resumen', m.rows(), { vsPeriod: { a: { label: 'A', range: r }, b: { label: 'B', range: r } } });
  assert.deepEqual([...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((x) => x[1]), ['Indra: A frente a B', 'T-Systems: A frente a B']);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('Resumen, mes a mes: debajo de la corona, un mes por fila y la media del año fiscal; Entrantes, MTTR, % dentro de SLA, %IQA y Uso de la IA en columnas', () => {
  const { m, tabs } = setup([{ company: 0 }, null]);
  const card = (h) => h.slice(h.indexOf('>Mes a mes</h3>'), h.indexOf('</section>', h.indexOf('>Mes a mes</h3>')));
  const body = card(tabs.render('resumen', m.rows()));
  const row = (label) => { const a = body.indexOf(`>${label}</td>`); return a < 0 ? '' : body.slice(a, body.indexOf('</tr>', a)); };
  const cells = (r) => [...r.matchAll(/<td class="mt-num"([^>]*)>(?:<b class="mt-diff (\w+)">)?([^<]*)(?:<\/b>)?(?: <span class="mt-trend (\w*)">([^<]*)<\/span>)?<\/td>/g)]
    .map((x) => ({ tip: /data-tip="([^"]*)"/.exec(x[1])?.[1] ?? null, value: x[2] ?? '', text: x[3], arrow: x[5] ?? null, cls: x[4] ?? null }));
  // las columnas, los KPIs, con cómo se calcula cada uno en su tooltip
  assert.deepEqual([...body.matchAll(/<th class="mt-num" data-tip="[^"]+">([^<]*)<\/th>/g)].map((x) => x[1]), ['Abiertas', 'Entrantes', 'Entrantes por día', 'Resueltas por día', 'MTTR', '% dentro de SLA', '%IQA', 'Uso de la IA']);
  assert.match(body, /<th>Mes<\/th>/);
  assert.match(body, /data-tip="Las incidencias que entraron en el mes\. Mejor si baja\.">Entrantes<\/th>/);
  assert.match(body, /data-tip="[^"]*Mejor si baja\. La media del año fiscal, en verde por debajo de 69 h y en rojo por encima\.">MTTR<\/th>/);
  // las filas, un mes cada una (aquí, todo lo cargado: de enero a marzo) y, al final, la media del año fiscal
  assert.deepEqual([...body.matchAll(/<tr[^>]*><td[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]), ['ene', 'feb', 'mar', 'Media año fiscal']);
  assert.match(body, /<tr class="mt-grp mt-fy"><td data-tip="El año fiscal en curso, 01\/02\/2026 – [^"]*">Media año fiscal<\/td>/);
  // cada fila, lo recibido en su mes; el primero, sin el anterior (nada cargado antes): sin flecha
  const jan = m.rows().filter((i) => m.C.rep[i] < m.minuteOf(1)).length, feb = m.rows().filter((i) => m.C.rep[i] >= m.minuteOf(1) && m.C.rep[i] < m.minuteOf(2)).length;
  const fyAvg = m.today().filter((i) => m.C.rep[i] >= m.START_D).length / 2;
  assert.deepEqual(cells(row('ene'))[1], { tip: 'Sin el mes anterior para comparar.', value: jan < fyAvg ? 'good' : jan > fyAvg ? 'bad' : '', text: String(jan), arrow: null, cls: null });
  assert.deepEqual(cells(row('ene'))[6].text, '—');   // %IQA, aún sin datos
  // un mes con cifra frente al anterior con cifra: su flecha (las entrantes, mejor si bajan: en verde si baja) y, en el
  // tooltip, la del anterior; la cifra, frente a la media por mes del año fiscal
  if (jan && feb) assert.deepEqual(cells(row('feb'))[1], { tip: `ene: ${jan}`, value: feb < fyAvg ? 'good' : feb > fyAvg ? 'bad' : '', text: String(feb),
    arrow: feb > jan ? '▲' : feb < jan ? '▼' : '=', cls: feb > jan ? 'bad' : feb < jan ? 'good' : '' });
  // la media: de las entrantes, por mes (de febrero a marzo: dos); el MTTR de la media, frente a 69 h; sin flechas
  const fy = m.today().filter((i) => m.C.rep[i] >= m.START_D).length, avg = cells(row('Media año fiscal'));
  assert.equal(avg[1].text, (fy / 2).toFixed(1).replace('.', ','));
  assert.ok(avg.every((c) => c.arrow == null));
  // las abiertas, justo después del mes: de lo recibido en él, las que siguen abiertas; sin flecha ni color
  assert.equal(avg[0].text, '');   // sin media del año fiscal
  const openJan = m.rows().filter((i) => m.C.rep[i] < m.minuteOf(1) && m.OPEN[i]).length;
  assert.deepEqual(cells(row('ene'))[0], { tip: null, value: '', text: String(openJan), arrow: null, cls: null });
  // por día: las entrantes del mes entre sus días (enero, 31) y las resueltas en el mes por su fecha de resolución
  const d1 = (x) => x.toFixed(1).replace('.', ',');
  assert.equal(cells(row('ene'))[2].text, d1(jan / 31));
  const resJan = m.today().filter((i) => !m.OPEN[i] && m.C.res[i] >= 0 && m.C.res[i] < m.minuteOf(1)).length;
  assert.equal(cells(row('ene'))[3].text, d1(resJan / 31));
  const mins = (x) => { const h = Number(x.replace(',', '.').replace(/ (h|min)$/, '')); return /min$/.test(x) ? h : h * 60; };
  assert.equal(avg[4].value, mins(avg[4].text) < 69 * 60 ? 'good' : 'bad');
  // la cifra de cada mes, frente a la media (el MTTR, mejor si baja)
  for (const mo of ['ene', 'feb', 'mar']) {
    const c = cells(row(mo))[4];
    if (c && c.text !== '—') assert.equal(c.value, mins(c.text) < mins(avg[4].text) ? 'good' : mins(c.text) > mins(avg[4].text) ? 'bad' : '', mo);
  }
  // con un periodo de un mes, una sola fila de mes (y la media)
  m.setPeriod(m.minuteOf(2), m.END_D); m.refilter();
  assert.deepEqual([...card(tabs.render('resumen', m.rows())).matchAll(/<tr[^>]*><td[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]), ['mar', 'Media año fiscal']);
  // comparando, una fila por lado en cada mes y en la media, con su color
  const two = setup([{ company: 0 }, { company: 1 }]);
  const cmp = card(two.tabs.render('resumen', two.m.rows()));
  assert.equal((cmp.match(/<i class="mt-sw mt-c0"><\/i>/g) || []).length, 4);
  assert.equal((cmp.match(/<i class="mt-sw mt-c1"><\/i>/g) || []).length, 4);
  // cada mes, un bloque: su nombre una vez, a lo alto de sus dos filas, y una columna con el nombre de cada lado
  assert.equal((cmp.match(/<td class="mt-mm-mo" rowspan="2"/g) || []).length, 4);
  assert.equal((cmp.match(/<td class="mt-mm-side"><i class="mt-sw mt-c1"><\/i>T-Systems<\/td>/g) || []).length, 4);
  assert.equal((cmp.match(/<tr class="mt-mm-s0">/g) || []).length, 3);
  assert.match(cmp, /<th>Mes<\/th><th><\/th>/);
});
