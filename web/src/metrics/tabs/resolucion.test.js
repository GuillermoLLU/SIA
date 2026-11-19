import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';
import { afterDash } from './escalados.js';

const render = (sides, tab = 'resolucion') => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render(tab, m.rows());
};
// la tarjeta de las dos barras, dentro de «¿En qué se va el tiempo?»
const times = (html) => { const a = html.indexOf('<h3>En qué se va el tiempo</h3>'); return html.slice(a, html.indexOf('</section>', a)); };

test('En qué se va el tiempo: en Análisis tiempos (ya no en Resolución), sin comparar y comparando', () => {
  for (const sides of [[{ company: 0 }, null], [{ people: new Set([1]) }, { company: 0 }], [{ company: 0 }, { company: 1 }]]) {
    const html = render(sides, 'tiempos'), card = html.indexOf('<h3>En qué se va el tiempo</h3>');
    assert.ok(card > 0);
    assert.equal(html.indexOf('<section'), html.lastIndexOf('<section', card));   // la primera tarjeta
    assert.doesNotMatch(html, /En construcción|undefined|NaN/);
    assert.doesNotMatch(render(sides), /<h3>En qué se va el tiempo<\/h3>/);
  }
});

test('Resolución y escalados: en qué se va el tiempo, con las dos barras y una fila por barra para lo que se mira', () => {
  const html = times(render([{ company: 0 }, null], 'tiempos'));
  assert.equal((html.match(/class="mt-svc-time"/g) || []).length, 2);
  assert.deepEqual([...html.matchAll(/<span class="mt-svc-who">([^<]*)<\/span>/g)].map((x) => x[1]), ['Indra', 'Indra']);
  // Indra, sin escalar: la crítica (60 min) y la baja (100 min) resueltas
  assert.match(html, /<b>1,3 h<\/b>/);
});

test('Resolución y escalados, comparando una persona con su equipo: una fila por cada lado en cada barra', () => {
  const html = times(render([{ people: new Set([1]) }, { company: 0 }], 'tiempos'));
  assert.equal((html.match(/<span class="mt-svc-who">/g) || []).length, 4);
  assert.match(html, /<span class="mt-svc-who">Indra<\/span>/);
});

// abiertas (Asignada, sin resolver): las de la lista
const open = (d, list) => { for (const i of list) { d.cols.st[i] = 2; d.cols.res[i] = -1; } };

test('Escalados: solo lo activo; los proyectos elegidos filtran las cifras, los proyectos y la sábana; sin elegir, todo', () => {
  const d = data();
  d.dict.vproj = ['', 'SGA', 'ITS'];
  open(d, [3]);   // las de Indra: la 2 y la 3, abiertas, de SGA y de ITS; la 0, resuelta, no cuenta
  d.cols.fl = d.cols.fl.map((x) => x | 131072);
  d.cols.vt = d.cols.vt.map(() => 1);
  d.cols.vp = d.cols.vp.map((_, i) => (i % 2 ? 2 : 1));
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const kpiN = (h) => h.match(/Incidencias escaladas<\/div><div class="mt-kpi-v">(\d+)/)[1];
  const sheetRows = (h) => (h.slice(h.indexOf('Sábana de incidencias')).match(/<td class="mt-subj"/g) || []).length;
  const all = tabs.render('escalados', m.rows());
  const total = Number(kpiN(all));
  assert.ok(total > 0);
  assert.equal(total, m.today().filter((i) => m.OPEN[i]).length);   // lo resuelto, aunque esté escalado, no cuenta
  assert.ok(ui.escSheet.list.every((i) => m.OPEN[i]));
  assert.equal(Number(kpiN(tabs.render('escalados', []))), total);   // sea cual sea el periodo
  assert.match(all, /Antigüedad media/);
  assert.doesNotMatch(all, /Tiempo total medio/);
  assert.equal(sheetRows(all), total);
  assert.equal(ui.escSheet.list.length, total);
  assert.doesNotMatch(all, /data-jc-clear/);
  ui.jiraPick = [1];
  const one = tabs.render('escalados', m.rows());
  assert.match(one, /data-jc-clear/);
  assert.ok(Number(kpiN(one)) < total);
  assert.equal(sheetRows(one), Number(kpiN(one)));
  assert.ok(ui.escSheet.list.every((i) => m.C.vp[i] === 1));
  assert.match(one, /<td>SGA<\/td>/);
  assert.doesNotMatch(one.slice(one.indexOf('Sábana de incidencias')), /<td>ITS<\/td>/);
  assert.doesNotMatch(one, /undefined|NaN/);
});

test('Malos escalados: con su motivo, solo los activos, y filtrados por los proyectos elegidos', () => {
  const d = data();
  d.dict.vproj = ['', 'SGA', 'ITS'];
  open(d, [3]);   // y la 2, que ya lo está; la 0, cerrada, no sale
  d.cols.vt = d.cols.vt.map(() => 1);
  d.cols.vp = d.cols.vp.map((_, i) => (i % 2 ? 2 : 1));
  d.cols.fl = d.cols.fl.map((x, i) => x | (i === 0 ? 2097152 | 8388608 : i === 3 ? 2097152 | 4194304 : i === 2 ? 2097152 | 4194304 | 8388608 : 0) | (i > 1 ? 131072 : 0));   // las abiertas, escaladas: sus proyectos se eligen
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const card = (h) => h.slice(h.indexOf('>Malos escalados</h3>'), h.indexOf('</section>', h.indexOf('>Malos escalados</h3>')));
  // en la pestaña: a la izquierda, cada cambio de equipo y cuántas (filtra toda la página); a la derecha, sus
  // incidencias (id y resumen), con scroll
  const tab = card(tabs.render('escalados', m.rows()));
  assert.match(tab, /<div class="mt-bad"><div class="mt-bad-list"><table><thead><tr><th>Equipo original → final o dónde se descartó<\/th><th class="mt-num">Incidencias<\/th><\/tr>/);
  // las que no cambiaron de equipo, desglosadas por el proyecto Jira en que se descartaron
  assert.match(tab, /<tr class="mt-clk " data-only="mb:-3"[^>]*><td>Descartada en SGA<\/td><td class="mt-num">1<\/td><\/tr>/);
  assert.match(tab, /<tr class="mt-clk " data-only="mb:-4"[^>]*><td>Descartada en ITS<\/td><td class="mt-num">1<\/td><\/tr>/);
  assert.match(tab, /<div class="mt-bad-list"><table><thead><tr><th>Incidencia<\/th><th>Resumen<\/th><\/tr><\/thead><tbody>/);
  assert.equal((tab.match(/<a href="[^"]*" target="_blank" rel="noopener">INC\d{12}<\/a>/g) || []).length, 2);
  assert.equal(m.DIMS.vh.get(2), 0);
  // en el informe (Escalados), la tabla entera, con su motivo y sus tiempos
  const all = card(tabs.render('escalados', m.rows(), { inReport: true }));
  assert.match(all, /<td>Descartado en Jira<\/td>/);
  assert.match(all, /<th[^>]*>Equipo original → final<\/th>/);
  assert.match(all, /<th class="mt-num"[^>]*>THesc<\/th><th class="mt-num"[^>]*>Tesc<\/th><th class="mt-num"[^>]*>Tesc-r<\/th><th class="mt-num"[^>]*>Antigüedad<\/th><th class="mt-num"[^>]*>IDMTTR<\/th><\/tr>/);
  assert.match(all, /<td>Pendiente de actualizar<\/td>/);
  assert.doesNotMatch(all, /data-export/);
  assert.doesNotMatch(all, /undefined|NaN/);
  assert.doesNotMatch(all, /<td>Cambió de equipo<\/td>/);   // la cerrada
  assert.match(all, /2 incidencias/);
  ui.jiraPick = [2];
  const one = card(tabs.render('escalados', m.rows(), { inReport: true }));
  assert.doesNotMatch(one, /Descartado en Jira y Cambió de equipo/);
  assert.match(one, /<td>ITS<\/td>/);
  ui.jiraPick = [];
  m.toggle('pr', 1); m.refilter();   // las críticas: solo la cerrada, así que ninguno
  assert.match(tabs.render('escalados', m.rows()), /Ningún mal escalado activo con estos filtros/);
});

test('¿Qué escalamos y a quién?, en Activas: una tabla de los proyectos Jira de lo escalado y activo, como la de los módulos', () => {
  const d = data();
  open(d, [0]);
  d.cols.fl[0] |= 131072;   // la crítica de Indra (abierta, TEC: SGA-1), escalada
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui), html = tabs.render('escalados', m.rows());
  const at = html.indexOf('¿Qué escalamos y a quién?'), card = html.slice(html.indexOf('<table class="mt-sc">', at), html.indexOf('</table>', at));
  const top = html.slice(0, html.indexOf('<table class="mt-sc">'));
  for (const label of ['Incidencias escaladas', 'THesc medio', 'Tesc medio', 'Antigüedad media', 'IDMTTR']) assert.ok(top.includes(label), label);
  assert.ok(top.indexOf('IDMTTR') > top.indexOf('Antigüedad media'));   // a la derecha del todo
  assert.match(html.slice(html.indexOf('Sábana de incidencias')), /<th class="mt-num"[^>]*>IDMTTR<\/th>/);
  // la sábana: sin estado ni módulo; el título, del guion en adelante
  const sheet = html.slice(html.indexOf('Sábana de incidencias'));
  const heads = sheet.slice(0, sheet.indexOf('</thead>'));
  assert.doesNotMatch(heads, /<th[^>]*>Estado<\/th>|<th[^>]*>Módulo<\/th>/);
  assert.match(heads, /<th[^>]*>Título<\/th>/);
  assert.match(sheet, /<td class="mt-subj" data-tip="Etiqueta mal">Etiqueta mal<\/td>/);
  assert.equal(afterDash('100001 High ECOM ZARA C1 EWMS - Etiqueta mal'), 'Etiqueta mal');
  assert.equal(afterDash('Sin guion'), 'Sin guion');
  assert.equal(afterDash('Acaba en guion -'), 'Acaba en guion -');
  const jc = html.slice(html.indexOf('Proyectos Jira frente a la media'), html.indexOf('<table class="mt-sc">'));
  assert.match(jc, /data-jc="1" aria-pressed="false"/);      // de partida, solo la media
  assert.doesNotMatch(jc, /class="mt-c0"/);
  assert.equal((jc.match(/class="mt-jc-panel"/g) || []).length, 3);
  for (const label of ['THesc medio', 'Tesc medio', 'Antigüedad media', 'Media global']) assert.ok(jc.includes(label), label);
  assert.doesNotMatch(jc, /undefined|NaN/);
  ui.jiraPick = [1];
  const added = tabs.render('escalados', m.rows());
  assert.match(added, /data-jc="1" aria-pressed="true"/);
  assert.equal((added.match(/class="mt-jc-d ">0 %</g) || []).length, 1);   // solo el proyecto: es el único, igual que la media en el tiempo total; sin THesc ni Tesc, nada
  assert.equal((added.match(/class="mt-jc-row"/g) || []).length, 6);   // la media y el proyecto, en las tres gráficas
  assert.doesNotMatch(html, /Unas veces se escala|Un mismo ticket/);
  assert.match(html, />Malos escalados<\/h3>/);
  const res = tabs.render('resolucion', m.rows());
  assert.doesNotMatch(res, /¿Qué escalamos y a quién\?|Proyectos Jira|Malos escalados/);
  assert.match(res, /¿Qué módulos tardan más\?/);
  assert.match(card, /<th rowspan="2" class="mt-sc-title">Proyectos Jira<\/th>/);
  assert.match(card, /data-f="vp:1"><th class="mt-r" title="SGA">SGA<\/th>/);
  assert.match(card, /Todo lo escalado a Jira/);
  assert.match(card, /Activas/);
  assert.doesNotMatch(card, /Media resol\./);   // lo activo no tiene tiempo de resolución
  assert.doesNotMatch(card, /\(sin clave Jira\)/);
  // el desglose de los tiempos por proyecto, como arriba: THesc, Tesc, Tesc-r, antigüedad e IDMTTR
  assert.match(card, />Tiempos de escalado</);
  assert.match(card, /data-sort="rs-vp:the"[^>]*>THesc<\/th><th[^>]*data-sort="rs-vp:tes"[^>]*>Tesc<\/th><th[^>]*data-sort="rs-vp:tsr"[^>]*>Tesc-r<\/th><th[^>]*data-sort="rs-vp:age"[^>]*>Antigüedad<\/th><th[^>]*data-sort="rs-vp:idm"[^>]*>IDMTTR<\/th>/);
  assert.doesNotMatch(card, /undefined|NaN/);
});

test('Escalados, en Histórico (de partida): lo escalado y resuelto del periodo, con su tiempo total; se cambia a Activas', () => {
  const d = data();
  d.cols.fl = d.cols.fl.map((x) => x | 131072);   // todas escaladas: de Indra, la 0 y la 3 resueltas y la 2 abierta
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const kpiN = (h) => Number(h.match(/Incidencias escaladas<\/div><div class="mt-kpi-v">(\d+)/)[1]);
  const past = tabs.render('escalados', m.rows());
  assert.match(past, /data-esc-mode="past" aria-pressed="true"/);
  assert.match(past, /data-esc-mode="now" aria-pressed="false"/);
  assert.equal(kpiN(past), m.rows().filter((i) => !m.OPEN[i]).length);
  assert.ok(ui.escSheet.list.every((i) => !m.OPEN[i]));
  assert.match(past, /Tiempo total medio/);
  assert.doesNotMatch(past, /Antigüedad media|Tesc-r/);
  assert.match(past, />MTTR</);   // los proyectos Jira, con lo que tardan
  const pastCard = past.slice(past.indexOf('<table class="mt-sc">'), past.indexOf('</table>', past.indexOf('<table class="mt-sc">')));
  assert.match(pastCard, />Tiempos de escalado</);
  for (const c of ['the', 'tes', 'idm']) assert.match(pastCard, new RegExp(`data-sort="rs-vp:${c}"`), c);
  assert.doesNotMatch(pastCard, /rs-vp:(tsr|age)"/);   // en Histórico, sin Tesc-r ni antigüedad: ya está la media de resolución
  assert.doesNotMatch(pastCard, /undefined|NaN/);
  assert.equal(kpiN(tabs.render('escalados', [])), 0);   // depende del periodo
  assert.doesNotMatch(past, /data-only="sit:"/);
  m.toggle('sit', 3); m.refilter();   // filtrando por la situación de ahora: lo resuelto no está en ninguna; se avisa
  assert.match(tabs.render('escalados', m.rows()), /Histórico sale vacío\. <button class="mt-jc-clear" data-only="sit:">/);
  m.toggle('sit', 3); m.refilter();
  ui.escNow = true;
  const now = tabs.render('escalados', m.rows());
  assert.match(now, /data-esc-mode="now" aria-pressed="true"/);
  assert.equal(kpiN(now), 1);
  assert.match(now, /Antigüedad media/);
  assert.doesNotMatch(now, /undefined|NaN/);
});

test('Sin Jira: un KPI junto a los tiempos que, al pincharlo, filtra la pestaña por ellas; en Activas y en Histórico', () => {
  const d = data();
  d.dict.reason = ['', 'THIRD_PARTY_VENDOR_ACTION_REQD'];
  d.dict.status = ['', 'CLOSED', 'ASSIGNED', 'PENDING'];
  d.cols.st[2] = 3; d.cols.rs[2] = 1;   // la 2 (de Indra, abierta), en Pendiente de un tercero y sin Jira
  d.cols.fl = d.cols.fl.map((x) => x | 131072);   // todas escaladas; la 0 (resuelta) tiene SGA-1
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const kpiOf = (h, l) => h.match(new RegExp(`<div class="mt-kpi ([^"]*)"([^>]*)><div class="mt-kpi-l">${l}</div><div class="mt-kpi-v">([^<]*)<`));
  let h = tabs.render('escalados', m.rows());
  assert.doesNotMatch(h, /<h3>Sin Jira<\/h3>/);   // ya no es un cuadro
  const k = kpiOf(h, 'Sin Jira');
  assert.equal(k[3], '1');
  assert.match(k[1], /mt-clk/);
  assert.match(k[2], /data-esc-nojira[^>]*aria-pressed="false"/);
  assert.ok(h.indexOf('>Sin Jira<') < h.indexOf('>THesc medio<'));   // con los tiempos
  ui.escNoJira = true;
  h = tabs.render('escalados', m.rows());
  assert.match(kpiOf(h, 'Sin Jira')[1], /mt-on/);
  assert.match(h, /Pestaña filtrada por las Sin Jira/);
  assert.deepEqual(ui.escSheet.list, [2]);
  assert.equal(kpiOf(h, 'Incidencias escaladas')[3], '1');
  assert.doesNotMatch(h, /undefined|NaN/);
  ui.escNow = false;
  h = tabs.render('escalados', m.rows());   // en Histórico: lo escalado y resuelto sin Jira (la 3; la 0 tiene SGA-1)
  assert.equal(kpiOf(h, 'Sin Jira')[3], '1');
  assert.deepEqual(ui.escSheet.list, [3]);
  ui.escNoJira = false;
  tabs.render('escalados', m.rows());
  assert.deepEqual(ui.escSheet.list, [0, 3]);
});

test('En qué se va el tiempo: Actual (lo abierto, hasta hoy) o Histórico (lo resuelto del periodo, de partida)', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  let html = times(tabs.render('tiempos', m.rows()));
  assert.match(html, /data-times-mode="past" aria-pressed="true"/);
  assert.match(html, /data-times-mode="now" aria-pressed="false"/);
  assert.match(html, /2 resueltas/);   // Indra, sin escalar: la crítica y la baja
  ui.timesNow = true;
  html = times(tabs.render('tiempos', m.rows()));
  assert.match(html, /data-times-mode="now" aria-pressed="true"/);
  // Indra: abierta, solo la media (sin tocar, en cola desde hace 200 min): toda su barra, en cola
  assert.match(html, /1 abiertas/);
  assert.match(html, /<b>3,3 h<\/b>/);
  assert.match(html, /En cola: 3,3 h \(100 %\)/);
  assert.match(html, /De media por incidencia abierta/);
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.equal(times(tabs.render('tiempos', [])), html);   // sea cual sea el periodo
});

test('Análisis tiempos, por módulo: de más a menos tiempo total, con su parte, su media y en qué se le va; sigue Actual o Histórico', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const card = (h) => { const a = h.indexOf('<h3>Por módulo</h3>'); return h.slice(a, h.indexOf('</section>', a)); };
  const rows = (h) => [...card(h).matchAll(/<tr class="mt-clk [^"]*" data-f="mo:(\d+)"><th class="mt-r" title="([^"]*)">[^<]*<\/th>\s*<td class="mt-num">(\d+)<\/td><td class="mt-num"><b>([^<]*)<\/b><\/td><td class="mt-num">([^<]*)<\/td>/g)].map((x) => [x[2], +x[3], x[4], x[5]]);
  // Histórico, Indra: resueltas la crítica (EWMS, 60 min) y la baja (PACKING, 100 min): PACKING, la primera
  let html = tabs.render('tiempos', m.rows());
  assert.ok(html.indexOf('<h3>En qué se va el tiempo</h3>') < html.indexOf('<h3>Por módulo</h3>'));
  assert.deepEqual(rows(html), [['PACKING', 1, '1,7 h', '62,5 %'], ['EWMS', 1, '1 h', '37,5 %']]);
  assert.match(card(html), /<tr class="mt-tot"><th class="mt-r">Total<\/th><td class="mt-num">2<\/td><td class="mt-num"><b>2,7 h<\/b><\/td><td class="mt-num">100 %<\/td>/);
  for (const h of ['En cola', 'En curso', 'Esperando al centro', 'Esperando a terceros', 'Otras esperas']) assert.match(card(html), new RegExp(`</i>${h}</th>`), h);
  // Actual: lo abierto ahora, la media (EWMS, 200 min en cola)
  ui.timesNow = true;
  html = tabs.render('tiempos', m.rows());
  assert.deepEqual(rows(html), [['EWMS', 1, '3,3 h', '100,0 %']]);
  assert.match(card(html), /<th class="mt-num">Abiertas<\/th>/);
  assert.doesNotMatch(html, /undefined|NaN/);
  // sin nada, lo dice
  ui.timesNow = false;
  assert.match(tabs.render('tiempos', []), /Nada resuelto con estos filtros/);
});

test('Análisis tiempos, problemas comunes: de más a menos incidencias, con su tiempo y sus módulos; sin clasificar, al final; clic, filtrar', () => {
  const d = data();
  d.problems = ['Sin clasificar', 'Etiqueta de transporte', 'Impresoras e impresión'];
  d.cols.pc = [1, 2, 0, 1, 2];   // Indra: la crítica (EWMS) y la baja (PACKING), resueltas, con etiqueta de transporte; la media, abierta, sin clasificar
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const card = (h) => { const a = h.indexOf('<h3>Problemas comunes</h3>'); return h.slice(a, h.indexOf('</section>', a)); };
  const rows = (h) => [...card(h).matchAll(/data-f="pc:(\d+)"><th class="mt-r" title="([^"]*)">[^<]*<\/th>\s*<td class="mt-num"><b>(\d+)<\/b><\/td>/g)].map((x) => [x[2], +x[3]]);
  let html = tabs.render('tiempos', m.rows());
  assert.ok(html.indexOf('<h3>Por módulo</h3>') < html.indexOf('<h3>Problemas comunes</h3>'));
  assert.deepEqual(rows(html), [['Etiqueta de transporte', 2]]);
  assert.match(card(html), /EWMS 1 · PACKING 1|PACKING 1 · EWMS 1/);
  // Actual: lo abierto (la media, sin clasificar): solo esa fila, al final y apagada
  ui.timesNow = true;
  html = tabs.render('tiempos', m.rows());
  assert.deepEqual(rows(html), [['Sin clasificar', 1]]);
  assert.match(card(html), /<tr class="mt-clk mt-mut /);
  // filtrar por un problema: la fila marcada; el filtro, como cualquier otro
  ui.timesNow = false;
  m.toggle('pc', 1); m.refilter();
  html = tabs.render('tiempos', m.rows());
  assert.match(card(html), /<tr class="mt-clk  mt-sel" data-f="pc:1">/);
  assert.equal(m.DIMS.pc.label(1), 'Etiqueta de transporte');
  // sin los problemas en los datos (de antes), lo avisa
  const old = createModel(data()); old.S.sides = [{ company: 0 }, null]; old.refilter();
  const u2 = { exp: {}, sort: {}, showSheet: true };
  assert.match(createTabs(old, createCharts(old, u2), u2).render('tiempos', old.rows()), /Faltan los problemas comunes: reinicia SIA/);
});

test('Análisis tiempos: la sábana, abajo del todo, con las incidencias de las tablas; pinchar un módulo o un problema la filtra', () => {
  const d = data();
  d.problems = ['Sin clasificar', 'Etiqueta de transporte'];
  d.cols.pc = [1, 0, 0, 0, 0];
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  let html = tabs.render('tiempos', m.rows());
  const sheet = html.slice(html.indexOf('<h3>Sábana de incidencias</h3>'));
  assert.ok(html.indexOf('<h3>Problemas comunes</h3>') < html.indexOf('<h3>Sábana de incidencias</h3>'));
  // Histórico, Indra: las resueltas, de la que más tardó (la baja, 100 min) a la que menos (la crítica, 60)
  assert.deepEqual(ui.timesSheet.list, [3, 0]);
  for (const h of ['Problema común', 'Módulo', 'Tiempo de resolución']) assert.match(sheet, new RegExp(`<th[^>]*>${h}</th>`), h);
  assert.match(sheet, /<td>Etiqueta de transporte<\/td>/);
  assert.match(sheet, /data-export/);
  // pinchar un problema (o un módulo): la sábana, solo esas
  m.toggle('pc', 1); m.refilter();
  html = tabs.render('tiempos', m.rows());
  assert.deepEqual(ui.timesSheet.list, [0]);
  assert.match(html, /Filtrada por lo que has pinchado arriba/);
  m.toggle('pc', 1); m.toggle('mo', 2); m.refilter();   // PACKING
  tabs.render('tiempos', m.rows());
  assert.deepEqual(ui.timesSheet.list, [3]);
  // Actual: lo abierto, con su antigüedad y su estado
  m.toggle('mo', 2); m.refilter(); ui.timesNow = true;
  html = tabs.render('tiempos', m.rows());
  assert.deepEqual(ui.timesSheet.list, [2]);
  assert.match(html.slice(html.indexOf('<h3>Sábana de incidencias</h3>')), /<th[^>]*>Antigüedad<\/th>/);
});

test('Escalados: la tabla de lo escalado se agrupa por proyecto Jira (de partida), módulo o centro, con las mismas incidencias y columnas', () => {
  const d = data();
  open(d, [0]);
  d.cols.fl[0] |= 131072;   // la crítica de Indra (abierta, TEC: SGA-1), escalada
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const table = (h) => h.slice(h.indexOf('<div class="mt-esc-by">'), h.indexOf('</table>', h.indexOf('<div class="mt-esc-by">')));
  const picks = (h) => [...table(h).matchAll(/<button class="mt-seg-b ([^"]*)" data-esc-by="(\w+)"[^>]*>([^<]*)</g)].map((x) => [x[2], x[3], x[1].includes('mt-on')]);
  const cols = (h) => [...table(h).matchAll(/data-sort="rs-\w+:(\w+)"/g)].map((x) => x[1]);
  const jira = tabs.render('escalados', m.rows());
  assert.deepEqual(picks(jira), [['vp', 'Proyecto Jira', true], ['mo', 'Módulo', false], ['ce', 'Centro', false]]);
  assert.match(table(jira), /<th rowspan="2" class="mt-sc-title">Proyectos Jira<\/th>/);
  assert.match(table(jira), /Todo lo escalado a Jira/);
  const mod = m.DIMS.mo.label(m.C.mo[0]), ce = m.DIMS.ce.label(m.C.ce[0]);
  for (const [k, title, f, label] of [['mo', 'Módulos', `mo:${m.C.mo[0]}`, mod], ['ce', 'Centros', `ce:${m.C.ce[0]}`, ce]]) {
    ui.escBy = k;
    const h = tabs.render('escalados', m.rows()), t = table(h);
    assert.deepEqual(picks(h).find((x) => x[2])[0], k);
    assert.match(t, new RegExp(`<th rowspan="2" class="mt-sc-title">${title}</th>`));
    assert.ok(t.includes(`data-f="${f}"><th class="mt-r" title="${label}">${label}</th>`), `${k}: ${label}`);
    assert.match(t, /Todo lo escalado</);
    assert.deepEqual(cols(h), cols(jira));   // las mismas columnas
    assert.doesNotMatch(t, /undefined|NaN/);
  }
});

test('Análisis tiempos, el desglose con su selector: por módulo (de partida) o por centro, con las mismas columnas; clic, filtrar', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, showSheet: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const cardOf = (h, t) => { const a = h.indexOf(`<h3>${t}</h3>`); return a < 0 ? '' : h.slice(a, h.indexOf('</section>', a)); };
  const picks = (c) => [...c.matchAll(/<button class="mt-seg-b ([^"]*)" data-times-by="(\w+)"[^>]*>([^<]*)</g)].map((x) => [x[2], x[3], x[1].includes('mt-on')]);
  const rows = (c, dim) => [...c.matchAll(new RegExp(String.raw`<tr class="mt-clk [^"]*" data-f="${dim}:(\d+)"><th class="mt-r" title="([^"]*)">[^<]*</th>\s*<td class="mt-num">(\d+)</td><td class="mt-num"><b>([^<]*)</b>`, 'g'))].map((x) => [x[2], +x[3], x[4]]);
  const heads = (c) => [...c.slice(c.indexOf('<thead>'), c.indexOf('</thead>')).matchAll(/<th[^>]*>(?:<i[^>]*><\/i>)?([^<]*)<\/th>/g)].map((x) => x[1]);
  const mo = cardOf(tabs.render('tiempos', m.rows()), 'Por módulo');
  assert.deepEqual(picks(mo), [['mo', 'Módulo', true], ['ce', 'Centro', false]]);
  ui.timesBy = 'ce';
  let html = tabs.render('tiempos', m.rows()), ce = cardOf(html, 'Por centro');
  assert.equal(cardOf(html, 'Por módulo'), '');
  assert.deepEqual(picks(ce), [['mo', 'Módulo', false], ['ce', 'Centro', true]]);
  // Indra, lo resuelto del periodo, por su centro
  const want = new Map();
  for (const i of m.rows().filter((x) => m.SIDE[x] === 0 && m.C.res[x] >= 0 && !m.OPEN[x])) {
    const l = m.DIMS.ce.label(m.C.ce[i]), w = want.get(l) || [l, 0, 0]; w[1]++; w[2] += m.C.res[i] - m.C.rep[i]; want.set(l, w);
  }
  const exp = [...want.values()].sort((a, b) => b[2] - a[2]).map(([l, n, t]) => [l, n, t]);
  assert.deepEqual(rows(ce, 'ce').map(([l, n]) => [l, n]), exp.map(([l, n]) => [l, n]));
  assert.deepEqual(heads(ce).slice(1), heads(mo).slice(1));   // las mismas columnas
  assert.equal(heads(ce)[0], 'Centro');
  assert.match(ce, /<tr class="mt-tot"><th class="mt-r">Total<\/th><td class="mt-num">2<\/td><td class="mt-num"><b>2,7 h<\/b>/);
  // filtrando un centro: marcado y los demás, apagados pero a la vista
  const k = m.C.ce[0]; m.toggle('ce', k); m.refilter();
  ce = cardOf(tabs.render('tiempos', m.rows()), 'Por centro');
  assert.match(ce, new RegExp(`<tr class="mt-clk mt-sel" data-f="ce:${k}">`));
  assert.equal(rows(ce, 'ce').length, exp.length);
  assert.doesNotMatch(ce, /undefined|NaN/);
});

test('Malos escalados en la pestaña: un renglón por cambio de equipo (original → final), con cuántas, que filtra toda la página', () => {
  const d = data();
  open(d, [0, 3]);
  d.dict.vhops = ['', 'SGA → ITS', 'ITS → SGA'];
  d.cols.vh = [1, 0, 1, 2, 0];
  d.cols.fl = d.cols.fl.map((x, i) => x | ([0, 2, 3].includes(i) ? 131072 | 2097152 | 8388608 : 0));
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, escNow: true }, tabs = createTabs(m, createCharts(m, ui), ui);
  const bad = m.today().filter((i) => m.OPEN[i] && m.C.fl[i] & 2097152);
  const html = tabs.render('escalados', m.rows()), card = html.slice(html.indexOf('>Malos escalados</h3>'));
  const rowsOf = (h) => [...h.slice(h.indexOf('>Malos escalados</h3>')).matchAll(/<tr class="mt-clk ([^"]*)" data-only="([^"]+)"[^>]*><td>([^<]*)<\/td><td class="mt-num">(\d+)<\/td>/g)].map((x) => [x[2], x[3], Number(x[4]), x[1].trim()]);
  const rows = rowsOf(card).map((r) => r.slice(0, 3));
  const n = (k) => bad.filter((i) => m.DIMS.mb.get(i) === k).length;
  const expected = [[1, 'SGA → ITS'], [2, 'ITS → SGA']].filter(([k]) => n(k))
    .map(([k, l]) => [`mb:${k}`, l, n(k)]).sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]));
  assert.deepEqual(rows, expected);
  assert.equal(m.DIMS.vh.label(1), 'SGA → ITS');
  // filtrando por uno, la página entera: solo sus incidencias; en la tabla, ese destacado y los demás siguen (apagados)
  m.toggle('mb', 1); m.refilter();
  assert.ok(m.today().every((i) => m.C.vh[i] === 1));
  const after = rowsOf(tabs.render('escalados', m.rows()));
  assert.deepEqual(after.map((r) => r.slice(0, 3)), expected);
  assert.deepEqual(after.map((r) => [r[0], r[3]]), expected.map(([k]) => [k, k === 'mb:1' ? 'mt-sel' : 'mt-off']));
});
