import test from 'node:test';
import assert from 'node:assert/strict';
import { assistedPlan } from './assisted.js';

const LAUNCHERS = [{ id: 'claude', label: 'Claude', available: false }, { id: 'copilot', label: 'Copilot', available: true, native: true }];
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el plan: Copilot, conocimiento autónomo y solo el proyecto del origen', () => {
  const p = assistedPlan({ launchers: LAUNCHERS, projects: PROJECTS, origin: 'SISU' });
  assert.equal(p.launcher.id, 'copilot');
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5]);
  assert.equal(assistedPlan({ launchers: LAUNCHERS, projects: [{ id: 9, name: ' sga ' }], origin: 'SGA' }).projects[0], 9);
});

test('sin Copilot o sin el proyecto del origen, un motivo claro', () => {
  assert.match(assistedPlan({ launchers: [], projects: PROJECTS, origin: 'SGA' }).error, /no está configurado/);
  assert.match(assistedPlan({ launchers: [{ id: 'copilot', available: false }], projects: PROJECTS, origin: 'SGA' }).error, /no está instalado/);
  assert.match(assistedPlan({ launchers: LAUNCHERS, projects: [PROJECTS[1]], origin: 'SISU' }).error, /conocimiento de SISU/);
});
