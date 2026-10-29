import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForm, resolveReview, resumeStep, stepMissing, fileSize, fileBox, localShort } from './resolve-form.js';
// lo que manda el bridge al abrir Resolver
import { resolveDraft } from '../../../server/issues/resolve.js';

const n = (at, text) => ({ at, who: 'ANA', text });
// las cuatro notas del procedimiento: con ellas se puede escribir la de cierre
const ALL = ['SITUACION INICIAL', 'ANTECEDENTES', 'ANALISIS', 'DIAGNOSTICO'].map((t) => n('2026-10-28 11:05', `[${t}] Cola llena`));

test('dos bloques separados, con su ayuda, y lo de Remedy ya puesto y escapado, sin texto de relleno', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola <llena>')] }));
  assert.match(html, /Nota interna de resolución <em>Solo la ve el equipo<\/em>/);
  assert.match(html, /Mensaje al centro <em>Lo reciben el centro y quien haya participado<\/em>/);
  assert.equal((html.match(/role="tooltip"/g) || []).length, 4);
  assert.match(html, /name="what" rows="3" maxlength="20000">Cola &lt;llena&gt;<\/textarea><\/label>/);
  // los títulos y las ayudas «?» bastan: sin frases bajo los campos ni avisos de lo obvio
  assert.doesNotMatch(html, /Sale de tu nota|Cuéntalo sin jerga|Técnico y concreto|fallo del sistema|Seguimos con|Sigues en el paso/);
  assert.match(html, /<textarea id="iss-f-note" name="note"/);
  assert.match(html, /<span>¿Qué se ha hecho\?<\/span>/);
  assert.match(html, /aria-label="¿Qué es esto\?"/);
  assert.doesNotMatch(html, /P-0\d\d|C-0\d\d/);
});

test('si la nota de resolución ya está en Remedy, se enseña y no se pide', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:40', '[RESOLUCION] Se libera')] }));
  assert.match(html, /<blockquote>Se libera<\/blockquote>/);
  assert.doesNotMatch(html, /Ya la escribiste/);
  assert.match(html, /<input type="hidden" name="note" value="Se libera" \/>/);
  assert.doesNotMatch(html, /<textarea id="iss-f-note"/);
});

test('tres pasos: la nota interna, el mensaje con su adjunto, y revisar; solo el primero a la vista', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL }));
  assert.match(html, /<li data-step-mark="1" aria-current="step"><i>1<\/i>Nota interna<\/li><li data-step-mark="2"><i>2<\/i>Mensaje al centro<\/li><li data-step-mark="3"><i>3<\/i>Revisar y enviar<\/li>/);
  assert.match(html, /data-rstep="1">[\s\S]*Nota interna de resolución[\s\S]*data-rstep="2" hidden>[\s\S]*Mensaje al centro[\s\S]*<label class="iss-drop"><input type="file" data-file \/><b>Arrastra aquí el archivo<\/b>[\s\S]*data-rstep="3" hidden>/);
  assert.doesNotMatch(html, /multiple/);
  assert.match(html, /data-step-next>Siguiente: mensaje al centro/);
  assert.match(html, /data-confirm-send hidden>Confirmar y resolver/);
});

test('no se sale de un paso sin lo obligatorio', () => {
  assert.equal(stepMissing(1, { note: '  ' }), 'Nota interna de resolución');
  assert.equal(stepMissing(1, { note: 'Relanzada' }), null);
  assert.equal(stepMissing(2, { what: 'Se paró', how: '', prevent: 'x' }), '¿Cómo se resolvió?');
  assert.equal(stepMissing(2, { what: 'a', how: 'b', prevent: 'c' }), null);
  assert.equal(stepMissing(3, {}), null);
});

test('revisar: la nota y la nota externa con la plantilla, escapadas, con el adjunto y nada más', () => {
  const v = { note: 'Relanzada <ok>', what: 'Se paró', how: 'Se relanzó', prevent: 'Corrección pedida' };
  const msg = { lang: 'es', hour: 16 };
  const html = resolveReview(v, { name: 'cola<1>.png', size: 2048 }, msg);
  assert.match(html, /\[RESOLUCION\] Relanzada &lt;ok&gt;/);
  assert.match(html, /Nota externa para el centro en Remedy/);
  assert.match(html, /<p>Buenas tardes:<\/p><p>Se paró<\/p><p>Se relanzó<\/p><p>Corrección pedida<\/p><p>Un saludo\.<\/p>/);
  assert.match(resolveReview(v, null, { ...msg, lang: 'en' }), /<p>Good afternoon,<\/p>/);
  assert.doesNotMatch(html, /Qué ocurrió|Cómo se resolvió|Qué se hará|Correo/);
  assert.match(html, /Adjunto: cola&lt;1&gt;\.png · 2 KB/);
  assert.doesNotMatch(html, /Así quedará|Estado final|Resuelta|5 días|Aún no se envía/);
  assert.doesNotMatch(resolveReview(v, null, msg), /Adjunto/);
  assert.equal(fileSize(3.5 * 1024 * 1024), '3,5 MB');
});

test('título, identificador visible, guardado automático y lo que se dejó escrito, sin aviso de que viene de antes', () => {
  const r = resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL });
  assert.match(resolveForm('INC1', r), /<h3>Resolver incidencia<\/h3><span class="iss-act-id">INC1<\/span>/);
  assert.doesNotMatch(resolveForm('INC1', r), /Guardar para después/);
  assert.match(resolveForm('INC1', r), /data-autosave>El borrador se guarda solo mientras escribes/);
  assert.match(resolveForm('INC1', r), /<span>¿Qué ocurrió\?<\/span>[\s\S]*<span>¿Cómo se resolvió\?<\/span>[\s\S]*<span>¿Qué se hará para evitarlo\?<\/span>/);
  const at = new Date(2026, 9, 28, 15, 20).toISOString();
  const html = resolveForm('INC1', r, { at, note: 'Mi nota', what: 'Lo mío', how: '', prevent: 'P', file: { name: 'cola.png', size: 2048 } });
  assert.doesNotMatch(html, /Seguimos con|Descartar/);
  assert.match(html, /data-autosave>Borrador guardado 28\/10 15:20</);
  assert.match(html, /data-file-name>cola\.png · 2 KB<\/span><button type="button" class="lab-btn" data-file-clear>Quitar/);
  assert.doesNotMatch(html, /iss-drop/);
  assert.match(html, /name="what" rows="3" maxlength="20000">Lo mío<\/textarea>/);
  assert.match(html, /name="note" rows="4" maxlength="20000">Mi nota<\/textarea>/);
  assert.match(html, /name="prevent" rows="2" maxlength="20000">P<\/textarea>/);
  assert.match(html, /value="es" checked \/><span>Español<\/span>/);   // un borrador sin idioma, en español
  assert.match(resolveForm('INC1', r, { at, lang: 'en' }), /value="en" checked \/><span>English<\/span>/);
  assert.match(resolveForm('INC1', r), /value="es" checked \/><span>Español<\/span><\/label><label><input type="radio" name="lang" value="en" \/><span>English<\/span>/);
});

test('un borrador se retoma en el paso en el que se quedó, si los de antes siguen completos', () => {
  const r = resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL });
  const at = new Date(2026, 9, 28, 15, 20).toISOString();
  const full = { at, note: 'N', what: 'W', how: 'H', prevent: 'P' };
  assert.equal(resumeStep(r, null), 1);
  assert.equal(resumeStep(r, { ...full }), 1);                        // de antes de guardar el paso
  assert.equal(resumeStep(r, { ...full, step: 2 }), 2);
  assert.equal(resumeStep(r, { ...full, step: 3 }), 3);
  assert.equal(resumeStep(r, { ...full, what: '', step: 3 }), 2);     // falta algo del 2: vuelve al 2
  assert.equal(resumeStep(r, { ...full, note: '', step: 2 }), 1);
  const done = resolveDraft({ priority: 'HIGH', category: 'x', worklog: [...ALL, n('2026-10-28 11:30', '[RESOLUCION] Ya está')] });
  assert.equal(resumeStep(done, { ...full, note: '', step: 2 }), 2);  // la nota ya está en Remedy
  const blocked = resolveDraft({ priority: 'HIGH', category: '', worklog: ALL });
  assert.equal(resumeStep(blocked, { ...full, step: 3 }), 1);         // falta algo en Remedy: donde se avisa
  assert.match(resolveForm('INC1', r, { ...full, step: 2 }), /<input type="hidden" name="step" value="1" \/>/);
});

test('sin las notas del procedimiento en Remedy no se escribe la nota de cierre ni se pasa de paso', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola llena')] }));
  assert.match(html, /role="alert">Para escribir la nota de cierre faltan en Remedy: <b>Situación inicial, Antecedentes, Análisis<\/b>/);
  assert.match(html, /name="note" rows="4" maxlength="20000" disabled>/);
  assert.match(html, /data-step-next disabled>/);
  assert.match(resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: '', worklog: ALL })), /faltan en Remedy: <b>Categoría<\/b>[\s\S]*data-step-next disabled>/);
  const ok = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL }));
  assert.doesNotMatch(ok, /role="alert"|disabled/);
});

test('la zona del adjunto y la hora en la de este equipo', () => {
  assert.match(fileBox(null), /class="iss-drop">.*o pulsa para elegirlo · uno, hasta 15 MB/);
  assert.match(fileBox({ name: 'a<b>.txt', size: 10 }), /a&lt;b&gt;\.txt · 1 KB/);
  assert.equal(localShort(new Date(2026, 0, 5, 7, 3).toISOString()), '05/01 07:03');
});

test('el selector del adjunto se alcanza con el teclado: no está oculto con hidden', () => {
  assert.doesNotMatch(fileBox(null), /data-file hidden/);
});
