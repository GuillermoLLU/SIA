import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeOf, buildQuery, FIRST_LOAD, SESSION } from './query.js';

test('rangeOf: sin nada guardado, la primera carga desde 2025 (para comparar con el año anterior) y sin filtro de cambios', () => {
  assert.deepEqual(rangeOf({ first: null, last: null }), { floor: FIRST_LOAD, since: null, back: null });
  assert.equal(FIRST_LOAD, '2025-01-01 00:00:00.000');
});

test('rangeOf: lo cambiado desde la última modificación menos 2 días; el suelo, la apertura más antigua', () => {
  assert.deepEqual(rangeOf({ first: '2025-01-03 08:00:00', last: '2026-03-02 10:15:30.250' }),
    { floor: '2025-01-03 08:00:00.000', since: '2026-02-28 10:15:30.250', back: null });
  // al cruzar un año
  assert.equal(rangeOf({ first: '2025-01-01 00:00:00.000', last: '2026-01-01 12:00:00.000' }).since, '2025-12-30 12:00:00.000');
});

test('rangeOf: una base que empieza más de una semana después de FIRST_LOAD trae lo que le falta hasta él', () => {
  assert.deepEqual(rangeOf({ first: '2026-01-01 00:03:00', last: '2026-10-29 10:00:00.000' }).back, [FIRST_LOAD, '2026-01-01 00:03:00.000']);
  assert.equal(rangeOf({ first: '2025-01-07 23:00:00', last: '2026-10-29 10:00:00.000' }).back, null);   // a menos de 7 días: completa
});

test('buildQuery: la primera carga filtra solo por la apertura', () => {
  const { sql, binds } = buildQuery({ floor: FIRST_LOAD, since: null });
  assert.deepEqual(binds, [FIRST_LOAD]);
  assert.match(sql, /WHERE \(REPORTEDDATE >= TO_TIMESTAMP_NTZ\(\?, 'YYYY-MM-DD HH24:MI:SS.FF3'\)\)\n\)/);
  assert.doesNotMatch(sql, /LASTMODIFIEDDATE/);
});

test('buildQuery: lo que falta hasta FIRST_LOAD, entero y solo del grupo; sus fechas, detrás de las demás', () => {
  const { sql, binds } = buildQuery({ floor: '2026-01-01 00:03:00.000', since: '2026-10-27 10:00:00.000', back: [FIRST_LOAD, '2026-01-01 00:03:00.000'] });
  assert.deepEqual(binds, ['2026-01-01 00:03:00.000', '2026-10-27 10:00:00.000', FIRST_LOAD, '2026-01-01 00:03:00.000']);
  assert.match(sql, /\)\n {7}OR \(REPORTEDDATE >= TO_TIMESTAMP_NTZ\(\?, '[^']+'\) AND REPORTEDDATE < TO_TIMESTAMP_NTZ\(\?, '[^']+'\) AND TRIM\(ASSIGNEDGROUP\) = 'AYS SOPORTE'\)\n\)/);
});

test('buildQuery: la actualización trae solo lo cambiado; las fechas, por binds y en orden', () => {
  const { sql, binds } = buildQuery({ floor: '2025-11-20 08:00:00.000', since: '2026-02-28 10:15:30.250' });
  assert.deepEqual(binds, ['2025-11-20 08:00:00.000', '2026-02-28 10:15:30.250']);
  assert.match(sql, /AND COALESCE\(LASTMODIFIEDDATE, REPORTEDDATE\) >= TO_TIMESTAMP_NTZ\(\?,/);
  assert.doesNotMatch(sql, /2025-11-20|2026-02-28/);
  assert.equal(sql.split('(?,').length - 1, 2);   // el otro «?» es el de la URL de LINKREMEDY
});

test('buildQuery: las columnas del CSV de antes (notas, hijas, historial y enlace)', () => {
  const { sql } = buildQuery({ floor: FIRST_LOAD, since: null });
  for (const c of ['WORKLOG_DETAIL', 'CHILDREQUEST', 'AUDIT_DETAIL', 'LINKREMEDY']) assert.match(sql, new RegExp(`AS ${c}\\b`));
});

test('buildQuery: notas y cambios de un mismo segundo, siempre en el mismo orden', () => {
  const { sql } = buildQuery({ floor: FIRST_LOAD, since: null });
  assert.ok(sql.includes('ORDER BY w.WORKLOGSUBMITDATE, w.WORKLOGID)'));
  assert.ok(sql.includes('ORDER BY f.CREATE_DATE_C, f.FIELD, f.FIELD_VALUE_ORIG, f.FIELD_VALUE, f.SUBMITTER_C)'));
});

test('SESSION: todas las fechas con milisegundos, como en el CSV', () => {
  assert.equal(SESSION.length, 4);
  assert.ok(SESSION.every((s) => s.endsWith("_OUTPUT_FORMAT = 'YYYY-MM-DD HH24:MI:SS.FF3'")));
});
