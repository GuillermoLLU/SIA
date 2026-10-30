import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data, SNAP } from './fixture.js';
import { createService } from './service.js';

const IA_NOTE = 65536, THIRD_PARTY = 131072, BAD_ESCALATION = 262144;
const model = (d = data()) => { const m = createModel(d); m.refilter(); return m; };

test('los lados: Indra y T-Systems en el periodo; sin responsable, en ninguno', () => {
  const L = createService(model()).lists();
  assert.deepEqual([L.us, L.ts, L.prev], [[0, 2, 3], [1], []]);
});

test('Tatt: dentro del plazo de su prioridad; abierta sin empezar pasado el plazo, fuera; cerrada sin En curso, no cuenta', () => {
  const { stats: { us } } = createService(model()).compute();
  assert.deepEqual(us.action.all, { n: 3, ok: 1, ko: 1, share: 0.5, avg: 10 });   // crítica a los 10 min; media abierta 200 min (plazo 2 h)
  assert.equal(us.action.CRITICAL.share, 1);
  assert.equal(us.action.LOW.share, null);
});

test('MTTR continuo: resueltas con su TTR y abiertas con lo que llevan; el resto junta media y baja', () => {
  const { stats: { us } } = createService(model()).compute();
  assert.deepEqual([us.resolution.all.mttr, us.resolution.all.under], [(60 + 200 + 100) / 3, 1]);
  assert.deepEqual([us.resolution.CRITICAL.mttr, us.resolution.CRITICAL.max], [60, 60]);   // 60 no es < 1 h: no cumple
  assert.equal(us.resolution.REST.mttr, (200 + 100) / 2);
});

test('reapertura, de las cerradas', () => {
  const { stats: { us, ts } } = createService(model()).compute();
  assert.deepEqual(us.reopen.all, { done: 2, re: 0, share: 0 });
  assert.deepEqual(ts.reopen.all, { done: 1, re: 1, share: 1 });
});

test('entrantes y resueltas entrantes: una que entra y se resuelve después del periodo es entrante, no resuelta entrante (TC-07 de la #58)', () => {
  const d = data();
  d.cols.res[0] = SNAP + 2000;   // la crítica se resuelve después de acabar el periodo (END_D = 100.800)
  const m = model(d);
  m.setPeriod(0, 100800);
  const { stats: { us } } = createService(m).compute();
  assert.deepEqual([us.n, us.resolvedIn], [3, 1]);
});

test('mes a mes: entrantes y resueltas dentro del mes, por mes de apertura', () => {
  const { months } = createService(model()).compute();
  assert.deepEqual(months.map((x) => [x.k, x.us.n, x.us.resolvedIn]), [[0, 2, 2], [1, 0, 0], [2, 1, 0]]);
  assert.equal(months[2].label, 'mar*');
});

test('uso de la IA: de las resueltas, las que tienen nota _IA (TC-06 de la #58); escalados con sus tiempos de Jira', () => {
  const d = data();
  d.cols.fl[3] |= IA_NOTE | THIRD_PARTY | BAD_ESCALATION;
  d.cols.fl[0] |= THIRD_PARTY;
  Object.assign(d.cols, { the: [30, -1, -2, -1, -1], tes: [600, -1, -1, -1, -1], tsr: [-1, -1, 90, -1, -1] });
  const { stats: { us } } = createService(model(d)).compute();
  assert.deepEqual(us.ia, { done: 2, ia: 1, share: 0.5 });
  assert.deepEqual(us.esc, { n: 2, bad: 1, previous: 1, thesc: 30, nThesc: 1, tesc: 600, nTesc: 1, tescr: 90, nTescr: 1 });
});

test('el año anterior: el mismo periodo un año antes, con las dos empresas; si lo cargado no llega, se dice', () => {
  assert.equal(createService(model()).periods().prevCover, 'none');
  const d = data(), Y = 525600;   // 2025 tiene 365 días
  Object.assign(d.meta, { start: 2025, snapshot: Y + SNAP });
  d.cols.rep[2] = Y + 1000;       // la media abierta, en enero de 2026; las demás, en enero de 2025
  const m = model(d), svc = createService(m);
  m.setPeriod(Y, Y + 31 * 1440);
  assert.equal(svc.yearBack(Y), 0);
  assert.equal(svc.periods().prevCover, 'full');
  const L = svc.lists();
  assert.deepEqual([L.us, L.prev], [[2], [0, 1, 3]]);
});
