import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides, tab = 'resumen') => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render(tab, m.rows());
};
const cut = (html, from) => { const a = html.indexOf(from); return html.slice(a, html.indexOf('</section>', a)); };
const ring = (html) => cut(html, '<h3>En qué estado está</h3>');

test('arriba del todo, lo abierto ahora en una corona, por estado (Asignada, Pendiente de proveedor y de cliente, En curso)', () => {
  const all = render([{ company: 0 }, null]), html = ring(all);
  assert.ok(all.indexOf('En qué estado está') < all.indexOf('Antigüedad media'), 'la corona, antes que las cifras');
  // Indra: abierta ahora, solo la media, sin tocar (en Asignada); la crítica y la baja, cerradas
  assert.equal((html.match(/<svg class="mt-donut"/g) || []).length, 1);
  assert.match(html, /<text[^>]*class="mt-dn-n">1<\/text><text[^>]*class="mt-dn-l">pendientes<\/text>/);
  // los cuatro estados, aunque estén a cero; lo que espera por otro motivo, solo si lo hay
  assert.deepEqual([...html.matchAll(/<th><i class="mt-dn-sw mt-dn-(\w+)"><\/i>([^<]*)<\/th><td class="mt-num"><b>(\d+)<\/b>/g)].map((x) => [x[2], +x[3]]),
    [['Asignada', 1], ['Pendiente (proveedor)', 0], ['Pendiente (cliente)', 0], ['En curso', 0]]);
  assert.match(html, /<th>Pendientes<\/th><td class="mt-num"><b>1<\/b><small>ahora<\/small>/);
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
  assert.match(html, /<th>Pendientes<\/th>(<td class="mt-num"><b>\d+<\/b><small>[^<]*<\/small><\/td>){2}/);
});

test('el backlog ahora, arriba del todo: la corona, la antigüedad y los repartos (la evolución, en el Histórico)', () => {
  const html = render([{ company: 0 }, null]), now = html.slice(html.indexOf('¿Cómo está el backlog ahora?'));
  assert.ok(html.indexOf('¿Cómo está el backlog ahora?') > 0);
  // en la fila de la corona, la antigüedad en una baldosa cuadrada y la prioridad; sin pendientes (el total ya está en
  // la corona), ni SLA, ni SISU o SGA (es el selector de arriba)
  const row = [...now.matchAll(/<section class="mt-card mt-(s\d+)[^"]*">(?:<h3[^>]*>([^<]*)<\/h3>)?/g)].slice(0, 3).map((x) => [x[1], x[2]]);
  assert.deepEqual(row, [['s4', 'En qué estado está'], ['s2', 'Antigüedad media'], ['s6', 'Prioridad']]);
  assert.doesNotMatch(now, /class="mt-kpi|SLA de inicio|dentro del SLA|<h3>SISU o SGA<\/h3>/);
  assert.doesNotMatch(now, />Pendientes<\/h3>/);
  for (const h of ['Antigüedad', 'Prioridad', 'Centro', 'Módulo']) assert.match(now, new RegExp(`<h3>${h}</h3>`));
  assert.doesNotMatch(now, /Evolución del backlog|data-evo=/);
  // la evolución, en el Histórico, sin comparar: barras apiladas por prioridad (la media, la única abierta: tercer tramo) y la tendencia
  const evo = cut(render([{ company: 0 }, null], 'historico'), '<h3>Evolución del backlog</h3>');
  assert.ok(evo.length);
  assert.doesNotMatch(evo, /<polyline class="mt-line/);
  assert.match(evo, /<rect class="mt-pq2" /);
  assert.match(evo, /<line class="mt-trend" /);
  assert.match(evo, /<span><i class="mt-pq0"><\/i>Crítica<\/span><span><i class="mt-pq1"><\/i>Alta<\/span><span><i class="mt-pq2"><\/i>Media<\/span><span><i class="mt-pq3"><\/i>Baja<\/span>/);
  assert.match(evo, /<i class="mt-trend-key"><\/i>Tendencia \([^)]* al día\)/);
});

test('SISU o SGA, un selector arriba del todo: Todo, SISU o SGA; marca lo que está filtrado', () => {
  const html = render([{ company: 0 }, null]);
  assert.ok(html.indexOf('class="mt-seg"') < html.indexOf('¿Cómo vamos?'));
  assert.deepEqual([...html.matchAll(/<button class="mt-seg-b ([^"]*)" data-only="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map((x) => [x[3], x[2], x[1].includes('mt-on')]),
    [['Todo', 'ss:', true], ['SISU', 'ss:0', false], ['SGA', 'ss:1', false]]);
  // con SISU elegido (el filtro que pone el selector): marcado, y solo lo de SISU (de Indra, la de PACKING)
  const m = createModel(data()); m.S.f.ss = new Set([0]); m.refilter();
  const ui = { exp: {}, sort: {} }, out = createTabs(m, createCharts(m, ui), ui).render('resumen', m.rows());
  assert.match(out, /<button class="mt-seg-b mt-on" data-only="ss:0" aria-pressed="true">SISU<\/button>/);
  assert.deepEqual(m.rows().map((i) => m.DIMS.mo.label(m.C.mo[i])), ['PACKING']);
});

test('el backlog ahora, comparando: las cifras de cada lado y una tabla de dos lados con los repartos', () => {
  const html = render([{ company: 0 }, { company: 1 }]), now = html.slice(html.indexOf('¿Cómo está el backlog ahora?'));
  assert.match(now, /<h3>Cómo se reparte<\/h3>/);
  // de cifras, solo la antigüedad con la diferencia (sin pendientes ni SLA)
  assert.equal((now.match(/<div class="mt-kpi mt-kpi-co">/g) || []).length, 1);
  assert.match(now, /<div class="mt-kpi-l"[^>]*>Antigüedad media<\/div>/);
  assert.doesNotMatch(now, /SLA de inicio|>Pendientes<\/div>/);
  assert.equal((cut(render([{ company: 0 }, { company: 1 }], 'historico'), '<h3>Evolución del backlog</h3>').match(/<polyline class="mt-line mt-s\d"/g) || []).length, 2);
});

test('la evolución, en el Histórico, con su selector: el backlog (de partida), entrantes vs atendidas entrantes o vs atendidas totales', () => {
  const run = (evo) => {
    const d = data();
    d.cols.eV[0] = [5];   // la crítica de Indra, que entró el día 0, pasa a proveedor el 5: atendida del backlog
    const m = createModel(d); m.S.sides = [{ company: 0 }, null]; m.refilter();
    const ui = { exp: {}, sort: {}, evo }, html = createTabs(m, createCharts(m, ui), ui).render('historico', m.rows());
    const a = html.indexOf('data-evo="backlog"');
    return html.slice(html.lastIndexOf('<section', a), html.indexOf('</section>', a));
  };
  const back = run(undefined), flow = run('flow'), all = run('flowAll');
  assert.deepEqual([...back.matchAll(/<button class="mt-seg-b ([^"]*)" data-evo="(\w+)"[^>]*>([^<]*)<\/button>/g)].map((x) => [x[2], x[3], x[1] === 'mt-on']),
    [['backlog', 'Backlog', true], ['flow', 'Entrantes vs atendidas entrantes', false], ['flowAll', 'Entrantes vs atendidas totales', false]]);
  assert.match(back, /<h3>Evolución del backlog<\/h3>/);
  // entrantes vs atendidas entrantes: Indra, entran 3 (la crítica, la baja y la media) y se resuelven el mismo día 2
  assert.match(flow, /<h3>Entrantes frente a atendidas entrantes<\/h3>/);
  assert.match(flow, /En el periodo: 3 entrantes · 2 atendidas el día que entraron \(67 %\)<\/span>/);
  assert.match(flow, /<rect class="mt-dn-asig" /);
  assert.match(flow, /<rect class="mt-fl-res" /);
  assert.doesNotMatch(flow, /mt-trend|mt-fl-bkl/);
  // vs atendidas totales: además, en violeta, lo atendido del backlog
  assert.match(all, /<h3>Entrantes frente a atendidas totales<\/h3>/);
  assert.match(all, /data-evo="flowAll" aria-pressed="true"/);
  assert.match(all, /2 atendidas el día que entraron \(67 %\) · 1 del backlog<\/span>/);
  assert.match(all, /<rect class="mt-fl-bkl" /);
  assert.match(all, /<i class="mt-dn-sw mt-fl-bkl"><\/i>Atendidas del backlog/);
});

test('entrantes vs atendidas: cada serie de lo atendido se enciende y se apaga en la leyenda', () => {
  const run = (flowOff) => {
    const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
    const ui = { exp: {}, sort: {}, evo: 'flow', flowOff }, html = createTabs(m, createCharts(m, ui), ui).render('historico', m.rows());
    const a = html.indexOf('data-evo="backlog"');
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
    const ui = { exp: {}, sort: {}, evo: 'flowAll', flowOff }, html = createTabs(m, createCharts(m, ui), ui).render('historico', m.rows());
    const a = html.indexOf('data-evo="backlog"');
    return html.slice(html.lastIndexOf('<section', a), html.indexOf('</section>', a));
  };
  assert.match(run(undefined), / · 2 del backlog<\/span>/);
  assert.match(run({ res: true }), / · 1 del backlog<\/span>/);
  assert.match(run({ res: true, ven: true }), / · 0 del backlog<\/span>/);
  assert.match(run({ bkl: true }), / · 0 del backlog<\/span>/);
});

test('quién tiene qué: abajo del Resumen, justo antes de la sábana', () => {
  const html = render([{ company: 0 }, null]), at = html.indexOf('<h3>Quién tiene qué</h3>');
  assert.ok(at > 0 && at < html.indexOf('<h3>Sábana de incidencias</h3>'));
  // Indra: abierta ahora, la media de ANA; con su total y el clic para verla solo a ella
  const who = html.slice(at);
  assert.match(who, /<tr class="mt-clk " data-f="as:1"><td>ANA<\/td><td class="mt-num">1<\/td>/);
  assert.match(who, /<tr class="mt-grp"><td>Total<\/td><td class="mt-num">1<\/td>/);
});

test('la sábana: abajo del todo, lo abierto ahora con los filtros, con su enlace a Remedy y el botón de exportar', () => {
  const html = render([{ company: 0 }, null]), at = html.lastIndexOf('<h3>');
  assert.equal(html.slice(at, html.indexOf('</h3>', at) + 5), '<h3>Sábana de incidencias</h3>');
  const sheet = html.slice(at);
  assert.match(sheet, /<span class="mt-mut">1 incidencias<\/span><button class="mt-btn" data-export >Exportar a CSV<\/button>/);
  assert.match(sheet, /<td><a href="https:\/\/itx\.onbmc\.com[^"]*INC000000000003%22" target="_blank" rel="noopener">INC000000000003<\/a><\/td>/);
  assert.match(sheet, /<td>Media<\/td><td>Asignada<\/td><td>ANA<\/td>/);
});
