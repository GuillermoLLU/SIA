import test from 'node:test';
import assert from 'node:assert/strict';
import { sameName, deskOf, brief, doingCount, canTake, MAX_DOING } from './desk.js';

test('el nombre en SIA dentro del asignado de Remedy', () => {
  assert.equal(sameName('ANA LOPEZ GARCIA', 'Ana López'), true);
  assert.equal(sameName('ANA MARTIN GARCIA', 'Ana López'), false);
  assert.equal(sameName('ANA LOPEZ GARCIA', 'Ana'), false);
  assert.equal(sameName('', 'Ana López'), false);
});

test('mi mesa: responsable en Remedy o cogida en SIA', () => {
  const issues = [{ id: 'INC1', assignee: 'ANA LOPEZ GARCIA' }, { id: 'INC2', assignee: '' }, { id: 'INC3', assignee: '' }];
  const claims = [{ issue_id: 'INC2', user_id: 'u-ana' }, { issue_id: 'INC3', user_id: 'u-otro' }];
  const desk = deskOf(issues, { id: 'u-ana', name: 'Ana López' }, claims);
  assert.deepEqual(desk.map((i) => [i.id, i.claimed]), [['INC1', false], ['INC2', true]]);
});

test('mi mesa: las que me han traspasado llevan de quién vienen y por qué', () => {
  const issues = [{ id: 'INC2', assignee: '' }, { id: 'INC4', assignee: '' }];
  const claims = [{ issue_id: 'INC2', user_id: 'u-ana' }, { issue_id: 'INC4', user_id: 'u-ana' }];
  const transfers = [{ issue_id: 'INC4', from_name: 'Luis', happened_at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' }];
  const desk = deskOf(issues, { id: 'u-ana', name: 'Ana López' }, claims, transfers);
  assert.equal(desk[0].transferred, undefined);
  assert.deepEqual(desk[1].transferred, { from: 'Luis', at: '2026-10-29T10:00:00+00:00', reason: 'Es de tu centro.' });
  assert.deepEqual(brief(desk[1]).transferred, desk[1].transferred);
  assert.equal(brief(desk[0]).transferred, undefined);
});

test('brief: sin notas ni historial', () => {
  const b = brief({ id: 'INC1', notes: 'largo', changes: [], text: 't' });
  assert.equal(b.notes, undefined);
  assert.equal(b.changes, undefined);
});

test('el tope de en curso: con MAX_DOING entre manos no se coge otra; las pendientes y resueltas no cuentan', () => {
  const doing = (n) => Array.from({ length: n }, (_, i) => ({ id: `D${i}`, status: i % 2 ? 'ASSIGNED' : 'IN_PROGRESS' }));
  const rest = [{ id: 'P', status: 'PENDING' }, { id: 'R', status: 'RESOLVED' }];
  assert.equal(doingCount([...doing(3), ...rest]), 3);
  assert.equal(canTake([...doing(MAX_DOING - 1), ...rest]), true);
  assert.equal(canTake([...doing(MAX_DOING), ...rest]), false);
  assert.equal(canTake([...doing(MAX_DOING + 1)]), false);   // con traspasos de más, tampoco
});
