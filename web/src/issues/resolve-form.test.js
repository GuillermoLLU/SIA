import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForm, resolveBlocked, resumeStep, stepMissing, imagesDock, sectionImages, noteQuality, noteMeter, FULL, summaryHtml, phasesHtml, closePhasesHtml, reportHtml, localShort } from './resolve-form.js';
import { imageTag } from './tag-editor.js';
// lo que manda el bridge al abrir Resolver
import { resolveDraft } from '../../../server/issues/resolve.js';

const n = (at, text) => ({ at, who: 'ANA', text });
// las cuatro notas del procedimiento: con ellas se puede escribir la de cierre
const ALL = ['SITUACION INICIAL', 'ANTECEDENTES', 'ANALISIS', 'DIAGNOSTICO'].map((t) => n('2026-10-28 11:05', `[${t}] Cola llena`));

test('dos bloques separados, con su ayuda, y lo de Remedy ya puesto y escapado, sin texto de relleno', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola <llena>')] }));
  assert.match(html, /<b>Nota interna de resolución<\/b><\/div>/);   // sin marca: no estaba en Remedy
  assert.doesNotMatch(html, /Solo la ve el equipo|detalle técnico/);
  assert.match(html, /<section class="rv-step" data-rstep="2" hidden>\s*<div class="rv-cap"><b>¿Qué ha ocurrido\?<\/b><\/div>/);
  assert.match(html, /<div class="rv-cap rv-cap-center" data-gen-cap hidden><b data-gen-title><\/b><em data-gen-state hidden><\/em><\/div>[\s\S]*<div class="rv-gen" data-gen>\s*<section class="rv-gen-sum"><h4>Lo que has escrito<\/h4><ol data-summary><\/ol><\/section>\s*<section class="rv-gen-opts">\s*<h4 class="rv-gen-title">Preparar el informe<\/h4>[\s\S]*<fieldset class="iss-lang">[\s\S]*<input type="file" multiple data-extra \/>[\s\S]*<div class="ld" data-loader hidden>\s*<h4 class="ld-title" data-loader-title>Redactando el informe<\/h4>[\s\S]*<ol class="ld-phases" data-phases><\/ol>[\s\S]*<div class="rv-review" data-review hidden><\/div>/);   // el idioma y los archivos, antes de generar
  assert.doesNotMatch(html, /Lo reciben el centro|sin preocuparte del formato/);
  assert.match(html, /<div class="rv-ed" contenteditable="plaintext-only" id="iss-f-what" data-ed="what" role="textbox" aria-multiline="true">Cola &lt;llena&gt;<\/div><input type="hidden" name="what" value="Cola &lt;llena&gt;" \/><div class="rv-meter" data-meter="what"/);   // con su barra
  assert.match(html, /data-rstep="3" hidden>\s*<div class="rv-cap"><b>¿Cómo se ha resuelto\?<\/b><\/div>[\s\S]*data-rstep="4" hidden>\s*<div class="rv-cap"><b>¿Qué se hará para que no se repita\?<\/b><\/div>/);
  // los títulos y las ayudas «?» bastan: sin frases bajo los campos ni avisos de lo obvio
  assert.doesNotMatch(html, /Sale de tu nota|Cuéntalo sin jerga|Técnico y concreto|fallo del sistema|Seguimos con|Sigues en el paso/);
  assert.match(html, /<div class="rv-ed"[^>]*id="iss-f-note" data-ed="note"/);
  assert.doesNotMatch(html, /¿Qué se ha hecho\?/);   // el título del paso basta
  assert.doesNotMatch(html, /P-0\d\d|C-0\d\d/);
});

test('si la nota de resolución ya está en Remedy, se avisa y se parte de ella, pero se puede editar', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:40', '[RESOLUCION] Se libera')] }));
  assert.match(html, /<b>Nota interna de resolución<\/b><button type="button" class="rv-done" data-restore-note data-original="Se libera" disabled><span data-done><svg[\s\S]*?<\/svg>Se completó el 28\/10 11:40 por ANA<\/span><span data-restore><svg[\s\S]*?<\/svg>Restaurar la nota de ANA<\/span><\/button><\/div>/);   // la marca, en la fila del título
  assert.match(html, /data-ed="note"[^>]*>Se libera<\/div><input type="hidden" name="note" value="Se libera" \/>/);
  assert.doesNotMatch(html, /blockquote|Ya la escribiste/);
  // con borrador, manda lo que el técnico dejó escrito
  const edited = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: [n('2026-10-28 11:40', '[RESOLUCION] Se libera')] }), { at: new Date().toISOString(), note: 'Se libera y [imagen1]' });
  assert.match(edited, /name="note" value="Se libera y \[imagen1\]" \/>/);
  assert.match(edited, /class="rv-done changed" data-restore-note data-original="Se libera"><span/);   // cambiada: la marca pasa a ser «Restaurar»
});

test('cinco pasos: la nota interna, las tres preguntas con sus imágenes y el informe; solo el primero a la vista', () => {
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', vendorTicket: 'INC9', worklog: ALL }));
  assert.match(html, /<ol class="rv-steps"><li data-step-mark="1" aria-current="step"><i>1<\/i><span>Nota interna<\/span><\/li><li class="rv-steps-group"><ol><li data-step-mark="2"><i>2<\/i><span>Causa<\/span><\/li><li data-step-mark="3"><i>3<\/i><span>Solución<\/span><\/li><li data-step-mark="4"><i>4<\/i><span>Prevención<\/span><\/li><\/ol><b>Mensaje al centro<\/b><\/li><li class="rv-steps-link"><\/li><li data-step-mark="5" class="last"><i>5<\/i><span>Informe<\/span><\/li><\/ol>/);
  assert.match(html, /data-rstep="1">[\s\S]*Nota interna de resolución[\s\S]*<aside class="rv-dock" data-images>[\s\S]*data-rstep="2" hidden>[\s\S]*<aside class="rv-dock" data-images data-for="what">[\s\S]*data-rstep="3" hidden>[\s\S]*data-for="how"[\s\S]*data-rstep="4" hidden>[\s\S]*data-for="prevent"[\s\S]*data-rstep="5" hidden>[\s\S]*<h4 class="rv-gen-title">Preparar el informe<\/h4>[\s\S]*data-review hidden><\/div>/);
  assert.match(html, /<ul class="rv-warn" data-warn hidden><li>Tiene el ticket de proveedor INC9: avisa de que se ha resuelto\.<\/li><\/ul>/);   // con el informe
  assert.doesNotMatch(html, /Cancelar|iss-drop/);
  assert.match(html, /data-step-back hidden>Atrás<[\s\S]*data-step-next>Causa<[\s\S]*data-generate hidden><svg[\s\S]*?<\/svg>Generar informe<[\s\S]*data-confirm-send hidden>Resolver incidencia</);   // generar, en el pie, como el paso siguiente
});

test('no se sale de un paso sin lo obligatorio: cada pregunta en su paso', () => {
  assert.equal(stepMissing(1, { note: '  ' }), 'Nota interna de resolución');
  assert.equal(stepMissing(1, { note: 'Relanzada' }), null);
  assert.equal(stepMissing(2, { what: '', how: 'b', prevent: 'c' }), '¿Qué ha ocurrido?');
  assert.equal(stepMissing(3, { what: 'Se paró', how: '', prevent: 'x' }), '¿Cómo se ha resuelto?');
  assert.equal(stepMissing(4, { what: 'a', how: 'b', prevent: ' ' }), '¿Qué se hará para que no se repita?');
  assert.equal(stepMissing(4, { what: 'a', how: 'b', prevent: 'c' }), null);
  assert.equal(stepMissing(5, {}), null);
});

test('un borrador se retoma en el paso en el que se quedó, si los de antes siguen completos; nunca en el informe', () => {
  const r = resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL });
  const at = new Date(2026, 9, 28, 15, 20).toISOString();
  const full = { at, note: 'N', what: 'W', how: 'H', prevent: 'P' };
  assert.equal(resumeStep(r, null), 1);
  assert.equal(resumeStep(r, { ...full }), 1);                        // de antes de guardar el paso
  assert.equal(resumeStep(r, { ...full, step: 2 }), 2);
  assert.equal(resumeStep(r, { ...full, step: 4 }), 4);
  assert.equal(resumeStep(r, { ...full, step: 5 }), 4);               // la redacción se hace al llegar
  assert.equal(resumeStep(r, { ...full, how: '', step: 4 }), 3);      // falta la del 3: vuelve al 3
  assert.equal(resumeStep(r, { ...full, note: '', step: 2 }), 1);
  const done = resolveDraft({ priority: 'HIGH', category: 'x', worklog: [...ALL, n('2026-10-28 11:30', '[RESOLUCION] Ya está')] });
  assert.equal(resumeStep(done, { ...full, note: '', step: 2 }), 2);  // la nota ya está en Remedy
  assert.match(resolveForm('INC1', r, { ...full, step: 2 }), /<input type="hidden" name="step" value="1" \/>/);
});


test('título, identificador visible, guardado automático y lo que se dejó escrito, sin aviso de que viene de antes', () => {
  const r = resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL });
  assert.match(resolveForm('INC1', r), /<header class="rv-head"><h3>Resolver incidencia<\/h3><span class="rv-id">INC1<\/span><\/header>/);
  // con enlace, el identificador lleva al ticket
  assert.match(resolveForm('INC1', r, null, 'https://remedy/x?id=1&y=2'), /<a class="rv-id" href="https:\/\/remedy\/x\?id=1&amp;y=2" target="_blank" rel="noopener" title="Abrir el ticket">INC1<\/a>/);
  assert.doesNotMatch(resolveForm('INC1', r), /Guardar para después/);
  assert.match(resolveForm('INC1', r), /data-autosave>El borrador se guarda solo mientras escribes/);
  assert.match(resolveForm('INC1', r), /¿Qué ha ocurrido\?<\/b>[\s\S]*¿Cómo se ha resuelto\?<\/b>[\s\S]*¿Qué se hará para que no se repita\?<\/b>/);
  const at = new Date(2026, 9, 28, 15, 20).toISOString();
  const html = resolveForm('INC1', r, { at, note: 'Mi nota', what: 'Lo mío', how: '', prevent: 'P', images: [{ n: 2, name: 'cola.png', type: 'image/png', size: 2048 }] });
  assert.doesNotMatch(html, /Seguimos con|Descartar/);
  assert.match(html, /data-autosave>Borrador guardado 28\/10 15:20</);
  // la imagen del borrador, aún sin miniatura, en los dos pasos donde se escribe
  assert.equal((html.match(/<figure class="rv-img" draggable="true" data-img="2" title="cola\.png · 2 KB\. Arrástrala al texto para colocarla"><span class="rv-img-wait"><\/span><figcaption>\[imagen2\]<\/figcaption><button type="button" class="rv-img-x" data-img-drop="2" aria-label="Quitar \[imagen2\]">×<\/button><\/figure>/g) || []).length, 1);   // en el muelle del paso 1; ninguna pregunta la nombra
  const inWhat = resolveForm('INC1', r, { at, what: 'Ver [imagen2]', images: [{ n: 2, name: 'cola.png', type: 'image/png', size: 2048 }] });
  assert.match(inWhat, /<aside class="rv-dock" data-images data-for="what">\s*<p class="rv-dock-hint">[^<]*<\/p>\s*<figure class="rv-img" draggable="true" data-img="2"/);
  assert.doesNotMatch(inWhat, /data-for="how">\s*<p class="rv-dock-hint">[^<]*<\/p>\s*<figure/);
  assert.match(html, /<span>Otra imagen<\/span>/);
  assert.match(html, /data-ed="what"[^>]*>Lo mío<\/div><input type="hidden" name="what" value="Lo mío" \/>/);
  assert.match(html, /data-ed="note"[^>]*>Mi nota<\/div><input type="hidden" name="note" value="Mi nota" \/>/);
  assert.match(html, /data-ed="prevent"[^>]*>P<\/div><input type="hidden" name="prevent" value="P" \/>/);
  // una imagen en el texto guardado: ficha en el editor, [imagenN] en el campo oculto
  const tagged = resolveForm('INC1', r, { at, note: 'Ver [imagen2] aquí', images: [{ n: 2, name: 'cola.png', type: 'image/png', size: 2048 }] });
  assert.match(tagged, /data-ed="note"[^>]*>Ver <span class="rv-chip" contenteditable="false" draggable="true" data-n="2">\[imagen2\]<\/span> aquí<\/div><input type="hidden" name="note" value="Ver \[imagen2\] aquí" \/>/);
  assert.match(html, /value="es" checked \/><span>Español<\/span>/);   // un borrador sin idioma, en español
  assert.match(resolveForm('INC1', r, { at, lang: 'en' }), /value="en" checked \/><span>English<\/span>/);
  assert.match(resolveForm('INC1', r), /value="es" checked \/><span>Español<\/span><\/label><label><input type="radio" name="lang" value="en" \/><span>English<\/span>/);
});

test('sin las notas del procedimiento en Remedy no se abre el asistente: los puntos, con lo que falta, y el chat', () => {
  const html = resolveBlocked('INC1', resolveDraft({ priority: 'HIGH', category: 'x', vendorTicket: 'INC9', worklog: [n('2026-10-28 11:05', '[DIAGNOSTICO] Cola llena')] }));
  assert.match(html, /role="alertdialog"[\s\S]*<h3 id="rb-title">Aún no se puede resolver<\/h3>\s*<p><b>INC1<\/b><\/p>/);
  assert.match(html, /<li class="ok"><i><svg[\s\S]*?<\/svg><\/i><span>Diagnóstico<\/span><small>28\/10 11:05 · ANA<\/small>/);
  assert.match(html, /<li class="no"><i><svg[\s\S]*?<\/svg><\/i><span>Situación inicial<\/span><small>Falta<\/small>/);
  assert.doesNotMatch(html, /Resolución/);   // se escribe en el asistente, no es un punto previo
  assert.doesNotMatch(html, /proveedor|rb-note/);   // avisar al proveedor es cosa de resolver, no de este aviso
  assert.match(html, /data-resolve-chat>Completar con ayuda de la IA</);
  assert.doesNotMatch(html, /data-act-cancel/);   // se cierra con Escape o fuera
  assert.match(resolveBlocked('INC1', resolveDraft({ priority: 'HIGH', category: '', worklog: ALL })), /<span>Categoría de la issue<\/span><small>Falta<\/small>/);
  // con todo cubierto, la vista de resolver, sin avisos ni campos apagados (Resolver sí, hasta redactar)
  const ok = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL }));
  assert.doesNotMatch(ok, /role="alert"|disabled(?!="false")/);
});

test('el muelle de imágenes: miniatura si la hay, [imagenN] para el texto, quitar, y el hueco de añadir hasta el tope', () => {
  const html = imagesDock([{ n: 1, name: 'a<b>.png', size: 10, url: 'blob:x' }, { n: 2, name: 'c.png', size: 10 }]);
  assert.match(html, /^<aside class="rv-dock" data-images>\s*<p class="rv-dock-hint">Suelta aquí las imágenes<\/p>/);
  assert.match(html, /data-img="1" title="a&lt;b&gt;\.png · 1 KB\.[^"]*"><img src="blob:x" alt="" \/><figcaption>\[imagen1\]<\/figcaption>/);
  assert.match(html, /data-img="2"[^>]*><span class="rv-img-wait"><\/span>/);
  assert.doesNotMatch(imagesDock([]), /rv-img"/);
  assert.match(html, /<label class="rv-dock-add"><input type="file" accept="image\/\*" multiple data-file \/><svg[\s\S]*?<\/svg><span>Otra imagen<\/span><small>Pulsa, pega o arrastra<\/small><\/label>/);
  assert.match(imagesDock([]), /<span>Imágenes<\/span>/);
  assert.doesNotMatch(imagesDock(Array.from({ length: 10 }, (_, i) => ({ n: i + 1, name: 'x', size: 1 }))), /rv-dock-add/);   // al tope, sin añadir
  assert.doesNotMatch(html, /data-file hidden/);   // el selector se alcanza con el teclado
  assert.equal(imageTag(3), '[imagen3]');
  assert.equal(localShort(new Date(2026, 0, 5, 7, 3).toISOString()), '05/01 07:03');
});

test('cuánto cuenta la nota: la barra se llena con lo escrito, sin contar las imágenes', () => {
  assert.deepEqual(noteQuality(''), { pct: 0, label: 'Sin escribir', level: 'low' });
  // cada pregunta al centro cuenta hasta 250: la misma escala, más corta
  assert.deepEqual(noteQuality('x'.repeat(250), FULL.what), { pct: 100, label: 'Completa', level: 'ok' });
  assert.deepEqual([noteQuality('x'.repeat(30), FULL.how).label, noteQuality('x'.repeat(100), FULL.how).label, noteQuality('x'.repeat(200), FULL.how).label], ['Muy corta', 'Corta', 'Bien']);
  assert.match(noteMeter('x'.repeat(125), 'what'), /data-meter="what" data-level="good"[^>]*><div class="rv-meter-bar"><i style="width:50%">/);
  assert.deepEqual(noteQuality('Relanzada [imagen1]'), { pct: 2, label: 'Muy corta', level: 'low' });
  assert.deepEqual([noteQuality('x'.repeat(100)).label, noteQuality('x'.repeat(100)).level], ['Corta', 'mid']);
  assert.deepEqual(noteQuality('x'.repeat(200)), { pct: 50, label: 'Bien', level: 'good' });
  assert.deepEqual(noteQuality('x'.repeat(900)), { pct: 100, label: 'Completa', level: 'ok' });
  assert.equal(noteMeter('x'.repeat(200)), '<div class="rv-meter" data-meter="note" data-level="good" aria-hidden="true"><div class="rv-meter-bar"><i style="width:50%"></i></div><span>Bien</span></div>');
  // en el paso 1, bajo el campo, con lo que haya guardado
  const html = resolveForm('INC1', resolveDraft({ priority: 'HIGH', category: 'x', worklog: ALL }), { at: new Date().toISOString(), note: 'x'.repeat(200) });
  assert.match(html, /data-ed="note"[\s\S]*<input type="hidden" name="note"[^>]*><div class="rv-meter" data-meter="note" data-level="good" aria-hidden="true"><div class="rv-meter-bar"><i style="width:50%"><\/i><\/div><span>Bien<\/span><\/div>/);
  assert.match(html, /<section class="rv-step" data-rstep="1">\s*<div class="rv-cap"><b>Nota interna de resolución<\/b><\/div>\s*<div class="rv-text">/);   // el título, sobre las dos columnas
});

test('las imágenes de una sección son las que su texto nombra; su muelle, con el hueco de añadir hasta el tope', () => {
  const imgs = [{ n: 1, name: 'a.png', size: 1 }, { n: 2, name: 'b.png', size: 1 }, { n: 12, name: 'c.png', size: 1 }];
  assert.deepEqual(sectionImages(imgs, 'Ver [imagen1] y [imagen12]').map((i) => i.n), [1, 12]);   // [imagen1] no cuenta como [imagen12]
  assert.deepEqual(sectionImages(imgs, ''), []);
  assert.match(imagesDock([imgs[1]], 'how', 3), /data-images data-for="how">[\s\S]*<figure[^>]*data-img="2"[\s\S]*data-file data-for="how"/);
  assert.doesNotMatch(imagesDock([], 'how', 10), /rv-dock-add/);
});

test('lo escrito, resumido para el último paso: extracto sin fichas, cuánto cuenta, y sus imágenes; cada uno lleva a su paso', () => {
  const v = { note: 'x'.repeat(300), what: 'Ver [imagen1] y  [imagen2] ya', how: '', prevent: 'p'.repeat(200) };
  const html = summaryHtml(v);
  assert.deepEqual([...html.matchAll(/data-go="(\d)" title="Volver a ([^"]+)"><span class="rv-sum-h"><b>[^<]+<\/b><em data-level="\w+">([^<]+)<\/em>/g)].map((m) => [Number(m[1]), m[2], m[3]]),
    [[1, 'Nota interna', 'Bien'], [2, 'Causa', 'Muy corta'], [3, 'Solución', 'Sin escribir'], [4, 'Prevención', 'Bien']]);
  assert.match(html, /<span class="rv-sum-x">Ver y ya<\/span>/);   // sin las fichas
  const long = html.match(/<span class="rv-sum-x">(x+…)<\/span>/)[1];
  assert.equal(long.length, 180);   // el extracto se recorta con puntos suspensivos
  assert.match(summaryHtml({ what: 'a <b>' }), /<li><button type="button" data-go="2" title="Volver a Causa"><span class="rv-sum-h"><b>Causa<\/b><em data-level="low">Muy corta<\/em><\/span><span class="rv-sum-x">a &lt;b&gt;<\/span><\/button><\/li>/);
  assert.match(summaryHtml(v), /<b>Causa<\/b><em data-level="low">Muy corta<\/em><small><svg[\s\S]*?<\/svg>2 imágenes<\/small>/);
});

test('las fases de la IA: unificar archivos solo si los hay; y el borrador: solo el mensaje de relleno, con el PDF', () => {
  assert.match(phasesHtml(false), /^<li data-phase="read"><i><\/i>Leyendo todo lo que has escrito<\/li><li data-phase="improve">[^<]*<i><\/i>Formateando y mejorando respuestas<\/li><li data-phase="draft"><i><\/i>Preparando el borrador<\/li>$/);
  assert.match(phasesHtml(true), /<li data-phase="improve">[\s\S]*<li data-phase="files"><i><\/i>Unificando archivos<\/li><li data-phase="draft">/);   // unificar, solo con archivos
  const imgs = [{ n: 2, name: 'a<b>.png', url: 'blob:x' }];
  const mail = reportHtml({}, [...imgs, { n: 3, name: 'b.png', size: 2048 }], { lang: 'es', hour: 10, issueId: 'INC1' });
  assert.match(mail, /<p>Buenos días:<\/p>\s*<h5>Qué ha ocurrido<\/h5>[\s\S]*<p>Un saludo\.<\/p>\s*<\/div>\s*<div class="rv-rep-att"><i><svg[\s\S]*?<\/svg><\/i><div><b>adjuntos_INC1\.zip<\/b><small>Adjunto · 2 imágenes · 2 KB<\/small><\/div><\/div>/);
  assert.doesNotMatch(mail, /figure/);   // las imágenes van agrupadas en el adjunto, no sueltas
  const en = reportHtml({}, [], { lang: 'en', hour: 15 });
  assert.match(en, /<p>Good afternoon,<\/p>[\s\S]*<h5>What happened<\/h5>[\s\S]*<p>Kind regards\.<\/p>/);
  assert.doesNotMatch(en, /rv-rep-att/);   // sin imágenes, sin adjunto
  // solo el mensaje, con el PDF encima
  const all = reportHtml({ note: 'n' }, [], { lang: 'es', hour: 10 });
  assert.match(all, /^<div class="rv-rtools"><small data-rep-hint>Puedes retocar el texto antes de resolver<\/small><button type="button" class="rv-link" data-rep-restore hidden><svg[\s\S]*?<\/svg>Volver al texto de la IA<\/button><button type="button" class="lab-btn rv-pdf" data-pdf><svg[\s\S]*?<\/svg>Descargar PDF<\/button><\/div>\s*<div class="rv-rpanel" data-rpanel="mail"><section class="rv-rep rv-rep-mail">\s*<div class="rv-rep-edit" contenteditable="true"/);
  assert.match(closePhasesHtml(), /^<li data-phase="upload"><i><\/i>Subiendo el informe<\/li><li data-phase="rag"><i><\/i>Actualizando el conocimiento<\/li><li data-phase="close"><i><\/i>Cerrando la incidencia<\/li>$/);
  assert.doesNotMatch(all, /Nota interna|role="tab"/);
});
