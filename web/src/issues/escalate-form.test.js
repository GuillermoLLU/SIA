import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateForm, escalateLive } from './escalate-form.js';
import { DESTINATIONS, OPEN_TICKETS, TEST_CASES } from './escalate-mock.js';

const now = new Date('2026-10-29T12:00:00');
const issue = (o = {}) => ({ id: 'INC000027698079', priority: 'MEDIUM', status: 'IN_PROGRESS', reported: '2026-10-29 08:00', claimedBy: null, vendorTicket: '', center: '100497', ...o });
const form = (o = {}, v) => escalateForm({ issue: issue(o), now, dests: DESTINATIONS, open: OPEN_TICKETS, v });
const live = (v) => escalateLive(v, { issue: issue(), dests: DESTINATIONS });

test('el modal se explica solo: qué es escalar, el reloj arriba y las dos opciones como tarjetas', () => {
  const html = form();
  assert.match(html, /<h3>Escalar la issue<\/h3><span class="iss-act-id">INC000027698079<\/span>/);
  assert.match(html, /Cuando en soporte no se puede resolver, se pasa al equipo que puede/);
  assert.match(html, /iss-esc-clock"><b>Quedan 4 h<\/b> para el escalado formal · media o baja: 8 h desde que se creó/);
  assert.match(html, /<label class="iss-esc-card"><input type="radio" class="iss-sr" name="mode" value="escalate" checked \/><b>Escalar a otro equipo<\/b>/);
  assert.match(html, /<b>Unir a un ticket ya abierto<\/b>/);
  assert.equal((html.match(/<optgroup/g) || []).length, 3);
  assert.match(html, /placeholder="Ej\.:/);
  assert.match(html, /<details class="iss-esc-box">/);
  assert.doesNotMatch(html, /nivel 1/);
  assert.doesNotMatch(html, /Datos de prueba/);
  assert.match(escalateForm({ issue: issue(), now, dests: DESTINATIONS, open: OPEN_TICKETS, cases: TEST_CASES }), /Datos de prueba/);
});

test('escalar a un equipo no pide el ticket de proveedor', () => {
  const html = form();
  assert.doesNotMatch(html, /Ticket de proveedor/);
  assert.doesNotMatch(html, /name="ticket"/);
});

test('crítica: los niveles de escalado y el plazo vencido, en rojo', () => {
  const html = form({ priority: 'CRITICAL' });
  assert.match(html, /nivel 1/);
  assert.match(html, /iss-esc-clock late"><b>Te has pasado/);
});

test('resuelta: se escala por la causa raíz y sigue Resuelta', () => {
  const html = form({ status: 'RESOLVED' });
  assert.match(html, /Escalar por la causa raíz/);
  assert.match(html, /la issue sigue Resuelta/);
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

test('al elegir el destino: qué pasa, en palabras de quien no lo ha hecho nunca', () => {
  const n3 = live({ dest: 'sisupac', jiraPriority: 'MEDIUM', reason: 'Timeouts de 8 a 12 s en el túnel RFID' });
  assert.deepEqual(n3.show, { other: false, jira: true, dev: true });
  assert.match(n3.html.dest, /N3, el equipo que mantiene el módulo\. Se escala por SIGLO y abre un Jira: el ticket llega solo a la issue/);
  assert.equal(n3.html.sentTag, '(opcional)');
  assert.equal((n3.html.check.match(/class="ok"/g) || []).length, 2);
  const mail = live({ dest: 'operaciones' });
  assert.match(mail.html.dest, /no queda rastro en ninguna herramienta.*Si es alta o crítica, llama además/);
  assert.equal(mail.html.sentTag, '(recomendado)');
  assert.match(mail.html.check, /<li class="todo">.*Cuentas qué has enviado/);
  assert.match(live({ dest: 'sisupac', jiraPriority: 'BLOCKER' }).html.check, /la elegida no es la que le toca/);
});

test('el asunto del chat de N3 cambia con el destino elegido', () => {
  assert.match(live({ dest: '' }).html.subject, /&quot;MÓDULO&quot;/);
  assert.match(live({ dest: 'wospac' }).html.subject, /&quot;WOSPAC&quot; - INC000027698079 - 100497/);
  assert.match(form(), /<code data-esc-live="subject">/);
});

test('los casos de prueba cambian la issue sin tocar la original', () => {
  const base = issue();
  const crit = TEST_CASES.find((c) => c.id === 'crit-ok').apply(base, now);
  assert.equal(crit.priority, 'CRITICAL');
  assert.equal(base.priority, 'MEDIUM');
  assert.equal(TEST_CASES[0].apply(base, now), base);
});
