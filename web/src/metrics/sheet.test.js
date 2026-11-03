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
