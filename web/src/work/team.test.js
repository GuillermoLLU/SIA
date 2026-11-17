import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { dur } from '../metrics/format.js';
import { teamPanel, conclusionsPanel, teamIssues, compareTech } from './team.js';

// 2 personas de Indra (ANA, rápida; PEPE, lenta) con MIN (10) issues cada una y 1 de T-Systems (LUIS, con 1 issue), que no sale.
const MIN = 10;   // team.js: con menos issues, los % de una persona dicen poco
const issues = [
  ...Array.from({ length: MIN }, (_, i) => ({ as: 1, rep: 1000 + i, res: 1060 + i, ip: 5, fr: 5 })),
  ...Array.from({ length: MIN }, (_, i) => ({ as: 2, rep: 2000 + i, res: 9000 + i, ip: 300, fr: 300 })),
  { as: 3, rep: 3000, res: 3100, ip: 10, fr: 10 },
];
const n = issues.length, col = (f) => issues.map(f), zeros = () => col(() => 0);
const data = () => ({
  meta: { file: 'x.csv', start: 2026, first: 1000, last: 6000, group: 'AYS SOPORTE', rows: n, total: n, snapshot: 100000, generated: 'g' },
  dict: { status: ['', 'CLOSED'], reason: [''], prio: ['', 'HIGH'], svc: [''], person: ['', 'ANA', 'PEPE', 'LUIS'], centre: [''], op: [''], module: [''],
    cat: [''], vtype: [''], vproj: [''], vkey: [''], resol: [''], problem: [''] },
  themes: [], reasons: { client: [], vendor: [] }, company: [2, 0, 0, 1],
  cols: { id: col((_, i) => i + 1), rep: col((x) => x.rep), res: col((x) => x.res), st: col(() => 1), rs: zeros(), pr: col(() => 1), sv: zeros(),
    as: col((x) => x.as), ce: zeros(), op: zeros(), mo: zeros(), k3: zeros(), sc: zeros(), fl: zeros(), vt: zeros(), vp: zeros(), vk: zeros(),
    fr: col((x) => x.fr), ip: col((x) => x.ip), tA: zeros(), tI: zeros(), tPc: zeros(), tPv: zeros(), tPo: zeros(), nb: zeros(), np: zeros(), th: zeros(), rz: zeros(), de: zeros(),
    su: col(() => 'título'), sp: col((x) => [[0, x.res, x.as]]) },   // cada una, resuelta por su responsable
});

const render = (sides, charts = new Set()) => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts };
  m.S.sides = sides; m.refilter();
  return teamPanel(m, createCharts(m, ui), ui);
};
const rowOf = (html, name) => html.split('<tr').find((r) => r.includes(`>${name}<`));

test('solo Indra: una fila por persona y la del equipo, con sus datos y sin colores', () => {
  const h = render([{ company: 0 }, null]);
  assert.doesNotMatch(h, /undefined|NaN/);
  assert.ok(rowOf(h, 'ANA') && rowOf(h, 'PEPE') && !rowOf(h, 'LUIS'));
  assert.match(h, /Equipo Indra/);
  assert.doesNotMatch(h.slice(h.indexOf('<table class="wk-team"')), /mt-num (good|bad)/);
  assert.match(rowOf(h, 'ANA'), />100 %</);   // SLA cumplido: solo el %
  assert.match(h, /<h3>Pendientes<\/h3>[\s\S]*?<div class="wk-hero"><b>0<\/b><span>sin resolver/);   // todas cerradas
  assert.equal((h.match(/class="wk-block[ "]/g) || []).length, 7);   // la actividad y seis bloques, en dos filas (con cifras o como gráfica)
});

test('un bloque como gráfica: su evolución en lugar de las cifras, con la principal arriba', () => {
  const base = render([{ company: 0 }, null]);
  assert.equal((base.match(/class="wk-chart"/g) || []).length, 2);   // Volumen e IA, siempre como gráfica
  assert.doesNotMatch(base, /data-chart="(volume|ia)"/);              // sin icono para cambiar
  assert.match(base, /<h3>Volumen<\/h3><span class="wk-aside">Media al día <i class="mt-sw mt-c2"><\/i><b>[\d,]+<\/b> nuevas/);
  const h = render([{ company: 0 }, null], new Set(['times', 'sla']));
  assert.equal((h.match(/class="wk-chart"/g) || []).length, 4);
  assert.match(h, /data-chart="times" title="Ver los datos"/);
  const times = h.slice(h.indexOf('<h3>Tiempos'), h.indexOf('</section>', h.indexOf('<h3>Tiempos')));
  assert.match(times, /class="wk-key"/);
  assert.doesNotMatch(times, /wk-items/);
});

test('pendientes: lo del equipo cuenta aunque no caiga en SGA ni SISU, como en la tabla', () => {
  const d = data(); d.dict.status = ['', 'CLOSED', 'ASSIGNED']; d.cols.st[0] = 2;   // una de ANA, abierta y fuera de los filtros
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.match(h, /<h3>Pendientes<\/h3>[\s\S]*?<div class="wk-hero"><b>1<\/b>/);
  assert.match(h, /Asignadas al equipo<\/span><b>1</);
});

test('por turno: RPT, EPPT y PCPT (con sus e y b) y %IQA, por persona y del equipo', () => {
  const d = data();
  d.sessions = [[], [[1000, 1130, 1]], [], []];   // la sesión de ANA, de un turno: sus 10 se abren y se resuelven en ella
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  const heads = [...h.matchAll(/data-sort="team:[^"]+"[^>]*>([^<]+)</g)].map((x) => x[1].replace(/ [↓↑]$/, ''));
  for (const c of ['RPT', 'RPTe', 'RPTb', 'EPPT', 'EPPTe', 'EPPTb', 'PCPT', 'PCPTe', 'PCPTb', '%IQA']) assert.ok(heads.includes(c), c);
  assert.doesNotMatch(h, /undefined|NaN|reinicia SIA/);
  const cells = (name) => [...rowOf(h, name).matchAll(/<td class="mt-num">([^<]*)</g)].map((x) => x[1]);
  const at = (c) => heads.indexOf(c);
  const ana = cells('ANA');   // sus 10 entran y se resuelven en el turno 1 (minutos 1000 a 1069): 10 por turno, todas entrantes
  assert.deepEqual([ana[at('RPT')], ana[at('RPTe')], ana[at('RPTb')], ana[at('EPPT')]], ['10,0', '10,0', '0,0', '0,0']);
  assert.equal(ana[at('%IQA')], '—');   // sin la nota del agente de calidad
});

test('Tatt, Tan y TTR medios, por persona y del equipo; el Tan, solo de las resueltas', () => {
  const d = data();
  d.cols.tI = d.cols.as.map((a) => (a === 1 ? 30 : 150));
  d.cols.res[0] = -1; d.cols.tI[0] = 9999;   // una de ANA sin resolver: su tiempo En curso no cuenta en el Tan
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  const heads = [...h.matchAll(/data-sort="team:[^"]+"[^>]*>([^<]+)</g)].map((x) => x[1].replace(/ [↓↑]$/, ''));
  for (const c of ['Resolución media', 'Resueltas por día', 'En menos de 24 h', 'Devueltas', 'Sin explicar']) assert.ok(!heads.includes(c), c);
  const times = (name) => { const c = [...rowOf(h, name).matchAll(/<td class="mt-num">([^<]*)</g)].map((x) => x[1]); return ['Tatt medio', 'Tan medio', 'TTR medio'].map((k) => c[heads.indexOf(k)]); };
  assert.deepEqual(times('ANA'), [dur(5), dur(30), dur(60)]);
  assert.deepEqual(times('PEPE'), [dur(300), dur(150), dur(7000)]);
  assert.deepEqual(times('Equipo Indra'), [dur((5 + 300) / 2), dur((9 * 30 + 10 * 150) / 19), dur((9 * 60 + 10 * 7000) / 19)]);
});

test('La página de Calidad: se llega desde el bloque Calidad, con cifras o como gráfica, y se vuelve al equipo', () => {
  const link = /<h3>Calidad<\/h3><button class="wk-block-link" data-page="conclusions">Calidad</;
  assert.match(render([{ company: 0 }, null]), link);
  assert.match(render([{ company: 0 }, null], new Set(['quality'])), link);
  assert.equal((render([{ company: 0 }, null]).match(/data-page="conclusions"/g) || []).length, 1);   // solo en Calidad
  const h = conclusionsPanel();
  assert.match(h, /data-page="team"/);
  assert.match(h, /<h3>Calidad<\/h3>/);
  assert.match(h, /En construcción/);
});

test('Volumen: la media de resueltas cuenta lo mismo que su barra, también lo creado antes del periodo', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(['volumeMonths']) };
  m.S.sides = [{ company: 0 }, null];
  m.setPeriod(5 * 1440, 7 * 1440);   // las 10 de PEPE se crean antes (minuto 2000) y se resuelven el día 6 (minuto 9000)
  m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.match(h, /<b>—<\/b> nuevas <i class="mt-sw mt-c0"><\/i><b>10,0<\/b> resueltas/);
  assert.match(h, /Resueltas: 10/);
});

test('Volumen: la media por día de la semana, de todos los de ese tipo del periodo', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null];
  m.setPeriod(0, 14 * 1440);   // dos de cada; el minuto 0 es jueves: ANA crea y resuelve 10 el jueves y PEPE crea 10 el viernes y resuelve el miércoles
  m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  const tip = (day) => h.match(new RegExp(`data-tip="(${day} [^"]*)"`))[1];
  assert.match(tip('Jueves'), /^Jueves \(2 en el periodo\)\s+Nuevas: 5,0 de media\s+Resueltas: 5,0 de media$/);
  assert.match(tip('Viernes'), /Nuevas: 5,0 de media\s+Resueltas: 0,0 de media/);
  assert.match(tip('Miércoles'), /Nuevas: 0,0 de media\s+Resueltas: 5,0 de media/);
  assert.match(tip('Lunes'), /Nuevas: 0,0 de media\s+Resueltas: 0,0 de media/);
  assert.equal((h.match(/class="wk-cols wk-days"/g) || []).length, 1);   // solo en Volumen
  assert.match(h, /data-chart="volumeMonths" title="Ver por mes"/);
  const months = render([{ company: 0 }, null], new Set(['volumeMonths']));
  assert.doesNotMatch(months, /wk-days/);
  assert.match(months, /data-chart="volumeMonths" title="Ver por día de la semana"/);
});

test('filtrar a una persona: los bloques, solo sus datos; la tabla, entera, para poder elegir otra', () => {
  const d = data(); d.dict.status = ['', 'CLOSED', 'ASSIGNED']; d.cols.st[MIN] = 2;   // una de PEPE, abierta
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), person: 1 };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.ok(rowOf(h, 'ANA') && rowOf(h, 'PEPE'));
  assert.match(h, /Equipo Indra/);
  assert.match(h, /Solo los datos de <b>ANA<\/b><button[^>]*data-person-clear/);
  assert.match(h, /<div class="wk-key"><b>10<\/b><span>incidencias en el periodo/);
  assert.match(h, /<h3>Pendientes<\/h3>[\s\S]*?<div class="wk-hero"><b>0<\/b>/);   // la abierta de PEPE no cuenta
  ui.person = null;
  const all = teamPanel(m, createCharts(m, ui), ui);
  assert.ok(rowOf(all, 'ANA') && rowOf(all, 'PEPE'));
  assert.match(all, /Equipo Indra/);
  assert.doesNotMatch(all, /data-person-clear/);
  assert.match(all, /<div class="wk-key"><b>20<\/b>/);
  assert.match(all, /<h3>Pendientes<\/h3>[\s\S]*?<div class="wk-hero"><b>1<\/b>/);
});

test('Calidad: en grande el %IQA y, en pequeño, las reaperturas y las devueltas a la cola', () => {
  const d = data(); d.cols.nb = d.cols.nb.map((_, i) => (i < 2 ? 1 : 0));   // ANA: 2 devueltas de las 20 del equipo
  d.cols.fl[0] = 512;                                                       // y 1 reabierta
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  const b = h.slice(h.indexOf('<h3>Calidad'), h.indexOf('</section>', h.indexOf('<h3>Calidad')));
  assert.match(b, /<div class="wk-hero"><b>—<\/b><span>%IQA/);   // sin la nota del agente de calidad
  assert.match(b, /Reaperturas<\/span><b>5,0 %</);
  assert.match(b, /Devueltas a la cola<\/span><b>10,0 %</);
  assert.doesNotMatch(b, /sin explicar/);
  const chart = render([{ company: 0 }, null], new Set(['quality']));
  assert.match(chart, /Reaperturas, por (día|mes) de creación/);
});

test('Actividad: arriba del todo, del equipo o de la persona filtrada; con días elegidos, sigue enseñando el periodo de partida', () => {
  const d = data();
  d.cols.sp = d.cols.as.map((a) => (a === 1 ? [[0, 10, 1]] : a === 2 ? [[0, 1450, 2]] : [[0, 10, 3]]));   // ANA resuelve el día 0, PEPE el 1 y LUIS es de otra empresa
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null];
  m.setPeriod(0, 3 * 1440); m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.ok(h.indexOf('wk-activity') < h.indexOf('<h3>Volumen'));
  assert.match(h, /<h3>Actividad del equipo<\/h3>/);
  assert.match(h, /Resueltas <b>20</);
  ui.person = 1;
  const ana = teamPanel(m, createCharts(m, ui), ui);
  assert.match(ana, /<h3>Actividad de ANA<\/h3>/);
  assert.match(ana, /Resueltas <b>10</);
  ui.person = null;
  ui.range = { base: [0, 3 * 1440], days: [1440] };
  m.setPeriod(1440, 2 * 1440); m.refilter();
  const sel = teamPanel(m, createCharts(m, ui), ui);
  assert.equal((sel.match(/data-act-day=/g) || []).length, 3);
  assert.match(sel, /wk-act-out" data-act-day="0"/);
  assert.match(sel, /Resueltas <b>10</);   // la leyenda, solo lo elegido
  assert.match(sel, /<div class="wk-key"><b>10<\/b><span>incidencias con actividad esos días/);   // lo hecho ese día: las 10 de PEPE
});

test('Días sueltos: los bloques y la tabla, solo lo de esos días, no lo que queda entre ellos', () => {
  const d = data();
  d.cols.sp = d.cols.as.map((a) => (a === 1 ? [[0, 10, 1]] : a === 2 ? [[0, 1450, 2]] : []));
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), range: { base: [0, 3 * 1440], days: [0, 2 * 1440] } };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(0, 3 * 1440); m.refilter();   // ANA resuelve el día 0 y PEPE, el 1, que queda fuera
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.match(h, /<div class="wk-key"><b>10<\/b><span>incidencias con actividad esos días/);
  assert.ok(rowOf(h, 'ANA') && !rowOf(h, 'PEPE'));
  assert.match(h, /wk-act-out" data-act-day="1440"/);
  assert.doesNotMatch(h, /wk-act-out" data-act-day="0"/);
});

test('Sábana: abajo del todo, las incidencias del panel, abiertas o cerradas, con los filtros de técnico y días', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(0, 3 * 1440); m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui), sheet = h.slice(h.indexOf('Sábana de incidencias'));
  assert.ok(h.indexOf('persona a persona') < h.indexOf('Sábana de incidencias'));
  assert.match(sheet, /20 incidencias<\/span><button class="mt-btn" data-export >Exportar a CSV/);
  assert.equal((sheet.match(/<td class="mt-subj"/g) || []).length, 20);
  assert.match(sheet, /<th class="mt-num"[^>]*>Antigüedad o TTR<\/th><th class="mt-num"[^>]*>Nota final de la auditoría<\/th><th[^>]*>IA<\/th>/);
  assert.doesNotMatch(sheet, /Fecha apertura/);
  assert.doesNotMatch(sheet, /<th[^>]*>Responsable/);
  assert.ok(sheet.includes(`<td class="mt-num">${dur(60)}</td><td class="mt-num">—</td><td>No</td>`));   // resuelta en 60 min: su TTR; sin nota
  assert.doesNotMatch(sheet, /undefined|NaN/);
  assert.deepEqual(teamIssues(m, ui).slice(0, 2), [0, 1]);   // de la más antigua a la más reciente
  ui.person = 2;
  assert.equal(teamIssues(m, ui).length, 10);
  assert.ok(teamIssues(m, ui).every((i) => m.C.as[i] === 2));
  ui.person = null; ui.range = { base: [0, 3 * 1440], days: [2 * 1440] };   // sin pasos esos días
  assert.match(teamPanel(m, createCharts(m, ui), ui), /Ninguna incidencia con estos filtros/);
});

test('Días elegidos: lo hecho en ellos, aunque la incidencia se creara antes; tiempos y calidad, de lo resuelto esos días', () => {
  const d = data();
  // creadas el día 0: ANA resuelve sus 10 el día 5; PEPE solo escala sus 10 el día 5 y las resuelve después
  d.cols.rep = d.cols.rep.map(() => 100); d.cols.res = d.cols.as.map((a) => (a === 1 ? 5 * 1440 + 100 : a === 2 ? 9 * 1440 + 100 : 3100));
  d.cols.sp = d.cols.as.map((a) => (a === 1 ? [[0, 5 * 1440 + 100, 1]] : a === 2 ? [[1, 5 * 1440 + 100, 2], [0, 9 * 1440 + 100, 2]] : []));
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), range: { base: [0, 10 * 1440], days: [5 * 1440] } };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(5 * 1440, 6 * 1440); m.refilter();
  assert.equal(m.rows().length, 0);   // ninguna creada ese día
  const h = teamPanel(m, createCharts(m, ui), ui);
  assert.match(h, /<div class="wk-key"><b>20<\/b><span>incidencias con actividad esos días/);
  assert.ok(rowOf(h, 'ANA') && rowOf(h, 'PEPE'));
  assert.equal(teamIssues(m, ui).length, 20);
  // el TTR del equipo: solo el de las 10 de ANA, resueltas ese día
  assert.match(h, new RegExp(`<h3>Tiempos</h3>[\\s\\S]*?<div class="wk-hero"><b>${dur(5 * 1440)}</b>`));
  ui.person = 2;
  const pepe = teamPanel(m, createCharts(m, ui), ui);
  assert.match(pepe, /<div class="wk-key"><b>10<\/b>/);
  assert.match(pepe, /<h3>Tiempos<\/h3>[\s\S]*?<div class="wk-hero"><b>—<\/b>/);   // escaló, sin resolver ese día
});

test('Actividad frente a la media: todo el equipo, por día; una persona, por turno, frente a la fila del equipo', () => {
  const d = data();
  d.cols.sp = d.cols.as.map((a) => (a === 3 ? [] : [[0, 50, a]]));   // las 20 del equipo, el primero de los 3 días: 10 de ANA y 10 de PEPE
  d.sessions = [[], [[0, 100, 1]], [[0, 100, 1]], []];                // un turno cada uno: 10 por turno
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), actSeries: 'r' };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(0, 3 * 1440); m.refilter();
  const team = teamPanel(m, createCharts(m, ui), ui);
  // eR, por día: sin técnico elegido se compara por día, sin depender de los turnos
  const chart = team.slice(team.indexOf('wk-activity'), team.indexOf('</section>'));
  assert.match(chart, /Media del equipo: 6,7 por día/);
  assert.match(chart, /Resueltas: 20\s+Media del equipo: 6,7\s+por encima de la media/);
  assert.doesNotMatch(chart, /turno/);
  ui.person = 1;
  const ana = teamPanel(m, createCharts(m, ui), ui);
  assert.match(ana, /Media del equipo: 10,0 por turno/);
  assert.match(ana, /Resueltas: 10 en 1,00 turno\s+Por turno: 10,0/);
});

test('los pasos son de quien los hizo: un técnico ve lo que resolvió él, aunque hoy la incidencia la lleve otro', () => {
  const d = data();
  d.cols.sp = d.cols.as.map((a) => (a === 1 ? [[0, 1100, 2]] : []));   // las 10 de ANA las resolvió PEPE
  const m = createModel(d), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), person: 2 };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(0, 3 * 1440); m.refilter();
  const pepe = teamPanel(m, createCharts(m, ui), ui);
  assert.ok(pepe.includes('Resueltas <b>10<'));
  ui.person = 1;
  assert.ok(teamPanel(m, createCharts(m, ui), ui).includes('Resueltas <b>0<'));
  ui.person = 2; ui.range = { base: [0, 3 * 1440], days: [0] };
  assert.equal(teamIssues(m, ui).length, 10);
  assert.ok(teamIssues(m, ui).every((i) => m.C.as[i] === 1));
  assert.ok(rowOf(teamPanel(m, createCharts(m, ui), ui), 'PEPE'));
});

test('por turno: sin los turnos del bridge, lo dice', () => {
  assert.match(render([{ company: 0 }, null]), /Faltan los turnos de lo resuelto[^<]*reinicia SIA/);
});

test('al ordenar por una media o un %, quien tiene menos de MIN incidencias va al final', () => {
  const d = data(); d.company[3] = 0;   // LUIS, en el equipo, con 1 issue
  const m = createModel(d), ui = { exp: {}, sort: { team: ['avg', 1] } };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const names = [...teamPanel(m, createCharts(m, ui), ui).matchAll(/data-person="(\d)"/g)].map((x) => x[1]);
  assert.deepEqual(names, ['1', '2', '3']);   // LUIS tiene la media más baja, pero va al final
});

test('comparar técnicos: un clic marca o desmarca; con dos, el tercero entra como B y el B anterior pasa a A', () => {
  assert.deepEqual(compareTech(undefined, 1), [1]);
  assert.deepEqual(compareTech([1], 2), [1, 2]);
  assert.deepEqual(compareTech([1, 2], 3), [2, 3]);
  assert.deepEqual(compareTech([1, 2], 1), [2]);
});

test('comparar técnicos: con dos, solo sus filas y la diferencia de A frente a B, en verde o rojo según qué es mejor', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), cmp: [1, 2] };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui);
  const table = h.slice(h.indexOf('<table class="wk-team"'), h.indexOf('</table>'));
  assert.deepEqual([...table.matchAll(/data-person="(\d)"/g)].map((x) => x[1]), ['1', '2']);
  assert.match(rowOf(table, 'ANA'), /mt-sw mt-c0/);
  assert.match(rowOf(table, 'PEPE'), /mt-sw mt-c1/);
  assert.doesNotMatch(table, /Equipo Indra/);   // sin la fila del equipo: la diferencia, al pie
  const heads = [...table.matchAll(/data-sort="team:([^"]+)"/g)].map((x) => x[1]);
  const diff = [...rowOf(table, 'Diferencia').matchAll(/<td class="mt-num([^"]*)"[^>]*>([^<]*)</g)].map((x) => [x[1].trim(), x[2]]);
  assert.deepEqual(diff[heads.indexOf('n')], ['mt-diff', '=']);   // 10 y 10
  assert.equal(diff[heads.indexOf('avg')][0], 'mt-diff good');      // ANA resuelve antes
  assert.equal(diff[heads.indexOf('tatt')][0], 'mt-diff good');
  assert.match(h, /Comparando <b>ANA<\/b> con <b>PEPE<\/b>[\s\S]*data-cmp-clear/);
  assert.doesNotMatch(h, /undefined|NaN/);
});

test('comparar técnicos: con uno, toda la tabla, el elegido marcado y cómo elegir el otro; quien no tiene fila no cuenta', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), cmp: [1] };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const h = teamPanel(m, createCharts(m, ui), ui), table = h.slice(h.indexOf('<table class="wk-team'));
  assert.match(table, /^<table class="wk-team wk-picking">/);   // el resto, en segundo plano
  assert.match(rowOf(table, 'ANA'), /wk-cmp/);
  assert.doesNotMatch(rowOf(table, 'PEPE'), /wk-cmp/);
  assert.match(h, /Equipo Indra/);
  assert.match(h, /Pincha otro técnico para compararlo con <b>ANA<\/b>/);
  ui.cmp = [1, 3];   // LUIS es de T-Systems: no tiene fila, así que no se compara
  const h2 = teamPanel(m, createCharts(m, ui), ui);
  assert.doesNotMatch(h2, /Diferencia/);
  assert.match(h2, /compararlo con <b>ANA<\/b>/);
});

test('una persona frente a la media del equipo (vsTeam, el informe): su fila, la media por persona y la diferencia', () => {
  const m = createModel(data());
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const vs = (person) => { const ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), person, vsTeam: true }; return teamPanel(m, createCharts(m, ui), ui); };
  const ana = vs(1), card = ana.slice(ana.indexOf('<h3>ANA frente a la media del equipo</h3>'));
  assert.ok(ana.includes('<h3>ANA frente a la media del equipo</h3>'));
  assert.doesNotMatch(ana, /El equipo, persona a persona|undefined|NaN/);
  const row = (name) => card.split('<tr').find((r) => r.includes(`>${name}<`));
  assert.ok(row('ANA') && row('Media del equipo') && row('Diferencia'));
  // la media de ANA (1 h) y PEPE (≈ 117 h): su TTR, mejor que la media (en verde); el de PEPE, peor (en rojo)
  assert.match(row('Media del equipo'), new RegExp(`>${dur((60 + 7000) / 2)}<`));
  assert.match(row('Diferencia'), /mt-diff good/);
  assert.doesNotMatch(row('Diferencia'), /mt-diff bad/);
  const pepe = vs(2);
  assert.match(pepe.slice(pepe.indexOf('<h3>PEPE frente')).split('<tr').find((r) => r.includes('>Diferencia<')), /mt-diff bad/);
  // sin persona, la tabla de siempre
  assert.match(vs(null), /El equipo, persona a persona/);
});

test('Equipo soporte en un informe (noSheet): sin la sábana de incidencias', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, showSheet: true, charts: new Set(), noSheet: true };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  assert.doesNotMatch(teamPanel(m, createCharts(m, ui), ui), /Sábana de incidencias/);
  ui.noSheet = false;
  assert.match(teamPanel(m, createCharts(m, ui), ui), /Sábana de incidencias/);
});

test('Equipo soporte: la sábana ya no se ve (se exporta desde los tres puntos de Métricas)', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, charts: new Set() };
  m.S.sides = [{ company: 0 }, null]; m.setPeriod(0, 3 * 1440); m.refilter();
  assert.doesNotMatch(teamPanel(m, createCharts(m, ui), ui), /Sábana de incidencias|data-export/);
});
