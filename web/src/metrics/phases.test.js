import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { phasesOf, phasesChart } from './phases.js';

const THIRD_PARTY = 131072;
const model = (d = data()) => { const m = createModel(d); m.refilter(); return m; };

test('sin escalar: los estados suman su TTR (lo de antes del primer cambio, a la cola); escaladas: sus tres tiempos de Jira', () => {
  const d = data();
  d.cols.fl[1] |= THIRD_PARTY;   // la alta de T-Systems: escalada, sin datos de Jira
  const m = model(d), P = phasesOf(m);
  // Indra, sin escalar y resueltas: la crítica (60 min: 10 en cola, 50 en curso) y la baja (100 min, 50 en cola y el resto sin estado)
  const us = P([0, 2, 3]);
  assert.deepEqual(us.plain, { n: 2, seg: [(10 + 100) / 2, 50 / 2, 0, 0] });
  assert.equal(us.plain.seg.reduce((a, b) => a + b, 0), (60 + 100) / 2);
  assert.deepEqual(P([1]).esc, { n: 0, out: { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 1 }, seg: [null, null, null] });
  Object.assign(d.cols, { the: [-1, 30, -1, -1, -1], tes: [-1, 2000, -1, -1, -1], tcr: [-1, 970, -1, -1, -1] });
  assert.deepEqual(phasesOf(model(d))([1]).esc, { n: 1, out: { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 0 }, seg: [30, 2000, 970] });
  // ligada a un ticket previo: fuera, y dice por qué
  d.cols.the[1] = -2;
  assert.equal(phasesOf(model(d))([1]).esc.out.previous, 1);
});

test('los tramos se apilan en su barra y suman su tiempo de resolución; una escalada sin Jira no cuenta y se dice por qué', () => {
  const d = data();
  d.cols.fl[0] |= THIRD_PARTY;   // la crítica de Indra, escalada (resuelta en 60 min), con sus tres tiempos de Jira
  Object.assign(d.cols, { the: [10, -1, -1, -1, -1], tes: [40, -1, -1, -1, -1], tcr: [10, -1, -1, -1, -1] });
  d.cols.fl[3] |= THIRD_PARTY;   // la baja, escalada pero sin datos de Jira
  const esc = phasesChart([{ who: 'Indra', p: phasesOf(model(d))([0, 2, 3]) }], { jiraAt: 'x' }).split('Sin escalar')[0];
  assert.equal((esc.match(/<i class="mt-svc-pe\d" style="flex-grow:/g) || []).length, 3);
  assert.match(esc, /<b>1 h<\/b>/);   // en horas: 10 + 40 + 10 min
  assert.match(esc, /Escalada en Jira \(Tesc\): 0,67 h \(67 %\)/);
  assert.match(esc, /1 escaladas resueltas\nFuera: 1 sin datos de Jira/);
});

test('la gráfica: dos barras, una fila por cada uno y solo las escaladas con Tesc; sin Jira traído, lo dice', () => {
  const m = model(), P = phasesOf(m);
  const html = phasesChart([{ who: 'Indra', p: P([0, 2, 3]) }, { who: 'T-Systems', p: P([1]) }]);
  const [esc, plain] = html.split('<p class="mt-svc-th"><b>Sin escalar</b>');
  assert.match(esc, /Escalada en Jira \(Tesc\)/);
  assert.doesNotMatch(plain, /Tesc/);
  assert.deepEqual([...html.matchAll(/<span class="mt-svc-who">([^<]*)<\/span>/g)].map((x) => x[1]), ['Indra', 'T-Systems', 'Indra', 'T-Systems']);
  assert.match(esc, /aún no se ha traído nada de Jira/);
  assert.match(phasesChart([{ who: 'Indra', p: P([0]) }], { jiraAt: '2026-11-02T16:00:00Z' }).split('Sin escalar')[0], /<em>sin datos<\/em>/);
});
