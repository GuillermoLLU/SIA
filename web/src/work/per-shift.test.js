import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftCounts, perTurn, teamPerTurn, sessionAt } from './per-shift.js';

const H = 60;
const model = ({ rep, sp, sessions, company = [2, 0, 0, 1] }) => ({
  N: rep.length, S: { sides: [{ company: 0 }, null] }, C: { rep, sp }, data: { sessions, company },
});

test('los pasos son de quien los hizo y cuentan con su sesión; entrante, si la incidencia se abrió en las 8 h que acaban con ella', () => {
  const sessions = [[], [[10 * H, 20 * H, 1], [40 * H, 41 * H, 0.125]], [], []];
  const m = model({
    rep: [13 * H, 5 * H, 41 * H, 13 * H],
    sp: [
      [[0, 15 * H, 1]],                      // la 1, abierta dentro de las 8 h de la sesión (de 12 h a 20 h): entrante
      [[1, 16 * H, 1]],                      // la 2, abierta antes: backlog
      [[2, 40 * H, 1]],                      // la 3, abierta después de actuar pero dentro de la sesión: entrante
      [[0, 18 * H, 3]],                      // otra empresa: no cuenta
    ],
    sessions,
  });
  const c = shiftCounts(m, [0, 100 * H]);
  const ana = c.get(1);
  assert.equal(ana.turns, 1.125);
  assert.deepEqual([ana.r, ana.v, ana.c], [[1, 0], [0, 1], [1, 0]]);
  assert.equal(c.has(3), false);
  const r = perTurn(ana);
  assert.equal(r.r, 1 / 1.125);
  assert.equal(r.vb, 1 / 1.125);
});

test('una sesión que dura más de 8 h: la ventana de entrantes es la sesión entera', () => {
  const m = model({ rep: [11 * H], sp: [[[0, 25 * H, 1]]], sessions: [[], [[10 * H, 26 * H, 2]], [], []] });
  assert.deepEqual(shiftCounts(m, [0, 100 * H]).get(1).r, [1, 0]);
});

test('una sesión cuenta entera en el periodo en que termina, con sus pasos, y se puede limitar a unos días', () => {
  const sessions = [[], [[23 * H, 25 * H, 0.25], [50 * H, 60 * H, 1]], [], []];
  const m = model({ rep: [0, 0], sp: [[[0, 23.5 * H, 1]], [[0, 55 * H, 1]]], sessions });
  const day2 = shiftCounts(m, [24 * H, 48 * H]).get(1);   // empezó el día anterior, termina en este
  assert.equal(day2.turns, 0.25);
  assert.deepEqual(day2.r, [0, 1]);
  assert.equal(shiftCounts(m, [0, 24 * H]).has(1), false);
  const kept = shiftCounts(m, [0, 100 * H], (to) => to >= 48 * H).get(1);
  assert.equal(kept.turns, 1);
  assert.deepEqual(kept.r, [0, 1]);
});

test('la media del equipo: su total entre sus turnos; sin turnos, sin cifra', () => {
  const sessions = [[], [[0, 4 * H, 1]], [[0, 4 * H, 1], [10 * H, 11 * H, 0.125]], []];
  const m = model({ rep: [0, 0, 0], sp: [[[0, H, 1]], [[0, H, 2]], [[0, 10 * H, 2]]], sessions });
  const t = teamPerTurn(shiftCounts(m, [0, 100 * H]));
  assert.equal(t.turns, 2.125);
  assert.equal(t.r, 3 / 2.125);
  assert.equal(perTurn(undefined).r, null);
});

test('la sesión de un instante; sin sesiones del bridge (de antes), nada', () => {
  assert.deepEqual(sessionAt([[0, 5, 1], [10, 20, 1]], 12), [10, 20, 1]);
  assert.equal(sessionAt([[0, 5, 1]], 7), undefined);
  assert.equal(shiftCounts(model({ rep: [0], sp: [[]], sessions: undefined }), [0, 1e6]), null);
});
