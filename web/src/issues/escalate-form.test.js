import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateForm, sendHtml, summaryHtml, closePhases, linkedText, startValues } from './escalate-form.js';
import { resolveBlocked } from './resolve-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

const issue = (o = {}) => ({ id: 'INC000027698079', priority: 'MEDIUM', status: 'IN_PROGRESS', vendorTicket: '', center: '100497', ...o });
const ANALYSIS = { at: '2026-10-28 10:30', who: 'ANA', text: 'Timeouts de 8 a 12 s en el túnel RFID' };
const CHECK = { notes: [], missing: [], analysis: ANALYSIS };
const form = (o = {}, saved = null, check = CHECK) => escalateForm({ issue: issue(o), dests: DESTINATIONS, open: OPEN_TICKETS, check, saved });
const send = (v, o) => sendHtml({ mode: 'escalate', ...v }, { issue: issue(o), dests: DESTINATIONS });

test('el asistente: el aspecto de Resolver, cuatro pasos y sin texto de más', () => {
  const html = form();
  assert.match(html, /<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1"/);
  assert.match(html, /<h3>Escalar incidencia<\/h3><span class="rv-id">INC000027698079<\/span>/);
  assert.deepEqual([...html.matchAll(/data-step-mark="\d"[^>]*><i>\d<\/i><span>([^<]+)/g)].map((m) => m[1]), ['A quién', 'Qué pasa', 'Cómo se envía', 'Revisar']);
  assert.match(html, /<b>Escalar a un equipo<\/b><\/label>/);
  assert.match(html, /<b>Unir a un ticket abierto<\/b><\/label>/);
  assert.equal((html.match(/class="pick-group"/g) || []).length, 4);   // N3, N2, otros canales y fuera del mapa
  assert.match(html, /data-step-next>Qué pasa</);
  // lo que se quitó: los textos de las tarjetas, «Para que llegue bien», las etiquetas y la nota fija de Remedy
  assert.doesNotMatch(html, /Nadie lo ha escalado|Para que llegue bien|\(recomendado\)|\(opcional\)|Aún no se envía|<select|Plazos/);
});

test('«Qué pasa» empieza con la nota de análisis de Remedy, con su marca para restaurarla (TC-06)', () => {
  const html = form();
  assert.match(html, />Timeouts de 8 a 12 s en el túnel RFID<\/textarea>/);
  assert.match(html, /data-restore-note data-original="Timeouts de 8 a 12 s en el túnel RFID" disabled>.*Se completó el 28\/10 10:30 por ANA/);
  assert.match(form({}, { mode: 'escalate', reason: 'Lo mío', step: 2 }), /class="rv-done changed" data-restore-note/);
});

test('resuelta: se escala por la causa raíz y sigue Resuelta (TC-05)', () => {
  const html = form({ status: 'RESOLVED' });
  assert.match(html, /<h3>Escalar por la causa raíz<\/h3>/);
  assert.match(html, /<em>Sigue Resuelta<\/em>/);
  assert.match(form(), /<em>Pasa a Pendiente \(proveedor\) · se avisa al centro<\/em>/);
  assert.doesNotMatch(closePhases({ mode: 'escalate' }, true), /Pendiente/);
  assert.deepEqual([...closePhases({ mode: 'escalate' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Registrando el escalado', 'Avisando al centro', 'Pasando a Pendiente (proveedor)']);
  assert.deepEqual([...closePhases({ mode: 'link' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Uniendo al ticket', 'Pasando a Pendiente (proveedor)']);
});

test('si la foto trae un ticket, se propone unirla a él, de la lista o como otro (TC-02)', () => {
  const values = (vendorTicket) => startValues({ issue: issue({ vendorTicket }), open: OPEN_TICKETS, check: CHECK, saved: null });
  assert.deepEqual([values('ITD: SISUPAC-9211').mode, values('ITD: SISUPAC-9211').linked], ['link', 'SISUPAC-9211']);
  assert.deepEqual([values('TEC: SGAMSRAP-8777').linked, values('TEC: SGAMSRAP-8777').linkedOther], ['other', 'SGAMSRAP-8777']);
  assert.equal(values('TEC: MOCA').mode, 'escalate');
  const html = form({ vendorTicket: 'ITD: SISUPAC-9211' });
  assert.match(html, /name="mode" value="link" checked/);
  assert.match(html, /name="linked" value="SISUPAC-9211" checked/);
  assert.match(html, /5 issues esperando/);
  assert.match(linkedText('MOCA'), /no es un ticket/);
  assert.match(linkedText('itd: era-4170'), /se guardará como <b>ERA-4170/);
});

test('paso 3: lo que pide el destino (TC-03); lo que no le toca, oculto para no perderlo', () => {
  const n3 = send({ dest: 'sisupac' });
  assert.match(n3, /Prioridad del Jira/);
  assert.match(n3, /name="jiraPriority" value="MEDIUM"/);
  assert.match(n3, /Lo mínimo para N3 de desarrollo/);
  assert.match(n3, /N3 - &quot;SISUPAC&quot; - INC000027698079 - 100497/);
  assert.match(n3, /<input type="hidden" name="sent"/);
  assert.match(send({ dest: 'sisupac' }, { priority: 'HIGH' }), /name="jiraPriority" value="HIGH"/);
  const mail = send({ dest: 'operaciones', sent: 'Correo', jiraPriority: 'HIGH' });
  assert.match(mail, /¿Qué has enviado y por dónde\?<\/span><textarea class="rv-ed" id="iss-f-sent" name="sent">Correo</);
  assert.match(mail, /<input type="hidden" name="jiraPriority" value="HIGH"/);
  assert.doesNotMatch(mail, /N3 de desarrollo/);
  assert.doesNotMatch(send({ dest: 'returns' }), /N3 de desarrollo|name="sent">/);   // N2 por IOP: su Jira y nada más
});

test('revisar: lo escrito en cada paso, que lleva de vuelta a él', () => {
  const html = summaryHtml({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'CRITICAL', sent: 'no sale' }, DESTINATIONS);
  assert.deepEqual([...html.matchAll(/data-go="(\d)"/g)].map((m) => m[1]), ['1', '2', '3']);
  assert.match(html, /<b>A quién<\/b><\/span><span class="rv-sum-x">SISUPAC · N3 SISU</);
  assert.match(html, /<b>Qué pasa<\/b><em data-level="low">Muy corta<\/em>/);
  assert.match(html, /Por SIGLO · abre un Jira de SISUPAC · Prioridad del Jira: Crítico</);
  assert.doesNotMatch(html, /no sale/);   // abre una herramienta: la evidencia no cuenta
});

test('lo que se dejó escrito vuelve al abrir, tal cual', () => {
  const html = form({}, { at: '2026-10-28T14:20:00.000Z', mode: 'escalate', dest: 'returns', reason: 'Lo mío', step: 3 });
  assert.match(html, /name="dest" value="returns">/);
  assert.match(html, />Lo mío<\/textarea>/);
  assert.match(html, /Borrador guardado \d\d\/10 \d\d:20/);
});

test('sin las notas del método, el mismo aviso que Resolver, con su título y su botón (TC-07, TC-08)', () => {
  const check = { notes: [{ key: 'initial', label: 'Situación inicial', note: { at: '2026-10-28 10:00', who: 'ANA' } }, { key: 'analysis', label: 'Análisis', note: null }, { key: 'major', label: '¿Es mayor incidente?', note: null }], missing: ['Análisis', '¿Es mayor incidente?'] };
  const html = resolveBlocked('INC1', check, { title: 'Aún no se puede escalar', chat: 'data-escalate-chat' });
  assert.match(html, /<h3 id="rb-title">Aún no se puede escalar<\/h3>/);
  assert.match(html, /<li class="no">.*<span>Análisis<\/span><small>Falta<\/small>/);
  assert.match(html, /<span>¿Es mayor incidente\?<\/span><small>Falta/);
  assert.match(html, /data-escalate-chat>Completar con ayuda de la IA/);
  assert.match(resolveBlocked('INC1', { notes: [], missing: [] }), /Aún no se puede resolver[\s\S]*data-resolve-chat>/);   // Resolver, como estaba
});
