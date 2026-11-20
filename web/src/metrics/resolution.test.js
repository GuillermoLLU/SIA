import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { hoursOf, mttrOf, idmttr, idmttrOf, escalated, escalationTimes, jiraComparison, toggleProject, variation, JIRA_MAX, solved, ttrBlocks, bestOf, resolutionParts, partValue, partWorse, resolvedPair, modulesBySide } from './resolution.js';

test('MTTR e IDMTTR (#48): las abiertas cuentan lo que llevan; una cancelada sin resolver, no; IDMTTR = (horas − MTTR) / nº', () => {
  const m = { SNAP: 1000, OPEN: [0, 1, 0, 0], C: { rep: [0, 600, 0, 0], res: [100, -1, 700, -1] } };   // resuelta 100, abierta 400, resuelta 700, cancelada
  assert.deepEqual([0, 1, 2, 3].map((i) => hoursOf(m, i)), [100, 400, 700, null]);
  const base = mttrOf(m, [0, 1, 2, 3]);
  assert.deepEqual(base, { mttr: 400, n: 3 });
  assert.equal(idmttr(700, base), 100);       // sube el MTTR 100 min
  assert.equal(idmttr(100, base), -100);
  assert.equal(idmttr(null, base), null);
  assert.equal(idmttr(10, mttrOf(m, [])), null);
});

test('IDMTTR de un grupo (#48): MTTR con ellas − MTTR sin ellas; las de fuera del periodo no lo mueven', () => {
  const m = { SNAP: 1000, OPEN: [0, 1, 0, 0, 1], C: { rep: [0, 600, 0, 0, -5000], res: [100, -1, 700, -1, -1] } };   // la 4, abierta desde antes del periodo: 6000
  const A = [0, 1, 2, 3];                                       // el periodo: MTTR 400 de 3
  assert.equal(idmttrOf(m, A, [2]), 400 - 250);                // sin la de 700, MTTR 250
  assert.equal(idmttrOf(m, A, [1, 2]), 400 - 100);             // exacto: no (400 + 700 − 2·400) / 3
  assert.equal(idmttrOf(m, A, [4]), 0);                        // fuera del periodo: no lo mueve
  assert.equal(idmttrOf(m, A, [2, 4]), 150);
  assert.equal(idmttrOf(m, A, [0, 1, 2]), null);               // sin ellas no queda MTTR
  assert.equal(idmttrOf(m, [], [1]), null);
});

test('escalada, como en la #48: la que ha estado en Pendiente de un tercero, tenga o no ticket', () => {
  const esc = escalated({ C: { fl: [131072, 0, 131072 | 512], vt: [0, 1, 1] } });
  assert.deepEqual([0, 1, 2].map(esc), [true, false, true]);
});

test('los tiempos de las escaladas: THesc y Tesc, de las que los tienen; un ticket previo no cuenta; el total, de todas', () => {
  const m = { C: { rep: [0, 100, 200], res: [300, 500, 500], the: [60, -2, -1], tes: [120, 240, -1], tsr: [30, -1, 90] } };
  const t = escalationTimes(m, [0, 1, 2]);
  assert.equal(t.n, 3);
  assert.deepEqual(t.the, { n: 1, avg: 60 });
  assert.deepEqual(t.tes, { n: 2, avg: 180 });
  assert.deepEqual(t.tsr, { n: 2, avg: 60 });   // Tesc-r, de las que lo tienen
  assert.deepEqual(t.total, { n: 3, avg: (300 + 400 + 300) / 3 });
  assert.deepEqual(escalationTimes(m, []), { n: 0, the: { n: 0, avg: null }, tes: { n: 0, avg: null }, tsr: { n: 0, avg: null }, total: { n: 0, avg: null }, jiraOpen: 0 });
  // cerrada con su Jira aún abierto: su Tesc, desde que se creó el Jira (apertura + THesc) hasta la resolución en
  // Remedy, no hasta la última carga (y no cuenta como Jira aún abierto: su Tesc ya no corre)
  const open = escalationTimes({ SNAP: 1000, C: { rep: [100, 0], res: [200, 10], the: [50, 5], tes: [-1, -1], fl: [524288, 0] } }, [0, 1]);
  assert.deepEqual([open.tes, open.jiraOpen], [{ n: 1, avg: 200 - 100 - 50 }, 0]);
  // resuelta en Remedy con el Jira resuelto después: su Tesc, también hasta la resolución en Remedy
  assert.deepEqual(escalationTimes({ C: { rep: [0], res: [300], the: [60], tes: [500], fl: [0] } }, [0]).tes, { n: 1, avg: 240 });
  // abierta en Remedy: el total, hasta la última carga; con el Jira sin resolver, también su Tesc; resuelto, el suyo
  const live = escalationTimes({ SNAP: 1000, OPEN: [1, 1, 1], C: { rep: [100, 200, 300], res: [-1, -1, -1], the: [50, 20, -1], tes: [-1, 30, -1], fl: [0, 0, 0] } }, [0, 1, 2]);
  assert.deepEqual(live.total, { n: 3, avg: (900 + 800 + 700) / 3 });
  assert.deepEqual([live.tes, live.jiraOpen], [{ n: 2, avg: (850 + 30) / 2 }, 1]);
  assert.equal(escalationTimes({ C: { rep: [0], res: [10] } }, [0]).the.avg, null);   // sin datos de Jira
});

test('la comparativa de proyectos: de partida, solo la media; lo elegido, si sigue; y los tiempos de cada uno y de todos', () => {
  const vp = [1, 1, 1, 2, 2, 3, 4], C = { vp, rep: vp.map(() => 0), res: vp.map(() => 60), the: vp.map((p) => p * 10), tes: vp.map((p) => (p === 1 ? -1 : 100)) };
  const m = { C, DIMS: { vp: { label: (k) => `P${k}` } }, group: (_, list) => [1, 2, 3, 4].map((k) => { const rows = list.filter((i) => vp[i] === k); return { k, n: rows.length, rows }; }).filter((g) => g.n) };
  const all = vp.map((_, i) => i), start = jiraComparison(m, all);
  assert.deepEqual(start.options.map((o) => [o.label, o.n]), [['P1', 3], ['P2', 2], ['P3', 1], ['P4', 1]]);
  assert.deepEqual(start.picked, []);
  assert.deepEqual(start.shown, []);
  assert.equal(start.global.n, 7);
  const one = jiraComparison(m, all, [1]);
  assert.equal(one.shown[0].times.the.avg, 10);
  assert.equal(one.shown[0].times.tes.avg, null);   // sin ese dato: sin barra
  assert.deepEqual(jiraComparison(m, all, [4, 9]).picked, [4]);   // el 9 ya no está
  assert.deepEqual(jiraComparison(m, all, [9]).picked, []);
});

test('la variación frente a la media: más tiempo, en rojo y con +; menos, en verde y con −; lo que redondea a 0, sin color', () => {
  assert.deepEqual(variation(83, 71), { text: '+17 %', cls: 'mt-up' });
  assert.deepEqual(variation(27, 71), { text: '−62 %', cls: 'mt-down' });
  assert.deepEqual(variation(71.2, 71), { text: '0 %', cls: '' });
  assert.equal(variation(null, 71), null);
  assert.equal(variation(10, null), null);
});

test('elegir proyectos: clic, solo ese (otra vez, quitarlo); con Ctrl, se añaden y se quitan, sin pasar del máximo', () => {
  assert.deepEqual(toggleProject([1], 3), [3]);              // otro: se cambia a ese
  assert.deepEqual(toggleProject([3], 3), []);               // el mismo: se quita
  assert.deepEqual(toggleProject([1, 2], 1), [2]);           // uno de varios: se quita ese
  assert.deepEqual(toggleProject([1, 2], 3, true), [1, 2, 3]);
  assert.deepEqual(toggleProject([1, 2], 1, true), [2]);
  assert.deepEqual(toggleProject([2], 2, true), []);
  assert.deepEqual(toggleProject([], 2, true), [2]);
  const full = Array.from({ length: JIRA_MAX }, (_, i) => i + 1);
  assert.deepEqual(toggleProject(full, 99, true), full);
  assert.deepEqual(toggleProject(full, 99), [99]);
});

const model = (d = data(), sides = [{ company: 0 }, { company: 1 }]) => { const m = createModel(d); m.S.sides = sides; m.refilter(); return m; };
// n issues más, copiando la primera con cambios
const grow = (d, n, patch = {}) => { for (let j = 0; j < n; j++) for (const k of Object.keys(d.cols)) d.cols[k].push(patch[k]?.(j) ?? d.cols[k][0]); d.meta.rows += n; return d; };

// la primera, escalada: ha estado en Pendiente de un tercero
const withEscalated = () => { const d = data(); d.cols.fl[0] |= 131072; return d; };

test('cuánto tardan: sin escalar, escaladas y todas, repartidas en los tramos de tiempo', () => {
  const m = model(withEscalated()), A = m.rows(), R = A.filter(solved(m));
  assert.deepEqual(R, [0, 1, 3]);
  const { blocks, max } = ttrBlocks(m, A, [R]);
  assert.deepEqual(blocks.map((b) => [b[0].label, b[0].n, b[0].c]), [['Sin escalar', 2, [0, 1, 0, 0, 1, 0, 0, 0]], ['Escaladas', 1, [0, 1, 0, 0, 0, 0, 0, 0]], ['Todas las resueltas', 3, [0, 2, 0, 0, 1, 0, 0, 0]]]);
  assert.equal(max, 1);
  const [x, o] = [blocks[0][0], blocks[1][0]];   // sin escalar 50 % en < 24 h; escaladas 100 %
  assert.equal(bestOf(o, x, [0, 1, 2, 3], 'high'), true);
  assert.equal(bestOf(x, o, [0, 1, 2, 3], 'high'), false);
  assert.equal(bestOf(x, o, [0, 1, 2, 3], null), false);
});

test('mes a mes: lo resuelto de una lista en tres partes, y el valor de un dato solo si hay resueltas', () => {
  const m = model(withEscalated()), parts = resolutionParts(m)(m.rows());
  assert.equal(parts.a.escShare, 1 / 3);
  assert.deepEqual([parts.n.resolved, parts.e.resolved], [2, 1]);
  const avg = ['Media', 'a', (s) => s.avg, null, 'low'];
  assert.ok(Math.abs(partValue(parts, avg) - (60 + 3000 + 100) / 3) < 1e-9);
  assert.equal(partValue(resolutionParts(m)([2]), avg), null);
  assert.equal(partWorse(parts, avg, 2000, parts), false);   // con menos de 30 resueltas no se marca
});

test('comparando personas: lo resuelto de cada lado por persona y los módulos del que lleva', () => {
  const m = model(data(), [{ people: new Set([1]) }, { company: 0 }]), A = m.rows(), R = A.filter(solved(m)), T = m.bySide(R);
  const pair = resolvedPair(m, T);
  assert.deepEqual(pair.map((s) => [s.resolved, s.vol, s.H]), [[2, 2, 1], [2, 2, 1]]);   // ANA es todo su equipo
  const { top, rest, all } = modulesBySide(m, R, T, 0, 1);
  assert.deepEqual([top.map((x) => x.k), rest, all], [[1], [3], 2]);   // EWMS primero; PACKING, al resto
});
