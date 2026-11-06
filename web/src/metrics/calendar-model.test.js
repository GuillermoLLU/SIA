import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarModel } from './calendar-model.js';
import { DAY } from './rules.js';

const NOW = new Date('2026-10-29T12:00:00Z');

test('el año en curso al abrir: del 1 de enero a hoy, incluido; los años anteriores se pueden enseñar', () => {
  const m = calendarModel(2020, { now: NOW });
  assert.equal(m.S.d0, m.minuteOf(72), '1 de enero de 2026 (72 meses desde 2020)');
  assert.equal(m.S.d1, m.END_D, 'hoy incluido');
  assert.equal(m.LASTM, 81, 'octubre de 2026');
  assert.equal(m.monthAt(m.minuteOf(0)), 0, 'enero de 2020 es el primer mes');
});

test('primera carga: desde el primer día del modelo, con los meses y días de 2026', () => {
  const m = calendarModel(2026, { now: NOW, openAt: 'start' });
  assert.equal(m.S.d0, 0);
  assert.equal(m.S.d1, m.END_D);
});

test('elegir fechas: no sale del periodo del modelo ni queda al revés', () => {
  const m = calendarModel(2026, { now: NOW, openAt: 'start' });
  m.setPeriod(-5 * DAY, 1e9);
  assert.equal(m.S.d0, 0, 'antes del primer día, se queda en el primero');
  assert.equal(m.S.d1, m.END_D, 'después de hoy, se queda en hoy');
  m.setPeriod(m.END_D, 0);
  assert.equal(m.S.d1 - m.S.d0, DAY, 'un día como mínimo');
});
