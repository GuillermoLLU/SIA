import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForm } from './resolve-form.js';
import { resolveDraft } from './resolve-draft.js';

const n = (at, text) => ({ at, who: 'ANA', text });

test('dos bloques separados, con su ayuda, y lo de Remedy ya puesto y escapado', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola <llena>')] }));
  assert.match(html, /Nota interna de resolución <em>Solo la ve el equipo<\/em>/);
  assert.match(html, /Mensaje al centro <em>Lo reciben el centro y quien haya participado<\/em>/);
  assert.equal((html.match(/role="tooltip"/g) || []).length, 3);
  assert.match(html, /name="what" rows="3">Cola &lt;llena&gt;<\/textarea>\s*<small>Sale de tu nota de diagnóstico \(28\/10 11:05, ANA\)\. Cuéntalo sin jerga/);
  assert.match(html, /<textarea id="iss-f-note" name="note"/);
  assert.doesNotMatch(html, /P-0\d\d|C-0\d\d/);
});

test('si la nota de resolución ya está en Remedy, se enseña y no se pide', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:40', '[RESOLUCION] Se libera')] }));
  assert.match(html, /Ya la escribiste en Remedy \(28\/10 11:40, ANA\)/);
  assert.match(html, /<input type="hidden" name="note" value="Se libera" \/>/);
  assert.doesNotMatch(html, /<textarea id="iss-f-note"/);
});
