import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { sheetOf, sheetCsv, sheetFile, SHEET_COLS, incId } from './sheet.js';

const model = (sides) => { const m = createModel(data()); if (sides) m.S.sides = sides; m.refilter(); return m; };

test('la sábana: lo abierto ahora que pasa los filtros y los lados, de la más antigua a la más reciente', () => {
  const d = data(); d.cols.st = [2, 2, 2, 1, 1];   // abiertas la 1 (Indra), la 2 (T-Systems) y la 3 (Indra)
  const m = createModel(d); m.refilter();
  assert.deepEqual(sheetOf(m), [0, 2]);   // Indra: la 1 (minuto 1.000) y la 3 (99.800); la 2 es de T-Systems
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  assert.deepEqual(sheetOf(m), [0, 1, 2]);
  m.toggle('pr', 1); m.refilter();   // solo las críticas
  assert.deepEqual(sheetOf(m), [0]);
});

test('a CSV para Excel: BOM, «;», cada campo entre comillas (las comillas, dobladas) y el enlace a Remedy al final', () => {
  const d = data(); d.cols.su[2] = 'Abierta "urgente"; con punto y coma';
  const m = createModel(d); m.refilter();
  const csv = sheetCsv(m, sheetOf(m)), [head, row] = csv.slice(1).split('\r\n');
  assert.equal(csv[0], '﻿');
  assert.equal(head, [...SHEET_COLS.map(([l]) => l), 'Enlace a Remedy'].map((l) => `"${l}"`).join(';'));
  assert.ok(row.startsWith(`"${incId(3)}";"11/03/2026 07:20";"Abierta ""urgente""; con punto y coma";"Media";"Asignada";"ANA";`));
  assert.ok(row.endsWith(`INC000000000003%22"`));
});

test('el fichero, con el día de la última carga', () => {
  assert.equal(sheetFile(model()), 'incidencias-abiertas-2026-03-11.csv');
});

test('el Vendor Ticket Number, tal cual viene de Remedy (con su prefijo y todas sus claves)', () => {
  const d = data(); d.cols.st[0] = 2;   // la 1, la que tiene ticket, abierta
  const m = createModel(d); m.refilter();
  const col = SHEET_COLS.find(([l]) => l === 'Vendor Ticket Number');
  assert.deepEqual(sheetOf(m).map((i) => col[1](m, i)), ['TEC: SGA-1 / SGA-2', '']);
  assert.match(sheetCsv(m, sheetOf(m)), /"TEC: SGA-1 \/ SGA-2";"https:/);
});

test('La sábana se ordena entera (no solo lo que se ve) por la columna pinchada: la fecha de apertura, por fecha; otra vez, al revés', async () => {
  const { createModel } = await import('./model.js');
  const { data } = await import('./fixture.js');
  const { sheetBody, SHEET_COLS } = await import('./sheet.js');
  const m = createModel(data()); m.refilter();
  const all = m.today(true), byRep = [...all].sort((a, b) => m.C.rep[a] - m.C.rep[b]);
  const col = SHEET_COLS.findIndex(([l]) => l === 'Abierta');
  const ids = (h) => [...h.matchAll(/<tr><td><a [^>]*>([^<]*)<\/a>/g)].map((x) => x[1]);
  const idOf = (i) => SHEET_COLS[0][1](m, i);
  const more = () => '';
  // sin orden: como venga, con las cabeceras para pinchar
  const ui = { sort: {} }, list = [...all].reverse();
  let h = sheetBody(m, list, { ui, id: 's', expanded: true, more, empty: '' });
  assert.match(h, new RegExp(`<th data-sort="s:${col}">Abierta</th>`));
  // de la más reciente a la más antigua y al revés; la lista misma, en ese orden (lo que exporta el botón)
  ui.sort.s = [String(col), -1];
  const l1 = [...all]; h = sheetBody(m, l1, { ui, id: 's', expanded: true, more, empty: '' });
  assert.deepEqual(ids(h), [...byRep].reverse().map(idOf));
  assert.deepEqual(l1, [...byRep].reverse());
  assert.match(h, /<th class="mt-srt" data-sort="s:\d+">Abierta ↓<\/th>/);
  ui.sort.s = [String(col), 1];
  h = sheetBody(m, [...all], { ui, id: 's', expanded: true, more, empty: '' });
  assert.deepEqual(ids(h), byRep.map(idOf));
  // sin desplegar, las primeras de la lista entera ya ordenada
  h = sheetBody(m, [...all], { ui, id: 's', expanded: false, more, empty: '' });
  assert.deepEqual(ids(h), byRep.slice(0, ids(h).length).map(idOf));
  assert.ok(!h.includes('mt-colsort'));   // no la toca el orden genérico (table-sort.js): la tabla tiene th[data-sort]
});
