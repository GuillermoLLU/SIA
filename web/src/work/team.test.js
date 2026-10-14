import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { teamPanel, MIN } from './team.js';

// 2 personas de Indra (ANA, rápida; PEPE, lenta) con MIN issues cada una y 1 de T-Systems (LUIS, con 1 issue), que no sale.
const issues = [
  ...Array.from({ length: MIN }, (_, i) => ({ as: 1, rep: 1000 + i, res: 1060 + i, ip: 5, fr: 5 })),
  ...Array.from({ length: MIN }, (_, i) => ({ as: 2, rep: 2000 + i, res: 9000 + i, ip: 300, fr: 300 })),
  { as: 3, rep: 3000, res: 3100, ip: 10, fr: 10 },
];
const n = issues.length, col = (f) => issues.map(f), zeros = () => col(() => 0);
const data = () => ({
  meta: { file: 'x.csv', year: 2026, group: 'AYS SOPORTE', rows: n, total: n, snapshot: 100000, generated: 'g' },
  dict: { status: ['', 'CLOSED'], reason: [''], prio: ['', 'HIGH'], svc: [''], person: ['', 'ANA', 'PEPE', 'LUIS'], centre: [''], op: [''], module: [''],
    cat: [''], vtype: [''], vproj: [''], vkey: [''], resol: [''] },
  themes: [], company: [2, 0, 0, 1],
  cols: { id: col((_, i) => i + 1), rep: col((x) => x.rep), res: col((x) => x.res), st: col(() => 1), rs: zeros(), pr: col(() => 1), sv: zeros(),
    as: col((x) => x.as), ce: zeros(), op: zeros(), mo: zeros(), k3: zeros(), sc: zeros(), fl: zeros(), vt: zeros(), vp: zeros(), vk: zeros(),
    fr: col((x) => x.fr), ip: col((x) => x.ip), tA: zeros(), tI: zeros(), tPc: zeros(), tPv: zeros(), tPo: zeros(), nb: zeros(), np: zeros(), th: zeros(), rz: zeros(),
    su: col(() => 'título') },
});

const render = (sides, charts = new Set()) => {
  const m = createModel(data()), ui = { exp: {}, sort: {}, charts };
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
  assert.match(h, /<h3>Pendientes<\/h3>[\s\S]*?<div class="wk-hero"><b>0<\/b><span>sin resolver en SGA y SISU/);   // ninguna en SGA ni SISU
  assert.equal((h.match(/class="wk-block[ "]/g) || []).length, 6);   // seis bloques, en dos filas (con cifras o como gráfica)
});

test('un bloque como gráfica: su evolución en lugar de las cifras, con la principal arriba', () => {
  const base = render([{ company: 0 }, null]);
  assert.equal((base.match(/class="wk-chart"/g) || []).length, 2);   // Volumen e IA, siempre como gráfica
  assert.doesNotMatch(base, /data-chart="(volume|ia)"/);              // sin icono para cambiar
  assert.match(base, /Media al día: <b>[\d,]+<\/b> nuevas y <b>[\d,]+<\/b> resueltas/);
  const h = render([{ company: 0 }, null], new Set(['times', 'sla']));
  assert.equal((h.match(/class="wk-chart"/g) || []).length, 4);
  assert.match(h, /data-chart="times" title="Ver los datos"/);
  const times = h.slice(h.indexOf('<h3>Tiempos'), h.indexOf('</section>', h.indexOf('<h3>Tiempos')));
  assert.match(times, /class="wk-key"/);
  assert.doesNotMatch(times, /wk-items/);
});

test('al ordenar por una media o un %, quien tiene menos de MIN issues va al final', () => {
  const d = data(); d.company[3] = 0;   // LUIS, en el equipo, con 1 issue
  const m = createModel(d), ui = { exp: {}, sort: { team: ['avg', 1] } };
  m.S.sides = [{ company: 0 }, null]; m.refilter();
  const names = [...teamPanel(m, createCharts(m, ui), ui).matchAll(/data-person="(\d)"/g)].map((x) => x[1]);
  assert.deepEqual(names, ['1', '2', '3']);   // LUIS tiene la media más baja, pero va al final
});
