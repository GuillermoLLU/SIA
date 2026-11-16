import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effortLabel, modelLabelIn, modelShown, effortsIn } from './model-names.js';

const MODELS = [
  { id: 'auto', label: 'Auto', hint: 'elige Copilot por ti', efforts: [], defaultEffort: null },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', hint: '×3', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
];

test('el esfuerzo, con su nombre', () => {
  assert.equal(effortLabel('high'), 'Alto');
  assert.equal(effortLabel('xhigh'), 'Muy alto');
  assert.equal(effortLabel(undefined), 'De serie');
  assert.equal(effortLabel('raro'), 'raro');
});

test('el nombre del modelo que va: el de la cuenta; uno que no esté, por su id; nada, «Modelo»', () => {
  assert.equal(modelLabelIn(MODELS, 'gpt-6-sol'), 'GPT-6 Sol');
  assert.equal(modelLabelIn(MODELS, 'otro'), 'otro');
  assert.equal(modelLabelIn(null, null), 'Modelo');
});

test('el pie: con «Auto», también el modelo que contesta; si es el mismo, una vez', () => {
  assert.equal(modelShown(MODELS, 'auto', 'GPT-6 Luna'), 'Auto · GPT-6 Luna');
  assert.equal(modelShown(MODELS, 'gpt-6-sol', 'GPT-6 Sol'), 'GPT-6 Sol');
  assert.equal(modelShown(MODELS, 'auto', null), 'Auto');
});

test('los esfuerzos del modelo que va, con el de serie marcado; «Auto» no tiene; sin modelos, ninguno', () => {
  assert.deepEqual(effortsIn(MODELS, 'gpt-6-sol').map((e) => `${e.id}:${e.hint}`), ['low:rápido, directo', 'medium:el de serie', 'high:']);
  assert.deepEqual(effortsIn(MODELS, 'auto'), []);
  assert.deepEqual(effortsIn(MODELS, null).map((e) => e.id), ['low', 'medium', 'high']); // sin elegir: los del primero que tenga
  assert.deepEqual(effortsIn([], 'x'), []);
});
