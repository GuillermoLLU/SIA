import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeOf, buildQuery, periodSql, firstLoadRange, FIRST_LOAD, SESSION } from './query.js';

test('rangeOf: sin nada guardado, la primera carga desde 2025 (para comparar con el año anterior) y sin filtro de cambios', () => {
  assert.deepEqual(rangeOf({ first: null, last: null }), { floor: FIRST_LOAD, since: null, back: null });
  assert.equal(FIRST_LOAD, '2025-01-01 00:00:00.000');
});

test('rangeOf: lo cambiado desde la última modificación menos 6 horas; el suelo, la apertura más antigua', () => {
  assert.deepEqual(rangeOf({ first: '2025-01-03 08:00:00', last: '2026-03-02 10:15:30.250' }),
    { floor: '2025-01-03 08:00:00.000', since: '2026-03-02 04:15:30.250', back: null });
  // al cruzar la medianoche
  assert.equal(rangeOf({ first: '2025-01-01 00:00:00.000', last: '2026-01-01 03:00:00.000' }).since, '2025-12-31 21:00:00.000');
});

test('rangeOf: una base que empieza más de una semana después de FIRST_LOAD trae lo que le falta hasta él', () => {
  assert.deepEqual(rangeOf({ first: '2026-01-01 00:03:00', last: '2026-10-29 10:00:00.000' }).back, [FIRST_LOAD, '2026-01-01 00:03:00.000']);
  assert.equal(rangeOf({ first: '2025-01-07 23:00:00', last: '2026-10-29 10:00:00.000' }).back, null);   // a menos de 7 días: completa
});

test('la consulta: las notas, las hijas y la auditoría solo para las del grupo; las demás, sin esos datos', () => {
  const { sql } = buildQuery({ floor: FIRST_LOAD, since: null });
  assert.match(sql, /group_incidents AS \(\n\s+SELECT \* FROM incidents WHERE TRIM\(ASSIGNEDGROUP\) = 'AYS SOPORTE'/);
  for (const from of ['worklog_agg', 'association_agg', 'audit_agg']) {
    const block = sql.slice(sql.indexOf(`${from} AS (`), sql.indexOf('\n),', sql.indexOf(`${from} AS (`)));
    assert.match(block, /FROM SGA\.SIGLO\.REMEDY_\w+/);
    assert.match(block, /IN \(SELECT INCIDENTNUMBER FROM group_incidents\)|IN \(SELECT INCIDENTNUMBER FROM group_incidents\)/);
  }
  assert.match(sql, /FROM incidents t1/, 'el resultado trae todas las cambiadas, también las que salen del grupo');
});

test('el constructor de SQL de un periodo: solo el grupo', () => {
  assert.match(periodSql({ from: '2026-03-01', to: '2026-03-31' }), /AND TRIM\(ASSIGNEDGROUP\) = 'AYS SOPORTE'/);
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

test('SESSION: una sola sentencia que fija las cuatro fechas con milisegundos', () => {
  assert.equal(SESSION.length, 1);
  for (const v of ['', '_NTZ', '_LTZ', '_TZ']) assert.ok(SESSION[0].includes(`TIMESTAMP${v}_OUTPUT_FORMAT = 'YYYY-MM-DD HH24:MI:SS.FF3'`), v);
});

test('periodSql: las fechas escritas en el texto, con el último día incluido', () => {
  const sql = periodSql({ from: '2026-03-01', to: '2026-03-31' });
  assert.match(sql, /REPORTEDDATE >= TO_TIMESTAMP_NTZ\('2026-03-01 00:00:00.000', 'YYYY-MM-DD HH24:MI:SS.FF3'\) AND REPORTEDDATE < TO_TIMESTAMP_NTZ\('2026-04-01 00:00:00.000'/);
  assert.doesNotMatch(sql, /TO_TIMESTAMP_NTZ\(\?/, 'sin parámetros: se puede copiar tal cual');
});

test('periodSql: la misma consulta que la de actualización, desde las notas en adelante', () => {
  const tail = (s) => s.slice(s.indexOf('worklog_agg AS ('));
  const update = buildQuery({ floor: FIRST_LOAD, since: null }).sql;
  assert.equal(tail(periodSql({ from: '2026-03-01', to: '2026-03-01' })), tail(update));
});

test('periodSql: rechaza fechas que no existen, al revés o en otro formato', () => {
  assert.throws(() => periodSql({ from: '2026-02-30', to: '2026-03-01' }), RangeError);
  assert.throws(() => periodSql({ from: '2026-03-02', to: '2026-03-01' }), RangeError);
  assert.throws(() => periodSql({ from: '01/03/2026', to: '2026-03-01' }), RangeError);
});

test('buildQuery: con until, la primera carga de un periodo llega hasta ese día, sin incluirlo', () => {
  const { sql, binds } = buildQuery({ floor: '2026-03-01 00:00:00.000', since: null, until: '2026-04-01 00:00:00.000' });
  assert.match(sql, /AND REPORTEDDATE < TO_TIMESTAMP_NTZ\(\?, 'YYYY-MM-DD HH24:MI:SS.FF3'\)/);
  assert.deepEqual(binds, ['2026-03-01 00:00:00.000', '2026-04-01 00:00:00.000']);
  assert.deepEqual(buildQuery({ floor: FIRST_LOAD, since: null }).binds, [FIRST_LOAD]);
});

test('firstLoadRange: desde el primer día hasta el último incluido; fechas que no valen, RangeError', () => {
  assert.deepEqual(firstLoadRange({ from: '2026-02-28', to: '2026-03-01' }),
    { floor: '2026-02-28 00:00:00.000', since: null, until: '2026-03-02 00:00:00.000' });
  assert.throws(() => firstLoadRange({ from: '2026-02-30', to: '2026-03-01' }), RangeError);
  assert.throws(() => firstLoadRange({ from: '2026-03-02', to: '2026-03-01' }), RangeError);
});
