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
  // la misma corona, con lo de ahora; en el Resumen, con un enlace a Foto de hoy (en la propia Foto de hoy, no)
  const toHoy = /<p class="mt-dn-go"><button class="mt-go" data-go="hoy"[^>]*>Ver Foto de hoy →<\/button><\/p>/;
  assert.match(ring(html), toHoy);
  assert.doesNotMatch(ring(hoy), toHoy);
  // sin incidencias sin asignar, la misma (con ellas, el Resumen las suma como Asignada: su propio test)
  assert.equal(ring(html).replace(toHoy, ''), ring(hoy));
  assert.ok(html.indexOf('En qué estado está') < html.indexOf('>MTTR<'));
  // cada KPI, con un enlace a su pestaña debajo, como el de la corona: MTTR a Análisis tiempos, %IQA a Calidad y Uso de
  // la IA a Uso de la IA y Entrantes a Entrantes
  const kpiHtml = (label) => { const a = html.indexOf(`>${label}</div>`); return html.slice(a, html.indexOf('<div class="mt-kpi ', a)); };
  assert.match(kpiHtml('MTTR'), /<p class="mt-kpi-go"><button class="mt-go" data-go="tiempos">Ver Análisis tiempos →<\/button><\/p>/);
  // % dentro de SLA: lo del periodo empezado en plazo (como en SLAs), con su enlace a SLAs
  assert.equal(kpiOf(html, '% dentro de SLA'), pct(m.stats(m.rows()).sla));
  assert.match(kpiHtml('% dentro de SLA'), /<button class="mt-go" data-go="sla">Ver SLAs →<\/button>/);
  assert.ok(html.indexOf('>MTTR<') < html.indexOf('>% dentro de SLA<'));
  assert.match(kpiHtml('%IQA'), /<button class="mt-go" data-go="calidad">Ver Calidad →<\/button>/);
  assert.match(html, /<button class="mt-go" data-go="ia">Ver Uso de la IA →<\/button>/);
  assert.match(kpiHtml('Entrantes'), /<p class="mt-kpi-go"><button class="mt-go" data-go="entrada">Ver Entrantes →<\/button><\/p>/);
  assert.doesNotMatch(html, /mt-clk mt-kpi-go|role="link"/);   // el KPI ya no se pincha entero
  const A = m.rows();
  assert.equal(kpiOf(html, 'MTTR'), dur(mttrOf(m, A).mttr));
  assert.equal(kpiOf(html, '%IQA'), '—');   // aún sin datos
  assert.equal(kpiOf(html, 'Uso de la IA'), pct(iaStats(A, m.C).share, 1));
  assert.match(html, /tarea #55/);
  // Entrantes (el primer KPI): las que entraron en el periodo y, debajo, cuántas de esas están resueltas
  const solvedN = A.filter((i) => m.DIMS.tb.get(i) < 8).length;
  assert.equal(kpiOf(html, 'Entrantes'), String(A.length));
  assert.match(html, new RegExp(`<div class="mt-kpi-d">${solvedN} resueltas \\(${pct(solvedN / A.length)}\\)<p class="mt-kpi-go">`));
  assert.ok(html.indexOf('>Entrantes<') < html.indexOf('>MTTR<'));
  // las fechas, arriba y fuera de las tarjetas (abren el calendario de arriba); en la misma fila, la corona (s4) y, a su
  // derecha, los KPIs (s8); abajo del todo, el backlog de cada día, en barras por prioridad y sin selector de vista
  // las fechas y «Comparar» ya no están en la pestaña: van arriba del todo, en la barra de Métricas (quick-bar.js)
  assert.doesNotMatch(html, /mt-res-bar|data-preset|data-calendar|data-res-pop/);
  const cards = [...html.matchAll(/<section class="mt-card mt-(s\d+)[^"]*"><h3>([^<]*)<\/h3>/g)].map((x) => [x[1], x[2]]);
  assert.deepEqual(cards, [['s4', 'En qué estado está'], ['s8', 'Del periodo'], ['s12', 'Evolución del backlog']]);
  const evo = html.slice(html.indexOf('<h3>Evolución del backlog</h3>'));
  assert.match(evo, /<rect class="mt-pq\d"/);   // barras apiladas por prioridad
  assert.match(evo, /Tendencia/);
  assert.doesNotMatch(evo, /data-evo=/);
  // debajo, un enlace al Histórico con estas mismas fechas, en la vista del backlog
  assert.match(evo, new RegExp(`<p class="mt-dn-go"><button class="mt-go" data-go="historico" data-go-evo="backlog" data-period="${m.S.d0}:${m.S.d1}"[^>]*>Ver en Histórico →</button></p>`));
  assert.doesNotMatch(tabs.render('historico', m.rows()), /Ver en Histórico/);   // en el propio Histórico, no
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
  assert.equal((html.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 5);
  // Entrantes, en totales: de cada lado sus entrantes y sus resueltas; la diferencia, en unidades (sin mejor ni peor)
  const inc = html.slice(html.indexOf('>Entrantes<'), html.indexOf('>MTTR<'));
  assert.match(inc, /<span title="Indra">Indra<\/span><b>3 <small class="mt-mut">· 2 res\.<\/small><\/b>/);
  assert.match(inc, /<span title="T-Systems">T-Systems<\/span><b>1 <small class="mt-mut">· 1 res\.<\/small><\/b>/);
  assert.match(inc, /<div class="mt-kpi-v mt-diff">\+2 <small class="mt-mut">· \+1 res\.<\/small><\/div>/);
  assert.doesNotMatch(inc, /%|pts|good|bad/);
  assert.match(html, /<section class="mt-card mt-s12 [^"]*"><h3>Del periodo<\/h3>/);   // comparando, debajo de la corona
  assert.equal((html.match(/<p class="mt-kpi-go">/g) || []).length, 5);   // los enlaces, también comparando (Entrantes y SLA incluidos)
  assert.match(html.slice(html.indexOf('<h3>Evolución del backlog</h3>')), /<polyline class="mt-line mt-s0"[\s\S]*<polyline class="mt-line mt-s1"/);   // una línea por lado
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
  assert.match(tabs.render('resumen', m.rows()), /<section class="mt-card mt-s8[^"]*"><h3>Del periodo/);
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
