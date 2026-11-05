import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutRange, rangeError, toMinutes, parseDay, isoOf, todayOf } from './period.js';

const TODAY = parseDay('2026-10-30');
const range = (k, t = TODAY) => { const r = shortcutRange(k, t); return [isoOf(r.from), isoOf(r.to)]; };

test('los atajos acaban ayer (TC-01, TC-04, TC-09 y TC-15 de la #81)', () => {
  assert.deepEqual(range('7d'), ['2026-10-23', '2026-10-29']);
  assert.deepEqual(range('14d'), ['2026-10-16', '2026-10-29']);
  assert.deepEqual(range('1m'), ['2026-09-30', '2026-10-29']);
  assert.deepEqual(range('3m'), ['2026-07-30', '2026-10-29']);
  assert.deepEqual(range('1y'), ['2025-10-30', '2026-10-29']);
});

test('un mes antes de un día que ese mes no tiene: su último día', () => {
  assert.deepEqual(range('1m', parseDay('2026-03-31')), ['2026-02-28', '2026-03-30']);
  assert.deepEqual(range('1y', parseDay('2028-02-29')), ['2027-02-28', '2028-02-28']);
});

test('el último año son 365 días (TC-09)', () => {
  const [d0, d1] = toMinutes(shortcutRange('1y', TODAY), Date.UTC(2025, 0, 1));
  assert.equal((d1 - d0) / 1440, 365);
});

test('un rango a mano: un solo día vale (TC-08); ni hoy, ni futuro, ni fin antes del inicio (TC-14 y TC-15)', () => {
  assert.equal(rangeError('2026-10-29', '2026-10-29', TODAY), '');
  assert.equal(rangeError('2026-09-01', '2026-09-15', TODAY), '');
  assert.match(rangeError('2026-10-15', '2026-10-10', TODAY), /anterior a la de inicio/);
  assert.match(rangeError('2026-10-30', '2026-10-30', TODAY), /hasta ayer/);
  assert.match(rangeError('2026-10-20', '2026-11-05', TODAY), /hasta ayer/);
  assert.match(rangeError('', '2026-10-05', TODAY), /Elige/);
  assert.match(rangeError('2026-02-30', '2026-03-05', TODAY), /Elige/);
});

test('el periodo en minutos, con el último día entero', () => {
  assert.deepEqual(toMinutes({ from: parseDay('2026-01-02'), to: parseDay('2026-01-02') }, Date.UTC(2026, 0, 1)), [1440, 2880]);
});

test('hoy, por la fecha del reloj de quien mira', () => {
  assert.equal(isoOf(todayOf(new Date(2026, 9, 30, 23, 30))), '2026-10-30');
});
