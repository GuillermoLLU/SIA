import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { createCommon } from './common.js';
import { evolutionOf } from './evolucion.js';
import { data } from '../fixture.js';
import { dur } from '../format.js';

const render = (shifts, d = data()) => {
  d.cols.sV[1] = [3];   // la 1 (de T-Systems, la mañana del día 1), a proveedor en su turno
  const m = createModel(d); m.S.sides = [{ company: 1 }, null]; m.refilter();
  const ui = { exp: {}, sort: {}, shifts }, ch = createCharts(m, ui);
  // la gráfica ya no está en la pestaña Turnos: se prueba la pieza (evolucion.js, byShift)
  return { card: evolutionOf(createCommon(m, ch, ui)).byShift(m.rows()) };
};
const picked = (card) => [...card.matchAll(/<button class="mt-seg-b ([^"]*)" data-shk="(\d)"/g)].map((x) => [Number(x[2]), x[1].includes('mt-on')]);

test('Turnos: arriba del todo, las cifras por turno; luego, el día en 24 horas, qué se queda para el siguiente y la prioridad; sin entrantes frente a atendidas', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  const cards = [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((x) => x[1]);
  assert.deepEqual(cards.slice(0, 3), ['El día en 24 horas', '¿Qué se queda para el turno siguiente?', 'Prioridad por turno']);
  assert.ok(html.indexOf('mt-kpis') < html.indexOf('<h3>El día en 24 horas</h3>'));
  assert.match(html.slice(html.indexOf('mt-kpis')), /^mt-kpis">[\s\S]*?Entran de mañana/);
  assert.doesNotMatch(html, /Entrantes frente a atendidas/);
});

test('entrantes frente a atendidas en su turno (la pieza): de partida, los tres turnos juntos', () => {
  const { card } = render(undefined);
  assert.deepEqual(picked(card), [[0, true], [1, true], [2, true]]);
  assert.match(card, />Mañana <small>7 a 15 h<\/small><\/button>/);
  // T-Systems: entra 1, de mañana, y se atiende en su turno
  assert.match(card, /En el periodo: 1 entrantes · 1 atendidas en el turno en que entraron \(100 %\)/);
  assert.match(card, /todos los turnos\nEntraron: 1\nAtendidas en su turno: 1/);
  assert.doesNotMatch(card, /reinicia SIA/);
});

test('entrantes frente a atendidas (la pieza): los turnos elegidos, uno o varios juntos', () => {
  const tarde = render([1]).card;
  assert.deepEqual(picked(tarde), [[0, false], [1, true], [2, false]]);
  assert.match(tarde, /En el periodo: 0 entrantes/);
  const two = render([0, 2]).card;
  assert.match(two, /turnos de mañana \(7 a 15 h\) y noche \(23 a 7 h\)/);
  assert.match(two, /En el periodo: 1 entrantes · 1 atendidas/);
});

test('entrantes frente a atendidas (la pieza): sin los turnos de lo atendido (bridge de antes), lo dice', () => {
  const d = data(); delete d.cols.sR; delete d.cols.sV; delete d.cols.sC;
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {} }, html = evolutionOf(createCommon(m, createCharts(m, ui), ui)).byShift(m.rows());
  assert.match(html, /Faltan los turnos de lo atendido: reinicia SIA/);
});

test('Turnos, centrarse sin que lo demás desaparezca: «Turno a turno» con todos los turnos (el elegido, destacado) y el mapa de cuándo llegan', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const rows = (h) => [...h.matchAll(/<tr class="mt-clk ([^"]*)" data-f2="(tu:\d\|we:\d)"><td>[^<]*<span[^>]*>[^<]*<\/span><\/td><td class="mt-num">([^<]*)<\/td>/g)].map((x) => [x[2], x[1].trim(), x[3]]);
  const before = rows(tabs.render('turnos', m.rows()));
  assert.equal(before.length, 6);
  const [k, w] = before.find(([, , n]) => n !== '0' && n !== '—')[0].match(/\d/g).map(Number);
  m.toggle('tu', k); m.toggle('we', w); m.refilter();
  const after = rows(tabs.render('turnos', m.rows()));
  assert.deepEqual(after.map(([f, , n]) => [f, n]), before.map(([f, , n]) => [f, n]));   // las mismas cifras: no desaparecen
  assert.deepEqual(after.map(([f, c]) => [f, c]), before.map(([f]) => [f, f === `tu:${k}|we:${w}` ? 'mt-sel' : 'mt-off']));
});

test('Turnos: «Qué se queda para el turno siguiente» y «Prioridad por turno» (también sus cabeceras) filtran; sin «Por día de la semana»; cuándo llegan, con su total', () => {
  const m = createModel(data()); m.S.sides = [{ company: 0 }, null]; m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui), html = tabs.render('turnos', m.rows());
  const cut = (h, t) => { const a = h.indexOf(`>${t}</h3>`); return h.slice(a, h.indexOf('</section>', a)); };
  assert.deepEqual([...cut(html, '¿Qué se queda para el turno siguiente?').matchAll(/<div class="mt-split mt-clk ?" data-f="(tu:\d)">/g)].map((x) => x[1]), ['tu:0', 'tu:1', 'tu:2']);
  const prio = cut(html, 'Prioridad por turno');
  assert.match(prio, /<th class="mt-h mt-clk ?" data-f="tu:\d"/);   // la cabecera de columna
  assert.match(prio, /<th class="mt-r mt-clk ?" data-f="pr:\d"/);    // y la de fila
  assert.doesNotMatch(html, /Por día de la semana/);
  const llegan = cut(html, 'Cuándo llegan las incidencias');
  assert.match(llegan, /<th class="mt-num">Total<\/th><\/tr><\/thead>/);
  const totals = [...llegan.matchAll(/<td class="mt-num mt-total">(\d+)<\/td>/g)].map((x) => Number(x[1]));
  assert.equal(totals.length, 7);
  assert.equal(totals.reduce((a, b) => a + b, 0), m.rows().length);
  // con un turno elegido, en «turno siguiente» los demás siguen, apagados
  m.toggle('tu', 0); m.refilter();
  const after = cut(tabs.render('turnos', m.rows()), '¿Qué se queda para el turno siguiente?');
  assert.deepEqual([...after.matchAll(/<div class="mt-split mt-clk ([^"]*)" data-f="(tu:\d)">/g)].map((x) => [x[2], x[1].trim()]), [['tu:0', 'mt-sel'], ['tu:1', 'mt-off'], ['tu:2', 'mt-off']]);
});

test('Turnos: arriba, el selector de SISU o SGA; solo con SISU, sus turnos (mañana de 7 a 15 y tarde de 14 a 22, de lunes a viernes)', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const all = tabs.render('turnos', m.rows());
  assert.match(all, /aria-label="SISU o SGA"><button class="mt-seg-b " data-ring-sys="0"[^>]*>SISU<\/button><button class="mt-seg-b " data-ring-sys="1"[^>]*>SGA<\/button>/);
  assert.match(all, /Entran de noche/);                      // los dos: los tres turnos de 24 h
  m.S.f.ss = new Set([0]); m.refilter();
  const sisu = tabs.render('turnos', m.rows());
  assert.match(sisu, /data-ring-sys="0" aria-pressed="true"/);
  assert.match(sisu, /Entran de mañana/);
  assert.match(sisu, /Entran de tarde/);
  assert.doesNotMatch(sisu, /Entran de noche/);
  assert.match(sisu, /Entran fuera de turno/);
  assert.match(sisu, /Media de resolución/);
  assert.match(sisu, /data-f="ts:0"[^>]*><td>Mañana <span class="mt-mut">· 7 a 15 h<\/span>/);
  assert.match(sisu, /data-f="ts:1"[^>]*><td>Tarde <span class="mt-mut">· 14 a 22 h<\/span>/);
  assert.doesNotMatch(sisu, /Fin de semana<\/td>/);           // sin filas de fin de semana: pasan al lunes
  // con SGA, otra vez los tres turnos
  m.S.f.ss = new Set([1]); m.refilter();
  assert.match(tabs.render('turnos', m.rows()), /Entran de noche/);
});

test('Turnos: «Entran en fin de semana», con los turnos de 24 h; con SISU, no (lo del fin de semana pasa al lunes)', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  assert.match(tabs.render('turnos', m.rows()), /Entran en fin de semana/);
  m.S.f.ss = new Set([0]); m.refilter();
  assert.doesNotMatch(tabs.render('turnos', m.rows()), /Entran en fin de semana/);
});

test('Turnos con SGA (los turnos de 24 h): también la media hasta En curso y la de resolución, en tiempo natural', () => {
  const m = createModel(data()); m.S.f.ss = new Set([1]); m.refilter();
  const ui = { exp: {}, sort: {} }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  const kpi = (l) => html.match(new RegExp(`<div class="mt-kpi-l">${l}</div><div class="mt-kpi-v">([^<]*)<`))?.[1];
  const st = m.stats(m.rows().filter((i) => m.SIDE[i] === 0));
  assert.ok(kpi('Media hasta En curso') != null && kpi('Media de resolución') != null);
  if (st.ip != null) assert.equal(kpi('Media hasta En curso'), dur(st.ip));
  if (st.resolved) assert.equal(kpi('Media de resolución'), dur(st.avg));
});

test('Turnos con SGA (o los dos): el selector de entre semana o fin de semana, que filtra; con SISU, no sale', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const sel = (h) => h.match(/aria-label="Entre semana o fin de semana">([\s\S]*?)<\/div>/)?.[1];
  const both = tabs.render('turnos', m.rows());
  assert.match(sel(both), /data-only="we:0" aria-pressed="false"[^>]*>Entre semana<\/button>/);
  assert.match(sel(both), /data-only="we:1" aria-pressed="false"[^>]*>Fin de semana<\/button>/);
  m.S.f.ss = new Set([1]); m.S.f.we = new Set([1]); m.refilter();
  const sga = tabs.render('turnos', m.rows());
  assert.match(sel(sga), /data-only="we:1" aria-pressed="true"/);
  assert.ok(m.rows().every((i) => m.DIMS.we.get(i) === 1));   // filtra: solo lo del fin de semana
  m.S.f = { ss: new Set([0]) }; m.refilter();
  assert.equal(sel(tabs.render('turnos', m.rows())), undefined);   // con SISU, no
});

test('Turnos: Ctrl+clic en SISU o SGA, compararlos, solo entre semana, cada uno con sus turnos', () => {
  const m = createModel(data()); m.refilter();
  const ui = { exp: {}, sort: {}, ssCmp: true }, html = createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows());
  assert.match(html, /mt-dn-sys-cmp" role="group" aria-label="SISU o SGA"><button class="mt-seg-b mt-on" data-ring-sys="0"/);   // los dos, marcados
  assert.match(html, /Comparando SISU y SGA, solo entre semana/);
  assert.doesNotMatch(html, /aria-label="Entre semana o fin de semana"/);   // sin el selector de días
  for (const l of ['Entran por día laborable', 'Empezadas dentro del SLA', 'Empezadas en su turno', 'Resueltas en su turno', 'Media hasta En curso', 'Media de resolución']) {
    assert.match(html, new RegExp(`<div class="mt-kpi-l">${l}</div>\\s*<div class="mt-kpi-s"><i class="mt-c0"></i><span>SISU</span>[\\s\\S]*?<span>SGA</span>`), l);
  }
  // la tabla: los dos turnos de SISU y los tres de SGA
  const t = html.slice(html.indexOf('>Turno a turno</h3>'));
  assert.match(t, /SISU · de lunes a viernes[\s\S]*Mañana <span class="mt-mut">· 7 a 15 h[\s\S]*Tarde <span class="mt-mut">· 14 a 22 h[\s\S]*SGA · turnos de lunes a viernes[\s\S]*Noche/);
  // el día en 24 horas: los dos en una sola gráfica, con sus seis líneas
  const d24 = html.slice(html.indexOf('>El día en 24 horas</h3>'), html.indexOf('>¿Qué se queda para el turno siguiente?</h3>'));
  assert.equal((d24.match(/<svg /g) || []).length, 1);
  for (const l of ['SISU · entran', 'SISU · se empiezan', 'SISU · se resuelven', 'SGA · entran', 'SGA · se empiezan', 'SGA · se resuelven']) assert.ok(d24.includes(`</i>${l}</span>`), l);
  // y, comparando personas o empresas, no (cada lado, lo suyo)
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  assert.doesNotMatch(createTabs(m, createCharts(m, ui), ui).render('turnos', m.rows()), /Comparando SISU y SGA/);
});
