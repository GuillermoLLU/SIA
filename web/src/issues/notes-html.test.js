import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteItemHtml, notesListHtml, noteFormHtml, noteEditorHtml, notesTab, notesPanelHtml, visPickHtml } from './notes-html.js';
import { notesFeed, NOTE_TAGS } from './notes.js';

const now = new Date('2026-10-22T20:00:00Z');
const sia = (o = {}) => ({ key: 'n7', kind: 'note', src: 'sia', id: 7, at: '2026-10-22T19:00:00Z', by: 'Ana López', byId: 'u1', text: 'El perfil <RFID> caducó. El resto entra bien.', tag: 'ANALISIS', visibility: 'internal', edited: null, ...o });
const box = (html) => html.match(/<div class="iss-feed-text nt-box[^"]*"[^>]*>(.*?)<\/div><\/div>|<div class="iss-feed-text nt-box nt-folded"[^>]*>(.*?)<\/i><\/div>/s)[0];

test('plegada: en una sola línea la etiqueta, la primera frase con «…» y quién la ve; sin espacios dentro de la caja', () => {
  const html = noteItemHtml(sia(), { open: false, now });
  assert.match(html, /<li class="iss-feed-item nt-item v-internal" data-note-key="n7">/);
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">AL<\/span>/);
  assert.match(html, /aria-expanded="false"><span class="iss-feed-label">Análisis<\/span><span class="nt-first">El perfil &lt;RFID&gt; caducó…<\/span><span class="nt-vis">.*Interna<\/span><i class="nt-chev">/s);
  assert.doesNotMatch(box(html), />\s+</, 'la caja respeta los saltos de línea: nada de espacios entre etiquetas');
});

test('desplegada: arriba la etiqueta y quién la ve, y el texto entero, escapado', () => {
  const html = noteItemHtml(sia({ visibility: 'public', tag: 'ESCALADO' }), { open: true, now });
  assert.match(html, /nt-item v-public open"/);
  assert.match(html, /aria-expanded="true"><div class="nt-top"><span class="iss-feed-label">Escalado<\/span><span class="nt-vis">.*Pública<\/span><\/div><div class="nt-text">El perfil &lt;RFID&gt; caducó\. El resto entra bien\.<\/div>/s);
  const privada = noteItemHtml(sia({ visibility: 'private', tag: null }), { open: true, now });
  assert.match(privada, /<div class="nt-top"><span class="nt-vis">.*Privada<\/span><\/div>/s, 'sin etiqueta, solo quién la ve');
});

test('las de Remedy dicen de dónde vienen y no quién las ve; sin etiqueta ni visibilidad, la caja va directa al texto', () => {
  const [r] = notesFeed({ worklog: [{ at: '2026-10-12 12:25', who: 'robot.siglo', text: 'No podemos entrar.' }] });
  const html = noteItemHtml(r, { open: true, now });
  assert.match(html, /<b>robot\.siglo<\/b> <small>desde Remedy<\/small>/);
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">RS<\/span>/);
  assert.match(html, /nt-item v-none open"/);
  assert.doesNotMatch(html, /nt-vis|nt-top/);
  assert.match(html, /aria-expanded="true"><div class="nt-text">No podemos entrar\.<\/div>/);
});

test('los movimientos, una línea fina; el motivo de un traspaso, como nota interna de quien traspasó', () => {
  const [claimed, transfer] = notesFeed({ timeline: [
    { at: '2026-10-22T06:00:00Z', type: 'claimed', by: 'Ana', to: 'Ana' },
    { at: '2026-10-22T07:00:00Z', type: 'transferred', by: 'Ana', to: 'Luis <x>', text: 'Lleva <dos> llamadas.' },
  ] });
  assert.match(noteItemHtml(claimed, { now }), /^<li class="nt-move" data-note-key="m0"><span>Ana cogió la issue · (HOY|22\/10) \d\d:00<\/span><\/li>$/);
  const html = noteItemHtml(transfer, { open: true, now });
  assert.match(html, /<b>Ana<\/b> traspasó la issue a <b>Luis &lt;x&gt;<\/b>/);
  assert.match(html, /<span class="iss-feed-label">Motivo del traspaso<\/span><span class="nt-vis">.*Interna/s);
  assert.match(html, /<div class="nt-text">Lleva &lt;dos&gt; llamadas\.<\/div>/);
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
  assert.match(notesListHtml(feed, { now, remedyMissing: true }), /^<li class="nt-move nt-warn"><span>La foto cargada no trae las notas de Remedy/);
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
  assert.equal(notesTab(0), 'Notas');
  assert.equal(notesTab(3), 'Notas<span>3</span>');
  const html = notesPanelHtml({ worklog: [{ at: '2026-10-12 12:25', who: 'X', text: 'Uno.' }, { at: '2026-10-13 12:25', who: 'Y', text: 'Dos.' }, { at: '2026-10-14 12:25', who: 'Z', text: 'Tres.' }], now });
  assert.deepEqual([...html.matchAll(/data-note-key="(r\d)"/g)].map((m) => m[1]), ['r0', 'r1', 'r2']);
  assert.doesNotMatch(html, / open"/, 'ninguna desplegada, tampoco la última');
  assert.match(html, /data-notes-scroll/);
  assert.match(html, /data-note-form/);
});
