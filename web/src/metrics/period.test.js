import test from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel, daysLabel, periodSummary, sideDay, lastDays, pickMonth, wholeMonth, pickDay, shiftYear, sideHtml, periodPanel } from './period.js';
import { createModel } from './model.js';
import { data } from './fixture.js';

// la foto es el 11 de marzo de 2026; las issues, del 1 de enero al 11 de marzo
const model = () => createModel(data());
const at = (mo, d) => (Date.UTC(2026, mo, d) - Date.UTC(2026, 0, 1)) / 6e4;
// los mismos datos, empezando un año antes: de enero de 2025 a marzo de 2026
const twoYears = () => {
  const d = data(), year = 365 * 1440;
  d.meta.start = 2025; d.meta.first = 0; d.meta.snapshot += year; d.meta.last += year;
  return createModel(d);
};
// los números de los botones (data-pick-month o data-pick-day) con la clase dada, o deshabilitados
const withClass = (html, attr, cls) => [...html.matchAll(new RegExp(`data-pick-${attr}="\\w+:(-?\\d+)" class="([^"]*)"`, 'g'))].filter((x) => x[2].split(' ').includes(cls)).map((x) => Number(x[1]));
const disabled = (html, attr) => [...html.matchAll(new RegExp(`data-pick-${attr}="\\w+:(-?\\d+)" class="[^"]*" disabled`, 'g'))].map((x) => Number(x[1]));

test('el texto del periodo: siempre de qué fecha a qué fecha, y cuántos días', () => {
  const m = model();
  assert.equal(periodLabel(m), '01/01/2026 – 11/03/2026');
  assert.equal(periodSummary(m), '01/01/2026 – 11/03/2026 · 70 días');
  m.setPeriod(at(1, 1), at(1, 2));
  assert.equal(periodLabel(m), '01/02/2026 – 01/02/2026');
  assert.equal(daysLabel(m), '1 día');
});

test('el periodo de partida: el año fiscal en curso, del 1 de febrero a la foto; en enero, desde el febrero anterior', () => {
  const m = twoYears();
  m.resetPeriod();
  assert.equal(periodLabel(m), '01/02/2026 – 11/03/2026');
  const d = data(), year = 365 * 1440;   // la foto, el 11 de enero de 2026: desde el 1 de febrero de 2025
  d.meta.start = 2025; d.meta.first = 0; d.meta.snapshot = year + 10 * 1440 + 600; d.meta.last = d.meta.snapshot;
  const jan = createModel(d);
  jan.resetPeriod();
  assert.equal(periodLabel(jan), '01/02/2025 – 11/01/2026');
});

test('los últimos días: contando el de la foto; con menos cargados, desde el primero', () => {
  const m = model();
  m.setPeriod(...lastDays(m, 15));
  assert.equal(periodLabel(m), '25/02/2026 – 11/03/2026');
  assert.equal(daysLabel(m), '15 días');
  m.setPeriod(...lastDays(m, 1000));
  assert.equal(m.S.d0, m.MIN_D);
});

test('el rango se limita a lo cargado: ni antes del primer día con incidencias ni después de la foto', () => {
  const m = model();
  m.setPeriod(at(0, 1) - 99999, at(5, 1));
  assert.deepEqual([m.S.d0, m.S.d1], [m.MIN_D, m.END_D]);
  assert.deepEqual([sideDay(m, 'from'), sideDay(m, 'to')], [at(0, 1), at(2, 11)]);
});

test('un mes en «Desde» empieza el día 1; en «Hasta», acaba el último día con datos (el de la foto en el mes en curso)', () => {
  const m = model();
  m.setPeriod(at(0, 10), at(2, 5));
  assert.deepEqual(pickMonth(m, 'from', 1), [at(1, 1), at(2, 5)]);
  assert.deepEqual(pickMonth(m, 'to', 1), [at(0, 10), at(2, 1)]);     // hasta el 28 de febrero, incluido
  assert.deepEqual(pickMonth(m, 'to', 2), [at(0, 10), m.END_D]);      // marzo: hasta la foto
});

test('si un mes deja el otro extremo al revés, ese extremo se mueve a ese mismo mes', () => {
  const m = model();
  m.setPeriod(at(0, 10), at(0, 20));   // del 10 al 19 de enero
  assert.deepEqual(pickMonth(m, 'from', 1), [at(1, 1), at(2, 1)]);    // «Desde» febrero: «Hasta» pasa a fin de febrero
  m.setPeriod(at(1, 10), at(1, 20));   // del 10 al 19 de febrero
  assert.deepEqual(pickMonth(m, 'to', 0), [at(0, 1), at(1, 1)]);      // «Hasta» enero: «Desde» pasa al 1 de enero
});

test('doble clic en un mes: ese mes entero, del día 1 al último con datos, sea cual sea el periodo de antes', () => {
  const m = model();
  m.setPeriod(at(0, 10), at(2, 5));
  assert.deepEqual(wholeMonth(m, 1), [at(1, 1), at(2, 1)]);   // febrero entero, hasta el 28 incluido
  assert.deepEqual(wholeMonth(m, 2), [at(2, 1), m.END_D]);    // el mes en curso: hasta la foto
  m.setPeriod(...wholeMonth(m, 0));
  assert.equal(periodLabel(m), '01/01/2026 – 31/01/2026');
});

test('un día fija su extremo; si deja el otro al revés, el otro pasa al fin o al principio del mes de ese día', () => {
  const m = model();
  m.setPeriod(at(1, 10), at(1, 20));   // del 10 al 19 de febrero
  assert.deepEqual(pickDay(m, 'from', at(1, 5)), [at(1, 5), at(1, 20)]);
  assert.deepEqual(pickDay(m, 'to', at(1, 25)), [at(1, 10), at(1, 26)]);   // el día elegido, incluido
  assert.deepEqual(pickDay(m, 'from', at(1, 25)), [at(1, 25), at(2, 1)]);  // después del fin: fin de febrero
  assert.deepEqual(pickDay(m, 'to', at(0, 15)), [at(0, 1), at(0, 16)]);    // antes del inicio: 1 de enero
});

test('cambiar de año solo se mueve entre los meses con datos', () => {
  const m = twoYears();
  assert.equal(shiftYear(m, 14, -1), 2);    // marzo de 2026 → marzo de 2025
  assert.equal(shiftYear(m, 2, -1), 0);     // antes de 2025 no hay: se queda en el primer mes con datos
  assert.equal(shiftYear(m, 10, 1), 14);    // noviembre de 2025 → hasta marzo de 2026, el último con datos
});

test('un lado: su fecha, su mes elegido sólido, el año con ‹ › y los meses y días sin datos apagados', () => {
  const m = twoYears();
  m.setPeriod(m.minuteOf(14, 3), m.minuteOf(14, 8));   // del 3 al 7 de marzo de 2026
  const from = sideHtml(m, 'from', 14);
  assert.match(from, /<p class="mt-pp-title">Desde<\/p>\s*<b class="mt-side-date">03\/03\/2026<\/b>/);
  assert.match(from, /<b>2026<\/b>/);
  assert.deepEqual(withClass(from, 'month', 'mt-edge'), [14]);
  assert.deepEqual(disabled(from, 'month'), [15, 16, 17, 18, 19, 20, 21, 22, 23]);   // de abril de 2026 en adelante
  assert.match(from, /data-year="from:-1" aria-label="Año anterior" >/);             // 2025 tiene datos
  assert.match(from, /data-year="from:1" aria-label="Año siguiente" disabled/);      // 2027, no
  assert.equal((from.match(/<span><\/span>/g) || []).length, 6);                     // el 1 de marzo de 2026 es domingo
  assert.deepEqual(withClass(from, 'day', 'mt-in'), [3, 4, 5, 6, 7].map((d) => m.minuteOf(14, d)));
  assert.deepEqual(withClass(from, 'day', 'mt-edge'), [m.minuteOf(14, 3), m.minuteOf(14, 7)]);
  assert.deepEqual(withClass(from, 'day', 'mt-today'), [m.minuteOf(14, 11)]);
  assert.equal(disabled(from, 'day').length, 20);                                     // del 12 al 31: después de la foto
  assert.match(sideHtml(m, 'to', 14), /Hasta<\/p>\s*<b class="mt-side-date">07\/03\/2026/);
});

test('un lado que enseña otro año: ese mes con borde, y el elegido sigue siendo el de su fecha', () => {
  const m = twoYears();
  m.resetPeriod();                       // de febrero a marzo de 2026
  const html = sideHtml(m, 'from', 2);   // enseña marzo de 2025
  assert.match(html, /<b>2025<\/b>/);
  assert.deepEqual(withClass(html, 'month', 'mt-shown'), [2]);
  assert.deepEqual(withClass(html, 'month', 'mt-edge'), []);   // su mes elegido (marzo de 2026) no está en esta fila
  assert.match(html, /data-year="from:-1" aria-label="Año anterior" disabled/);
});

test('el panel: cabecera con el periodo y los dos lados, con los meses a la izquierda de los días; sin «Listo» ni campos de texto ni accesos rápidos', () => {
  const m = model();
  m.setPeriod(at(0, 15), at(1, 16));
  const html = periodPanel(m, { from: 0, to: 1 });
  assert.match(html, /<b>15\/01\/2026 – 15\/02\/2026 · 32 días<\/b>/);
  assert.doesNotMatch(html, /data-done|Listo/);   // cada elección se aplica al momento
  // en cada lado, el año y los meses en una columna y, a su derecha, los días
  assert.match(html, /mt-side-body">\s*<div class="mt-mcol">[\s\S]*?mt-months[\s\S]*?<\/div>\s*<\/div>\s*<div class="mt-days">/);
  assert.match(html, /Desde[\s\S]*Hasta/);
  assert.doesNotMatch(html, /<input|data-last|data-month-all|Todo/);
});
