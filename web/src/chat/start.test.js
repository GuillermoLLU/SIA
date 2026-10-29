import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLauncher, chatPlan, knowledgeLabel } from './start.js';

const LAUNCHERS = [{ id: 'claude', label: 'Claude', available: true }, { id: 'copilot', label: 'Copilot', available: false }];
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el chat: Claude, conocimiento autónomo y todo lo que la persona ve', () => {
  const p = chatPlan({ launchers: LAUNCHERS, projects: PROJECTS });
  assert.equal(p.launcher.id, 'claude');
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5, 6]);
  assert.deepEqual(chatPlan({ launchers: LAUNCHERS }).projects, [], 'sin proyectos se abre igual, sin conocimiento');
});

test('sin Claude, un motivo claro', () => {
  assert.match(pickLauncher([]).error, /no está configurado/);
  assert.match(pickLauncher([{ id: 'claude', available: false }]).error, /no está instalado/);
  assert.match(chatPlan({ launchers: [], projects: PROJECTS }).error, /no está configurado/);
});

test('la etiqueta del conocimiento: uno, varios o ninguno', () => {
  assert.equal(knowledgeLabel([PROJECTS[0]]), 'Con el conocimiento de SISU');
  assert.equal(knowledgeLabel(PROJECTS), 'Con el conocimiento de SISU y SGA');
  assert.equal(knowledgeLabel([...PROJECTS, { id: 7, name: ' Otro ' }]), 'Con el conocimiento de SISU, SGA y Otro');
  assert.equal(knowledgeLabel([]), 'Sin conocimiento del equipo asignado');
  assert.equal(knowledgeLabel([{ id: 1 }]), 'Sin conocimiento del equipo asignado');
});
