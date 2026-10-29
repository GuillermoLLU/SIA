import test from 'node:test';
import assert from 'node:assert/strict';
import { assistedPlan, originOf } from './assisted.js';

const LAUNCHERS = [{ id: 'claude', label: 'Claude', available: true }, { id: 'copilot', label: 'Copilot', available: false }];
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el origen de la issue decide el conocimiento', () => {
  assert.equal(originOf({ sisu: true }), 'SISU');
  assert.equal(originOf({ sisu: false }), 'SGA');
});

test('el plan: Claude, conocimiento autónomo y solo el proyecto del origen', () => {
  const p = assistedPlan({ launchers: LAUNCHERS, projects: PROJECTS, origin: 'SISU' });
  assert.equal(p.launcher.id, 'claude');
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5]);
  assert.equal(assistedPlan({ launchers: LAUNCHERS, projects: [{ id: 9, name: ' sga ' }], origin: 'SGA' }).projects[0], 9);
});

test('sin Claude o sin el proyecto del origen, un motivo claro', () => {
  assert.match(assistedPlan({ launchers: [], projects: PROJECTS, origin: 'SGA' }).error, /no está configurado/);
  assert.match(assistedPlan({ launchers: [{ id: 'claude', available: false }], projects: PROJECTS, origin: 'SGA' }).error, /no está instalado/);
  assert.match(assistedPlan({ launchers: LAUNCHERS, projects: [PROJECTS[1]], origin: 'SISU' }).error, /conocimiento de SISU/);
});
