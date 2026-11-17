import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateForm, requirementsHtml, summaryHtml, filesHtml, ticketHtml, doneHtml, closePhases, linkedText, startValues, withoutLevel } from './escalate-form.js';
import { resolveBlocked } from './resolve-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

const issue = (o = {}) => ({ id: 'INC000027698079', priority: 'MEDIUM', status: 'IN_PROGRESS', vendorTicket: '', center: '100497', ...o });
const note = (text) => ({ at: '2026-10-28 10:30', who: 'ANA', text });
const ANALYSIS = note('Timeouts de 8 a 12 s en el túnel RFID');
const NOTES = [['initial', 'Situación inicial', 'No lee el túnel'], ['background', 'Antecedentes', 'Sin KB ni Jira'], ['analysis', 'Análisis', ANALYSIS.text]].map(([key, label, t]) => ({ key, label, note: note(t) }));
const CHECK = { notes: NOTES, missing: [], analysis: ANALYSIS, background: NOTES[1].note };
const form = (o = {}, saved = null, check = CHECK) => escalateForm({ issue: issue(o), dests: DESTINATIONS, open: OPEN_TICKETS, check, saved });
const reqs = (v, o) => requirementsHtml({ mode: 'escalate', ...v }, { issue: issue(o), dests: DESTINATIONS });
const steps = (html) => [...html.matchAll(/data-step-mark="\d"[^>]*><i>\d<\/i><span>([^<]+)/g)].map((m) => m[1]);

test('el asistente: el aspecto de Resolver, cinco pasos y sin texto de más', () => {
  const html = form();
  assert.match(html, /<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1"/);
  assert.match(html, /<h3>Escalar incidencia<\/h3><span class="rv-id">INC000027698079<\/span>/);
  assert.deepEqual(steps(html), ['Ticket abierto', 'A quién', 'Motivo', 'Requisitos', 'Resumen']);
  assert.match(html, /<input type="hidden" name="mode" value="escalate" \/>/);
  // fuera: el desplegable de destinos, «Cómo se envía» y los textos de relleno
  assert.doesNotMatch(html, /data-pick|<select|Cómo se envía|Por SIGLO ·|Para que llegue bien|\(recomendado\)|Aún no se envía/);
});

test('paso 1: primero, si ya hay un ticket abierto, con los antecedentes y la ayuda de la IA', () => {
  const html = form();
  assert.match(html, /<b>¿Ya hay un ticket abierto\?<\/b><button type="button" class="rv-link iss-esc-ai" data-esc-ai>Buscarlo con la IA<\/button>/);
  assert.match(html, /<h4>Antecedentes <small>28\/10 10:30 · ANA<\/small><\/h4>\s*<p>Sin KB ni Jira<\/p>/);
  assert.match(html, /name="linked" value="SISUPAC-9211"/);
  assert.match(html, /5 issues esperando/);
  assert.doesNotMatch(form({}, null, { ...CHECK, background: null }), /Antecedentes/);
});

test('si la foto trae un ticket, se propone unirla a él, de la lista o como otro (TC-02)', () => {
  const values = (vendorTicket) => startValues({ issue: issue({ vendorTicket }), open: OPEN_TICKETS, check: CHECK, saved: null });
  assert.deepEqual([values('ITD: SISUPAC-9211').mode, values('ITD: SISUPAC-9211').linked], ['link', 'SISUPAC-9211']);
  assert.deepEqual([values('TEC: SGAMSRAP-8777').linked, values('TEC: SGAMSRAP-8777').linkedOther], ['other', 'SGAMSRAP-8777']);
  assert.equal(values('TEC: MOCA').mode, 'escalate');
  const html = form({ vendorTicket: 'ITD: SISUPAC-9211' });
  assert.match(html, /name="mode" value="link"/);
  assert.match(html, /name="linked" value="SISUPAC-9211" checked/);
  assert.match(linkedText('MOCA'), /no es un ticket/);
  assert.match(linkedText('itd: era-4170'), /se guardará como <b>ERA-4170/);
});

test('paso 2: los destinos en cajas por nivel, cada uno con su ayuda, y la ayuda de la IA', () => {
  const html = form({}, { mode: 'escalate', dest: 'returns' });
  assert.deepEqual([...html.matchAll(/<section class="iss-esc-group">\s*<h4>([^<]+)/g)].map((m) => m[1]), ['N3 por SIGLO', 'N2 por IOP', 'Otros canales', 'Fuera del mapa']);
  assert.equal((html.match(/name="dest" value=/g) || []).length, DESTINATIONS.length + 1);
  assert.match(html, /<label class="iss-esc-seg"><input type="radio" class="iss-sr" name="dest" value="returns" checked \/><span>Soporte Returns<\/span><\/label>/);   // como el selector de idioma de Resolver
  // en N3 y N2 el grupo ya dice el nivel: el botón no lo repite; en «Otros canales», sí
  const names = (group) => [...html.split(`<h4>${group}</h4>`)[1].split('</section>')[0].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(names('N3 por SIGLO'), ['SISUPAC · SISU', 'SISUSTOCK · SISU', 'SGAEWMSAP · SGA', 'WOSPAC · SGA', 'ERA']);
  assert.deepEqual(names('N2 por IOP'), ['Courier Support', 'Soporte Returns', 'Stock Solutions', 'Maestros']);
  assert.deepEqual(names('Otros canales'), ['CHANGEMGT · N3', 'Teleco · N2', 'AS400 · N2', 'Operaciones/Implantaciones · N2']);
  assert.equal(withoutLevel('N2 Courier Support'), 'Courier Support');
  assert.match(html, /data-dest-help="sisupac" aria-label="Qué cubre SISUPAC · N3 SISU"/);   // la ayuda, con el nombre entero
  assert.doesNotMatch(html, /data-dest-help="other"/);
  assert.match(html, /data-esc-help>¿Dudas\? Pregúntale a la IA/);
  // el nombre del equipo de fuera del mapa, en la misma fila que su opción: su hueco está siempre
  assert.match(html, /name="dest" value="other" \/><span>Otro equipo, fuera del mapa<\/span><\/label><\/div><label class="iss-field iss-esc-otherbox" for="iss-f-destOther" data-esc-other hidden><input id="iss-f-destOther" name="destOther" value="" placeholder="Equipo o proveedor"/);
  assert.doesNotMatch(form({}, { mode: 'escalate', dest: 'other' }), /data-esc-other hidden/);
});

test('paso 3: «Motivo del escalado» empieza con la nota [ANALISIS], con «Restaurar» y los archivos (TC-06)', () => {
  const html = form();
  assert.match(html, /<b>Motivo del escalado<\/b>/);
  // el editor de Resolver (fichas [imagenN]) con su campo oculto
  assert.match(html, /<div class="rv-ed" contenteditable="plaintext-only" id="iss-f-reason" data-ed="reason"[^>]*>Timeouts de 8 a 12 s en el túnel RFID<\/div><input type="hidden" name="reason" value="Timeouts de 8 a 12 s en el túnel RFID" \/>/);
  assert.match(form({}, { mode: 'escalate', reason: 'Ver [imagen1]', step: 3 }), /Ver <span class="rv-chip"[^>]*data-n="1">\[imagen1\]<\/span>/);
  assert.match(html, /data-restore-note data-original="Timeouts de 8 a 12 s en el túnel RFID" disabled>.*Se completó el 28\/10 10:30 por ANA/);
  assert.match(form({}, { mode: 'escalate', reason: 'Lo mío', step: 3 }), /class="rv-done changed" data-restore-note/);
  assert.match(html, /<aside class="rv-dock" data-esc-dock>\s*<p class="rv-dock-hint">Suelta aquí los archivos<\/p>/);   // el muelle de Resolver
  assert.match(html, /<input type="file" multiple data-esc-files \/>.*<span>Archivos<\/span><small>Pulsa, pega o arrastra<\/small>/);
  // las imágenes, con su miniatura y su [imagenN] para arrastrarla al texto; los demás, en lista
  const files = filesHtml([{ name: 'logs <1>.zip', size: 2048 }, { name: 'cap.png', size: 1024, n: 2, url: 'blob:x' }]);
  assert.match(files, /^<figure class="rv-img" draggable="true" data-img="2" title="cap\.png · 1 KB\. Arrástrala al texto para colocarla"><img src="blob:x" alt="" \/><figcaption>\[imagen2\]<\/figcaption><button type="button" class="rv-img-x" data-file-drop="1"/);
  assert.match(files, /<ul class="rv-extras"><li><span>logs &lt;1&gt;\.zip<\/span><small>2 KB<\/small><button type="button" class="rv-img-x" data-file-drop="0"/);
  assert.equal(filesHtml([]), '');
});

test('paso 4: la prioridad en tarjetas con su explicación aparte, lo mínimo en casillas (TC-03)', () => {
  const n3 = reqs({ dest: 'sisupac', jiraPriority: 'MEDIUM', mins: 'logs' });
  assert.match(n3, /<h4>Prioridad del Jira<\/h4>/);
  assert.match(n3, /name="jiraPriority" value="BLOCKER" \/><b>Bloqueo<\/b><small>Bug repetitivo/);
  assert.match(n3, /name="jiraPriority" value="MEDIUM" checked \/><b>Importante<\/b><em>La de su criticidad<\/em>/);
  assert.match(n3, /<h4>Lo mínimo para SISUPAC · N3 SISU<\/h4>/);
  // lo mínimo, como la lista de puntos del aviso de Resolver: una fila por punto, con su estado y,
  // en el chat, el asunto para copiar
  assert.match(n3, /<li><label><input type="checkbox" class="iss-sr" data-min="form" \/><i><svg.*<\/i><span><b>Formulario de SIGLO<\/b>Con el análisis previo y las evidencias\.<\/span><small data-on>Hecho<\/small><small data-off>Falta<\/small>/);
  assert.match(n3, /data-min="logs" checked \/>/);
  assert.match(n3, /<li class="opt"><label><input type="checkbox" class="iss-sr" data-min="chat" \/>.*<small data-off>Si aplica<\/small>/);
  assert.match(n3, /<p class="iss-esc-subject"><code>N3 - &quot;SISUPAC&quot; - INC000027698079 - 100497<\/code><button type="button" class="rv-link" data-copy="N3 - &quot;SISUPAC&quot; - INC000027698079 - 100497">Copiar asunto<\/button><\/p>/);
  assert.match(n3, /<input type="hidden" name="sent"/);
  assert.match(n3, /<input type="hidden" name="mins" value="logs" \/>/);
  assert.match(reqs({ dest: 'sisupac' }, { priority: 'HIGH' }), /value="HIGH" checked \/><b>Muy importante<\/b><em>/);
  const mail = reqs({ dest: 'operaciones', sent: 'Correo', jiraPriority: 'HIGH' });
  assert.match(mail, /<h4>¿Qué has enviado y por dónde\?<\/h4>\s*<p class="iss-esc-hint">Operaciones\/Implantaciones · N2 no abre ticket: lo que escribas aquí es la prueba del escalado\.<\/p>/);
  assert.match(mail, /<textarea class="rv-ed iss-esc-sent" id="iss-f-sent" name="sent"[^>]*placeholder="Ej\.: [^"]+">Correo</);
  assert.match(mail, /<input type="hidden" name="jiraPriority" value="HIGH" \/>/);
  assert.doesNotMatch(mail, /Lo mínimo|Prioridad del Jira/);
  assert.match(reqs({ dest: 'maestros' }), /No pide nada más/);   // N2 por IOP con incidencia de Remedy
});

test('paso 5: el resumen como el de Resolver: las notas de Remedy y lo de cada paso, con su calidad', () => {
  const html = summaryHtml({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'CRITICAL', mins: 'form,logs', sent: 'no sale' },
    { issue: issue(), dests: DESTINATIONS, check: CHECK, files: [{ name: 'a.zip', size: 1 }] });
  assert.deepEqual([...html.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ['Situación inicial', 'Antecedentes', 'Análisis', 'A quién', 'Motivo', 'Requisitos']);
  assert.match(html, /<div class="rv-sum-note"><span class="rv-sum-h"><b>Situación inicial<\/b><em data-level="low">Muy corta<\/em>/);   // las de Remedy no llevan a ningún paso
  assert.deepEqual([...html.matchAll(/data-go="(\d)"/g)].map((m) => m[1]), ['2', '3', '4']);
  assert.match(html, /<b>Motivo<\/b><em data-level="low">Muy corta<\/em><small><svg[^]*?<\/svg>1 archivo<\/small><\/span><span class="rv-sum-x">Timeouts</);   // en la etiqueta, como las imágenes en Resolver
  assert.match(html, /Prioridad del Jira: Crítico · Lo mínimo: 2 de 3 confirmado</);
  assert.doesNotMatch(html, /no sale/);   // abre una herramienta: la evidencia no cuenta
  // a todo el ancho, sin la columna de opciones de Resolver: lo que pasa al escalar, bajo el título
  assert.match(form(), /<section class="rv-gen-sum iss-esc-review" data-esc-review>\s*<h4>Lo que has escrito<\/h4>\s*<p class="iss-esc-after">Al escalar, la issue pasa a Pendiente \(proveedor\) y se avisa al centro\.<\/p>\s*<ol data-summary><\/ol>/);
  assert.doesNotMatch(form(), /rv-gen-opts/);
});

test('antes de escalar, el borrador del ticket, como el informe de Resolver: lo escrito, las notas y los adjuntos', () => {
  const t = ticketHtml({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'HIGH', mins: 'logs' },
    { issue: issue({ text: 'No lee el túnel RFID' }), dests: DESTINATIONS, check: CHECK, files: [{ name: 'logs.zip', size: 4096 }] });
  assert.deepEqual([...t.matchAll(/<h5>([^<]+)<\/h5><p>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]), [
    ['Destino', 'SISUPAC · N3 SISU · Jira de SISUPAC'], ['Prioridad del Jira', 'Muy importante'], ['Título', 'INC000027698079 · No lee el túnel RFID'],
    ['Motivo del escalado', 'Timeouts'], ['Análisis previo', ANALYSIS.text], ['Antecedentes', 'Sin KB ni Jira'], ['Lo mínimo', 'Logs'],
  ]);
  assert.match(t, /contenteditable="true"[^>]*aria-label="Borrador del ticket"/);   // se puede retocar, como en Resolver
  assert.match(t, /<div class="rv-rep-att"><i><svg[^]*?<\/svg><\/i><div><b>logs\.zip<\/b><small>Adjunto · 4 KB<\/small>/);
  const mail = ticketHtml({ mode: 'escalate', dest: 'operaciones', reason: 'x', sent: 'Correo de las 10:12' }, { issue: issue(), dests: DESTINATIONS, check: CHECK });
  assert.match(mail, /<h5>Destino<\/h5><p>Operaciones\/Implantaciones · N2 · sin ticket<\/p>/);
  assert.match(mail, /<h5>Evidencia<\/h5><p>Correo de las 10:12<\/p>/);
  assert.doesNotMatch(mail, /Prioridad del Jira|Lo mínimo|rv-rep-att/);
  assert.match(form(), /<b>Borrador del ticket<\/b><em>Revísalo antes de escalar<\/em>/);
  assert.match(form(), /data-esc-preview hidden>Ver el ticket</);
});

test('resuelta: se escala por la causa raíz y sigue Resuelta (TC-05)', () => {
  const html = form({ status: 'RESOLVED' });
  assert.match(html, /<h3>Escalar por la causa raíz<\/h3>/);
  assert.match(html, /la issue sigue Resuelta/);
  assert.match(form(), /la issue pasa a Pendiente \(proveedor\) y se avisa al centro/);
  assert.doesNotMatch(closePhases({ mode: 'escalate' }, true), /Pendiente/);
  assert.deepEqual([...closePhases({ mode: 'escalate' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Registrando el escalado', 'Avisando al centro', 'Pasando a Pendiente (proveedor)']);
  assert.deepEqual([...closePhases({ mode: 'link' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Uniendo al ticket', 'Pasando a Pendiente (proveedor)']);
});

test('al acabar: lo hecho y el ticket para copiarlo; el de un escalado, de ejemplo hasta conectar Jira', () => {
  const sample = doneHtml({ ticket: 'SISUPAC-0000', sample: true }, 'SISUPAC · N3 SISU', 'escalate', false);
  assert.match(sample, /<h4>Escalada a SISUPAC · N3 SISU<\/h4>/);
  assert.match(sample, /<span>Ticket generado<\/span><code>SISUPAC-0000<\/code><button type="button" class="lab-btn" data-copy="SISUPAC-0000">Copiar<\/button>/);
  assert.match(sample, /De ejemplo: el ticket real llegará al conectar Jira/);
  const linked = doneHtml({ ticket: 'SISUPAC-9211', sample: false }, 'SISUPAC-9211', 'link', false);
  assert.match(linked, /<h4>Unida a SISUPAC-9211<\/h4>/);
  assert.match(linked, /<span>Ticket<\/span>/);
  assert.doesNotMatch(linked, /De ejemplo/);
  assert.doesNotMatch(doneHtml(null, 'Operaciones', 'escalate', false), /Ticket/);   // por correo: sin ticket
  assert.match(doneHtml(null, 'X', 'escalate', true), /sigue Resuelta/);
  assert.match(form(), /data-esc-close hidden>Cerrar</);
});

test('lo que se dejó escrito vuelve al abrir, tal cual', () => {
  const html = form({}, { at: '2026-10-28T14:20:00.000Z', mode: 'escalate', dest: 'returns', reason: 'Lo mío', step: 3 });
  assert.match(html, /name="dest" value="returns" checked/);
  assert.match(html, /data-ed="reason"[^>]*>Lo mío<\/div>/);
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
