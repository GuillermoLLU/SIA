import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyActivity, turnsByDay, comparePerDay, pickDays, activityPanel, axisDay } from './activity.js';

const DAY = 1440;
const dayName = (min) => `d${min / DAY}`;

test('cuenta cada paso en su día, solo los del periodo, una vez por incidencia y día, y solo de quien se mira', () => {
  const C = { sp: [[[0, 2 * DAY, 1], [1, 2 * DAY + 5, 1], [0, 2 * DAY + 9, 1], [0, 9 * DAY, 1]], [[0, 3 * DAY, 2], [2, 4 * DAY, 2]]] };
  const days = dailyActivity(C, [0, 1], [2 * DAY, 5 * DAY]);
  assert.deepEqual(days, [
    { day: 2 * DAY, r: 1, v: 1, c: 0 },
    { day: 3 * DAY, r: 1, v: 0, c: 0 },
    { day: 4 * DAY, r: 0, v: 0, c: 1 },
  ]);
  assert.deepEqual(dailyActivity(C, [0, 1], [2 * DAY, 3 * DAY], (p) => p === 2)[0], { day: 2 * DAY, r: 0, v: 0, c: 0 });
  assert.deepEqual(dailyActivity({}, [0], [0, DAY])[0], { day: 0, r: 0, v: 0, c: 0 });   // sin las columnas, sin nada
});

test('elegir días: un día, un rango en cualquier sentido; lo mismo otra vez vuelve al periodo de partida', () => {
  const start = [0, 10 * DAY];
  const one = pickDays(null, start, 3 * DAY, 3 * DAY);
  assert.deepEqual(one, { period: [3 * DAY, 4 * DAY], range: { base: start, days: [3 * DAY] } });
  assert.deepEqual(pickDays(one.range, one.period, 3 * DAY, 3 * DAY), { period: start, range: null });   // otra vez: se quita
  const back = pickDays(one.range, one.period, 5 * DAY, 2 * DAY);   // arrastrando hacia atrás; el de partida no cambia
  assert.deepEqual(back, { period: [2 * DAY, 6 * DAY], range: { base: start, days: [2 * DAY, 3 * DAY, 4 * DAY, 5 * DAY] } });
  assert.deepEqual(pickDays(back.range, back.period, 2 * DAY, 5 * DAY), { period: start, range: null });
});

test('con Ctrl: se suman días sueltos en cualquier orden, se quitan de uno en uno y, sin Ctrl, un día sustituye a todos', () => {
  const start = [0, 10 * DAY];
  let s = pickDays(null, start, 5 * DAY, 5 * DAY, true);
  s = pickDays(s.range, s.period, 1 * DAY, 1 * DAY, true);
  s = pickDays(s.range, s.period, 8 * DAY, 8 * DAY, true);
  assert.deepEqual(s, { period: [DAY, 9 * DAY], range: { base: start, days: [DAY, 5 * DAY, 8 * DAY] } });
  const less = pickDays(s.range, s.period, 5 * DAY, 5 * DAY, true);
  assert.deepEqual(less.range.days, [DAY, 8 * DAY]);
  assert.deepEqual(pickDays(s.range, s.period, 5 * DAY, 5 * DAY).range.days, [5 * DAY]);   // sin Ctrl: solo ese
  let out = pickDays(null, start, DAY, DAY, true);
  out = pickDays(out.range, out.period, DAY, DAY, true);
  assert.deepEqual(out, { period: start, range: null });   // quitando el último, vuelve al de partida
});

const days = [{ day: 0, r: 2, v: 1, c: 1 }, { day: DAY, r: 6, v: 0, c: 2 }];

test('la barra apila las tres series a escala, con su total, y el detalle sale al pasar el ratón', () => {
  const h = activityPanel(days, { title: 'Actividad', dayName });
  assert.match(h, /data-act-day="0" data-tip="d0\s+Resueltas: 2\s+Escaladas a proveedor: 1\s+Pendientes de cliente: 1\s+Total: 4"/);
  assert.match(h, /wk-act-r" style="height:[\d.]+%/);
  assert.match(h, /wk-act-n">8</);
  assert.match(h, /Resueltas <b>8</);
  assert.match(h, /Pincha un día para verlo y otra vez para quitarlo; Ctrl \+ clic/);
  assert.doesNotMatch(h, /undefined|NaN|wk-act-out|data-range-clear/);
});

test('con días elegidos: lo demás se atenúa, la leyenda suma solo lo elegido y se puede quitar', () => {
  const h = activityPanel(days, { title: 'A', dayName, sel: [DAY] });
  assert.match(h, /wk-act-out" data-act-day="0"/);
  assert.doesNotMatch(h, /wk-act-out" data-act-day="1440"/);
  assert.match(h, /Resueltas <b>6</);
  assert.match(h, /data-range-clear/);
});

test('una serie por turno: los pasos de una persona entre los turnos de sus sesiones que terminan ese día', () => {
  const C = { sp: [[[0, 100, 1], [0, 200, 1], [1, DAY + 100, 1]], [[0, 100, 2]]] };
  const sessions = [[], [[0, 300, 0.5], [DAY + 50, DAY + 150, 0.25]], [[0, 300, 1]]];
  const [d0, d1, d2] = turnsByDay(C, sessions, [0, 3 * DAY], 'r', 1);
  assert.deepEqual(d0, { day: 0, count: 2, turns: 0.5, value: 4 });
  assert.deepEqual(d1, { day: DAY, count: 0, turns: 0.25, value: 0 });   // solo escaló: trabajó, sin resolver
  assert.deepEqual(d2, { day: 2 * DAY, count: 0, turns: 0, value: null });
  assert.equal(turnsByDay(C, sessions, [0, 3 * DAY], 'v', 1)[1].value, 4);
});

test('una sesión que cruza la medianoche cuenta, con sus pasos, en el día en que termina', () => {
  const C = { sp: [[[0, DAY - 10, 1]]] };
  const [d0, d1] = turnsByDay(C, [[], [[DAY - 60, DAY + 60, 0.25]]], [0, 2 * DAY], 'r', 1);
  assert.equal(d0.value, null);
  assert.deepEqual(d1, { day: DAY, count: 1, turns: 0.25, value: 4 });
});

const compare = { per: 'turno', avg: 2, days: [{ day: 0, count: 6, turns: 2, value: 3 }, { day: DAY, count: 1, turns: 1, value: 1 }, { day: 2 * DAY, count: 0, turns: 0, value: null }] };
const threeDays = [{ day: 0, r: 6, v: 1, c: 1 }, { day: DAY, r: 1, v: 0, c: 0 }, { day: 2 * DAY, r: 0, v: 0, c: 0 }];

test('al pinchar una serie: solo ella, por turno, con la línea de la media y si queda por encima o por debajo', () => {
  const h = activityPanel(threeDays, { title: 'A', dayName, picked: 'r', compare });
  assert.equal((h.match(/class="wk-act-r" style/g) || []).length, 2);
  assert.doesNotMatch(h, /class="wk-act-[vc]" style/);
  assert.match(h, /Media del equipo: 2,0 por turno/);
  assert.match(h, /Por turno: 3,0\s+Media del equipo: 2,0\s+por encima de la media/);
  assert.match(h, /Por turno: 1,0\s+Media del equipo: 2,0\s+por debajo de la media/);
  assert.match(h, /wk-act-on" data-act-series="r" aria-pressed="true"/);
  assert.match(h, /wk-act-dim" data-act-series="v" aria-pressed="false"/);
  assert.match(h, /Resueltas por turno trabajado, frente a la media del equipo/);
  assert.match(h, /wk-act-n">3,0</);
  // la línea y las barras, a la misma escala
  const at = (re) => Number(h.match(re)[1]);
  assert.ok(Math.abs(at(/--at:([\d.]+)/) / at(/wk-act-r" style="height:([\d.]+)%/) - 2 / 3) < 0.001);
});

test('todo el equipo: lo de cada día frente a la media al día, contando también los días sin actividad', () => {
  const byDay = comparePerDay(threeDays, 'r');
  assert.deepEqual(byDay.days.map((d) => d.value), [6, 1, 0]);
  assert.ok(Math.abs(byDay.avg - 7 / 3) < 1e-9);
  const h = activityPanel(threeDays, { title: 'A', dayName, picked: 'r', compare: byDay });
  assert.match(h, /Media del equipo: 2,3 por día/);
  assert.match(h, /Resueltas por día, frente a la media del equipo/);
  assert.match(h, /Resueltas: 6\s+Media del equipo: 2,3\s+por encima de la media/);
  assert.match(h, /Resueltas: 1\s+Media del equipo: 2,3\s+por debajo de la media/);
  assert.match(h, /wk-act-n">6</);
  assert.doesNotMatch(h, /por turno|turnos/);
});

test('los turnos del detalle, con dos decimales: una fracción cuadra con los pasos por turno', () => {
  const h = activityPanel([{ day: 0, r: 1, v: 0, c: 0 }], { title: 'A', dayName, picked: 'r', compare: { per: 'turno', avg: 2, days: [{ day: 0, count: 1, turns: 0.25, value: 4 }] } });
  assert.ok(h.includes('Resueltas: 1 en 0,25 turnos'));
  assert.ok(h.includes('Por turno: 4,0'));
});

test('sin los turnos del bridge no se puede comparar: sigue la actividad y lo dice', () => {
  const h = activityPanel(threeDays, { title: 'A', dayName, picked: 'r', compare: null });
  assert.match(h, /Faltan los turnos para comparar: reinicia SIA/);
  assert.match(h, /class="wk-act-v" style/);
  assert.doesNotMatch(h, /wk-act-avg/);
});

test('cada barra con su día: en una línea; con más de 16, en tres; con más de 31, solo algunos', () => {
  const axis = axisDay(Date.UTC(2026, 9, 23));   // el minuto 0, viernes 23 de octubre de 2026
  assert.equal(axis(0), 'V 23 oct 2026');
  assert.equal(axis(3 * DAY), 'L 26 oct 2026');
  assert.equal(axis(2 * DAY), 'D 25 oct 2026');
  const panel = (length) => activityPanel(Array.from({ length }, (_, k) => ({ day: k * DAY, r: 1, v: 0, c: 0 })), { title: 'A', dayName, axis });
  const labels = (h) => (h.match(/wk-act-x">[VSDLMXJ] /g) || []).length;
  assert.equal(labels(panel(15)), 15);
  assert.match(panel(15), /wk-act-x">V 23 oct 2026</);
  assert.doesNotMatch(panel(15), /wk-act-tall/);
  assert.equal(labels(panel(31)), 31);
  assert.match(panel(31), /wk-act-tall/);
  assert.match(panel(31), /wk-act-x">V 23<br>oct<br>2026</);
  assert.ok(labels(panel(120)) <= 12);
});

test('con muchos días: sin totales encima, el máximo como referencia y solo algunas fechas', () => {
  const many = Array.from({ length: 120 }, (_, k) => ({ day: k * DAY, r: k, v: 0, c: 0 }));
  const h = activityPanel(many, { title: 'A', dayName });
  assert.doesNotMatch(h, /wk-act-n/);
  assert.match(h, /máx\. 119 al día/);
  assert.match(h, /wk-act-dense/);
  assert.ok((h.match(/wk-act-x">d/g) || []).length <= 12);
});
