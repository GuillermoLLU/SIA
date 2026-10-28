import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForm, resolveConfirm } from './resolve-form.js';
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

test('confirmación: la nota y el correo limpios, escapados, y el estado final', () => {
  const html = resolveConfirm('INC1', { note: 'Relanzada <ok>', what: 'Se paró', how: 'Se relanzó', prevent: 'Corrección pedida' });
  assert.match(html, /\[RESOLUCION\] Relanzada &lt;ok&gt;/);
  assert.match(html, /<p><b>Qué ocurrió<\/b>Se paró<\/p><p><b>Cómo se resolvió<\/b>Se relanzó<\/p><p><b>Qué se hará para evitarlo<\/b>Corrección pedida<\/p>/);
  assert.match(html, /<b>Resuelta<\/b>/);
  assert.match(html, /data-confirm-back>Volver a editar.*data-confirm-send>Confirmar y resolver/s);
  assert.doesNotMatch(resolveForm('INC1', { notes: [], draft: {}, resolution: null, warnings: [] }), /Así se enviará/);
});

test('título, identificador visible y lo guardado para después por encima de Remedy', () => {
  const r = resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola llena')] });
  assert.match(resolveForm('INC1', r), /<h3>Resolver incidencia<\/h3><span class="iss-act-id">INC1<\/span>/);
  assert.match(resolveForm('INC1', r), /data-saved-keep>Guardar para después/);
  const html = resolveForm('INC1', r, { at: '2026-10-28 15:20', note: 'Mi nota', what: 'Lo mío', how: '', prevent: 'P' });
  assert.match(html, /Seguimos con lo que guardaste el 28\/10 15:20/);
  assert.match(html, /name="what" rows="3">Lo mío<\/textarea>/);
  assert.match(html, /name="note" rows="3">Mi nota<\/textarea>/);
  assert.match(html, /name="prevent" rows="2">P<\/textarea>/);
});
