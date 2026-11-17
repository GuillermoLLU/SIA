import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateForm, requirementsHtml, summaryHtml, filesHtml, ticketHtml, doneHtml, closePhases, linkedText, startValues, withoutLevel, searchingHtml, searchPhases, ticketDetailHtml } from './escalate-form.js';
import { findEscalations } from './escalate.js';
import { resolveBlocked } from './resolve-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

const issue = (o = {}) => ({ id: 'INC000027698079', priority: 'MEDIUM', status: 'IN_PROGRESS', vendorTicket: '', center: '100497', ...o });
const note = (text) => ({ at: '2026-10-28 10:30', who: 'ANA', text });
const ANALYSIS = note('Timeouts de 8 a 12 s en el túnel RFID');
const NOTES = [['initial', 'Situación inicial', 'No lee el túnel'], ['recurrence', 'Recurrencia', 'Ninguna abierta en el centro'], ['background', 'Antecedentes', 'Sin KB ni Jira'], ['analysis', 'Análisis', ANALYSIS.text]].map(([key, label, t]) => ({ key, label, note: note(t) }));
const CHECK = { notes: NOTES, missing: [], analysis: ANALYSIS, background: NOTES[2].note };
const FOUND = findEscalations(issue(), OPEN_TICKETS);   // SGA, centro 100497: SISUPAC-9211 e ITSMECOM-5804475
const form = (o = {}, saved = null, found = FOUND) => escalateForm({ issue: issue(o), dests: DESTINATIONS, found, check: CHECK, saved });
const reqs = (v, o) => requirementsHtml({ mode: 'escalate', ...v }, { issue: issue(o), dests: DESTINATIONS });
const steps = (html) => [...html.matchAll(/data-step-mark="\d"(?:(?! hidden)[^>])*><i>\d<\/i><span>([^<]+)/g)].map((m) => m[1]);

test('el asistente: el aspecto de Resolver, los pasos de cada flujo y sin texto de más', () => {
  const html = form();
  assert.match(html, /<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1"/);
  assert.match(html, /<h3>Escalar incidencia<\/h3><span class="rv-id">INC000027698079<\/span>/);
  // la decisión del principio (unir o nuevo) no es un paso: la barra no la lleva y empieza oculta
  assert.match(html, /<ol class="rv-steps" hidden>/);
  assert.deepEqual(steps(html), ['A quién', 'Motivo', 'Requisitos', 'Resumen']);
  assert.deepEqual([...html.matchAll(/data-step-mark="(\d)"[^>]*><i>(\d)<\/i>/g)].filter((m) => m[1] !== '6').map((m) => m[2]), ['1', '2', '3', '4'], 'numerados del 1 al 4');
  assert.doesNotMatch(html, /data-step-mark="1"|aria-current/);
  assert.deepEqual(steps(form({ vendorTicket: 'SISUPAC-9211' })), ['Actualizar escalado']);   // al unir, solo el comentario
  assert.match(form({ vendorTicket: 'SISUPAC-9211' }), /data-step-mark="6" class="last"><i>1<\/i><span>Actualizar escalado/);
  assert.match(html, /<input type="hidden" name="mode" value="escalate" \/>/);
  // fuera: el desplegable de destinos, «Cómo se envía» y los textos de relleno
  assert.doesNotMatch(html, /data-pick|<select|Cómo se envía|Por SIGLO ·|Para que llegue bien|\(recomendado\)|Aún no se envía/);
});

test('al abrir por el paso 1, la búsqueda de escalados del mismo problema va dentro del modal, con el cargador común', () => {
  const html = searchingHtml();
  assert.match(html, /^<div class="iss-esc-searching"><div class="ld" data-loader>/);   // el cargador común (ui/loader.js)
  assert.doesNotMatch(html, /rb-list|rb-icon|lab-btn/, 'sin los puntos ya cumplidos ni botones: se busca sola');
  // con los criterios del equipo: SGA por centro, SISU por módulo
  assert.deepEqual([...searchPhases({ center: '100497' }).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Mismo centro · 100497', 'Resumen parecido']);
  assert.match(searchPhases({ sisu: true }), /<\/i>Mismo módulo</);
});

test('al abrir: arriba el buscador de tickets de Jira y debajo las coincidencias, con por qué ha salido cada una', () => {
  const html = form();
  assert.match(html, /<section class="rv-step rv-step-one iss-esc-pick" data-rstep="1">\s*<div class="iss-esc-find">\s*<input type="radio" class="iss-sr" name="linked" value="other"[^>]*\/>\s*<i><svg[\s\S]*?<\/i>\s*<input name="linkedOther"[^>]*placeholder="Busca un ticket de Jira: PROYECTO-número o INC…" aria-label="Buscar un ticket de Jira"/, 'el buscador, lo primero');
  assert.match(html, /<\/div>\s*<div class="rv-cap"><b>Tickets que pueden tener similitud con esta incidencia<\/b><\/div>\s*<div class="rv-text">\s*<fieldset class="iss-esc-open">/, 'debajo, las coincidencias');
  assert.deepEqual([...html.matchAll(/name="linked" value="([^"]+)"/g)].map((m) => m[1]), ['other', 'SISUPAC-9211', 'ITSMECOM-5804475']);
  assert.match(html, /5 issues esperando/);
  assert.match(html, /<span class="iss-esc-why"><small>Mismo centro · Resumen parecido<\/small><button type="button" class="rv-link" data-ticket-detail="SISUPAC-9211">Ver detalle<\/button><\/span>/);
  assert.doesNotMatch(html, /data-esc-ai|<h4>Antecedentes|INC000027778368/);   // la del otro centro no sale
  assert.doesNotMatch(html, /<b>Otro escalado<\/b>|data-esc-new/, 'ni la tarjeta de otro escalado ni un segundo botón');
  assert.match(form({}, null, []), /Ningún escalado del mismo problema/);
});

test('el detalle de un ticket sugerido, sin salir de SIA: volver al listado, sus datos, lo que dice y quién espera', () => {
  const o = OPEN_TICKETS[0];
  const html = ticketDetailHtml(o, DESTINATIONS);
  // una sola fila arriba: volver a la izquierda, el título en el centro y el ticket a la derecha
  assert.match(html, /^<header class="iss-esc-detail-h">\s*<button type="button" class="lab-btn iss-esc-detail-back" data-detail-back><svg[\s\S]*?<\/svg>Volver al listado<\/button>\s*<h3>Lentitud RFID en packing<\/h3>\s*<b class="iss-mono">SISUPAC-9211<\/b>\s*<\/header>/);
  assert.deepEqual([...html.matchAll(/<dt>([^<]+)<\/dt><dd>(.*?)<\/dd>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]),
    [['Estado', 'En curso'], ['Prioridad', 'Muy importante'], ['Equipo', 'SISUPAC · N3 SISU'], ['Abierto', '27/10 09:12'], ['Último movimiento', '29/10 11:40'], ['Esperando', '5 incidencias']]);
  assert.match(html, /<h4>Último comentario<\/h4><p><small>Equipo SISUPAC · 29\/10 11:40<\/small>Identificado un bloqueo/);
  assert.equal((html.match(/<li><span class="iss-mono">INC\d{12}<\/span> · \d+<\/li>/g) || []).length, 5);
  assert.doesNotMatch(html, /Jira ↗|target="_blank"|Nuevo escalado/, 'sin salir a Jira ni el pie del asistente');
  assert.match(ticketDetailHtml({ ...OPEN_TICKETS[2], comment: null }, DESTINATIONS), /Aún sin comentarios\.<\/p>/);
  assert.match(ticketDetailHtml({ ...o, title: 'A <b>', description: 'x < y' }, DESTINATIONS), /<h3>A &lt;b&gt;<\/h3>[\s\S]*x &lt; y/);
  for (const t of OPEN_TICKETS) assert.equal(t.waiting.length, t.issues, `${t.ticket}: tantas esperando como dice`);
});

test('la búsqueda: en SGA por centro, en SISU por módulo; no sale de la nota [RECURRENCIA]', () => {
  assert.deepEqual(findEscalations({ center: '100537' }, OPEN_TICKETS).map((o) => o.ticket), ['INC000027778368']);
  assert.deepEqual(findEscalations({ center: '100999' }, OPEN_TICKETS), []);
  const sisu = findEscalations({ sisu: true, center: '100537', category: 'ECOM › EWMS › RFID' }, OPEN_TICKETS);
  assert.deepEqual(sisu.map((o) => [o.ticket, o.why.join(' · ')]), [['SISUPAC-9211', 'Mismo módulo · Resumen parecido']]);
});

test('actualizar escalado: el comentario para el escalado empieza escrito con lo nuevo y se puede retocar', () => {
  const html = form({ vendorTicket: 'SISUPAC-9211' });
  assert.match(html, /<section class="rv-step rv-step-one" data-rstep="6" hidden>\s*<div class="rv-cap"><b>Comentario para <span class="iss-mono" data-esc-feed-ticket><\/span><\/b><small class="iss-esc-from">Se añade al escalado y a Remedy<\/small>/);
  assert.match(html, /name="comment"[^>]*>Nueva incidencia relacionada: INC000027698079 \(centro 100497\)\.\n\nSituación inicial: No lee el túnel\n\nAnálisis: Timeouts/);
  assert.match(html, /data-meter="comment"/);
  assert.match(form({}, { mode: 'link', linked: 'ERA-4170', comment: 'Lo mío', step: 6 }), /name="comment"[^>]*>Lo mío</);
});

test('si la foto trae un ticket, se propone unirla a él, de la lista o como otro (TC-02)', () => {
  const values = (vendorTicket) => startValues({ issue: issue({ vendorTicket }), open: FOUND, check: CHECK, saved: null });
  assert.deepEqual([values('ITD: SISUPAC-9211').mode, values('ITD: SISUPAC-9211').linked], ['link', 'SISUPAC-9211']);
  assert.deepEqual([values('TEC: SGAMSRAP-8777').linked, values('TEC: SGAMSRAP-8777').linkedOther], ['other', 'SGAMSRAP-8777']);
  assert.equal(values('TEC: MOCA').mode, 'escalate');
  const html = form({ vendorTicket: 'ITD: SISUPAC-9211' });
  assert.match(html, /name="mode" value="link"/);
  assert.match(html, /name="linked" value="SISUPAC-9211" checked/);
  assert.match(linkedText('MOCA'), /no es una clave/);
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
  assert.match(n3, /<li><label><input type="checkbox" class="iss-sr" data-min="form" \/><i><svg.*<\/i><span><b>Formulario de SIGLO<\/b>Con el análisis y las evidencias\.<\/span><small data-on>Hecho<\/small><small data-off>Falta<\/small>/);
  assert.match(n3, /data-min="logs" checked \/>/);
  assert.match(n3, /<li class="opt"><label><input type="checkbox" class="iss-sr" data-min="chat" \/>.*<small data-off>Si aplica<\/small>/);
  assert.match(n3, /<p class="iss-esc-subject"><code>N3 - &quot;SISUPAC&quot; - INC000027698079 - 100497<\/code><button type="button" class="rv-link" data-copy="N3 - &quot;SISUPAC&quot; - INC000027698079 - 100497">Copiar asunto<\/button><\/p>/);
  assert.match(n3, /<input type="hidden" name="sent"/);
  assert.match(n3, /<input type="hidden" name="mins" value="logs" \/>/);
  assert.match(reqs({ dest: 'sisupac' }, { priority: 'HIGH' }), /value="HIGH" checked \/><b>Muy importante<\/b><em>/);
  const mail = reqs({ dest: 'operaciones', sent: 'Correo', jiraPriority: 'HIGH' });
  assert.match(mail, /<h4>¿Qué has enviado y por dónde\?<\/h4>\s*<textarea/);   // sin explicación: la pregunta basta
  assert.match(mail, /<textarea class="rv-ed iss-esc-sent" id="iss-f-sent" name="sent"[^>]*placeholder="Correo a las 10:12 con logs y captura">Correo</);
  assert.match(mail, /<input type="hidden" name="jiraPriority" value="HIGH" \/>/);
  assert.doesNotMatch(mail, /Lo mínimo|Prioridad del Jira/);
  assert.match(reqs({ dest: 'maestros' }), /No pide nada más/);   // N2 por IOP con incidencia de Remedy
});

test('paso 5: el resumen como el de Resolver: las notas de Remedy y lo de cada paso, con su calidad', () => {
  const html = summaryHtml({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'CRITICAL', mins: 'form,logs', sent: 'no sale' },
    { issue: issue(), dests: DESTINATIONS, check: CHECK, files: [{ name: 'a.zip', size: 1 }] });
  assert.deepEqual([...html.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ['Notas del método', 'A quién', 'Motivo', 'Requisitos']);
  assert.match(html, /<div class="rv-sum-note"><span class="rv-sum-h"><b>Notas del método<\/b><em data-level="ok">Completas<\/em><\/span><span class="rv-sum-x">Situación inicial · Recurrencia · Antecedentes · Análisis<\/span>/);   // en una fila: ya comprobadas al entrar
  assert.deepEqual([...html.matchAll(/data-go="(\d)"/g)].map((m) => m[1]), ['2', '3', '4']);
  assert.match(html, /<b>Motivo<\/b><em data-level="low">Muy corta<\/em><small><svg[^]*?<\/svg>1 archivo<\/small><\/span><span class="rv-sum-x">Timeouts</);   // en la etiqueta, como las imágenes en Resolver
  assert.match(html, /Prioridad del Jira: Crítico · Lo mínimo: 2 de 3 confirmado</);
  assert.doesNotMatch(html, /no sale/);   // abre una herramienta: la evidencia no cuenta
  // a todo el ancho, sin la columna de opciones de Resolver: lo que pasa al escalar, bajo el título
  assert.match(form(), /<section class="rv-gen-sum iss-esc-review" data-esc-review>\s*<h4>Lo que has escrito<\/h4>\s*<ol data-summary><\/ol>/);
  assert.doesNotMatch(form(), /rv-gen-opts/);
});

test('antes de escalar, el borrador del ticket, como el informe de Resolver: lo escrito, las notas y los adjuntos', () => {
  const t = ticketHtml({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'HIGH', mins: 'logs' },
    { issue: issue({ text: 'No lee el túnel RFID' }), dests: DESTINATIONS, check: CHECK, files: [{ name: 'logs.zip', size: 4096 }] });
  assert.deepEqual([...t.matchAll(/<h5>([^<]+)<\/h5><p>([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]), [
    ['Destino', 'SISUPAC · N3 SISU · Jira de SISUPAC'], ['Prioridad del Jira', 'Muy importante'], ['Título', 'INC000027698079 · No lee el túnel RFID'],
    ['Motivo del escalado', 'Timeouts'], ['Situación inicial', 'No lee el túnel'], ['Recurrencia', 'Ninguna abierta en el centro'], ['Análisis', ANALYSIS.text], ['Antecedentes', 'Sin KB ni Jira'], ['Lo mínimo', 'Logs'],
  ]);
  assert.match(t, /contenteditable="true"[^>]*aria-label="Borrador del escalado"/);   // se puede retocar, como en Resolver
  assert.match(t, /<div class="rv-rep-att"><i><svg[^]*?<\/svg><\/i><div><b>logs\.zip<\/b><small>Adjunto · 4 KB<\/small>/);
  const mail = ticketHtml({ mode: 'escalate', dest: 'operaciones', reason: 'x', sent: 'Correo de las 10:12' }, { issue: issue(), dests: DESTINATIONS, check: CHECK });
  assert.match(mail, /<h5>Destino<\/h5><p>Operaciones\/Implantaciones · N2 · sin herramienta<\/p>/);
  assert.match(mail, /<h5>Evidencia<\/h5><p>Correo de las 10:12<\/p>/);
  assert.doesNotMatch(mail, /Prioridad del Jira|Lo mínimo|rv-rep-att/);
  assert.match(form(), /<b>Borrador del escalado<\/b><\/div>/);   // sin «revísalo» ni «retócalo»: el título basta
  assert.doesNotMatch(t, /Puedes retocar/);
  // el análisis no se repite si el motivo ya es la nota de análisis
  const same = ticketHtml({ mode: 'escalate', dest: 'sisupac', reason: ANALYSIS.text }, { issue: issue(), dests: DESTINATIONS, check: CHECK });
  assert.doesNotMatch(same, /<h5>Análisis<\/h5>/);
  assert.match(form(), /data-esc-preview hidden>Ver el escalado</);
  assert.match(form(), /data-confirm-send hidden>Crear escalado</);   // como «Actualizar escalado» en el otro flujo
});

test('resuelta: se escala por la causa raíz y sigue Resuelta (TC-05)', () => {
  const html = form({ status: 'RESOLVED' });
  assert.match(html, /<h3>Escalar por la causa raíz<\/h3>/);
  assert.doesNotMatch(closePhases({ mode: 'escalate' }, true), /Pendiente/);
  assert.deepEqual([...closePhases({ mode: 'escalate' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Creando el escalado', 'Registrando en Remedy', 'Avisando al centro', 'Pasando a Pendiente (proveedor)']);
  assert.deepEqual([...closePhases({ mode: 'link' }, false).matchAll(/<\/i>([^<]+)/g)].map((m) => m[1]), ['Comentando en el escalado', 'Registrando en Remedy', 'Pasando a Pendiente (proveedor)']);
});

test('al acabar: lo hecho y el ticket para copiarlo; el de un escalado, de ejemplo hasta conectar Jira', () => {
  const sample = doneHtml({ ticket: 'SISUPAC-0000', sample: true }, 'SISUPAC · N3 SISU', 'escalate', false);
  assert.match(sample, /<h4>Nuevo escalado a SISUPAC · N3 SISU<\/h4>/);
  assert.match(sample, /<span>Escalado<\/span><code>SISUPAC-0000<\/code><button type="button" class="lab-btn" data-copy="SISUPAC-0000">Copiar<\/button>/);
  assert.match(sample, /De ejemplo hasta conectar Jira/);
  const linked = doneHtml({ ticket: 'SISUPAC-9211', sample: false }, 'SISUPAC-9211', 'link', false);
  assert.match(linked, /<h4>Escalado actualizado<\/h4>/);
  assert.match(linked, /<span>Escalado<\/span><code>SISUPAC-9211/);
  assert.doesNotMatch(linked, /De ejemplo/);
  assert.doesNotMatch(doneHtml(null, 'Operaciones', 'escalate', false), /iss-esc-ticket/);   // por correo: sin clave que copiar
  assert.match(doneHtml(null, 'X', 'escalate', true), /Sigue Resuelta/);
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
