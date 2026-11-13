import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data, SNAP } from '../fixture.js';
import { dur } from '../format.js';
import { REASONS } from './cliente.js';

// De Indra (ANA): la 1 y la 3, en Pendiente de cliente; la 4, en Pendiente de un tercero. La 1, abierta hace mucho, sin
// escribir al cliente desde hace 2.000 min, pidiéndole información y en su 2.ª vez; la 3, reciente, pidiéndole validar.
const pendingData = ({ old = false } = {}) => {
  const d = data();
  d.dict.status = ['', 'CLOSED', 'ASSIGNED', 'PENDING'];
  d.dict.reason = ['', 'CLIENT_ACTION_REQUIRED', 'THIRD_PARTY_VENDOR_ACTION_REQD'];
  d.cols.st = [3, 1, 3, 3, 1]; d.cols.rs = [1, 0, 1, 2, 0]; d.cols.res = [-1, 5000, -1, -1, 6001];
  d.cols.tPc = [300, 0, 50, 0, 0];
  d.cols.lm = [SNAP - 100, 5000, SNAP - 60, SNAP - 10, 6001];
  if (!old) {
    d.cols.pn = [SNAP - 2000, -1, SNAP - 100, -1, -1];
    d.cols.pm = [1, 0, 2, 0, 0];
    d.cols.nC = [2, 0, 1, 0, 0];
  }
  return d;
};
const setup = (opts, sides = [{ company: 0 }, null]) => {
  const m = createModel(pendingData(opts)); m.S.sides = sides; m.refilter();
  const ui = { exp: {}, sort: {} };
  return { m, ui, html: createTabs(m, createCharts(m, ui), ui).render('cliente', m.rows()) };
};
const kpiOf = (html, label) => html.match(new RegExp(`<div class="mt-kpi-l"[^>]*>${label}</div><div class="mt-kpi-v[^"]*">([^<]*)<`))?.[1];

test('Pendiente de cliente: solo lo activo en Pendiente de cliente; sus KPIs', () => {
  const { html, ui } = setup();
  assert.match(html, /¿Qué esperamos del cliente\?/);
  assert.deepEqual(ui.cliSheet.list, [0, 2]);   // de la más antigua a la más reciente; ni la de proveedor ni las cerradas
  assert.equal(kpiOf(html, 'Pendientes de cliente'), '2');
  assert.equal(kpiOf(html, 'Tiempo medio abiertas'), undefined);   // quitado: con todas abiertas, es el MTTR
  assert.equal(kpiOf(html, 'MTTR'), dur((SNAP - 1000 + 200) / 2));   // todas abiertas: lo que llevan
  assert.equal(kpiOf(html, 'Tiempo medio en pendiente de cliente'), dur((300 + 100 + 50 + 60) / 2));   // lo sumado y lo de desde su última modificación
  assert.equal(kpiOf(html, 'Sin reclamar más de 24 h'), '1');
  assert.equal(kpiOf(html, 'Rebotes'), '1');
  assert.ok(kpiOf(html, 'IDMTTR'));
  assert.doesNotMatch(html, /undefined|NaN|Faltan las notas/);
});

test('Pendiente de cliente: el motivo de pendiente, en barras horizontales, y la sábana con sus tiempos', () => {
  const { html } = setup();
  const card = html.slice(html.indexOf('<h3>Motivo de pendiente</h3>'), html.indexOf('</section>', html.indexOf('<h3>Motivo de pendiente</h3>')));
  const rows = [...card.matchAll(/<tr[^>]*><th>([^<]*)<\/th><td class="mt-num">(\d+)<\/td>/g)].map((x) => [x[1], +x[2]]);
  assert.deepEqual(rows, [[REASONS[1], 1], [REASONS[2], 1], [REASONS[3], 0], [REASONS[4], 0], [REASONS[5], 0], [REASONS[0], 0]]);
  assert.match(card, /class="mt-blist-bar"><i class="mt-c0" style="width:50.0%"/);
  const sheet = html.slice(html.indexOf('<h3>Sábana de incidencias</h3>'));
  for (const h of ['Antigüedad', 'En pendiente de cliente', 'Última nota pública', 'Motivo', 'Veces en pendiente', 'IDMTTR']) assert.match(sheet, new RegExp(`<th[^>]*>${h}</th>`), h);
  assert.match(sheet, /<td>Información\/evidencias solicitadas<\/td>/);
  assert.match(sheet, new RegExp(`hace ${dur(2000)}`));
  assert.match(sheet, /<td class="mt-num">2<\/td>/);   // veces en pendiente de la 1
  assert.match(sheet, /data-export/);
});

test('Pendiente de cliente: con datos de antes (sin notas públicas ni rebotes), lo avisa y no se rompe', () => {
  const { html } = setup({ old: true });
  assert.match(html, /Faltan las notas públicas y los rebotes: reinicia SIA/);
  assert.equal(kpiOf(html, 'Pendientes de cliente'), '2');
  assert.equal(kpiOf(html, 'Rebotes'), '—');
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('Pendiente de cliente, comparando: los KPIs de cada lado', () => {
  const { html } = setup({}, [{ company: 0 }, { company: 1 }]);
  assert.equal((html.match(/class="mt-kpi mt-kpi-co[ "]/g) || []).length, 6);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('Pendiente de cliente: las definiciones, al pasar el ratón; Sin reclamar, Rebotes y cada motivo filtran la sábana', () => {
  const m = createModel(pendingData()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const render = () => tabs.render('cliente', m.rows());
  let html = render();
  // la definición ya no va debajo de la cifra: en el tooltip del KPI
  assert.doesNotMatch(html, /<div class="mt-kpi-d">Incidencias abiertas que están ahora/);
  assert.match(html, /<div class="mt-kpi mt-t0" data-tip="Incidencias abiertas que están ahora en Pendiente[^"]*"><div class="mt-kpi-l">Pendientes de cliente<\/div>/);
  // Sin reclamar y Rebotes, pinchables; los demás, no
  assert.match(html, /<div class="mt-kpi mt-t0 mt-clk" data-tip="[^"]*Clic para ver solo estas\.[^"]*" data-cli-f="quiet" role="button" tabindex="0" aria-pressed="false">/);
  assert.match(html, /data-cli-f="reb" role="button"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('>Pendientes de cliente<')), /data-cli-f/);
  // las barras del motivo, pinchables
  assert.match(html, /<tr class="mt-clk " data-cli-f="r:1"/);
  // filtrando por Sin reclamar: la sábana, solo la 1; marcado, con el aviso para quitarlo
  ui.cliFilter = 'quiet';
  html = render();
  assert.deepEqual(ui.cliSheet.list, [0]);
  assert.match(html, /data-cli-f="quiet" role="button" tabindex="0" aria-pressed="true"/);
  assert.match(html, /mt-t0 mt-clk mt-on/);
  assert.match(html, /Sábana filtrada: 1 de 2, sin reclamar más de 24 h\. <button class="mt-jc-clear" data-cli-f="">Quitar filtro<\/button>/);
  assert.equal(kpiOf(html, 'Pendientes de cliente'), '2');   // los KPIs, sin filtrar
  ui.cliFilter = 'reb';
  render();
  assert.deepEqual(ui.cliSheet.list, [0]);
  // por motivo: Validación de solución/workaround, la 3; su barra, marcada; el gráfico, entero
  ui.cliFilter = 'r:2';
  html = render();
  assert.deepEqual(ui.cliSheet.list, [2]);
  assert.match(html, /<tr class="mt-clk mt-sel" data-cli-f="r:2"/);
  assert.match(html, /con motivo «Validación de solución\/workaround»/);
  ui.cliFilter = 'r:3';
  render();
  assert.deepEqual(ui.cliSheet.list, []);
  ui.cliFilter = null;
  render();
  assert.deepEqual(ui.cliSheet.list, [0, 2]);
});


test('Pendiente de cliente: por módulo afectado y por centro, con sus cifras y el total; clic en una fila, filtra todo', () => {
  const { m, html } = setup();
  const cardOf = (h, title) => { const a = h.indexOf(`<h3>${title}</h3>`); return a < 0 ? '' : h.slice(a, h.indexOf('</section>', a)); };
  const rowsOf = (c) => [...c.matchAll(/<tr class="mt-clk[^"]*" data-f="(\w+:\d+)"><th[^>]*>([^<]*)<\/th>((?:<td[^>]*>[^<]*<\/td>)+)/g)]
    .map((x) => [x[1], x[2], [...x[3].matchAll(/>([^<]*)<\/td>/g)].map((y) => y[1])]);
  const tot = (c) => [...c.slice(c.indexOf('<tr class="mt-tot">')).matchAll(/>([^<]*)<\/td>/g)].map((y) => y[1]);
  assert.ok(html.indexOf('<h3>Motivo de pendiente</h3>') < html.indexOf('<h3>Por módulo afectado</h3>'));
  assert.ok(html.indexOf('<h3>Por módulo afectado</h3>') < html.indexOf('<h3>Por centro</h3>'));
  assert.ok(html.indexOf('<h3>Por centro</h3>') < html.indexOf('<h3>Sábana de incidencias</h3>'));
  for (const [dim, title] of [['mo', 'Por módulo afectado'], ['ce', 'Por centro']]) {
    const c = cardOf(html, title), rows = rowsOf(c);
    // las dos de Indra en Pendiente de cliente (la 0 y la 2), repartidas por su módulo o su centro
    const want = m.group(dim, [0, 2]).map((x) => [`${dim}:${x.k}`, m.DIMS[dim].label(x.k), x.n]);
    assert.deepEqual(rows.map((r) => [r[0], r[1], Number(r[2][0])]), want, title);
    assert.deepEqual(tot(c).slice(0, 2), ['2', '100 %']);
    assert.equal(tot(c)[3], '1'); assert.equal(tot(c)[4], '1');   // sin reclamar > 24 h (la 0) y rebotes (la 0)
    assert.doesNotMatch(c, /undefined|NaN/);
  }
  // filtrando un módulo: esa fila marcada y las demás apagadas, que siguen a la vista
  const k = m.C.mo[0]; m.toggle('mo', k); m.refilter();
  const ui2 = { exp: {}, sort: {} }, h2 = createTabs(m, createCharts(m, ui2), ui2).render('cliente', m.rows());
  const mo2 = cardOf(h2, 'Por módulo afectado');
  assert.match(mo2, new RegExp(`<tr class="mt-clk mt-sel" data-f="mo:${k}">`));
  assert.equal(rowsOf(mo2).length, rowsOf(cardOf(html, 'Por módulo afectado')).length);
});
