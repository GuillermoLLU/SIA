import test from 'node:test';
import assert from 'node:assert/strict';
import { readIssue, statusHistory, noteFlags, vendorOf, scopeOf, operationOf, entries, minutesSince, FLAG, SCOPE } from './remedy.js';

const BASE = Date.UTC(2026, 0, 1);
const at = (s) => minutesSince(BASE, s);

test('minutos desde el 1 de enero; -1 si no hay fecha', () => {
  assert.equal(at('2026-01-01 00:00:59'), 0);
  assert.equal(at('2026-01-02 01:30:00.000'), 1530);
  assert.equal(at(''), -1);
});

test('entradas «fecha - quién - texto» separadas por « | »', () => {
  const text = '2026-01-01 10:00:00.000 - ana - Status: New → Assigned | 2026-01-01 10:05:00.000 - luis - nota con - guiones';
  assert.deepEqual(entries(text), [
    { at: '2026-01-01 10:00:00.000', who: 'ana', text: 'Status: New → Assigned' },
    { at: '2026-01-01 10:05:00.000', who: 'luis', text: 'nota con - guiones' },
  ]);
});

const audit = (...e) => e.map(([t, who, text]) => `2026-01-01 ${t}:00.000 - ${who} - ${text}`).join(' | ');

test('historial: tiempos por estado, primera actuación, paso a En curso, devoluciones y reapertura', () => {
  const h = statusHistory(audit(
    ['10:00', 'robot', 'Status: New → Assigned'],
    ['10:20', 'ana', 'Status: Assigned → In Progress'],
    ['10:50', 'ana', 'Status: In Progress → Assigned'],
    ['11:00', 'ana', 'Status_Reason:  → Third Party Vendor Action Reqd'],
    ['11:00', 'ana', 'Status: Assigned → Pending'],
    ['12:00', 'ana', 'Status: Pending → Resolved'],
    ['13:00', 'luis', 'Status: Resolved → In Progress'],
    ['13:30', 'luis', 'Status: In Progress → Resolved'],
  ), { reported: at('2026-01-01 09:55:00'), modified: -1, openNow: false, at });
  assert.deepEqual(h.time, { queue: 30, work: 60, client: 0, vendor: 60, other: 0 });
  assert.equal(h.first, 25);   // el primer cambio real (Assigned → In Progress), desde la apertura
  assert.equal(h.start, 25);
  assert.equal(h.bounces, 1);
  assert.equal(h.pendings, 1);
  assert.equal(h.reopened, true);
  assert.deepEqual(h.resolvedBy, ['ana', 'luis']);
});

test('historial: abierta ahora, el estado actual cuenta hasta el último movimiento; sin En curso, start = -1', () => {
  const h = statusHistory(audit(['10:00', 'robot', 'Status: New → Assigned']),
    { reported: at('2026-01-01 10:00:00'), modified: at('2026-01-01 12:00:00'), openNow: true, at });
  assert.equal(h.time.queue, 120);
  assert.equal(h.first, -1);
  assert.equal(h.start, -1);
});

test('notas: marcas entre corchetes y notas del agente de IA', () => {
  const w = audit(['10:00', 'pepe', '[MAJOR INCIDENT] caída'], ['10:01', 'pepe', '[CALL] al centro'], ['10:02', 'logsup.ia', 'informe'],
    ['10:03', 'pepe', '[HITL_REVIEW_OK] bien'], ['10:04', 'pepe', '[IA_FAIL] mal'], ['10:05', 'pepe', '[RECURRENCIA]']);
  assert.equal(noteFlags(w), FLAG.MAJOR | FLAG.CALL | FLAG.IA | FLAG.HITL_OK | FLAG.IA_FAIL | FLAG.RECURRENCE);
  assert.equal(noteFlags(''), 0);
});

test('ticket de tercero: prefijo conocido, clave Jira, otro texto', () => {
  assert.deepEqual(vendorOf('TEC: SGAEWMSAP-7037'), { type: 'TEC', project: 'SGAEWMSAP', key: 'SGAEWMSAP-7037' });
  assert.deepEqual(vendorOf('ABC-12'), { type: 'JIRA', project: 'ABC', key: 'ABC-12' });
  assert.deepEqual(vendorOf('XYZ: algo'), { type: 'OTRO', project: '', key: '' });
  assert.deepEqual(vendorOf(' '), { type: '', project: '', key: '' });
});

test('ámbito: SISU, SGA, petición y fuera', () => {
  const tags = (...t) => new Set(t);
  assert.equal(scopeOf('ECOM lo que sea', 'USER_SERVICE_RESTORATION', tags('SISUINC')), SCOPE.SISU);
  assert.equal(scopeOf('100001 High ECOM ZARA X PACKING - algo', 'USER_SERVICE_RESTORATION', tags()), SCOPE.SGA);
  assert.equal(scopeOf('Bloqueo DB2 en tabla', 'USER_SERVICE_REQUEST', tags()), SCOPE.REQUEST);
  assert.equal(scopeOf('ECOM RBS caída', 'USER_SERVICE_RESTORATION', tags()), SCOPE.OUT);
  assert.equal(scopeOf('otra cosa', 'USER_SERVICE_RESTORATION', tags()), SCOPE.OUT);
});

test('tipo de operación por el prefijo de la categoría 2', () => {
  assert.equal(operationOf('Ecom Zara AE3'), 'ECOM Zara');
  assert.equal(operationOf('ECOM BRANDS'), 'ECOM Cadenas');
  assert.equal(operationOf('Paquetería X'), 'Paquetería');
  assert.equal(operationOf('cualquier cosa'), 'Otros');
  assert.equal(operationOf(''), 'Sin clasificar');
});

test('fila entera → issue medida', () => {
  const i = readIssue({
    INCIDENTNUMBER: 'INC000000000123', ASSIGNEE: ' ANA LOPEZ ', SUMMARY: ' 100001 High ECOM ZARA X PACKING - Etiqueta mal impresa ',
    PRIORITY: 'HIGH', STATUS: 'CLOSED', STATUSREASON: '', SERVICETYPE: 'USER_SERVICE_RESTORATION', TAGS: 'SIGLO_TIP_SOL=3; PRIO;IA_SOLVED_OK',
    REPORTEDDATE: '2026-01-01 09:55:00', LASTRESOLUTIONDATE: '2026-01-01 12:00:00', LASTMODIFIEDDATE: '2026-01-02 08:00:00',
    RESOLUTION: 'Reimpresa 3 veces', VENDORTICKETNUMBER: '', PRODUCTCATEGORIZATIONTIER1: 'AYS ES13-ILLESCAS', PRODUCTCATEGORIZATIONTIER2: 'ECOM ZARA',
    PRODUCTCATEGORIZATIONTIER3: 'packing', CATEGORIZATIONTIER3: 'Etiqueta', WORKLOG_DETAIL: '',
    AUDIT_DETAIL: audit(['10:00', 'robot', 'Status: New → Assigned'], ['10:30', 'ana', 'Status: Assigned → Resolved']),
  }, BASE);
  assert.equal(i.id, 123);
  assert.equal(i.assignee, 'ANA LOPEZ');
  assert.equal(i.centre, 'ES13-ILLESCAS');
  assert.equal(i.module, 'PACKING');
  assert.equal(i.scope, SCOPE.SGA);
  assert.equal(i.flags, FLAG.PRIO | FLAG.IA_SOLVED);
  assert.equal(i.first, 35);
  assert.equal(i.start, -1);
  assert.equal(i.title, '100001 High ECOM ZARA X PACKING - Etiqueta mal impresa');
  assert.equal(i.resolution, 'reimpresa # veces');
  assert.ok(i.themes > 0);
});
