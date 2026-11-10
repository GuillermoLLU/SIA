import test from 'node:test';
import assert from 'node:assert/strict';
import { escalationOf, PREVIOUS } from './escalation.js';

const issue = (o) => ({ reported: 1000, resolved: -1, open: true, escalated: true, ...o });
const NOW = 10000;
const NONE = { thesc: -1, tesc: -1, tcr: -1, tescr: -1, bad: false, jiraOpen: false, early: false, misrouted: false, discarded: false, moved: false, routes: [] };

test('THesc: de la apertura al primero de sus tickets; si solo los hay anteriores, ticket previo', () => {
  assert.equal(escalationOf(issue(), [{ created: 1300, resolved: -1, status: 'Open' }, { created: 1100, resolved: -1, status: 'Open' }], NOW).thesc, 100);
  assert.equal(escalationOf(issue(), [{ created: 900, resolved: -1, status: 'Open' }], NOW).thesc, PREVIOUS);
  assert.equal(escalationOf(issue({ escalated: false }), [], NOW).thesc, -1);
});

test('Tesc empieza en el más antiguo de sus tickets aunque sea Discarded, y Tcr en el de solución final (TC-07 de la #48)', () => {
  const e = escalationOf(issue({ open: false, resolved: 5000 }),
    [{ created: 1100, resolved: 1500, status: 'Discarded' }, { created: 2000, resolved: 4000, status: 'Closed' }], NOW);
  assert.deepEqual(e, { ...NONE, thesc: 100, tesc: 4000 - 1100, tcr: 1000, misrouted: true, discarded: true });   // el Discarded: mal escalada
});

test('los tickets de otras incidencias que citan las notas no cuentan: solo los creados entre la apertura y el cierre', () => {
  // como INC000027617700: abierta y resuelta en el día, con tickets de agosto citados en las notas
  const e = escalationOf(issue({ open: false, resolved: 1600 }),
    [{ created: 200, resolved: 400, status: 'Cerrada' }, { created: 500, resolved: 900, status: 'Cerrada' }, { created: 1150, resolved: 1500, status: 'Cerrada' }, { created: 1700, resolved: 1800, status: 'Cerrada' }], NOW);
  assert.deepEqual(e, { ...NONE, thesc: 150, tesc: 350, tcr: 100 });
});

test('ligada a un ticket previo: ni se mide ni es mal escalada', () => {
  // como INC000027141021: se abrió ligada a un Jira que ya existía
  assert.deepEqual(escalationOf(issue({ open: false, resolved: 1500 }), [{ created: 700, resolved: 3000, status: 'Cerrado' }], NOW), { ...NONE, thesc: PREVIOUS });
});

test('cerrada en Remedy antes que su Jira: Tesc sí, Tcr no', () => {
  assert.deepEqual(escalationOf(issue({ open: false, resolved: 1500 }), [{ created: 1100, resolved: 3000, status: 'Cerrado' }], NOW), { ...NONE, thesc: 100, tesc: 1900, early: true });
});

test('cerrada con su Jira sin resolver: no es mal escalada, es cerrada con el Jira abierto', () => {
  assert.deepEqual(escalationOf(issue({ open: false, resolved: 1500 }), [{ created: 1100, resolved: -1, status: 'En Cartera' }], NOW), { ...NONE, thesc: 100, jiraOpen: true });
});

test('Tesc-r: de la solución final a ahora, solo si sigue abierta en Remedy', () => {
  assert.equal(escalationOf(issue(), [{ created: 1100, resolved: 4000, status: 'Resolved' }], NOW).tescr, NOW - 4000);
  assert.equal(escalationOf(issue({ open: false, resolved: 4500 }), [{ created: 1100, resolved: 4000, status: 'Resolved' }], NOW).tescr, -1);
});

test('una escalada cerrada sin ningún Jira suyo que valga es «sin Jira válido» (la mal escalada de TC-05 y TC-13 de la #48)', () => {
  assert.deepEqual(escalationOf(issue({ open: false, resolved: 5000 }), [], NOW), { ...NONE, bad: true });
  const descartados = escalationOf(issue({ open: false, resolved: 5000 }), [{ created: 1100, resolved: 1500, status: 'Descartado' }, { created: 1200, resolved: 1600, status: 'Cancelado' }], NOW);
  assert.deepEqual(descartados, { ...NONE, thesc: 100, bad: true, misrouted: true, discarded: true });
  // abierta aún: no es mal escalada todavía
  assert.equal(escalationOf(issue(), [], NOW).bad, false);
});

test('sin escalar: solo THesc, aunque tenga Jira', () => {
  assert.deepEqual(escalationOf(issue({ escalated: false, open: false, resolved: 5000 }), [{ created: 1100, resolved: 4000, status: 'Closed' }], NOW), { ...NONE, thesc: 100 });
});

test('mal escalada: alguno de sus tickets se descartó o pasó de un equipo a otro, esté como esté la incidencia', () => {
  const t = (o) => ({ created: 1100, resolved: -1, status: 'Open', moves: 0, ...o });
  // de un equipo a otro: del original al final, aunque pasara por otros; un ticket, una ruta
  assert.deepEqual(escalationOf(issue(), [t({ moves: 2, hops: [['A', 'B'], ['B', 'C']] }), t({ moves: 1, hops: [['X', 'Y']] }), t()], NOW).routes, [['A', 'C'], ['X', 'Y']]);
  assert.equal(escalationOf(issue(), [t({ moves: 1 })], NOW).misrouted, true);                       // pasó de un equipo a otro
  assert.equal(escalationOf(issue(), [t({ status: 'Discarded' }), t({ created: 1200 })], NOW).misrouted, true);
  assert.equal(escalationOf(issue({ escalated: false }), [t({ moves: 2 })], NOW).misrouted, true);   // aunque no pasara por Pendiente de un tercero
  assert.equal(escalationOf(issue(), [t({})], NOW).misrouted, false);
  // un ticket de otra incidencia citado en las notas (anterior a la apertura) no cuenta
  assert.equal(escalationOf(issue(), [t({ created: 500, moves: 3 }), t({})], NOW).misrouted, false);
});

test('Abierta y con un Jira suyo aún sin resolver: Tesc hasta ahora y sin Tesc-r, aunque otro suyo ya esté resuelto (el caso de SISUPAC-9207 abierto y SISUPAC-9215 cerrado)', () => {
  const tickets = [{ created: 1100, resolved: -1, status: 'Backlog' }, { created: 1200, resolved: 4000, status: 'Cerrada' }];
  const e = escalationOf(issue(), tickets, NOW);
  assert.equal(e.tescr, -1); assert.equal(e.tesc, NOW - 1100);   // Tesc, del primero hasta ahora: sigue escalada
  assert.equal(e.thesc, 100);   // el THesc, sí: el primero se creó
  // un descartado sin resolver no cuenta: sigue habiendo solución final
  assert.equal(escalationOf(issue(), [{ created: 1100, resolved: -1, status: 'Discarded' }, { created: 1200, resolved: 4000, status: 'Cerrada' }], NOW).tescr, NOW - 4000);
  // un ticket previo (de antes de abrirse) sin resolver, tampoco
  assert.equal(escalationOf(issue(), [{ created: 500, resolved: -1, status: 'Backlog' }, { created: 1200, resolved: 4000, status: 'Cerrada' }], NOW).tescr, NOW - 4000);
  // cerrada en Remedy: como antes (su Tcr, del último resuelto)
  assert.equal(escalationOf(issue({ open: false, resolved: 4500 }), tickets, NOW).tcr, 500);
});

test('Abierta y con todos sus Jira sin resolver: Tesc hasta ahora y sin Tesc-r; cerrada así, sin Tesc y con el Jira abierto', () => {
  const open = [{ created: 1100, resolved: -1, status: 'Backlog' }];
  const e = escalationOf(issue(), open, NOW);
  assert.equal(e.tesc, NOW - 1100); assert.equal(e.tescr, -1); assert.equal(e.jiraOpen, false);
  const c = escalationOf(issue({ open: false, resolved: 5000 }), open, NOW);
  assert.equal(c.tesc, -1); assert.equal(c.jiraOpen, true);
});
