import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { solved, ttrBlocks, bestOf, resolutionParts, partValue, partWorse, mixedEscalation, tickets, resolvedPair, modulesBySide } from './resolution.js';

const model = (d = data(), sides = [{ company: 0 }, { company: 1 }]) => { const m = createModel(d); m.S.sides = sides; m.refilter(); return m; };
// n issues más, copiando la primera con cambios
const grow = (d, n, patch = {}) => { for (let j = 0; j < n; j++) for (const k of Object.keys(d.cols)) d.cols[k].push(patch[k]?.(j) ?? d.cols[k][0]); d.meta.rows += n; return d; };

test('cuánto tardan: sin escalar, escaladas y todas, repartidas en los tramos de tiempo', () => {
  const m = model(), A = m.rows(), R = A.filter(solved(m));
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
  const m = model(), parts = resolutionParts(m)(m.rows());
  assert.equal(parts.a.escShare, 1 / 3);
  assert.deepEqual([parts.n.resolved, parts.e.resolved], [2, 1]);
  const avg = ['Media', 'a', (s) => s.avg, null, 'low'];
  assert.ok(Math.abs(partValue(parts, avg) - (60 + 3000 + 100) / 3) < 1e-9);
  assert.equal(partValue(resolutionParts(m)([2]), avg), null);
  assert.equal(partWorse(parts, avg, 2000, parts), false);   // con menos de 30 resueltas no se marca
});

test('lo que unas veces se escala y otras no, y los tickets con muchas incidencias: nada con tan pocas issues', () => {
  const m = model();
  assert.deepEqual(mixedEscalation(m, 12), { all: 0, shown: [], groups: [] });
  assert.deepEqual(tickets(m, m.rows()), []);
});

test('un ticket con 6 incidencias: abiertas, centros, primera y última y su problema', () => {
  const d = grow(data(), 5, { id: (j) => 10 + j, rep: (j) => 1000 + j * 1440 * 2, res: (j) => (j ? 1100 + j * 2880 : -1), st: (j) => (j ? 1 : 2) });
  const m = model(d), [t] = tickets(m, m.rows());
  assert.deepEqual([t.k, t.n, t.open, t.centres, t.first, t.last, t.span, t.problem], [1, 6, 1, 1, 1000, 1000 + 8 * 1440, 8, 1]);
});

test('comparando personas: lo resuelto de cada lado por persona y los módulos del que lleva', () => {
  const m = model(data(), [{ people: new Set([1]) }, { company: 0 }]), A = m.rows(), R = A.filter(solved(m)), T = m.bySide(R);
  const pair = resolvedPair(m, T);
  assert.deepEqual(pair.map((s) => [s.resolved, s.vol, s.H]), [[2, 2, 1], [2, 2, 1]]);   // ANA es todo su equipo
  const { top, rest, all } = modulesBySide(m, R, T, 0, 1);
  assert.deepEqual([top.map((x) => x.k), rest, all], [[1], [3], 2]);   // EWMS primero; PACKING, al resto
});
