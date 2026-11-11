import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { REPORTS, reportBounds, reportRange, rangeText, reportName, reportHead } from './report.js';

const DAY = 1440, BASE = Date.UTC(2026, 0, 1);
const bounds = { min: '2026-01-01', max: '2026-03-10' };

test('lo que se puede elegir con los históricos: de lo cargado, del primer día al de la foto', () => {
  const m = createModel(data());
  const b = reportBounds(m);
  assert.equal(b.min, '2026-01-01');
  assert.equal(b.max, new Date(m.BASE + (m.END_D - DAY) * 6e4).toISOString().slice(0, 10));
});

test('con los datos actuales, el periodo de arriba tal cual, sin mirar las fechas', () => {
  assert.deepEqual(reportRange({ source: 'now', current: [10, 20], from: '', to: '', bounds, base: BASE }), { range: [10, 20] });
});

test('con los históricos: un rango a mano, los dos días incluidos, en orden y dentro de lo cargado', () => {
  assert.deepEqual(reportRange({ source: 'history', from: '2026-01-02', to: '2026-01-04', bounds, base: BASE }), { range: [DAY, 4 * DAY] });
  assert.deepEqual(reportRange({ source: 'history', from: '2026-01-05', to: '2026-01-05', bounds, base: BASE }), { range: [4 * DAY, 5 * DAY] }, 'un solo día vale');
  assert.match(reportRange({ source: 'history', from: '2026-01-04', to: '2026-01-02', bounds, base: BASE }).error, /anterior a la de inicio/);
  assert.match(reportRange({ source: 'history', from: '2025-12-30', to: '2026-01-02', bounds, base: BASE }).error, /Solo hay datos del 01\/01\/2026 al 10\/03\/2026/);
  assert.match(reportRange({ source: 'history', from: '2026-03-01', to: '2026-03-11', bounds, base: BASE }).error, /Solo hay datos/);
  assert.match(reportRange({ source: 'history', from: '', to: '2026-01-02', bounds, base: BASE }).error, /Elige/);
  assert.match(reportRange({ source: 'history', from: '2026-02-30', to: '2026-03-02', bounds, base: BASE }).error, /Elige/);
});

test('el periodo en texto y el nombre del PDF: el último día, incluido', () => {
  assert.equal(rangeText([0, 3 * DAY], BASE), '01/01/2026 – 03/01/2026 · 3 días');
  assert.equal(rangeText([0, DAY], BASE), '01/01/2026 – 01/01/2026 · 1 día');
  assert.equal(REPORTS[0][0], 'basic');
  assert.equal(reportName('basic', [0, 3 * DAY], BASE), 'Informe básico 2026-01-01 a 2026-01-03');
});

test('la cabecera: periodo, de dónde salen los datos, qué se mira, filtros y cuándo se generó', () => {
  const h = reportHead({ key: 'basic', source: 'now', range: [0, 3 * DAY], base: BASE, sides: ['Indra', 'T-Systems'], filters: ['Prioridad: Alta'], coverage: 'Datos desde 01/01/2026', generatedAt: new Date(2026, 10, 11, 9, 5) });
  assert.match(h, /<h1>Informe básico · Métricas<\/h1>/);
  assert.match(h, /<dt>Periodo<\/dt><dd>01\/01\/2026 – 03\/01\/2026 · 3 días<\/dd>/);
  assert.match(h, /<dt>Datos<\/dt><dd>Datos actuales · Datos desde 01\/01\/2026<\/dd>/);
  assert.match(h, /<dt>Comparando<\/dt><dd>Indra frente a T-Systems<\/dd>/);
  assert.match(h, /<dt>Filtros<\/dt><dd>Prioridad: Alta<\/dd>/);
  assert.match(h, /<dt>Generado<\/dt><dd>11\/11\/2026 09:05<\/dd>/);
  assert.doesNotMatch(h, /estado del backlog/);
  const old = reportHead({ key: 'basic', source: 'history', range: [0, DAY], base: BASE, sides: ['Indra'] });
  assert.match(old, /<dt>Qué se mira<\/dt><dd>Indra<\/dd>/);
  assert.doesNotMatch(old, /Filtros/);
  assert.match(old, /Datos históricos/);
  assert.match(old, /no hay estado del backlog por situación/);
});
