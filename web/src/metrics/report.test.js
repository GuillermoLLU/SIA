import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { REPORTS, withDates, reportLabel, reportBounds, reportRange, rangeText, reportName, reportHead } from './report.js';

const DAY = 1440, BASE = Date.UTC(2026, 0, 1);
const bounds = { min: '2026-01-01', max: '2026-03-10' };

test('los informes del desplegable: Backlog actual (lo de ahora, el primero) e Histórico (con fechas), cada uno con lo que contiene', () => {
  assert.deepEqual(REPORTS.map(([k, l]) => [k, l]), [['backlog', 'Backlog actual'], ['history', 'Histórico']]);
  assert.equal(withDates('backlog'), false);
  assert.equal(withDates('history'), true);
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

test('Histórico: un rango a mano, los dos días incluidos, en orden y dentro de lo cargado', () => {
  const r = (from, to) => reportRange({ key: 'history', from, to, bounds, base: BASE });
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
  assert.equal(reportName('history', [0, 3 * DAY], BASE), 'Histórico 2026-01-01 a 2026-01-03');
  assert.equal(reportName('backlog', [0, 3 * DAY], BASE, Date.UTC(2026, 10, 12, 9)), 'Backlog actual 2026-11-12');
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

test('la cabecera de Histórico: su periodo y hasta dónde llegan los datos, y que no lleva el estado por situación', () => {
  const h = reportHead({ key: 'history', range: [0, DAY], base: BASE, sides: ['Indra'], coverage: 'Datos desde 01/01/2026 hasta 01/01/2026' });
  assert.match(h, /<h1>Histórico · Métricas<\/h1>/);
  assert.match(h, /<dt>Periodo<\/dt><dd>01\/01\/2026 – 01\/01\/2026 · 1 día<\/dd>/);
  assert.match(h, /<dt>Datos<\/dt><dd>Datos desde 01\/01\/2026 hasta 01\/01\/2026<\/dd>/);
  assert.match(h, /<dt>Qué se mira<\/dt><dd>Indra<\/dd>/);
  assert.doesNotMatch(h, /A fecha de|Filtros/);
  assert.match(h, /no hay estado del backlog por situación/);
});
