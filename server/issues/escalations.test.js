import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingKeys, teamEscalations } from './escalations.js';

const issue = (id, over = {}) => ({ id, status: 'PENDING', vendorTicket: '', assignee: '', modified: '2026-11-10 09:00', ...over });
const me = { id: 'u-ana', name: 'Ana López' };

test('los Jira que hay que mirar: de las pendientes, sin repetir', () => {
  const issues = [issue('INC1', { vendorTicket: 'TEC: SGAEWMSAP-7037' }), issue('INC2', { vendorTicket: 'SGAEWMSAP-7037' }),
    issue('INC3', { vendorTicket: 'llamado' }), issue('INC4', { status: 'IN_PROGRESS', vendorTicket: 'SISUPAC-1' })];
  assert.deepEqual(pendingKeys(issues), ['SGAEWMSAP-7037']);
});

test('los escalados del equipo: de todos, con su dueño y si es mío', () => {
  const issues = [issue('INC1', { vendorTicket: 'SISUPAC-1', assignee: 'ANA LOPEZ GARCIA' }), issue('INC2', { vendorTicket: 'SISUPAC-2' }), issue('INC3', { vendorTicket: 'SISUPAC-3', assignee: 'LUIS PEREZ' })];
  const claims = [{ issue_id: 'INC2', user_id: 'u-javi', user_name: 'Javier Varela' }];
  const list = teamEscalations(issues, claims, new Map(), me);
  assert.deepEqual(list.map((e) => [e.id, e.owner, e.mine, e.jira.state]),
    [['INC1', 'ANA LOPEZ GARCIA', true, 'open'], ['INC2', 'Javier Varela', false, 'open'], ['INC3', 'LUIS PEREZ', false, 'open']]);
});

test('los escalados del equipo: primero los Jira resueltos y luego lo más parado', () => {
  const issues = [issue('INC1', { vendorTicket: 'SISUPAC-1', modified: '2026-11-12 09:00' }), issue('INC2', { vendorTicket: 'SISUPAC-2', modified: '2026-11-01 09:00' }),
    issue('INC3', { vendorTicket: 'SISUPAC-3', modified: '2026-11-15 09:00' })];
  const states = new Map([['SISUPAC-3', { state: 'resolved', at: '2026-11-17 08:00' }], ['SISUPAC-2', { state: 'discarded' }]]);
  const list = teamEscalations(issues, [], states, me);
  assert.deepEqual(list.map((e) => [e.id, e.jira.state]), [['INC3', 'resolved'], ['INC2', 'discarded'], ['INC1', 'open']]);
  assert.equal(list[0].jira.at, '2026-11-17 08:00');
});

test('los escalados del equipo: el enlace al Jira, con la base de la persona', () => {
  const [e] = teamEscalations([issue('INC1', { vendorTicket: 'SISUPAC-1' })], [], new Map(), me, 'https://jira.ejemplo/');
  assert.equal(e.jira.url, 'https://jira.ejemplo/browse/SISUPAC-1');
  assert.equal(teamEscalations([issue('INC1', { vendorTicket: 'SISUPAC-1' })], [], new Map(), me)[0].jira.url, undefined);
});
