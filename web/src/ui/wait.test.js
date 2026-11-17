import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitHtml } from './wait.js';

test('el aviso de arranque: el giro y su línea, escondido salvo que se pida', () => {
  assert.equal(waitHtml('Iniciando <agente>…'), '<div class="ai-wait" data-wait hidden><i class="ai-wait-spin"></i><span>Iniciando &lt;agente&gt;…</span></div>');
  assert.equal(waitHtml('Iniciando agente…', { hidden: false }), '<div class="ai-wait" data-wait><i class="ai-wait-spin"></i><span>Iniciando agente…</span></div>');
});
