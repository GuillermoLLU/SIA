import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCopilot, chatPlan } from './start.js';

const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el chat: conocimiento autónomo y todo lo que la persona ve', () => {
  const p = chatPlan({ copilot: { available: true }, projects: PROJECTS });
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5, 6]);
  assert.deepEqual(chatPlan({ copilot: { available: true } }).projects, [], 'sin proyectos se abre igual, sin conocimiento');
});

test('sin Copilot, un motivo claro', () => {
  assert.match(checkCopilot({ available: false }).error, /no está instalado/);
  assert.match(checkCopilot(undefined).error, /no está instalado/);
  assert.match(chatPlan({ copilot: null, projects: PROJECTS }).error, /no está instalado/);
});
