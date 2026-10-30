import test from 'node:test';
import assert from 'node:assert/strict';
import { escalationOf, PREVIOUS } from './escalation.js';

const issue = (o) => ({ reported: 1000, resolved: -1, open: true, escalated: true, ...o });
const NOW = 10000;

test('THesc: de la apertura al primer Jira creado después; si todos son anteriores, ticket previo', () => {
  assert.equal(escalationOf(issue(), [{ created: 1300, resolved: -1, status: 'Open' }, { created: 1100, resolved: -1, status: 'Open' }], NOW).thesc, 100);
  assert.equal(escalationOf(issue(), [{ created: 900, resolved: -1, status: 'Open' }], NOW).thesc, PREVIOUS);
  assert.equal(escalationOf(issue({ escalated: false }), [], NOW).thesc, -1);
});

test('Tesc empieza en el Jira más antiguo aunque sea Discarded, y Tcr en el de solución final (TC-07 de la #48)', () => {
  const e = escalationOf(issue({ open: false, resolved: 5000 }),
    [{ created: 1100, resolved: 1500, status: 'Discarded' }, { created: 2000, resolved: 4000, status: 'Closed' }], NOW);
  assert.deepEqual(e, { thesc: 100, tesc: 4000 - 1100, tcr: 1000, tescr: -1, bad: false });
});

test('Tesc-r: de la solución final a ahora, solo si sigue abierta en Remedy', () => {
  assert.equal(escalationOf(issue(), [{ created: 1100, resolved: 4000, status: 'Resolved' }], NOW).tescr, NOW - 4000);
  assert.equal(escalationOf(issue({ open: false, resolved: 4500 }), [{ created: 1100, resolved: 4000, status: 'Resolved' }], NOW).tescr, -1);
});

test('una escalada cerrada sin Jira de solución final es mal escalada y no cuenta (TC-05 y TC-13 de la #48)', () => {
  const none = { tesc: -1, tcr: -1, tescr: -1, bad: true };
  const sinJira = escalationOf(issue({ open: false, resolved: 5000 }), [], NOW);
  assert.deepEqual({ ...sinJira, thesc: undefined }, { ...none, thesc: undefined });
  const descartados = escalationOf(issue({ open: false, resolved: 5000 }), [{ created: 1100, resolved: 1500, status: 'Descartado' }], NOW);
  assert.deepEqual({ ...descartados, thesc: undefined }, { ...none, thesc: undefined });
  // abierta aún: no es mal escalada todavía
  assert.equal(escalationOf(issue(), [], NOW).bad, false);
});

test('sin escalar: solo THesc, aunque tenga Jira', () => {
  assert.deepEqual(escalationOf(issue({ escalated: false, open: false, resolved: 5000 }), [{ created: 1100, resolved: 4000, status: 'Closed' }], NOW),
    { thesc: 100, tesc: -1, tcr: -1, tescr: -1, bad: false });
});
