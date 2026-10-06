import test from 'node:test';
import assert from 'node:assert/strict';
import { issueContext, promptArgs } from './context.js';

const issue = { id: 'INC1', text: 'PDA sin imagen', center: '100537', priority: 'HIGH', prio: true, sisu: false, status: 'ASSIGNED', reason: '', category: 'A › B', reported: '2026-10-01 10:00', notes: 'El SKU no carga', vendorTicket: '', related: '' };

test('contexto: los datos de la issue y lo que dice el centro', () => {
  const t = issueContext(issue);
  assert.match(t, /incidencia INC1/);
  assert.match(t, /Criticidad: alta \(priorizada por negocio\)/);
  assert.match(t, /Origen: SGA/);
  assert.match(t, /El SKU no carga/);
  assert.doesNotMatch(t, /Ticket de proveedor/);
});

test('contexto: descripción enorme, recortada', () => {
  assert.ok(issueContext({ ...issue, notes: 'x'.repeat(20000) }).length < 7000);
});

test('primer mensaje según el agente', () => {
  assert.deepEqual(promptArgs('claude', 'hola'), ['hola']);
  assert.deepEqual(promptArgs('codex', 'hola'), ['hola']);
  assert.deepEqual(promptArgs('copilot', 'hola'), ['-i', 'hola']);
});
