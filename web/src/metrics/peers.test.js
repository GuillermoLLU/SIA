import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { personVsTeam, expectedAvg, expectedSla } from './peers.js';

const model = (sides) => { const m = createModel(data()); m.S.sides = sides; m.refilter(); return m; };

test('persona frente a su equipo: en qué lado está cada uno; si no es eso, nada', () => {
  assert.deepEqual(personVsTeam(model([{ people: new Set([1]) }, { company: 0 }])), { p: 0, t: 1 });
  assert.deepEqual(personVsTeam(model([{ company: 0 }, { people: new Set([1]) }])), { p: 1, t: 0 });
  assert.equal(personVsTeam(model([{ company: 0 }, { company: 1 }])), null);
  assert.equal(personVsTeam(model([{ company: 0 }, null])), null);
  assert.equal(personVsTeam(model([{ people: new Set([1]) }, { people: new Set([2]) }])), null);
});

test('lo que tardaría el equipo con los módulos de la persona: la media del equipo en cada uno, con su peso', () => {
  const m = model([{ people: new Set([1]) }, { company: 0 }]), pt = personVsTeam(m);
  const R = m.bySide(m.rows().filter((i) => m.DIMS.tb.get(i) < 8));
  const { own, expected, n } = expectedAvg(m, R, pt);
  assert.deepEqual([own, expected, n], [80, 80, [2, 2]]);   // ANA es todo el equipo: coincide
  assert.deepEqual(expectedAvg(m, [[], R[1]], pt), { own: null, expected: null, n: [0, 2] });
});

test('lo que cumpliría el otro con el mismo trabajo: por prioridad y módulo, con el peso de cada uno', () => {
  const m = model([{ company: 0 }, { company: 1 }]), T = m.bySide(m.rows());
  assert.equal(expectedSla(m, T[0], T[0]), 0.5);    // consigo mismo: su propio 50 %
  assert.equal(expectedSla(m, T[0], T[1]), null);   // el otro no tiene nada de esas prioridades
});
