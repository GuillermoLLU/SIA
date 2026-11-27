import test from 'node:test';
import assert from 'node:assert/strict';
import { dur, nice } from '../metrics/format.js';
import { shortTitle, TEAM_SHEET_COLS } from './team-sheet.js';

test('el título: lo que viene tras el primer guion, sin espacios; sin guion o sin nada detrás, el resumen', () => {
  assert.equal(shortTitle('123 Zara CENTRO - No imprime etiquetas'), 'No imprime etiquetas');
  assert.equal(shortTitle('123 Zara CENTRO-No imprime'), 'No imprime');
  assert.equal(shortTitle('123 CENTRO - Falla el SGA - urgente'), 'Falla el SGA - urgente');
  assert.equal(shortTitle('Sin guion'), 'Sin guion');
  assert.equal(shortTitle('Acaba en guion -'), 'Acaba en guion -');
});

const value = (m, i, label) => TEAM_SHEET_COLS.find(([l]) => l === label)[1](m, i);

test('las columnas de la sábana, en su orden', () => {
  assert.deepEqual(TEAM_SHEET_COLS.map(([l]) => l), ['Incidencia', 'Título', 'Prioridad', 'Estado', 'Centro', 'Módulo', 'Vendor Ticket Number', 'Antigüedad o TTR', 'Nota final de la auditoría', 'IA']);
});

test('el estado, sin su motivo', () => {
  const m = { DI: { status: ['', 'PENDING'], reason: ['', 'CLIENT_ACTION_REQUIRED'] }, C: { st: [1], rs: [1] } };
  assert.equal(value(m, 0, 'Estado'), nice('PENDING'));
});

test('IA: sí con cualquier marca de IA; no sin ninguna ni con otras marcas', () => {
  const m = { C: { fl: [32, 64, 2048, 0, 512] } };
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => value(m, i, 'IA')), ['Sí', 'Sí', 'Sí', 'No', 'No']);
});

test('resuelta, su TTR; abierta, su antigüedad; cancelada sin resolver, nada; la nota, pendiente', () => {
  const m = { SNAP: 1000, OPEN: [0, 1, 0], C: { rep: [100, 100, 100], res: [160, -1, -1] } };
  assert.equal(value(m, 0, 'Antigüedad o TTR'), dur(60));
  assert.equal(value(m, 1, 'Antigüedad o TTR'), dur(900));
  assert.equal(value(m, 2, 'Antigüedad o TTR'), '—');
  assert.equal(value(m, 0, 'Nota final de la auditoría'), '—');
});
