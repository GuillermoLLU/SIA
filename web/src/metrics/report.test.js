import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { REPORTS, MODES, modesOf, modeOf, AUDIENCES, sidesOf, SYSTEMS, systemsFilter, systemsText, withDates, reportLabel, reportBounds, reportRange, rangeText, reportName, reportHead } from './report.js';

const DAY = 1440, BASE = Date.UTC(2026, 0, 1);
const bounds = { min: '2026-01-01', max: '2026-03-10' };

test('los informes del desplegable, cada uno con lo que contiene y con qué datos sale', () => {
  assert.deepEqual(REPORTS.map(([k, l]) => [k, l]), [['backlog', 'Backlog actual'], ['history', 'Resumen básico'], ['tiempos', 'Análisis de tiempos'], ['modulos', 'Módulos y focos'], ['escalados', 'Escalados'], ['slas', 'Estado de SLAs'], ['equipo', 'Equipo soporte']]);
  assert.deepEqual(MODES.map(([k, l]) => [k, l]), [['now', 'Actual'], ['dates', 'Histórico']]);
  // Backlog actual, solo lo de ahora; Resumen básico, solo con fechas; los otros dos, cualquiera (de partida, Actual)
  assert.deepEqual(modesOf('backlog'), ['now']);
  assert.deepEqual(modesOf('history'), ['dates']);
  for (const k of ['tiempos', 'modulos', 'escalados']) assert.deepEqual(modesOf(k), ['now', 'dates'], k);
  assert.deepEqual(modesOf('equipo'), ['dates']);
  assert.deepEqual(modesOf('slas'), ['dates']);
  assert.equal(withDates('backlog'), false);
  assert.equal(withDates('backlog', 'dates'), false, 'pedirle fechas a uno que no las admite: el suyo');
  assert.equal(withDates('history'), true);
  assert.equal(withDates('tiempos'), false);
  assert.equal(withDates('tiempos', 'dates'), true);
  assert.equal(modeOf('modulos', 'dates'), 'dates');
  assert.equal(modeOf('modulos', undefined), 'now');
  for (const [, , , about] of REPORTS) assert.ok(about.length > 40);
  assert.equal(reportLabel('nope'), 'Backlog actual', 'uno que no existe: el primero');
});

test('lo que se puede elegir con fechas: de lo cargado, del primer día al de la foto', () => {
  const m = createModel(data());
  const b = reportBounds(m);
  assert.equal(b.min, '2026-01-01');
  assert.equal(b.max, new Date(m.BASE + (m.END_D - DAY) * 6e4).toISOString().slice(0, 10));
});

test('Backlog actual: sin fechas, el periodo de arriba tal cual, sin mirar las que haya escritas', () => {
  assert.deepEqual(reportRange({ key: 'backlog', current: [10, 20], from: '', to: '', bounds, base: BASE }), { range: [10, 20] });
});

test('con fechas: un rango a mano, los dos días incluidos, en orden y dentro de lo cargado', () => {
  const r = (from, to) => reportRange({ key: 'history', from, to, bounds, base: BASE });
  assert.deepEqual(reportRange({ key: 'tiempos', mode: 'dates', from: '2026-01-02', to: '2026-01-04', bounds, base: BASE }), { range: [DAY, 4 * DAY] });
  assert.deepEqual(reportRange({ key: 'tiempos', mode: 'now', current: [10, 20], from: '', to: '', bounds, base: BASE }), { range: [10, 20] }, 'en Actual no mira las fechas');
  assert.deepEqual(r('2026-01-02', '2026-01-04'), { range: [DAY, 4 * DAY] });
  assert.deepEqual(r('2026-01-05', '2026-01-05'), { range: [4 * DAY, 5 * DAY] }, 'un solo día vale');
  assert.match(r('2026-01-04', '2026-01-02').error, /anterior a la de inicio/);
  assert.match(r('2025-12-30', '2026-01-02').error, /Solo hay datos del 01\/01\/2026 al 10\/03\/2026/);
  assert.match(r('2026-03-01', '2026-03-11').error, /Solo hay datos/);
  assert.match(r('', '2026-01-02').error, /Elige/);
  assert.match(r('2026-02-30', '2026-03-02').error, /Elige/);
});

test('el periodo en texto y el nombre del PDF: el del informe y su día o su rango', () => {
  assert.equal(rangeText([0, 3 * DAY], BASE), '01/01/2026 – 03/01/2026 · 3 días');
  assert.equal(rangeText([0, DAY], BASE), '01/01/2026 – 01/01/2026 · 1 día');
  assert.equal(reportName('history', [0, 3 * DAY], BASE), 'Resumen básico 2026-01-01 a 2026-01-03');
  assert.equal(reportName('backlog', [0, 3 * DAY], BASE, { asOf: Date.UTC(2026, 10, 12, 9) }), 'Backlog actual 2026-11-12');
  assert.equal(reportName('backlog', [0, 3 * DAY], BASE, { asOf: Date.UTC(2026, 10, 12, 9), audience: 'ts' }), 'Backlog actual frente a T-Systems 2026-11-12');
  assert.equal(reportName('history', [0, 3 * DAY], BASE, { audience: 'ts' }), 'Resumen básico frente a T-Systems 2026-01-01 a 2026-01-03');
  assert.equal(reportName('modulos', [0, 3 * DAY], BASE, { mode: 'now', asOf: Date.UTC(2026, 10, 12) }), 'Módulos y focos 2026-11-12');
  assert.equal(reportName('tiempos', [0, 3 * DAY], BASE, { mode: 'dates' }), 'Análisis de tiempos 2026-01-01 a 2026-01-03');
});

test('la cabecera de Backlog actual: a fecha de la última carga, sin periodo, qué se mira, filtros y cuándo se generó', () => {
  const h = reportHead({ key: 'backlog', range: [0, 3 * DAY], base: BASE, asOf: '12/11/2026 09:30', sides: ['Indra', 'T-Systems'], filters: ['Prioridad: Alta'], coverage: 'Datos desde 01/01/2026', generatedAt: new Date(2026, 10, 11, 9, 5) });
  assert.match(h, /<h1>Backlog actual · Métricas<\/h1>/);
  assert.match(h, /<dt>A fecha de<\/dt><dd>12\/11\/2026 09:30<\/dd>/);
  assert.doesNotMatch(h, /Periodo|01\/01\/2026/);
  assert.match(h, /<dt>Datos<\/dt><dd>Lo abierto ahora, se abriera cuando se abriera<\/dd>/);
  assert.match(h, /<dt>Comparando<\/dt><dd>Indra frente a T-Systems<\/dd>/);
  assert.match(h, /<dt>Filtros<\/dt><dd>Prioridad: Alta<\/dd>/);
  assert.match(h, /<dt>Generado<\/dt><dd>11\/11\/2026 09:05<\/dd>/);
  assert.doesNotMatch(h, /estado del backlog/);
});

test('la cabecera de Resumen básico: su periodo y hasta dónde llegan los datos, y que no lleva el estado por situación', () => {
  const h = reportHead({ key: 'history', range: [0, DAY], base: BASE, sides: ['Indra'], coverage: 'Datos desde 01/01/2026 hasta 01/01/2026' });
  assert.match(h, /<h1>Resumen básico · Métricas<\/h1>/);
  assert.match(h, /<dt>Periodo<\/dt><dd>01\/01\/2026 – 01\/01\/2026 · 1 día<\/dd>/);
  assert.match(h, /<dt>Datos<\/dt><dd>Datos desde 01\/01\/2026 hasta 01\/01\/2026<\/dd>/);
  assert.match(h, /<dt>Qué se mira<\/dt><dd>Indra<\/dd>/);
  assert.doesNotMatch(h, /A fecha de|Filtros/);
  assert.match(h, /no hay estado del backlog por situación/);
});

test('las dos pestañas: solo de Indra o de Indra frente a T-Systems (sin Módulos y focos), con sus lados', async () => {
  assert.deepEqual(AUDIENCES.map(([k, l]) => [k, l]), [['indra', 'Indra'], ['ts', 'Indra frente a T-Systems']]);
  const { reportsOf } = await import('./report.js');
  assert.deepEqual(reportsOf('indra').map(([k]) => k), ['backlog', 'history', 'tiempos', 'modulos', 'escalados', 'slas', 'equipo']);
  assert.deepEqual(reportsOf('ts').map(([k]) => k), ['backlog', 'history', 'tiempos', 'slas']);
  assert.deepEqual(sidesOf('indra'), [{ company: 0 }, null]);
  assert.deepEqual(sidesOf('ts'), [{ company: 0 }, { company: 1 }]);
  assert.deepEqual(sidesOf('nope'), [{ company: 0 }, null], 'una que no existe: la primera');
  // nuevos cada vez: cambiarlos no toca los de la pestaña
  sidesOf('ts')[0].company = 9;
  assert.equal(sidesOf('ts')[0].company, 0);
});

test('comparando con T-Systems, los informes salen con los dos lados y vuelven a ser solo de Indra después', () => {
  const m = createModel(data());
  const before = m.S.sides;
  m.S.sides = sidesOf('ts'); m.refilter();
  assert.deepEqual(m.CO(), [0, 1]);
  assert.deepEqual(m.NAMES(), ['Indra', 'T-Systems']);
  m.S.sides = before; m.refilter();
  assert.deepEqual(m.CO(), [0]);
});

test('las casillas SGA y SISU: las dos, sin filtro de sistema; una, solo ese (DIMS.ss: 0 SISU, 1 SGA); ninguna, no hay informe', () => {
  assert.deepEqual(SYSTEMS.map(([k, l]) => [k, l]), [['sga', 'SGA'], ['sisu', 'SISU']]);
  assert.equal(systemsFilter(['sga', 'sisu']), null);
  assert.deepEqual([...systemsFilter(['sga'])], [1]);
  assert.deepEqual([...systemsFilter(['sisu'])], [0]);
  assert.equal(systemsText(['sga', 'sisu']), 'SGA y SISU');
  assert.equal(systemsText(['sisu']), 'Solo SISU');
  assert.match(reportRange({ key: 'backlog', current: [0, 1], bounds, base: BASE, systems: [] }).error, /Marca SGA, SISU o los dos/);
  assert.match(reportRange({ key: 'history', from: '2026-01-02', to: '2026-01-04', bounds, base: BASE, systems: [] }).error, /Marca/);
  assert.deepEqual(reportRange({ key: 'backlog', current: [0, 1], bounds, base: BASE, systems: ['sga'] }), { range: [0, 1] });
});

test('de un solo sistema, el nombre y la cabecera lo dicen; con los dos, la cabecera los nombra', () => {
  assert.equal(reportName('backlog', [0, DAY], BASE, { asOf: Date.UTC(2026, 10, 12), systems: ['sga'] }), 'Backlog actual SGA 2026-11-12');
  assert.equal(reportName('history', [0, 3 * DAY], BASE, { audience: 'ts', systems: ['sisu'] }), 'Resumen básico SISU frente a T-Systems 2026-01-01 a 2026-01-03');
  assert.equal(reportName('backlog', [0, DAY], BASE, { asOf: Date.UTC(2026, 10, 12), systems: ['sga', 'sisu'] }), 'Backlog actual 2026-11-12');
  assert.match(reportHead({ key: 'backlog', range: [0, DAY], base: BASE, asOf: 'x', sides: ['Indra'], systems: ['sga'] }), /<dt>Sistemas<\/dt><dd>Solo SGA<\/dd>/);
  assert.match(reportHead({ key: 'backlog', range: [0, DAY], base: BASE, asOf: 'x', sides: ['Indra'] }), /<dt>Sistemas<\/dt><dd>SGA y SISU<\/dd>/);
});

test('el filtro de sistema del informe deja solo las de ese sistema y, quitado, vuelven todas', () => {
  const m = createModel(data()); m.refilter();
  const all = m.rows().length;
  m.S.f.ss = systemsFilter(['sisu']); m.refilter();
  const sisu = m.rows();
  assert.ok(sisu.every((i) => m.DIMS.ss.get(i) === 0));
  m.S.f.ss = systemsFilter(['sga']); m.refilter();
  assert.ok(m.rows().every((i) => m.DIMS.ss.get(i) === 1));
  assert.equal(sisu.length + m.rows().length, all);
  delete m.S.f.ss; m.refilter();
  assert.equal(m.rows().length, all);
});

test('la cabecera de los informes con dos modos dice cuál; la nota del estado, solo en el Resumen básico', () => {
  const now = reportHead({ key: 'modulos', mode: 'now', range: [0, DAY], base: BASE, asOf: '12/11/2026 09:30', sides: ['Indra'] });
  assert.match(now, /<h1>Módulos y focos · Actual · Métricas<\/h1>/);
  assert.match(now, /<dt>A fecha de<\/dt>/);
  assert.doesNotMatch(now, /estado del backlog/);
  const past = reportHead({ key: 'tiempos', mode: 'dates', range: [0, DAY], base: BASE, sides: ['Indra'], coverage: 'c' });
  assert.match(past, /<h1>Análisis de tiempos · Histórico · Métricas<\/h1>/);
  assert.match(past, /<dt>Periodo<\/dt>/);
  assert.doesNotMatch(past, /estado del backlog/);
  assert.match(reportHead({ key: 'backlog', range: [0, DAY], base: BASE, asOf: 'x', sides: ['Indra'] }), /<h1>Backlog actual · Métricas<\/h1>/, 'con un solo modo, sin decirlo');
});

test('las listas de módulos y centros, solo en Análisis de tiempos y Módulos y focos; todo marcado, sin filtro; si no, lo marcado', async () => {
  const { PICKS, picksOf, pickedFilter, pickedText } = await import('./report.js');
  assert.deepEqual(PICKS.map(([d, l]) => [d, l]), [['mo', 'Módulos'], ['ce', 'Centros'], ['vp', 'Equipos de Jira']]);
  for (const k of ['tiempos', 'modulos']) assert.deepEqual(picksOf(k).map(([d]) => d), ['mo', 'ce'], k);
  assert.deepEqual(picksOf('escalados').map(([d]) => d), ['vp'], 'Escalados, por equipo de Jira');
  assert.match(reportRange({ key: 'escalados', mode: 'now', current: [0, 1], bounds, base: BASE, picked: { vp: 0 } }).error, /al menos un equipo de Jira/);
  for (const k of ['backlog', 'history', 'equipo']) assert.deepEqual(picksOf(k), [], k);
  // sin listas, nada que comprobar: el informe sale aunque no lleguen casillas
  assert.deepEqual(reportRange({ key: 'backlog', mode: 'now', current: [0, 1], bounds, base: BASE, picked: { mo: 0 } }), { range: [0, 1] });
  assert.equal(pickedFilter([1, 2, 3], [1, 2, 3]), null);
  assert.deepEqual([...pickedFilter([1, 2, 3], [2])], [2]);
  const name = (k) => `M${k}`, all = Array.from({ length: 10 }, (_, i) => i + 1);
  assert.equal(pickedText(all, all, name), '', 'con todo, no hace falta decirlo');
  assert.equal(pickedText(all, [1, 3], name), 'M1, M3');
  assert.equal(pickedText(all, [1, 2, 3, 4, 5, 6, 7], name), '7 de 10: M1, M2, M3, M4, M5, M6…');
  // sin ninguno marcado en una lista, no hay informe
  assert.match(reportRange({ key: 'modulos', mode: 'now', current: [0, 1], bounds, base: BASE, picked: { mo: 0, ce: 3 } }).error, /al menos un módulo/);
  assert.match(reportRange({ key: 'modulos', mode: 'now', current: [0, 1], bounds, base: BASE, picked: { mo: 2, ce: 0 } }).error, /al menos un centro/);
  assert.deepEqual(reportRange({ key: 'modulos', mode: 'now', current: [0, 1], bounds, base: BASE, picked: { mo: 2, ce: 1 } }), { range: [0, 1] });
  // y la cabecera, una fila por lista que filtra
  assert.match(reportHead({ key: 'modulos', mode: 'now', range: [0, DAY], base: BASE, asOf: 'x', sides: ['Indra'], picks: [['Módulos', 'EWMS, PACKING']] }), /<dt>Módulos<\/dt><dd>EWMS, PACKING<\/dd>/);
});

test('Equipo soporte: sin las casillas de SGA y SISU, de todo el equipo o de un técnico', async () => {
  const { withSystems, withPerson } = await import('./report.js');
  assert.equal(withSystems('equipo'), false);
  assert.equal(withPerson('equipo'), true);
  for (const k of ['backlog', 'history', 'tiempos', 'modulos', 'escalados']) { assert.equal(withSystems(k), true, k); assert.equal(withPerson(k), false, k); }
  // sin sistemas marcados no pasa nada: no los lleva
  assert.ok(reportRange({ key: 'equipo', mode: 'dates', current: [0, 1], from: '2026-01-01', to: '2026-01-31', bounds, base: BASE, systems: [] }).range);
  const h = (person) => reportHead({ key: 'equipo', mode: 'dates', range: [0, DAY], base: BASE, sides: ['Indra'], systems: ['sga'], person });
  assert.doesNotMatch(h(''), /Sistemas/);
  assert.match(h(''), /<dt>Técnico<\/dt><dd>Todo el equipo<\/dd>/);
  assert.match(h('Ana Pérez'), /<dt>Técnico<\/dt><dd>Ana Pérez<\/dd>/);
  assert.equal(reportName('equipo', [0, 3 * DAY], BASE, { mode: 'dates', systems: ['sga'], person: 'Ana Pérez' }), 'Equipo soporte Ana Pérez 2026-01-01 a 2026-01-03');
  assert.doesNotMatch(reportHead({ key: 'escalados', mode: 'now', range: [0, DAY], base: BASE, asOf: 'x', sides: ['Indra'] }), /Técnico/);
});

test('Estado de SLAs: una casilla por parámetro, todas de partida; sin ninguna, no hay informe', async () => {
  const { PARAMS, withParams, paramsText } = await import('./report.js');
  assert.deepEqual(PARAMS.map(([k]) => k), ['sla', 'inc', 'res', 'mttr', 'iqa', 'ia']);
  assert.equal(withParams('slas'), true);
  for (const k of ['backlog', 'history', 'tiempos', 'modulos', 'escalados', 'equipo']) assert.equal(withParams(k), false, k);
  const r = (params) => reportRange({ key: 'slas', mode: 'dates', current: [0, 1], from: '2026-01-01', to: '2026-01-31', bounds, base: BASE, params });
  assert.match(r([]).error, /al menos un parámetro/);
  assert.ok(r(['mttr']).range);
  assert.ok(r(undefined).range, 'de partida, todos');
  assert.equal(paramsText(PARAMS.map(([k]) => k)), '');
  assert.equal(paramsText(['mttr', 'sla']), 'Atendidas en SLA, MTTR');
  const h = (params) => reportHead({ key: 'slas', mode: 'dates', range: [0, DAY], base: BASE, sides: ['Indra', 'T-Systems'], params });
  assert.doesNotMatch(h(undefined), /Parámetros/);
  assert.match(h(['mttr']), /<dt>Parámetros<\/dt><dd>MTTR<\/dd>/);
  assert.match(h(['mttr']), /<dt>Comparando<\/dt><dd>Indra frente a T-Systems<\/dd>/);
});
