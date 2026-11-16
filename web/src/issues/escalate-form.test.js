import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateForm, escalateLive } from './escalate-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

const issue = (o = {}) => ({ id: 'INC000027698079', priority: 'MEDIUM', status: 'IN_PROGRESS', reported: '2026-10-29 08:00', claimedBy: null, vendorTicket: '', center: '100497', ...o });
const form = (o = {}, v) => escalateForm({ issue: issue(o), dests: DESTINATIONS, open: OPEN_TICKETS, v });
const live = (v) => escalateLive(v, { issue: issue(), dests: DESTINATIONS });

test('el modal: el identificador y las dos opciones como tarjetas, sin texto de relleno', () => {
  const html = form();
  assert.match(html, /<h3>Escalar la issue<\/h3><span class="iss-act-id">INC000027698079<\/span>/);
  assert.match(html, /<label class="iss-esc-card"><input type="radio" class="iss-sr" name="mode" value="escalate" checked \/><b>Escalar a otro equipo<\/b>/);
  assert.match(html, /<b>Unir a un ticket ya abierto<\/b>/);
  assert.equal((html.match(/class="pick-group"/g) || []).length, 4);   // N3, N2, otros canales y fuera del mapa
  assert.doesNotMatch(html, /<select/);   // todos los desplegables, con el formato de la web
  assert.match(html, /placeholder="Ej\.:/);
  assert.match(html, /Para que llegue bien/);
  // lo que se quitó en la revisión del 29/10: ni la frase de arriba, ni el reloj, ni los plazos, ni textos bajo los campos
  assert.doesNotMatch(html, /Cuando en soporte|Quedan|escalado formal|Plazos|nivel 1|Sigues con|Datos de prueba|Qué has visto y qué has probado\.|Del mapa de escalado|ya está puesta/);
});

test('escalar a un equipo no pide el ticket de proveedor', () => {
  const html = form();
  assert.doesNotMatch(html, /Ticket de proveedor/);
  assert.doesNotMatch(html, /name="ticket"/);
});

test('resuelta: se escala por la causa raíz', () => {
  assert.match(form({ status: 'RESOLVED' }), /<h3>Escalar por la causa raíz<\/h3>/);
});

test('si Remedy ya trae un ticket, se propone unirla a él, de la lista o como otro', () => {
  const listed = form({ vendorTicket: 'ITD: SISUPAC-9211' });
  assert.match(listed, /Remedy ya trae el ticket <b class="iss-mono">SISUPAC-9211<\/b>/);
  assert.match(listed, /data-esc-use-link>Unirla a SISUPAC-9211/);
  assert.match(listed, /name="linked" value="SISUPAC-9211" checked/);
  const other = form({ vendorTicket: 'TEC: SGAMSRAP-8777' });
  assert.match(other, /name="linked" value="other" checked/);
  assert.match(other, /value="SGAMSRAP-8777"/);
  assert.doesNotMatch(form({ vendorTicket: 'TEC: MOCA' }), /Remedy ya trae/);
});

test('unir: los tickets abiertos como tarjetas y el botón Unir al ticket', () => {
  const html = form({}, { mode: 'link' });
  assert.match(html, /name="linked" value="SISUPAC-9211"/);
  assert.match(html, /5 issues esperando/);
  assert.match(html, /data-esc-ok>Unir al ticket</);
  assert.match(live({ linkedOther: 'MOCA' }).html.linked, /no es un ticket/);
  assert.match(live({ linkedOther: 'itd: era-4170' }).html.linked, /se guardará como <b>ERA-4170/);
});

test('al elegir el destino salen las cajas que le tocan y lo recomendable', () => {
  const n3 = live({ dest: 'sisupac', jiraPriority: 'MEDIUM', reason: 'Timeouts de 8 a 12 s en el túnel RFID' });
  assert.deepEqual(n3.show, { other: false, jira: true, dev: true });
  assert.equal(n3.html.sentTag, '(opcional)');
  assert.equal((n3.html.check.match(/class="ok"/g) || []).length, 2);
  const mail = live({ dest: 'operaciones' });
  assert.deepEqual(mail.show, { other: false, jira: false, dev: false });
  assert.equal(mail.html.sentTag, '(recomendado)');
  assert.match(mail.html.check, /<li class="todo">.*Cuentas qué has enviado/);
  assert.deepEqual(live({ dest: 'other' }).show, { other: true, jira: false, dev: false });
  assert.match(live({ dest: 'sisupac', jiraPriority: 'BLOCKER' }).html.check, /la elegida no es la que le toca/);
});

test('el asunto del chat de N3 cambia con el destino elegido', () => {
  assert.match(live({ dest: '' }).html.subject, /&quot;MÓDULO&quot;/);
  assert.match(live({ dest: 'wospac' }).html.subject, /&quot;WOSPAC&quot; - INC000027698079 - 100497/);
  assert.match(form(), /<code data-esc-live="subject">/);
});

test('los desplegables de Escalar: el de la web, con lo elegido o lo que toca', () => {
  assert.match(form({}, { dest: 'sisupac' }), /name="dest" value="sisupac">[\s\S]*data-pick-label>SISUPAC · N3 SISU</);
  assert.match(form(), /name="dest" value="">[\s\S]*data-pick-label class="pick-ph">Elige el equipo</);
  assert.match(form({ priority: 'HIGH' }), /name="jiraPriority" value="HIGH"/);
});

test('lo que se dejó escrito vuelve al abrir, tal cual y sin aviso', () => {
  const html = form({}, { dest: 'returns', reason: 'Lo mío' });
  assert.match(html, /name="dest" value="returns">/);
  assert.match(html, />Lo mío<\/textarea>/);
  assert.doesNotMatch(html, /Sigues con|Descartar/);
});
