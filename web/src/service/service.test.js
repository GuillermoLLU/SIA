import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../metrics/model.js';
import { createService } from './service.js';

const DAY = 1440, IA_NOTE = 65536, REOPENED = 512, THIRD_PARTY = 131072;
const at = (d, h = 10) => d * DAY + h * 60;   // minutos desde el 1 de enero de 2025: día d, a las h
// Incidencias a medida: { rep, res, ip, pr, co (0 Indra, 1 T-Systems, 2 nadie), st (1 cerrada, 2 abierta), fl, the, tes, tsr }
const model = (issues, { jira = null, last = null } = {}) => {
  const n = issues.length, col = (f, d = 0) => issues.map((x, i) => f(x, i) ?? d);
  const snap = last ?? Math.max(...issues.flatMap((x) => [x.rep, x.res ?? -1]));
  const m = createModel({
    meta: { file: 'x', start: 2025, first: Math.min(...issues.map((x) => x.rep)), last: snap, group: 'G', rows: n, total: n, snapshot: snap, generated: 'g', jira },
    dict: { status: ['', 'CLOSED', 'ASSIGNED'], reason: [''], prio: ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], svc: [''], person: ['', 'ANA', 'LUIS'], centre: [''], op: [''], module: [''], cat: [''], vtype: [''], vproj: [''], vkey: [''], vtext: [''], resol: [''], problem: [''] },
    themes: [], reasons: { client: [], vendor: [] }, company: [2, 0, 1],
    cols: { id: col((_, i) => i + 1), rep: col((x) => x.rep), res: col((x) => x.res, -1), lm: col((x) => x.rep), st: col((x) => x.st, 1), rs: col(() => 0), pr: col((x) => x.pr, 2), sv: col(() => 0),
      as: col((x) => (x.co === 2 ? 0 : (x.co ?? 0) + 1)), ce: col(() => 0), op: col(() => 0), mo: col(() => 0), k3: col(() => 0), sc: col(() => 0), fl: col((x) => x.fl), vt: col(() => 0), vp: col(() => 0), vk: col(() => 0), vn: col(() => 0),
      fr: col((x) => x.ip, -1), ip: col((x) => x.ip, -1), tA: col(() => 0), tI: col(() => 0), tPc: col(() => 0), tPv: col(() => 0), tPo: col(() => 0), nb: col(() => 0), np: col(() => 0), th: col(() => 0), rz: col(() => 0), de: col(() => 0),
      the: col((x) => x.the, -1), tes: col((x) => x.tes, -1), tcr: col(() => -1), tsr: col((x) => x.tsr, -1), su: col(() => 't') },
  });
  m.refilter();
  return m;
};
const range = (a, b) => [a * DAY, (b + 1) * DAY];

test('uso de la IA: del periodo y de cada día, de las resueltas ese día (TC-03 de la #81)', () => {
  const V = createService(model([
    { rep: at(1), res: at(9) },                            // A: [ANALISIS], sin _IA
    { rep: at(2), res: at(9), fl: IA_NOTE },               // B: [DIAGNOSTICO_IA]
    { rep: at(3), res: at(10), fl: IA_NOTE },              // C y D: [ANALISIS_IA]
    { rep: at(4), res: at(10), fl: IA_NOTE },
  ])).compute(range(9, 10));
  assert.equal(V.stats.us.ia.share, 0.75);
  assert.deepEqual(V.daily.us.map((d) => d.ia.share), [0.5, 1]);
});

test('MTTR: un día sin resueltas no tiene valor y el periodo sale de los demás; en los conteos, ese día es 0 (TC-10)', () => {
  const V = createService(model([{ rep: at(24), res: at(24, 12) }, { rep: at(26), res: at(26, 16) }], { last: at(26, 20) })).compute(range(24, 26));
  assert.deepEqual(V.daily.us.map((d) => d.resolution.all.mttr), [120, null, 360]);
  assert.equal(V.stats.us.resolution.all.mttr, 240);
  assert.deepEqual(V.daily.us.map((d) => d.n), [1, 0, 1]);
});

test('el MTTR es de lo resuelto: las abiertas no cuentan; por prioridad, resto junta media y baja', () => {
  const V = createService(model([{ rep: at(1), res: at(1, 12), pr: 3 }, { rep: at(1), res: at(1, 14), pr: 4 }, { rep: at(1), st: 2, pr: 3 }], { last: at(5) })).compute(range(1, 5));
  assert.equal(V.stats.us.resolution.REST.mttr, 180);
  assert.equal(V.stats.us.resolution.REST.n, 2);
  assert.equal(V.stats.us.resolution.CRITICAL.mttr, null);
});

test('Tatt: en el día en que empieza; abierta sin empezar, el día en que se le pasa el plazo, y fuera; cerrada sin En curso, no cuenta (TC-02)', () => {
  const V = createService(model([
    { rep: at(1), ip: 10, pr: 1 },            // crítica (plazo 15 min), a tiempo
    { rep: at(1), ip: 60, pr: 1 },            // crítica, tarde
    { rep: at(1, 23), ip: 120, pr: 3 },       // media (2 h), a tiempo: empieza al día siguiente
    { rep: at(2), st: 2, pr: 4 },             // baja (8 h), abierta sin empezar
    { rep: at(2), res: at(2, 12), pr: 2 },    // cerrada sin En curso
  ], { last: at(3) })).compute(range(1, 3));
  const A = V.stats.us.action;
  assert.deepEqual([A.CRITICAL.ok, A.CRITICAL.ko, A.CRITICAL.share, A.CRITICAL.avg], [1, 1, 0.5, 35]);
  assert.deepEqual([A.MEDIUM.ok, A.LOW.ko, A.HIGH.ok + A.HIGH.ko], [1, 1, 0]);
  assert.deepEqual(V.daily.us.map((d) => [d.action.all.ok, d.action.all.ko]), [[1, 1], [1, 1], [0, 0]]);
});

test('entrantes y resueltas entrantes: resuelta después del día o del periodo, no cuenta como resuelta entrante', () => {
  const V = createService(model([{ rep: at(1), res: at(1, 12) }, { rep: at(1), res: at(2) }, { rep: at(2), res: at(9) }, { rep: at(0), res: at(1) }])).compute(range(1, 2));
  assert.deepEqual([V.stats.us.n, V.stats.us.resolvedIn, V.stats.us.inShare], [3, 2, 2 / 3]);
  assert.deepEqual(V.daily.us.map((d) => [d.n, d.resolvedIn]), [[2, 1], [1, 0]]);
});

test('reapertura: de las cerradas, el día de su resolución', () => {
  const V = createService(model([{ rep: at(1), res: at(2), fl: REOPENED }, { rep: at(1), res: at(2) }, { rep: at(1), res: at(2), st: 2 }])).compute(range(1, 2));
  assert.deepEqual([V.stats.us.reopen.all.done, V.stats.us.reopen.all.re, V.stats.us.reopen.all.share], [2, 1, 0.5]);
});

test('los lados: cada uno lo suyo; un día sin datos de T-Systems solo se nota en su serie (TC-06 y TC-11)', () => {
  const y = 365;   // 2026, desde el 1 de enero de 2025
  const V = createService(model([
    { rep: at(y + 20), res: at(y + 20, 12) },                 // Indra
    { rep: at(y + 19), res: at(y + 19, 11), co: 1 },          // T-Systems, otro día
    { rep: at(20), res: at(20, 14) },                         // Indra, un año antes
    { rep: at(20), res: at(20, 18), co: 1 },                  // T-Systems, un año antes: es el servicio entero de entonces
    { rep: at(y + 20), res: at(y + 20, 13), co: 2 },          // sin responsable: en ninguno
  ])).compute(range(y + 19, y + 20));
  assert.deepEqual(V.daily.us.map((d) => d.resolution.all.mttr), [null, 120]);
  assert.deepEqual(V.daily.ts.map((d) => d.resolution.all.mttr), [60, null]);
  assert.deepEqual(V.daily.prev.map((d) => d && d.resolution.all.mttr), [null, (240 + 480) / 2]);   // el primer día queda antes de lo cargado
  assert.equal(V.prevCover, 'partial');
});

test('un día de fuera de lo cargado no tiene ningún valor, tampoco en los conteos; el año anterior, si no llega, se dice', () => {
  const V = createService(model([{ rep: at(400), res: at(400, 12) }])).compute(range(399, 401));
  assert.deepEqual(V.daily.us.map((d) => d && d.n), [null, 1, null]);
  assert.equal(V.daily.prev[1], null);
  assert.equal(V.prevCover, 'none');
});

const ESCALATED = (d) => ({ rep: at(d), res: at(d + 3), the: 60, tes: DAY, fl: THIRD_PARTY });
test('THesc y Tesc: el día de su primer Jira y el de su solución', () => {
  const V = createService(model([ESCALATED(1)], { jira: { at: '2025-02-01T08:00:00Z', tickets: 1, message: '' } })).compute(range(1, 3));
  assert.deepEqual(V.daily.us.map((d) => [d.esc.thesc, d.esc.tesc]), [[60, null], [null, 1440], [null, null]]);
  assert.deepEqual([V.stats.us.esc.thesc, V.stats.us.esc.nTesc, V.stats.us.esc.n], [60, 1, 1]);
});

test('Tesc-r, solo de las abiertas; un ticket previo no cuenta en la media del THesc', () => {
  const V = createService(model([{ rep: at(1), st: 2, the: 60, tes: DAY, tsr: 300, fl: THIRD_PARTY }, { rep: at(1), the: -2, res: at(2), fl: THIRD_PARTY }], { jira: { at: '2025-02-01T08:00:00Z', message: '' }, last: at(5) })).compute(range(1, 5));
  assert.deepEqual([V.stats.us.esc.tescr, V.stats.us.esc.nThesc, V.stats.us.esc.previous], [300, 1, 1]);
});

test('Jira sin responder: sus métricas no tienen valor desde el día de la última vez que se trajo; el resto, sí (TC-13)', () => {
  const m = model([ESCALATED(1), { rep: at(3), res: at(3, 12), the: 30, tes: 60, fl: THIRD_PARTY }], { jira: { at: new Date(2025, 0, 4, 9).toISOString(), tickets: 2, message: 'No se llega a Jira' } });
  const V = createService(m).compute(range(1, 3));
  assert.deepEqual(V.daily.us.map((d) => d.esc.thesc), [60, null, null]);   // el día 3 no se sabe: Jira no respondió
  assert.equal(V.stats.us.esc.thesc, 60);
  assert.equal(V.daily.us[2].resolution.all.mttr, 120);   // lo de Remedy, con normalidad
});

test('Jira nunca traído: sus métricas no tienen valor', () => {
  const V = createService(model([ESCALATED(1)])).compute(range(1, 3));
  assert.equal(V.stats.us.esc.thesc, null);
  assert.equal(V.stats.us.esc.n, 1);
});

test('un día del último año: tantos valores como días, sin agrupar (TC-09)', () => {
  const V = createService(model([{ rep: at(400), res: at(400, 12) }])).compute(range(40, 404));
  assert.equal(V.days.length, 365);
  assert.equal(V.daily.us.length, 365);
});
