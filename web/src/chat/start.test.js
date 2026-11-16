import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLauncher, chatPlan } from './start.js';

const LAUNCHERS = [{ id: 'claude', label: 'Claude', available: true }, { id: 'copilot', label: 'Copilot', available: true, native: true }];
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el chat: Copilot sin terminal, conocimiento autónomo y todo lo que la persona ve', () => {
  const p = chatPlan({ launchers: LAUNCHERS, projects: PROJECTS });
  assert.equal(p.launcher.id, 'copilot');
  assert.equal(p.launcher.native, true);
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5, 6]);
  assert.deepEqual(chatPlan({ launchers: LAUNCHERS }).projects, [], 'sin proyectos se abre igual, sin conocimiento');
});

test('sin Copilot, un motivo claro', () => {
  assert.match(pickLauncher([]).error, /no está configurado/);
  assert.match(pickLauncher([{ id: 'copilot', available: false }]).error, /no está instalado/);
  assert.match(chatPlan({ launchers: [], projects: PROJECTS }).error, /no está configurado/);
});
