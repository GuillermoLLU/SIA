import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftCounts, perTurn, teamPerTurn } from './per-shift.js';

// turnos de 8 h desde las 7:00 (minuto 420): el turno s empieza en 420 + 480 s
const at = (s, plus = 10) => 420 + 480 * s + plus;
const model = (issues) => {
  const col = (f) => issues.map(f);
  return { C: { as: col((x) => x.as), rep: col((x) => x.rep), ip: col((x) => x.ip ?? -1), sR: col((x) => x.sR || []), sV: col((x) => x.sV || []), sC: col((x) => x.sC || []) } };
};

test('por turno: entrantes (entran en ese turno) y backlog (antes), en los turnos trabajados del periodo', () => {
  const m = model([
    { as: 1, rep: at(2), sR: [2] },            // entra y se resuelve en el turno 2: entrante
    { as: 1, rep: at(0), sR: [3] },            // entró en el turno 0, se resuelve en el 3: backlog
    { as: 1, rep: at(2), sV: [2], sC: [4] },   // a proveedor en su turno; a pendiente de cliente, dos turnos después
    { as: 1, rep: at(1), ip: 480 },            // la empieza en el turno 2: cuenta como trabajado, sin pasos que sumar
    { as: 2, rep: at(2), sR: [9] },            // fuera del periodo: no cuenta
    { as: 0, rep: at(2), sR: [2] },            // sin responsable: no cuenta
  ]);
  const c = shiftCounts(m, [0, 1, 2, 3, 4, 5], [at(2, 0), at(5, 0)]);
  const ana = c.get(1);
  assert.deepEqual([...ana.turns].sort(), [2, 3, 4]);
  assert.deepEqual([ana.r, ana.v, ana.c], [[1, 1], [1, 0], [0, 1]]);
  assert.equal(c.has(2), false);
  const r = perTurn(ana);
  assert.equal(r.turns, 3);
  assert.equal(r.r, 2 / 3); assert.equal(r.re, 1 / 3); assert.equal(r.rb, 1 / 3);
  assert.equal(r.v, 1 / 3); assert.equal(r.vb, 0); assert.equal(r.cb, 1 / 3);
});

test('por turno: el equipo, la media por persona y turno; sin turnos, sin cifra', () => {
  const m = model([{ as: 1, rep: at(0), sR: [0] }, { as: 2, rep: at(0), sR: [0, 1] }]);
  const t = teamPerTurn(shiftCounts(m, [0, 1], [0, at(9)]));
  assert.equal(t.turns, 3);   // 1 de ANA y 2 de PEPE
  assert.equal(t.r, 1);       // 3 resueltas entre 3 turnos
  assert.equal(perTurn(undefined).r, null);
});

test('por turno: sin los turnos del bridge (de antes), nada', () => {
  assert.equal(shiftCounts({ C: { as: [1], rep: [0], ip: [-1] } }, [0], [0, 1e6]), null);
});
