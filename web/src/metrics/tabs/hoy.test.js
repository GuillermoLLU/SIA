import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides, tab = 'hoy') => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render(tab, m.rows());
};
const cut = (html, from) => { const a = html.indexOf(from); return html.slice(a, html.indexOf('</section>', a)); };
const ring = (html) => cut(html, '>En qué estado está</h3>');

test('filtrando por Pendiente (proveedor), la corona enlaza con Escalados, en Activas y quitando ese filtro', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  assert.doesNotMatch(ring(tabs.render('hoy', m.rows())), /data-go="escalados"/);
  m.toggle('sit', 3); m.refilter();
  assert.match(ring(tabs.render('hoy', m.rows())), /<button class="mt-go" data-go="escalados" data-esc-now data-rm="sit:3" data-tip="[^"]*">Ver en Escalados →<\/button>/);
  m.toggle('sit', 4); m.toggle('sit', 3); m.refilter();
  assert.doesNotMatch(ring(tabs.render('hoy', m.rows())), /data-go="escalados"/);   // otro estado: sin enlace
});

test('arriba del todo, lo abierto ahora en una corona, por estado (Asignada, Pendiente de proveedor y de cliente, En curso)', () => {
  const all = render([{ company: 0 }, null]), html = ring(all);
  assert.ok(all.indexOf('En qué estado está') < all.indexOf('Antigüedad media'), 'la corona, antes que las cifras');
  // Indra: abierta ahora, solo la media, sin tocar (en Asignada); la crítica y la baja, cerradas
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 1);
  assert.match(html, /<text[^>]*class="mt-dn-n">1<\/text><text[^>]*class="mt-dn-l">incidencias<\/text>/);
  // los cuatro estados, aunque estén a cero; lo que espera por otro motivo, solo si lo hay
  assert.deepEqual([...html.matchAll(/<th><i class="mt-dn-sw mt-dn-(\w+)"><\/i>([^<]*)<\/th><td class="mt-num"><b>(\d+)<\/b>/g)].map((x) => [x[2], +x[3]]),
    [['Asignada', 1], ['Pendiente (proveedor)', 0], ['Pendiente (cliente)', 0], ['En curso', 0]]);
  assert.match(html, /<th>Incidencias<\/th><td class="mt-num"><b>1<\/b><small>ahora<\/small>/);
  // un solo tramo, el de Asignada, que filtra a la vez sin tocar y devuelta a la cola
  const arcs = [...html.matchAll(/<circle class="mt-dn-(\w+)[^"]*"[^>]*>/g)].filter((x) => x[1] !== 'track');
  assert.deepEqual(arcs.map((x) => [x[1], /data-f2="([^"]+)"/.exec(x[0])?.[1]]), [['asig', 'sit:1|sit:2']]);
  assert.doesNotMatch(html, /Cerradas|otro motivo/);
  // lo del periodo ya no está en el Resumen: está en el Histórico (historico.test.js)
  assert.doesNotMatch(all, /¿Qué tenemos\?|¿Y en el periodo\?|mt-answers/);
});

test('comparando: una corona por lado, con su nombre, y en la leyenda las cifras de cada uno', () => {
  const html = ring(render([{ company: 0 }, { company: 1 }]));
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 2);
  // con el nombre de su lado, sin su color (el ocre del segundo lado se confundiría con el de fuera de plazo)
  assert.deepEqual([...html.matchAll(/<figcaption>([^<]*)<\/figcaption>/g)].map((x) => x[1]), ['Indra', 'T-Systems']);
  assert.match(html, /<tr class="mt-dn-head"><th><\/th><th class="mt-num">Indra<\/th><th class="mt-num">T-Systems<\/th><\/tr>/);
  assert.match(html, /<th>Incidencias<\/th>(<td class="mt-num"><b>\d+<\/b><small>[^<]*<\/small><\/td>){2}/);
});

test('el backlog ahora, arriba del todo: la corona con en qué punto está a su lado, la antigüedad y la prioridad (la evolución, en el Histórico)', () => {
  const html = render([{ company: 0 }, null]), now = html.slice(html.indexOf('¿Cómo está el backlog ahora?'));
  assert.ok(html.indexOf('¿Cómo está el backlog ahora?') > 0);
  // la corona y, a su lado, en qué punto está, con la antigüedad media al final (en el sitio de «Aparte»); sin pendientes
  // (el total ya está en la corona), ni SLA, ni SISU o SGA ni prioridad (son los selectores de arriba)
  const row = [...now.matchAll(/<section class="mt-card mt-(s\d+)[^"]*">(?:<h3[^>]*>([^<]*)<\/h3>)?/g)].slice(0, 2).map((x) => [x[1], x[2]]);
  assert.deepEqual(row, [['s4', 'En qué estado está'], ['s6', 'En qué situación está y desde cuándo']]);
  const panel = now.slice(now.indexOf('mt-stock mt-st-side'), now.indexOf('Lo pendiente en detalle'));
  assert.deepEqual([...panel.matchAll(/<h4>([^<]*)/g)].map((x) => x[1]), ['¿En qué punto están?', 'A vigilar', 'Antigüedad media']);
  assert.match(panel, /<section class="mt-st mt-st-age"><h4>Antigüedad media<\/h4><div class="mt-st-big"><b>3,3 h<\/b>/);
  assert.doesNotMatch(now, /<h4>Aparte|mt-st-apart|<h3>Antigüedad media|<h3>Prioridad<\/h3>/);
  assert.doesNotMatch(now, /class="mt-kpi|SLA de inicio|dentro del SLA|<h3>SISU o SGA<\/h3>/);
  assert.doesNotMatch(now, />Pendientes<\/h3>/);
  assert.doesNotMatch(now, /Evolución del backlog|data-evo=/);
  // la evolución, en el Histórico, sin comparar: barras apiladas por prioridad (la media, la única abierta: tercer tramo) y la tendencia
  const evo = cut(render([{ company: 0 }, null], 'historico'), '>Evolución del backlog</h3>');
  assert.ok(evo.length);
  assert.doesNotMatch(evo, /<polyline class="mt-line/);
  assert.match(evo, /<rect class="mt-pq2" /);
  assert.match(evo, /<line class="mt-trend" /);
  assert.match(evo, /<span><i class="mt-pq0"><\/i>Crítica<\/span><span><i class="mt-pq1"><\/i>Alta<\/span><span><i class="mt-pq2"><\/i>Media<\/span><span><i class="mt-pq3"><\/i>Baja<\/span>/);
  assert.match(evo, /<i class="mt-trend-key"><\/i>Tendencia \([^)]* al día\)/);
});

test('SISU o SGA y la prioridad, dos selectores en una fila arriba del todo; marcan lo que está filtrado', () => {
  const html = render([{ company: 0 }, null]);
  assert.ok(html.indexOf('<div class="mt-hoy-picks"><div class="mt-seg" role="group" aria-label="SISU o SGA">') >= 0);
  assert.ok(html.indexOf('aria-label="Prioridad"') < html.indexOf('¿Cómo está hoy?'));
  const picks = (h) => [...h.matchAll(/<button class="mt-seg-b ([^"]*)" data-only="([^"]*)"[^>]*>([^<]*)(?:<small>(\d+)<\/small>)?<\/button>/g)].map((x) => [x[3], x[2], x[1].includes('mt-on'), x[4] ?? null]);
  const m0 = createModel(data()), pr = (p) => `pr:${m0.DI.prio.indexOf(p)}`;
  // de cada prioridad, lo abierto ahora (Indra: solo la media)
  assert.deepEqual(picks(html), [['Todo', 'ss:', true, null], ['SISU', 'ss:0', false, null], ['SGA', 'ss:1', false, null],
    ['Todas', 'pr:', true, null], ['Crítica', pr('CRITICAL'), false, '0'], ['Alta', pr('HIGH'), false, '0'], ['Media', pr('MEDIUM'), false, '1'], ['Baja', pr('LOW'), false, '0']]);
  // con una prioridad elegida: marcada, y las cifras de las demás, como estaban
  const m1 = createModel(data()); m1.S.sides = [{ company: 0 }, null]; m1.S.f.pr = new Set([m1.DI.prio.indexOf('HIGH')]); m1.refilter();
  const ui1 = { exp: {}, sort: {} }, p1 = picks(createTabs(m1, createCharts(m1, ui1), ui1).render('hoy', m1.rows())).slice(3);
  assert.deepEqual(p1.map((x) => [x[0], x[2], x[3]]), [['Todas', false, null], ['Crítica', false, '0'], ['Alta', true, '0'], ['Media', false, '1'], ['Baja', false, '0']]);
  // con SISU elegido (el filtro que pone el selector): marcado, y solo lo de SISU (de Indra, la de PACKING)
  const m = createModel(data()); m.S.f.ss = new Set([0]); m.refilter();
  const ui = { exp: {}, sort: {} }, out = createTabs(m, createCharts(m, ui), ui).render('hoy', m.rows());
  assert.match(out, /<button class="mt-seg-b mt-on" data-only="ss:0" aria-pressed="true"[^>]*>SISU<\/button>/);
  assert.deepEqual(m.rows().map((i) => m.DIMS.mo.label(m.C.mo[i])), ['PACKING']);
});

test('el backlog ahora, comparando: las cifras de cada lado, una tabla de dos lados con los repartos y cómo está lo pendiente (lo de la antigua pestaña Backlog)', () => {
  const html = render([{ company: 0 }, { company: 1 }]), now = html.slice(html.indexOf('¿Cómo está el backlog ahora?'));
  assert.match(now, /<h3[^>]*>Cómo se reparte<\/h3>/);
  assert.ok(now.indexOf('>Cómo se reparte</h3>') < now.indexOf('>Cómo está lo pendiente</h3>'));
  assert.doesNotMatch(now, /Qué tiene pendiente cada uno/);   // es el «Cómo se reparte»
  // de cifras, la antigüedad y las de la antigua pestaña Backlog, con la diferencia (sin pendientes ni SLA)
  assert.deepEqual([...now.matchAll(/<div class="mt-kpi mt-kpi-co"><div class="mt-kpi-l"[^>]*>([^<]*)</g)].map((x) => x[1]),
    ['Antigüedad media', 'Días de entrada acumulados', '% sin tocar', '% fuera de plazo', '% con más de 15 días', '% escaladas']);
  assert.doesNotMatch(now, /SLA de inicio|>Pendientes<\/div>/);
  assert.equal((cut(render([{ company: 0 }, { company: 1 }], 'historico'), '>Evolución del backlog</h3>').match(/<polyline class="mt-line mt-s\d"/g) || []).length, 2);
});

test('entrantes vs atendidas, en Entrantes (ya no en el Histórico), con su selector: atendidas entrantes (de partida) o totales', () => {
  const run = (evo) => {
    const d = data();
    d.cols.eV[0] = [5];   // la crítica de Indra, que entró el día 0, pasa a proveedor el 5: atendida del backlog
    const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
    const ui = { exp: {}, sort: {}, evo }, tabs = createTabs(m, createCharts(m, ui), ui), html = tabs.render('entrada', m.rows());
    const a = html.indexOf('data-evo="flow"');
    return { sec: html.slice(html.lastIndexOf('<section', a), html.indexOf('</section>', a)), hist: tabs.render('historico', m.rows()), html };
  };
  const first = run(undefined), back = first.sec, flow = run('flow').sec, all = run('flowAll').sec;
  // de partida (y con el backlog elegido en otra pestaña), atendidas entrantes; el selector, sin el backlog
  assert.deepEqual([...back.matchAll(/<button class="mt-seg-b ([^"]*)" data-evo="(\w+)"[^>]*>([^<]*)<\/button>/g)].map((x) => [x[2], x[3], x[1] === 'mt-on']),
    [['flow', 'Entrantes vs atendidas entrantes', true], ['flowAll', 'Entrantes vs atendidas totales', false]]);
  assert.match(run('backlog').sec, /data-evo="flow" aria-pressed="true"/);
  // debajo de las cifras de arriba, antes de la tabla mes a mes
  assert.ok(first.html.indexOf('% Bajas en SLA') < first.html.indexOf('data-evo="flow"'));
  assert.ok(first.html.indexOf('data-evo="flow"') < first.html.indexOf('lo que entra, lo que se cierra y lo que queda'));
  // el Histórico, solo con el backlog y sin selector de vista
  assert.match(first.hist, /<h3[^>]*>Evolución del backlog<\/h3>/);
  assert.doesNotMatch(first.hist, /data-evo=|Entrantes frente a atendidas/);
  // entrantes vs atendidas entrantes: Indra, entran 3 (la crítica, la baja y la media) y se resuelven el mismo día 2
  assert.match(flow, /<h3[^>]*>Entrantes frente a atendidas entrantes<\/h3>/);
  assert.match(flow, /En el periodo: 3 entrantes · 2 atendidas el día que entraron \(67 %\)<\/span>/);
  assert.match(flow, /<rect class="mt-dn-asig" /);
  assert.match(flow, /<rect class="mt-fl-res" /);
  assert.doesNotMatch(flow, /mt-trend|mt-fl-bkl/);
  // vs atendidas totales: además, en violeta, lo atendido del backlog
  assert.match(all, /<h3[^>]*>Entrantes frente a atendidas totales<\/h3>/);
  assert.match(all, /data-evo="flowAll" aria-pressed="true"/);
  assert.match(all, /2 atendidas el día que entraron \(67 %\) · 1 del backlog<\/span>/);
  assert.match(all, /<rect class="mt-fl-bkl" /);
  assert.match(all, /<i class="mt-dn-sw mt-fl-bkl"><\/i>Atendidas del backlog/);
});

test('entrantes vs atendidas: cada serie de lo atendido se enciende y se apaga en la leyenda', () => {
  const run = (flowOff) => {
    const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
    const ui = { exp: {}, sort: {}, evo: 'flow', flowOff }, html = createTabs(m, createCharts(m, ui), ui).render('entrada', m.rows());
    const a = html.indexOf('data-evo="flow"');
    return html.slice(html.lastIndexOf('<section', a), html.indexOf('</section>', a));
  };
  const on = run(undefined), off = run({ res: true });
  assert.deepEqual([...on.matchAll(/<button class="mt-fl-tg ([^"]*)" data-flk="(\w+)" aria-pressed="(\w+)"/g)].map((x) => [x[2], x[3]]),
    [['res', 'true'], ['ven', 'true'], ['cli', 'true']]);
  assert.match(on, /<rect class="mt-fl-res" /);
  // sin resueltas: fuera de la barra y de las cifras; la nota de cada día lo sigue diciendo todo
  assert.match(off, /<button class="mt-fl-tg mt-off" data-flk="res" aria-pressed="false"/);
  assert.doesNotMatch(off, /<rect class="mt-fl-res" /);
  assert.match(off, /En el periodo, con lo marcado: 3 entrantes · 0 atendidas el día que entraron \(0 %\)/);
  assert.match(off, /Atendidas de las que entraron ese día: 1 \(1 resueltas/);
});

test('vs atendidas totales: lo del backlog sigue a lo que se mira (sin resueltas, no cuentan las del backlog resueltas)', () => {
  const run = (flowOff) => {
    const d = data();
    d.cols.eV[0] = [5]; d.cols.eR[0] = [0, 6];   // la crítica de Indra: a proveedor el día 5 y otra vez resuelta el 6
    const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
    const ui = { exp: {}, sort: {}, evo: 'flowAll', flowOff }, html = createTabs(m, createCharts(m, ui), ui).render('entrada', m.rows());
    const a = html.indexOf('data-evo="flow"');
    return html.slice(html.lastIndexOf('<section', a), html.indexOf('</section>', a));
  };
  assert.match(run(undefined), / · 2 del backlog<\/span>/);
  assert.match(run({ res: true }), / · 1 del backlog<\/span>/);
  assert.match(run({ res: true, ven: true }), / · 0 del backlog<\/span>/);
  assert.match(run({ bkl: true }), / · 0 del backlog<\/span>/);
});

test('quién tiene qué: abajo del Resumen, justo antes de la sábana', () => {
  const html = render([{ company: 0 }, null]), at = html.indexOf('>Quién tiene qué</h3>');
  assert.ok(at > 0 && at < html.indexOf('>Sábana de incidencias</h3>'));
  // Indra: abierta ahora, la media de ANA; con su total y el clic para verla solo a ella
  const who = html.slice(at);
  assert.match(who, /<tr class="mt-clk " data-f="as:1"><td>ANA<\/td><td class="mt-num">1<\/td>/);
  assert.match(who, /<tr class="mt-grp"><td>Total<\/td><td class="mt-num">1<\/td>/);
});

test('la sábana: abajo del todo, lo abierto ahora con los filtros, con su enlace a Remedy y el botón de exportar', () => {
  const html = render([{ company: 0 }, null]), at = html.lastIndexOf('<h3');
  // la última tarjeta; su explicación, en el tooltip del título
  assert.match(html.slice(at), /^<h3 data-tip="Lo abierto ahora, con los filtros[^"]*">Sábana de incidencias<\/h3>/);
  const sheet = html.slice(at);
  assert.match(sheet, /<span class="mt-mut">1 incidencias<\/span><button class="mt-btn" data-export >Exportar a CSV<\/button>/);
  assert.match(sheet, /<td><a href="https:\/\/itx\.onbmc\.com[^"]*INC000000000003%22" target="_blank" rel="noopener">INC000000000003<\/a><\/td>/);
  assert.match(sheet, /<td>Media<\/td><td>Asignada<\/td><td>ANA<\/td>/);
});

test('Entrantes: el % de lo que entra que se resuelve el mismo día en que entra', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('entrada', m.rows());
  // Indra: entran 3 (la crítica, la media y la baja); la crítica y la baja, resueltas el día que entraron (como en la gráfica)
  assert.match(html, /<div class="mt-kpi-l">% resuelto el día que entra<\/div><div class="mt-kpi-v">67 %<\/div><div class="mt-kpi-d">de lo que entró, resuelto el mismo día<\/div>/);
  assert.ok(html.indexOf('Resolvemos al día') < html.indexOf('% resuelto el día que entra'));
  assert.match(html, /En el periodo: 3 entrantes · 2 atendidas el día que entraron \(67 %\)/);   // cuadra con la gráfica
});

test('Entrantes: el % de lo que entra que se gestiona (resuelve o escala) el mismo día en que entra', () => {
  const d = data();
  d.cols.eV[2] = [Math.floor(d.cols.rep[2] / 1440)];   // la media de Indra, abierta: escalada a proveedor el día que entró
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('entrada', m.rows());
  // de las 3 de Indra: 2 resueltas el mismo día y 1 escalada el mismo día
  assert.match(html, /<div class="mt-kpi-l">% resuelto el día que entra<\/div><div class="mt-kpi-v">67 %<\/div>/);
  assert.match(html, /<div class="mt-kpi-l">% gestionado el día que entra<\/div><div class="mt-kpi-v">100 %<\/div><div class="mt-kpi-d">de lo que entró, resuelto o escalado el mismo día<\/div>/);
  assert.ok(html.indexOf('% resuelto el día que entra') < html.indexOf('% gestionado el día que entra'));
});

test('Entrantes: de cada prioridad, el % empezado dentro de su SLA de inicio (no el reparto de lo recibido)', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('entrada', m.rows());
  const st = (p) => m.stats(m.rows().filter((i) => m.C.pr[i] === p)).sla;
  const kpi = (l) => html.match(new RegExp(`<div class="mt-kpi-l">${l}</div><div class="mt-kpi-v">([^<]*)</div><div class="mt-kpi-d">([^<]*)</div>`))?.slice(1);
  // Indra: la crítica, en curso a los 10 min (SLA de 15): en SLA; la media, abierta y sin empezar, ya fuera de plazo
  assert.deepEqual(kpi('% Críticas en SLA'), ['100 %', `empezadas en ${m.slaLabel(1).split(' · ')[1]}`]);
  assert.equal(st(1), 1);
  assert.equal(kpi('% Medias en SLA')[0], '0 %');
  assert.equal(kpi('% Bajas en SLA')[0], '—');   // la baja se cerró sin pasar por En curso: no cuenta
  assert.doesNotMatch(html, /<div class="mt-kpi-l">% Críticas<\/div>/);   // el reparto, ya no
});


test('Foto de hoy, de un lado: debajo de los repartos, lo de la antigua pestaña Backlog (sin el recuadro de Pendientes, que es la corona), de lo abierto ahora', () => {
  const html = render([{ company: 0 }, null]), at = (s) => html.indexOf(s);
  const titles = ['En qué situación está y desde cuándo', 'Por prioridad y tarjeta', 'Por módulo: en qué situación', 'Por módulo: desde cuándo', 'Escaladas: a quién y desde cuándo', 'Por centro: desde cuándo'];
  for (const x of titles) assert.match(html, new RegExp(`<h3 data-tip="[^"]+">${x}</h3>`), x);   // la explicación, en el tooltip
  assert.doesNotMatch(html, /class="mt-sub"/);   // en Foto de hoy, ninguna explicación a la vista
  // a la derecha de la corona, el panel; sin las tarjetas de antigüedad, centro y módulo (están en las tablas)
  assert.ok(at('>En qué estado está</h3>') < at('mt-stock mt-st-side') && at('mt-stock mt-st-side') < at('Lo pendiente en detalle'));
  for (const x of ['Antigüedad', 'Centro', 'Módulo', 'Prioridad']) assert.ok(!html.includes(`<h3>${x}</h3>`), x);
  assert.ok(at('<h2 class="mt-sec">Lo pendiente en detalle') < at('>En qué situación está y desde cuándo</h3>'));
  assert.ok(at('>En qué situación está y desde cuándo</h3>') < at('>Quién tiene qué</h3>'));
  assert.match(html, /mt-stock mt-st-side mt-st-nototal/);
  assert.doesNotMatch(html, /mt-st-total|recibidas en el periodo<\/p>/);
  assert.match(html, /¿En qué punto están\?/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('la pestaña Backlog ya no existe: lo suyo está en Foto de hoy', async () => {
  const { TABS, QUESTIONS } = await import('./common.js');
  assert.ok(!TABS.some(([k]) => k === 'backlog')); assert.equal(QUESTIONS.backlog, undefined);
});

test('Foto de hoy, «Escaladas: a quién y desde cuándo»: por el proyecto Jira, no por el prefijo del ticket', () => {
  const d = data(); d.cols.vt[2] = 1; d.cols.vp[2] = 1;   // la abierta de Indra, escalada con «TEC: SGA-1»: prefijo TEC, proyecto SGA
  const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('hoy', m.rows());
  const card = html.slice(html.indexOf('>Escaladas: a quién y desde cuándo</h3>'), html.indexOf('</section>', html.indexOf('>Escaladas: a quién y desde cuándo</h3>')));
  assert.match(card, /Proyecto Jira · antigüedad →/);
  assert.match(card, /<th class="mt-r"[^>]*data-f="vp:1">SGA<\/th>/);
  assert.doesNotMatch(card, /TEC|vt:/);
});

test('Foto de hoy, la sábana: de la más reciente a la más antigua, el título del guion en adelante y el estado sin su motivo', async () => {
  const { createModel } = await import('../model.js');
  const { createCharts } = await import('../charts.js');
  const { createTabs } = await import('../tabs.js');
  const { data } = await import('../fixture.js');
  const d = data(); d.cols.su = d.cols.su.map((x, i) => `TDA ${i} - Título ${i}`);
  const m = createModel(d); m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('hoy', m.rows());
  const open = m.today().filter((i) => m.OPEN[i]);
  assert.deepEqual(ui.hoySheet.list, [...open].sort((a, b) => m.C.rep[b] - m.C.rep[a]));
  const sheet = html.slice(html.lastIndexOf('<h3', html.indexOf('>Sábana de incidencias</h3>')));
  assert.match(sheet, /de la más reciente a la más antigua/);
  assert.match(sheet, /<td class="mt-subj" data-tip="Título \d+">Título \d+<\/td>/);
  assert.doesNotMatch(sheet, /TDA \d+ -/);
  const head = [...sheet.matchAll(/<th[^>]*>([^<]*)</g)].map((x) => x[1]);
  const states = [...sheet.matchAll(/<tr>(.*?)<\/tr>/gs)].map((r) => [...r[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)][head.indexOf('Estado')]?.[1]).filter(Boolean);
  for (const s of states) assert.doesNotMatch(s, / · /, s);
});

test('Foto de hoy en un informe (Backlog actual): sin la sábana de incidencias', async () => {
  const { createModel } = await import('../model.js');
  const { createCharts } = await import('../charts.js');
  const { createTabs } = await import('../tabs.js');
  const { data } = await import('../fixture.js');
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  assert.doesNotMatch(tabs.render('hoy', m.rows(), { inReport: true }), /Sábana de incidencias/);
  assert.match(tabs.render('hoy', m.rows()), /Sábana de incidencias/);
});
