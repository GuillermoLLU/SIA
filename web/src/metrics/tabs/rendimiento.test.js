import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';
import { faceTabs } from '../faces.js';
import { tones, performance, segments, clockOf, phasesOf, periodDays, dailyMedian, weekMeans } from './rendimiento.js';
import { workMinutes } from '../hours.js';
import { solved as solvedOf, escalated as escOf, mttrOf } from '../resolution.js';

const setup = (ui = {}) => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const u = { exp: {}, sort: {}, ...ui };
  return { m, ui: u, tabs: createTabs(m, createCharts(m, u), u) };
};
const LABELS = ['Recibidas', 'Entrantes entre semana', 'Entrantes en finde', '% de resolución', 'Tatt', 'Tan', 'Tpc', 'Tesc', 'MTTR', 'IDMTTR'];

test('Rendimiento equipos: en la vista Equipo, tras Equipo soporte', () => {
  assert.deepEqual(faceTabs('equipo').map(([k]) => k).slice(0, 2), ['rendimiento', 'calidad']);   // (Equipo soporte, sin team, no sale)
  assert.ok(faceTabs('equipo').some(([k, l]) => k === 'rendimiento' && l === 'Rendimiento equipos'));
});

test('Rendimiento equipos: selector SISU / SGA, los indicadores y una gráfica de cada', () => {
  const { m, tabs } = setup();
  const html = tabs.render('rendimiento', m.rows(), { live: true });
  assert.match(html, /mt-dn-sys" role="group" aria-label="SISU o SGA"><button class="mt-seg-b mt-on" data-ring-sys="0"/);
  for (const l of LABELS) assert.match(html, new RegExp(`<div class="mt-kpi-l">${l.replace(/[%]/g, '\\$&')}</div>`), l);
  for (const t of ['En qué estado está', 'Antigüedad de lo abierto', 'Recibidas por prioridad', 'Recibidas por categorización', 'Recibidas por producto']) assert.equal(html.split(`${t}</h3>`).length - 1, 1, t);
  // la corona lleva lo resuelto (sit:6) y filtra; las barras, también
  assert.match(html, /data-f="sit:6"/);
  assert.match(html, /data-f="age:\d"/);
  assert.match(html, /data-f="pr:\d+"/);
  assert.match(html, /data-f="k3:\d+"/);
  assert.match(html, /data-f="mo:\d+"/);   // el producto: el módulo (categoría de producto 3 de Remedy)
  // Recibidas: lo recibido en el periodo
  assert.match(html, new RegExp(`<div class="mt-kpi-l">Recibidas</div><div class="mt-kpi-v">${m.rows().filter((i) => m.SIDE[i] === 0).length}<`));
});

test('Rendimiento equipos: comparando SISU y SGA (Ctrl+clic), cada gráfica dos veces y los indicadores en verde y rojo', () => {
  const { m, tabs } = setup({ ssCmp: true });
  const html = tabs.render('rendimiento', m.rows(), { live: true });
  for (const t of ['En qué estado está', 'Antigüedad de lo abierto', 'Recibidas por prioridad', 'Recibidas por categorización', 'Recibidas por producto']) {
    assert.match(html, new RegExp(`SISU · ${t}</h3>`), t);
    assert.match(html, new RegExp(`SGA · ${t}</h3>`), t);
  }
  assert.equal((html.match(/mt-rd-kpi/g) || []).length, LABELS.length);
  // Recibidas, de cada sistema
  const n = [0, 1].map((k) => m.rows().filter((i) => m.DIMS.ss.get(i) === k).length);
  assert.match(html, new RegExp(`Recibidas</div>\\s*<div class="mt-kpi-s"><i class="mt-c0"></i><span>SISU</span><b class="mt-diff ">${n[0]}</b></div><div class="mt-kpi-s"><i class="mt-c1"></i><span>SGA</span><b class="mt-diff ">${n[1]}</b>`));
  assert.match(html, /mt-diff (good|bad)/);
});

test('Rendimiento equipos: debajo de los indicadores, la barra acumulada de los tiempos (una por lado, comparando)', () => {
  const { m, tabs } = setup();
  const html = tabs.render('rendimiento', m.rows(), { live: true });
  const a = html.indexOf('<div class="mt-kpis">'), b = html.indexOf('>Tiempo medio por incidencia</h3>'), c = html.indexOf('En qué estado está</h3>');
  assert.ok(a >= 0 && a < b && b < c);
  // dos barras: sin escalar (sin Tesc) y escaladas
  assert.equal((html.match(/mt-rd-times/g) || []).length, 2);
  assert.match(html, /mt-split-l"[^>]*>Sin escalar<\/span>[\s\S]*mt-split-l"[^>]*>Escaladas<\/span>/);
  const plain = html.slice(html.indexOf('>Sin escalar</span>'), html.indexOf('>Escaladas</span>'));
  assert.doesNotMatch(plain, /Tesc:/);
  const cmp = setup({ ssCmp: true }).tabs.render('rendimiento', m.rows(), { live: true });
  assert.equal((cmp.match(/mt-rd-times/g) || []).length, 4);
  // las sin escalar de SISU y SGA juntas y, aparte, las escaladas
  assert.match(cmp, /mt-rd-kind">Sin escalar<\/div>[\s\S]*SISU<\/span>[\s\S]*SGA<\/span>[\s\S]*mt-rd-kind mt-rd-gap">Escaladas<\/div>[\s\S]*SISU<\/span>[\s\S]*SGA<\/span>/);});

test('Rendimiento equipos: toda la página filtra, como las demás (la elegida, destacada; las demás, apagadas, sin desaparecer)', () => {
  const { m, tabs } = setup();
  const html = tabs.render('rendimiento', m.rows(), { live: true });
  // los indicadores con dimensión: % de resolución (lo resuelto), Tesc (lo escalado) e IDMTTR (lo abierto)
  assert.match(html, /mt-kpi mt-clk" data-tip="[^"]*" data-f="sit:6"[^>]*><div class="mt-kpi-l">% de resolución/);
  assert.match(html, /data-f="es:1"[^>]*><div class="mt-kpi-l">Tesc/);
  assert.match(html, /data-f2="sit:0\|sit:1\|sit:2\|sit:3\|sit:4\|sit:5"[^>]*><div class="mt-kpi-l">IDMTTR/);
  // las barras de tiempos: sin escalar y escaladas
  assert.match(html, /mt-rd-times mt-clk " data-f="es:0"/);
  assert.match(html, /mt-rd-times mt-clk " data-f="es:1"/);
  // con las escaladas elegidas: su barra, destacada; la de sin escalar, apagada pero ahí; el KPI de Tesc, marcado
  m.S.f.es = new Set([1]); m.refilter();
  const h2 = tabs.render('rendimiento', m.rows(), { live: true });
  assert.match(h2, /mt-rd-times mt-clk mt-off" data-f="es:0"/);
  assert.match(h2, /mt-rd-times mt-clk mt-sel" data-f="es:1"/);
  assert.match(h2, /mt-kpi mt-clk mt-on" data-tip="[^"]*Clic para quitar el filtro\." data-f="es:1"/);
  // y una prioridad elegida: su barra, destacada; las demás, apagadas
  delete m.S.f.es; const p = m.PRIOS[0]; m.S.f.pr = new Set([p]); m.refilter();
  const h3 = tabs.render('rendimiento', m.rows(), { live: true });
  assert.match(h3, new RegExp(`mt-hb-row mt-clk mt-sel" data-f="pr:${p}"`));
  assert.match(h3, /mt-hb-row mt-clk mt-off" data-f="pr:/);
  // con Ctrl+clic, varias: todas las elegidas, destacadas
  if (m.PRIOS.length > 2) {
    const two = m.PRIOS.slice(0, 2); m.S.f.pr = new Set(two); m.refilter();
    const h4 = tabs.render('rendimiento', m.rows(), { live: true });
    for (const p of two) assert.match(h4, new RegExp(`mt-hb-row mt-clk mt-sel" data-f="pr:${p}"`));
    assert.match(h4, new RegExp(`mt-hb-row mt-clk mt-off" data-f="pr:${m.PRIOS[2]}"`));
  }
});

test('segments: Tatt, Tan, Tesc y Tpc, que suman el MTTR (sin «resto»); sin los que no hay', () => {
  assert.deepEqual(segments({ tatt: 10, tan: 20, tesc: 30, tpc: 15, mttr: 75 }).map((s) => [s[0], s[1]]), [['Tatt', 10], ['Tan', 20], ['Tesc', 30], ['Tpc', 15]]);
  assert.deepEqual(segments({ tatt: 10, tan: null, tesc: 30, tpc: 0, mttr: 40 }).map((s) => [s[0], s[1]]), [['Tatt', 10], ['Tesc', 30]]);
});

// un modelo de juguete para phasesOf: las incidencias, sus columnas y su situación de ahora (sit)
const toy = (rows, { SNAP = 10000, sisu = [] } = {}) => {
  const col = (k, d = -1) => rows.map((r) => r[k] ?? d);
  return { SNAP, BASE: Date.UTC(2026, 0, 5), OPEN: col('open', 0), C: { rep: col('rep'), res: col('res'), lm: col('lm'), fa: col('fa'), ip: col('ip'), aPv: col('aPv', 0), aPc: col('aPc', 0), aPvw: col('aPvw', 0), aPcw: col('aPcw', 0) },
    DIMS: { sit: { get: (i) => rows[i].sit ?? 0 }, ss: { get: (i) => (sisu.includes(i) ? 0 : 1) } } };
};

test('phasesOf: Tatt hasta la primera atención; tras ella, Tesc (proveedor), Tpc (cliente) y Tan (lo demás, también la vuelta a la cola); suman el TTR', () => {
  const m = toy([
    { rep: 0, res: 1000, fa: 100, aPv: 300, aPc: 200 },   // resuelta: 100 + (900 − 300 − 200) + 300 + 200
    { rep: 0, res: 500, fa: -1 },                          // resuelta sin atender: todo Tatt
    { rep: 0, open: 1, lm: 8000, fa: 50, aPc: 1000, sit: 4 },   // abierta, en Pendiente de cliente desde su último cambio
    { rep: 0, open: 1, lm: 9000, fa: 50, sit: 3 },              // abierta, en Pendiente de proveedor
    { rep: 0, res: -1 },                                   // cancelada sin resolver: no cuenta
  ]);
  const ph = phasesOf(m);
  assert.deepEqual(ph(0), { tatt: 100, tan: 400, tesc: 300, tpc: 200, ttr: 1000 });
  assert.deepEqual(ph(1), { tatt: 500, tan: 0, tesc: 0, tpc: 0, ttr: 500 });
  assert.deepEqual(ph(2), { tatt: 50, tan: 10000 - 50 - 3000, tesc: 0, tpc: 1000 + 2000, ttr: 10000 });   // hasta la última carga
  assert.deepEqual(ph(3), { tatt: 50, tan: 10000 - 50 - 1000, tesc: 1000, tpc: 0, ttr: 10000 });
  assert.equal(ph(4), null);
  for (const i of [0, 1, 2, 3]) { const x = ph(i); assert.equal(x.tatt + x.tan + x.tesc + x.tpc, x.ttr, `incidencia ${i}`); }
  // y en las cifras: de media por incidencia, que suman el MTTR
  const p = performance(m, [0, 1, 2, 3, 4], 1, () => true, () => false);
  assert.ok(Math.abs(p.tatt + p.tan + p.tesc + p.tpc - p.mttr) < 1e-9);
  assert.equal(p.mttr, (1000 + 500 + 10000 + 10000) / 4);
});

test('phasesOf con el horario de SISU: solo el Tatt va en su horario; desde la primera atención, todo en tiempo natural', () => {
  // el minuto 0, lunes 5 de enero de 2026 a las 00:00; abierta a las 6:00, atendida a las 8:00, resuelta a las 12:00
  const H = 60, m = toy([{ rep: 6 * H, res: 12 * H, fa: 2 * H, aPv: 60, aPvw: 30, aPc: 60, aPcw: 45 }], { sisu: [0] });
  const x = phasesOf(m, clockOf(m))(0);
  assert.deepEqual(x, { tatt: H, tan: 4 * H - 60 - 60, tesc: 60, tpc: 60, ttr: H + 4 * H });   // Tatt, de 7 a 8; luego, de 8 a 12
  // abierta el viernes a las 21:00, atendida el sábado a las 10:00 (fuera de turno) y resuelta el sábado a las 14:00: el
  // Tatt, solo la hora del viernes; lo del sábado, aunque sea fuera de turno, cuenta en Tan
  const D = 1440, fri = 4 * D, m2 = toy([{ rep: fri + 21 * H, res: fri + D + 14 * H, fa: 13 * H }], { sisu: [0] });
  assert.deepEqual(phasesOf(m2, clockOf(m2))(0), { tatt: H, tan: 4 * H, tesc: 0, tpc: 0, ttr: 5 * H });
  // en SGA, todo natural: el Tatt, las 13 h
  const m3 = toy([{ rep: fri + 21 * H, res: fri + D + 14 * H, fa: 13 * H }]);
  assert.deepEqual(phasesOf(m3, clockOf(m3))(0), { tatt: 13 * H, tan: 4 * H, tesc: 0, tpc: 0, ttr: 17 * H });
});

test('tones:el mejor en verde y el peor en rojo; sin sentido o empate, sin color', () => {
  assert.deepEqual(tones(10, 20, 'low'), ['good', 'bad']);
  assert.deepEqual(tones(10, 20, 'high'), ['bad', 'good']);
  assert.deepEqual(tones(10, 10, 'low'), ['', '']);
  assert.deepEqual(tones(10, 20, null), ['', '']);
  assert.deepEqual(tones(null, 20, 'low'), ['', '']);
});

test('performance: recibidas, por día, % de resolución, MTTR e IDMTTR', () => {
  const { m } = setup();
  const l = m.rows(), solved = solvedOf(m), p = performance(m, l, 10, solved, escOf(m));
  assert.equal(p.n, l.length);
  assert.equal(p.perDay, l.length / 10);
  assert.equal(p.resolved, l.filter(solved).length / l.length);
  assert.equal(p.mttr, mttrOf(m, l).mttr);
  const base = mttrOf(m, l), open = l.filter((i) => m.OPEN[i]);
  if (open.length) assert.ok(Math.abs(p.idmttr - open.reduce((a, i) => a + ((m.C.res[i] >= 0 ? m.C.res[i] - m.C.rep[i] : m.SNAP - m.C.rep[i]) - base.mttr) / base.n, 0)) < 1e-6);
});

test('el Tatt de SISU, solo en su horario de atención (de lunes a viernes, de 7 a 22 h); lo demás y lo de SGA, en tiempo natural', () => {
  const { m } = setup(), clock = clockOf(m), dow0 = new Date(m.BASE).getUTCDay();
  const sisu = m.rows().filter((i) => m.DIMS.ss.get(i) === 0), sga = m.rows().filter((i) => m.DIMS.ss.get(i) === 1);
  const any = (l) => l.find((i) => m.C.res[i] >= 0 && m.C.res[i] > m.C.rep[i]);
  const a = any(sisu), b = any(sga);
  if (a != null) {
    assert.equal(clock(a, m.C.rep[a], m.C.res[a]), workMinutes(m.C.rep[a], m.C.res[a], dow0));
    assert.ok(clock.work(a));
  }
  if (b != null) { assert.equal(clock(b, m.C.rep[b], m.C.res[b]), m.C.res[b] - m.C.rep[b]); assert.ok(!clock.work(b)); }
  // con el reloj, solo cambia el Tatt (y el MTTR, por él): Tan, Tesc y Tpc, los de tiempo natural
  const solved = solvedOf(m), p = performance(m, sisu, 10, solved, escOf(m), clock), nat = performance(m, sisu, 10, solved, escOf(m));
  for (const k of ['tan', 'tesc', 'tpc']) assert.equal(p[k], nat[k], k);
  for (const k of ['tatt', 'mttr']) if (nat[k] != null) assert.ok(p[k] <= nat[k] + 1e-9, k);
  if (nat.mttr != null) assert.ok(Math.abs((nat.mttr - p.mttr) - (nat.tatt - p.tatt)) < 1e-6);
  // en la pestaña, lo dice arriba
  const html = setup().tabs.render('rendimiento', m.rows(), { live: true });
  assert.match(html, /Tatt de SISU en su horario: de lunes a viernes, de 7 a 22 h/);
});

test('con los datos de prueba: los cuatro tiempos suman el MTTR, sin y con el horario de SISU', () => {
  const { m } = setup(), solved = solvedOf(m);
  for (const clock of [undefined, clockOf(m)]) {
    const p = performance(m, m.rows(), 10, solved, escOf(m), clock);
    assert.ok(Math.abs(p.tatt + p.tan + p.tesc + p.tpc - p.mttr) < 1e-6);
  }
});

test('entrantes por día: entre los días naturales enteros del periodo, sin mirar la hora', () => {
  const D = 1440, H = 60;
  assert.equal(periodDays(0, 7 * D), 7);                     // una semana, de medianoche a medianoche
  assert.equal(periodDays(10 * H, 7 * D), 7);                // aunque empiece a las 10:00, el primer día cuenta entero
  assert.equal(periodDays(0, 6 * D + 9 * H), 7);             // y aunque acabe a las 9:00, el último también
  assert.equal(periodDays(3 * D + 22 * H, 4 * D + 2 * H), 2);   // de las 22:00 a las 2:00: dos días
  assert.equal(periodDays(5 * D, 5 * D), 0);
  // en la pestaña ya no está Entrantes por día (sí, entre semana y en finde)
  const { m, tabs } = setup(), html = tabs.render('rendimiento', m.rows(), { live: true });
  assert.doesNotMatch(html, /Entrantes por día/);
});

test('la gráfica de tiempos, por incidencia: en Equipo, la media (suman el MTTR); en Técnicas, la mediana de las que pasan por cada tramo', () => {
  const { m, tabs } = setup();
  const team = tabs.render('rendimiento', m.rows(), { live: true, face: 'equipo' }), tech = tabs.render('rendimiento', m.rows(), { live: true, face: 'tecnicas' });
  assert.match(team, /<h3 data-tip="Por incidencia: [^"]*no el total acumulado[^"]*">Tiempo medio por incidencia<\/h3>/);
  assert.match(team, /de media por incidencia"/);
  assert.doesNotMatch(team, /Tiempo mediano por incidencia|Mediana del TTR/);
  assert.match(tech, /<h3 data-tip="Por incidencia: [^"]*de las que pasan por él[^"]*">Tiempo mediano por incidencia<\/h3>/);
  assert.match(tech, /mediana por incidencia, de las \d+ que pasan por ahí"/);
  assert.doesNotMatch(tech, /Tiempo medio por incidencia/);
  // lo demás, igual en las dos
  const strip = (h) => h.replace(/<section class="mt-card mt-s12 mt-rd-timecard">[\s\S]*?<\/section>/, '');
  assert.equal(strip(team), strip(tech));
});

test('entrantes por día: la mediana de cada día natural, con los días sin ninguna; un día con muchas no la mueve', () => {
  const D = 1440, H = 60, at = (days) => ({ C: { rep: days } });
  // 5 días: 2, 0, 1, 51 (una avalancha) y 1 → ordenados 0, 1, 1, 2, 51: la mediana, 1 (la media daría 11)
  const reps = [0, 3 * H, D + 0, 3 * D, ...Array(50).fill(3 * D + 5 * H), 4 * D + 23 * H].map((x, k) => (k === 2 ? 2 * D + H : x));
  const m = at(reps), all = reps.map((_, i) => i);
  assert.equal(dailyMedian(m, all, 0, 5 * D), 1);
  // con un número par de días, la media de los dos del medio: 2, 1, 0, 51 → 0, 1, 2, 51 → 1,5
  assert.equal(dailyMedian(at([0, H, D, 3 * D, ...Array(50).fill(3 * D)]), [...Array(54).keys()], 0, 4 * D), 1.5);
  // a cualquier hora: las de las 23:00 cuentan en su día
  assert.equal(dailyMedian(at([23 * H, 23 * H + 30]), [0, 1], 0, D), 2);
  // lo de fuera del periodo, no; sin días, null
  assert.equal(dailyMedian(at([-D, 2 * D]), [0, 1], 0, D), 0);
  assert.equal(dailyMedian(at([0]), [0], D, D), null);
});

test('entrantes entre semana y en finde: la media de cada tipo de día, con los días sin ninguna', () => {
  // el minuto 0, lunes 5 de enero de 2026: del lunes 5 al domingo 11, una semana; 10 el lunes, 5 el martes, 3 el sábado
  const D = 1440, m = { BASE: Date.UTC(2026, 0, 5), C: { rep: [...Array(10).fill(60), ...Array(5).fill(D + 60), ...Array(3).fill(5 * D + 23 * 60)] } };
  const all = m.C.rep.map((_, i) => i);
  assert.deepEqual(weekMeans(m, all, 0, 7 * D), { weekday: 15 / 5, weekend: 3 / 2 });
  // solo de lunes a miércoles: sin fin de semana
  assert.deepEqual(weekMeans(m, all, 0, 3 * D), { weekday: 15 / 3, weekend: null });
  // en la pestaña, los dos indicadores
  const { m: mm, tabs } = setup(), html = tabs.render('rendimiento', mm.rows(), { live: true });
  assert.match(html, /<div class="mt-kpi-l">Entrantes entre semana<\/div>/);
  assert.match(html, /<div class="mt-kpi-l">Entrantes en finde<\/div>/);
});

test('en Técnicas, la gráfica de los tiempos con la mediana: de cada tramo, de las que pasan por él; y la raya de la mediana del TTR', () => {
  const { m, tabs } = setup(), html = tabs.render('rendimiento', m.rows(), { live: true, face: 'tecnicas' });
  assert.doesNotMatch(html, />Tiempo medio por incidencia<\/h3>/);   // la de la media, aquí no
  const b = html.indexOf('>Tiempo mediano por incidencia</h3>');
  assert.ok(b >= 0);
  assert.equal((html.match(/mt-rd-times/g) || []).length, 2);
  assert.match(html.slice(b), /Mediana del TTR/);
  // las medianas, de cada tramo, de las que pasan por él: el Tpc, de la única que estuvo en Pendiente de cliente (300); sin
  // ninguna en Pendiente de proveedor, sin Tesc. La del TTR, de todas
  const toyM = toy([{ rep: 0, res: 100, fa: 10 }, { rep: 0, res: 1000, fa: 500, aPc: 300 }, { rep: 0, res: 300, fa: 20 }]);
  const p = performance(toyM, [0, 1, 2], 1, () => true, () => false);
  assert.deepEqual(p.med, { tatt: 20, tan: 200, tesc: null, tpc: 300, mttr: 300 });   // Tatt 10/500/20, Tan 90/200/280, Tpc —/300/—, TTR 100/1000/300
  assert.deepEqual(p.medN, { tatt: 3, tan: 3, tesc: 0, tpc: 1, ttr: 3 });
});
