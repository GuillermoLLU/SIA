import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { startBlocks, slaStats, slaPair, commonModules } from './sla.js';

const model = (sides = [{ company: 0 }, null]) => { const m = createModel(data()); m.S.sides = sides; m.refilter(); return m; };

test('cuándo pasan a En curso: por prioridad, con el tramo hasta el que se está en plazo', () => {
  const m = model(), list = m.rows(), { blocks, max } = startBlocks(m, list, [list]);
  assert.deepEqual(blocks.map((b) => [b[0].label, b[0].n, b[0].lim, b[0].c.indexOf(1)]),
    [['Crítica · 0,25 h', 1, 0, 0], ['Media · 2 h', 1, 2, 7], ['Baja · 8 h', 1, 3, 8], ['Todas', 3, -1, 0]]);   // 7: abierta sin empezar; 8: cerrada sin En curso
  assert.equal(max, 1);
});

test('los indicadores con el SLA de cada prioridad', () => {
  const m = model(), s = slaStats(m)(m.rows());
  assert.equal(s.sla, 0.5);
  assert.deepEqual([s.byP[1], s.byP[3], s.byP[4]], [1, 0, null]);   // crítica a tiempo; media abierta y vencida; baja cerrada sin En curso
  assert.deepEqual([s.nP[1], s.nP[3], s.nP[4]], [1, 1, 1]);
});

test('comparando: lo de cada lado por persona, y los módulos que tienen los dos', () => {
  const m = model([{ company: 0 }, { company: 1 }]), A = m.rows(), T = m.bySide(A);
  assert.deepEqual(slaPair(m, T).map((s) => [s.n, s.vol, s.H]), [[3, 3, 1], [1, 1, 1]]);
  assert.deepEqual(commonModules(m, A, T, 1).map((x) => x.k), [2]);   // PACKING: una de cada; EWMS solo de Indra
  assert.deepEqual(commonModules(m, A, T, 2), []);
});
