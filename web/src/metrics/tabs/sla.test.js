import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';

const render = (sides) => {
  const m = createModel(data()); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('sla', m.rows());
};

test('SLAs, en Histórico (de partida): tras las cifras de arriba, ¿Empezamos a tiempo? (en qué se va el tiempo está en Análisis tiempos)', () => {
  for (const sides of [[{ company: 0 }, null], [{ company: 0 }, { company: 1 }]]) {
    const html = render(sides);
    assert.match(html, /data-sla-mode="past" aria-pressed="true"/);
    assert.ok(html.indexOf('<h2 class="mt-sec">¿Empezamos a tiempo?') > html.indexOf('mt-kpis'));
    assert.doesNotMatch(html, /En qué se va el tiempo|mt-svc-time/);
  }
});

test('SLAs: Actual y Histórico, con los mismos cuadros; Actual, de lo abierto ahora (sea cual sea el periodo), y su sábana', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const titles = (h) => [...h.matchAll(/<h3>([^<]*)<\/h3>|class="mt-sc-title">([^<]*)</g)].map((x) => x[1] || x[2]);
  const kpi = (h, l) => h.match(new RegExp(`<div class="mt-kpi-l">${l}</div><div class="mt-kpi-v">([^<]*)<`))?.[1];
  const past = tabs.render('sla', m.rows());
  const period = [m.S.d0, m.S.d1];
  ui.slaNow = true;
  const now = tabs.render('sla', m.rows());
  assert.deepEqual([m.S.d0, m.S.d1], period);   // el periodo, como estaba
  assert.match(now, /data-sla-mode="now" aria-pressed="true"/);
  assert.deepEqual(titles(now), titles(past));   // los mismos cuadros
  assert.ok(titles(now).includes('Lo que más prisa corre'));
  // Indra: abierta, solo la media, sin empezar y fuera de su plazo (lleva 200 min; el de las medias, 120)
  assert.equal(kpi(now, 'Fuera de SLA'), undefined);   // sin KPI: con el selector de arriba
  assert.equal(kpi(now, 'Dentro del SLA'), '0 %');
  assert.deepEqual(ui.slaSheet.list, [2]);
  assert.match(now, /<td>Sin empezar, fuera de plazo<\/td>/);
  assert.match(now, /fuera desde hace 1,3 h/);   // 200 − 120 min
  assert.doesNotMatch(now, /undefined|NaN/);
  assert.equal(tabs.render('sla', []), now);   // sea cual sea el periodo
  // comparando, también
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  const cmpNow = tabs.render('sla', m.rows()); ui.slaNow = false;
  assert.deepEqual(titles(cmpNow), titles(tabs.render('sla', m.rows())));
});

test('SLAs: los KPIs, con el % empezado a tiempo de cada prioridad y las devueltas a cola, sin fuera de SLA (es el selector), cerradas sin En curso, escaladas sin Pendiente ni sin texto de resolución', () => {
  for (const sides of [[{ company: 0 }, null], [{ company: 0 }, { company: 1 }], [{ people: new Set([1]) }, { company: 0 }]]) {
    const html = render(sides), top = html.slice(html.indexOf('mt-kpis'), html.indexOf('<h2 class="mt-sec">'));
    for (const l of ['% Críticas a tiempo', '% Altas a tiempo', '% Medias a tiempo', '% Bajas a tiempo', 'Devueltas a cola'])
      assert.ok(top.includes(`>${l}<`), `${l} · ${JSON.stringify(sides)}`);
    if (!sides[1] || sides[0].people) for (const l of ['Dentro del SLA']) assert.ok(top.includes(`>${l}<`), `${l} · ${JSON.stringify(sides)}`);
    for (const l of ['Fuera de SLA', 'Cerradas sin En curso', 'Escaladas sin Pendiente', 'Sin texto de resolución']) assert.ok(!top.includes(`>${l}<`), `${l} · ${JSON.stringify(sides)}`);
    assert.doesNotMatch(top, /undefined|NaN/);
  }
  // Indra: la crítica, en curso a los 10 min (SLA de 15): a tiempo
  const html = render([{ company: 0 }, null]);
  assert.match(html, /<div class="mt-kpi-l">% Críticas a tiempo<\/div><div class="mt-kpi-v">100 %<\/div><div class="mt-kpi-d">empezadas en [^<]*<\/div>/);
});

test('SLAs, Mes a mes: sin los meses vacíos (en Actual, lo abierto ahora de un solo mes, una fila)', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, slaNow: true }, html = createTabs(m, createCharts(m, ui), ui).render('sla', m.rows());
  const month = html.slice(html.indexOf('<h3>Mes a mes</h3>'), html.indexOf('</section>', html.indexOf('<h3>Mes a mes</h3>')));
  assert.equal((month.match(/<tr class="mt-clk [^"]*" data-f="month:/g) || []).length, 1);
  assert.match(month, /<tr class="mt-tot"><td>Total<\/td>/);
});

test('SLAs: los KPIs se pinchan para filtrar sus incidencias (y se marcan al filtrar), con un lado y comparando', () => {
  for (const sides of [[{ company: 0 }, null], [{ company: 0 }, { company: 1 }]]) {
    const m = createModel(data()); m.S.sides = sides; m.refilter();
    const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
    const top = (h) => h.slice(h.indexOf('mt-kpis'), h.indexOf('<h2 class="mt-sec">'));
    const html = top(tabs.render('sla', m.rows())), crit = m.DI.prio.indexOf('CRITICAL');
    for (const f of ['q:0', 'q:1', `pr:${crit}`]) assert.ok(html.includes(`data-kf="${f}"`), `${f} · ${JSON.stringify(sides)}`);
    assert.doesNotMatch(html, /data-kf="sl:/);
    assert.match(html, /data-kf="q:1" role="button" tabindex="0" aria-pressed="false"/);
    m.toggle('q', 1); m.refilter();
    assert.match(top(tabs.render('sla', m.rows())), /mt-on"? ?[^>]*data-kf="q:1"[^>]*aria-pressed="true"/);
  }
});

test('SLAs: el interruptor Dentro ⇄ Fuera, a la derecha de Actual / Histórico, cambia el % de los KPIs (el real, sin filtrar) y nada más', () => {
  for (const sides of [[{ company: 0 }, null], [{ people: new Set([1]) }, { company: 0 }]]) {
    const m = createModel(data()); m.S.sides = sides; m.refilter();
    const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
    const top = (h) => h.slice(h.indexOf('mt-kpis'), h.indexOf('<h2 class="mt-sec">')), rest = (h) => h.slice(h.indexOf('<h2 class="mt-sec">'));
    const val = (h, l) => h.match(new RegExp(`<div class="mt-kpi-l"[^>]*>${l}</div><div class="mt-kpi-v[^"]*">([^<]*)<`))?.[1];
    const inH = tabs.render('sla', m.rows());
    assert.ok(inH.indexOf('mt-slasw') > inH.indexOf('data-sla-mode="past"'));
    assert.match(inH, /<div class="mt-slasw mt-in" role="switch" aria-checked="false"[^>]*>.*?<i data-sla-side="out">/);
    const rows = m.rows().length;
    ui.slaOut = true;
    const outH = tabs.render('sla', m.rows());
    assert.equal(m.rows().length, rows); assert.deepEqual(Object.keys(m.S.f), []);   // no filtra
    assert.match(outH, /<div class="mt-slasw mt-out" role="switch" aria-checked="true"[^>]*>.*?<i data-sla-side="in">/);
    assert.equal(rest(outH), rest(inH).replace('mt-slasw', 'mt-slasw'));   // las tablas, igual
    assert.ok(top(outH).includes('>% Críticas fuera de plazo<') && !top(outH).includes('a tiempo<'), JSON.stringify(sides));
    if (!sides[1]) {
      // Indra: la crítica, a tiempo (100 % dentro, 0 % fuera); todas, el complemento
      assert.equal(val(inH, '% Críticas a tiempo'), '100 %'); assert.equal(val(outH, '% Críticas fuera de plazo'), '0 %');
      const d = parseInt(val(inH, 'Dentro del SLA'), 10), f = parseInt(val(outH, 'Fuera de SLA'), 10);
      assert.equal(d + f, 100);
    }
    assert.doesNotMatch(outH, /undefined|NaN/);
  }
});
