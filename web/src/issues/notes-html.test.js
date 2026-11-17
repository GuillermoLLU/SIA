import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteItemHtml, notesListHtml, noteFormHtml, noteEditorHtml, notesTab, notesPanelHtml, visPickHtml } from './notes-html.js';
import { notesFeed, NOTE_TAGS } from './notes.js';

const now = new Date('2026-10-22T20:00:00Z');
const sia = (o = {}) => ({ key: 'n7', kind: 'note', src: 'sia', id: 7, at: '2026-10-22T19:00:00Z', by: 'Ana López', byId: 'u1', text: 'El perfil <RFID> caducó. El resto entra bien.', tag: 'ANALISIS', visibility: 'internal', edited: null, ...o });
const box = (html) => html.match(/<div class="iss-feed-text nt-box[^"]*"[^>]*>(.*?)<\/div><\/div>|<div class="iss-feed-text nt-box nt-folded"[^>]*>(.*?)<\/i><\/div>/s)[0];

test('plegada: la etiqueta, una ficha junto al nombre; en la caja, en una sola línea, la primera frase con «…» y quién la ve; sin espacios dentro', () => {
  const html = noteItemHtml(sia(), { open: false, now });
  assert.match(html, /<li class="iss-feed-item nt-item v-internal" data-note-key="n7">/);
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">AL<\/span>/);
  assert.match(html, /<span class="iss-feed-did"><b>Ana López<\/b><span class="nt-tag" title="ANALISIS">Análisis<\/span><\/span>/);
  assert.match(html, /aria-expanded="false"><span class="nt-first">El perfil &lt;RFID&gt; caducó…<\/span><span class="nt-vis">.*Interna<\/span><i class="nt-chev">/s);
  assert.doesNotMatch(box(html), /iss-feed-label|nt-tag/, 'la etiqueta no se repite dentro de la caja');
  assert.doesNotMatch(box(html), />\s+</, 'la caja respeta los saltos de línea: nada de espacios entre etiquetas');
});

test('desplegada: arriba quién la ve y el texto entero, escapado; la etiqueta, junto al nombre', () => {
  const html = noteItemHtml(sia({ visibility: 'public', tag: 'ESCALADO' }), { open: true, now });
  assert.match(html, /nt-item v-public open"/);
  assert.match(html, /<span class="nt-tag" title="ESCALADO">Escalado<\/span>/);
  assert.match(html, /aria-expanded="true"><span class="nt-vis">.*Pública<\/span><div class="nt-text">El perfil &lt;RFID&gt; caducó\. El resto entra bien\.<\/div>/s, 'quién la ve, junto a la primera línea, sin fila propia');
  const privada = noteItemHtml(sia({ visibility: 'private', tag: null }), { open: true, now });
  assert.match(privada, /aria-expanded="true"><span class="nt-vis">.*Privada<\/span><div class="nt-text">/s);
  assert.doesNotMatch(privada, /nt-tag/, 'sin etiqueta, sin ficha');
});

test('las de Remedy: su autor y, si la traen, su etiqueta (sin decir de dónde vienen ni quién las ve); sin nada más, la caja va directa al texto', () => {
  const [r] = notesFeed({ worklog: [{ at: '2026-10-12 12:25', who: 'robot.siglo', text: 'No podemos entrar.' }] });
  const html = noteItemHtml(r, { open: true, now });
  assert.match(html, /<span class="iss-feed-did"><b>robot\.siglo<\/b><\/span>/);
  assert.doesNotMatch(html, /desde Remedy/);
  const [act] = notesFeed({ worklog: [{ at: '2026-10-12 12:25', who: 'CESARHD', text: '[ACT] Enviamos por IOP 4477622' }] });
  assert.match(noteItemHtml(act, { now }), /<b>CESARHD<\/b><span class="nt-tag" title="ACT">Actuación<\/span>/);
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">RS<\/span>/);
  assert.match(html, /nt-item v-none open"/);
  assert.doesNotMatch(html, /nt-vis|nt-top/);
  assert.match(html, /aria-expanded="true"><div class="nt-text">No podemos entrar\.<\/div>/);
});

test('los movimientos, un hito en la línea de tiempo con su icono y su frase; el motivo de un traspaso, en su caja plegable', () => {
  const [assigned, claimed, released, transfer] = notesFeed({ timeline: [
    { at: '2026-10-22T05:00:00Z', type: 'assigned', by: 'Ana', to: 'Luis' },
    { at: '2026-10-22T06:00:00Z', type: 'claimed', by: 'Ana', to: 'Ana' },
    { at: '2026-10-22T06:30:00Z', type: 'released', by: null },
    { at: '2026-10-22T07:00:00Z', type: 'transferred', by: 'Ana', to: 'Luis <x>', text: 'Lleva <dos> llamadas. Y más.' },
  ] });
  assert.match(noteItemHtml(assigned, { now }), /<li class="iss-feed-item nt-ev strong" data-note-key="m0"><span class="nt-ev-ic" aria-hidden="true"><svg/);
  assert.match(noteItemHtml(assigned, { now }), /<b>Ana<\/b> se la asignó a <b>Luis<\/b> desde el Backlog<\/span><time>/);
  assert.match(noteItemHtml(claimed, { now }), /<li class="iss-feed-item nt-ev" data-note-key="m1">.*<b>Ana<\/b> cogió la issue/s, 'coger, sin marcar');
  assert.match(noteItemHtml(released, { now }), /<b>Alguien<\/b> la devolvió a la cola/);
  assert.doesNotMatch(noteItemHtml(claimed, { now }), /nt-box/, 'sin motivo, sin caja');
  const folded = noteItemHtml(transfer, { now });
  assert.match(folded, /nt-ev strong" data-note-key="m3">/);
  assert.match(folded, /<b>Ana<\/b> la traspasó a <b>Luis &lt;x&gt;<\/b>/);
  assert.match(folded, /nt-folded"[^>]*><span class="iss-feed-label">Motivo<\/span><span class="nt-first">Lleva &lt;dos&gt; llamadas…<\/span><i class="nt-chev">/, 'plegado, como una nota y sin decir quién lo ve');
  assert.match(noteItemHtml(transfer, { now, open: true }), /nt-ev strong open".*<div class="nt-text">Lleva &lt;dos&gt; llamadas\. Y más\.<\/div>/s);
});

test('una nota sin texto (de Remedy, solo su etiqueta) se queda en su línea: autor, etiqueta y hora, sin caja', () => {
  const [r] = notesFeed({ worklog: [{ at: '2026-10-26 16:59', who: 'Remedy Application Service', text: '[INCIDENT REOPENED BY A PUBLIC WORK INFO]' }] });
  const html = noteItemHtml(r, { now });
  assert.match(html, /<b>Remedy Application Service<\/b><span class="nt-tag" title="INCIDENT REOPENED BY A PUBLIC WORK INFO">INCIDENT REOPENED BY A PUBLIC WORK INFO<\/span>/);
  assert.doesNotMatch(html, /nt-box|data-note-fold/);
});

test('una llamada: como la nota del técnico, con el teléfono en el sitio del avatar y su etiqueta de Remedy (CALLOK, CALLKO); en la caja, el número y lo escrito', () => {
  const [ko, ok] = notesFeed({ worklog: [
    { at: '2026-10-22 13:20', who: 'CESARHD', text: '[CALLKO] +90 212 555 0143' },
    { at: '2026-10-22 13:45', who: 'CESARHD', text: '[CALLOK] +90 212 555 0143 Hablamos con <Mehmet>. Confirma que escanean.' },
  ] });
  const k = noteItemHtml(ko, { now });
  assert.match(k, /<li class="iss-feed-item nt-ev nt-call ko" data-note-key="r0"><span class="nt-ev-ic" aria-hidden="true"><svg/);
  assert.match(k, /<span class="iss-feed-did"><b>CESARHD<\/b><span class="nt-tag" title="Llamada sin respuesta">CALLKO<\/span><\/span>/);
  assert.match(k, /nt-folded nt-short"[^>]*><span class="nt-phone">\+90 212 555 0143<\/span><span class="nt-first">No responden\.<\/span>/, 'de Remedy, sin texto: «No responden.» (una frase: si cabe, no se despliega)');
  const o = noteItemHtml(ok, { now });
  assert.match(o, /nt-call ok" data-note-key="r1">/);
  assert.match(o, /<b>CESARHD<\/b><span class="nt-tag" title="Llamada atendida">CALLOK<\/span>/);
  assert.match(o, /nt-folded"[^>]*><span class="nt-phone">\+90 212 555 0143<\/span><span class="nt-first">Hablamos con &lt;Mehmet&gt;…<\/span>/);
  assert.match(noteItemHtml(ok, { now, open: true }), /<div class="nt-text"><span class="nt-phone">\+90 212 555 0143<\/span>Hablamos con &lt;Mehmet&gt;\. Confirma que escanean\.<\/div>/);
  assert.doesNotMatch(k + o, /habló con el centro|sin éxito|Lo hablado/, 'nada de frases del sistema');
  const mine = noteItemHtml(sia({ tag: 'CALLOK', text: '+34 600 000 000 Confirma.' }), { now, meId: 'u1' });
  assert.match(mine, /nt-call ok/);
  assert.match(mine, /data-edit-note="n7">Editar/, 'la propia se edita también');
});

test('«Editar» solo en mis notas de SIA de las últimas 24 h; el editor, con el texto escapado', () => {
  assert.match(noteItemHtml(sia(), { meId: 'u1', now }), /data-edit-note="n7">Editar/);
  assert.doesNotMatch(noteItemHtml(sia(), { meId: 'u2', now }), /data-edit-note/);
  assert.doesNotMatch(noteItemHtml(sia(), { meId: 'u1', now: new Date('2026-10-25T00:00:00Z') }), /data-edit-note/);
  assert.match(noteItemHtml(sia({ edited: '2026-10-22T19:30:00Z' }), { now }), /<small>editada /);
  assert.match(noteEditorHtml('a <b>'), /<textarea[^>]*>a &lt;b&gt;<\/textarea>/);
});

test('la conversación: con el aviso si la foto no trae las de Remedy; vacía, lo dice', () => {
  const feed = [sia()];
  assert.match(notesListHtml(feed, { open: new Set(['n7']), now }), /nt-item v-internal open"/);
  assert.match(notesListHtml(feed, { now, remedyMissing: true }), /^<li class="nt-warn"><span>La foto cargada no trae las notas de Remedy/);
  assert.equal(notesListHtml([], { now }), '<li class="nt-empty">Todavía no hay notas.</li>');
});

test('la barra de escribir: interna de serie, sin etiqueta, el aviso de pública escondido y Enviar apagado; los menús, con todo', () => {
  const html = noteFormHtml();
  assert.match(html, /<form class="nt-form" data-note-form data-visibility="internal" data-tag="" novalidate>/);
  assert.match(html, /data-public-hint hidden>/);
  assert.match(html, /data-vis-pick[^>]*>.*<span>Interna<\/span>/s);
  assert.deepEqual([...html.matchAll(/data-set-vis="(\w+)" aria-checked="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`), ['private:false', 'internal:true', 'public:false']);
  assert.match(html, /<b>Privada<\/b><small>Solo tú<\/small>/);
  assert.match(html, /<b>Pública<\/b><small>También el centro<\/small>/);
  assert.equal((html.match(/data-set-tag="/g) || []).length, NOTE_TAGS.length);
  assert.match(html, /data-tag-chip hidden>/);
  assert.match(html, /<textarea name="note" rows="1" placeholder="Escribe una nota…"/);
  assert.match(html, /class="iss-send"[^>]*disabled/);
  assert.match(visPickHtml('public'), /<span>Pública<\/span>/);
});

test('la pestaña y su panel: el número de notas y todo plegado', () => {
  assert.equal(notesTab(0), 'Seguimiento');
  assert.equal(notesTab(3), 'Seguimiento<span>3</span>');
  const html = notesPanelHtml({ worklog: [{ at: '2026-10-12 12:25', who: 'X', text: 'Uno.' }, { at: '2026-10-13 12:25', who: 'Y', text: 'Dos.' }, { at: '2026-10-14 12:25', who: 'Z', text: 'Tres.' }], now });
  assert.deepEqual([...html.matchAll(/data-note-key="(r\d)"/g)].map((m) => m[1]), ['r0', 'r1', 'r2']);
  assert.doesNotMatch(html, / open"/, 'ninguna desplegada, tampoco la última');
  assert.match(html, /data-notes-scroll/);
  assert.match(html, /data-note-form/);
});

test('plegada, la de una sola frase lleva nt-short (si cabe en su línea no se despliega); la que sigue, no', () => {
  assert.match(noteItemHtml(sia({ text: 'Llamar mañana a Mehmet.' }), { now }), /class="iss-feed-text nt-box nt-folded nt-short" data-note-fold/);
  assert.match(noteItemHtml(sia({ text: 'Primera frase. Y otra.' }), { now }), /class="iss-feed-text nt-box nt-folded" data-note-fold/);
  assert.doesNotMatch(noteItemHtml(sia({ text: 'Llamar mañana a Mehmet.' }), { now, open: true }), /nt-short/, 'desplegada, no');
});
