import test from 'node:test';
import assert from 'node:assert/strict';
import { workScreen, trailHtml, trailTab, releaseDialogHtml, noteFormHtml, sendsNote, canEditNote, noteEditorHtml, worklogHtml, firstLine, assistHtml } from './work-screen.js';

const issue = (o = {}) => ({ id: 'INC1', text: 'PDA <sin imagen>', priority: 'HIGH', status: 'ASSIGNED', reason: '', notes: 'no <arranca>',
  resolution: '', category: 'SGA', group: 'AYS SOPORTE', assignee: '', reported: '2026-10-01 10:00', modified: '2026-10-01 11:00',
  vendorTicket: '', changes: [['2026-10-01 10:00', '', 'ASSIGNED']], related: '', prio: false, sisu: false, center: '100', link: '', claimedBy: null, ...o });
const now = new Date('2026-10-01T12:00:00');

test('la pantalla: cuatro pestañas, Detalle por defecto, sin análisis de la IA y el texto escapado', () => {
  const html = workScreen({ issue: issue(), sameCenter: [], now, mine: false });
  assert.equal((html.match(/data-wtab="/g) || []).length, 4);
  assert.match(html, /data-wtab="remedy" aria-selected="false">Seguimiento</);
  assert.deepEqual([...html.matchAll(/data-wtab="([a-z]+)"/g)].map((m) => m[1]), ['detail', 'remedy', 'trail', 'related'], 'Detalle, Notas Remedy, Notas internas, Relacionadas');
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
  assert.doesNotMatch(html, /Análisis de la IA|data-wpanel="ai"/);
  assert.match(html, /Nadie la ha movido ni anotado en SIA todavía/);
  assert.doesNotMatch(html, /data-chat-head|iss-chat-note/, 'la cabecera del chat la pinta el propio chat');
  assert.match(html, /<div class="iss-chat-body"><\/div>/);
  assert.match(html, /iss-trail-hint">Por quién ha pasado esta issue y las notas internas del equipo</);
  assert.doesNotMatch(html, /data-act="note"/);
  assert.match(html, /data-note-form/);
  assert.match(html, /Por conectar/);
  assert.equal((html.match(/iss-pending/g) || []).length, 1);
  assert.match(html, /PDA &lt;sin imagen&gt;/);
  assert.match(html, /no &lt;arranca&gt;/);
  assert.doesNotMatch(html, /data-release/);
});

test('mía y cogida en SIA: se puede devolver y se ve quién la tiene', () => {
  const html = workScreen({ issue: issue({ claimedBy: { id: 'u', name: 'Ana', at: '2026-10-01T10:30:00Z' } }), sameCenter: [], now, mine: true, tab: 'detail' });
  assert.match(html, /data-release/);
  assert.match(html, /<dt>Asignada<\/dt><dd>[^<]*<span class="iss-low">· en SIA, Ana<\/span><\/dd>/); // en la Ficha del detalle
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
});

test('el feed: lo más reciente arriba, con avatar, quién hizo qué y su cuándo; el motivo del traspaso como comentario; todo escapado', () => {
  const html = trailHtml([
    { at: '2026-10-01T08:00:00+00:00', type: 'claimed', by: 'Ana López', from: null, to: 'Ana López' },
    { at: '2026-10-01T09:00:00+00:00', type: 'transferred', by: 'Ana López', from: 'Ana López', to: 'Luis <x>', text: 'Lleva <dos> llamadas.' },
    { at: '2026-10-01T10:00:00+00:00', type: 'note', id: 2, kind: 'note', by: 'Luis', text: 'El centro confirma.', edited: '2026-10-01T10:30:00+00:00' },
    { at: '2026-10-01T11:00:00+00:00', type: 'released', by: null, from: null, to: null },
    { at: '2026-10-02T08:00:00+00:00', type: 'claimed', by: 'Luis', from: null, to: 'Luis' },
  ], new Date('2026-10-02T12:00:00'));
  assert.equal((html.match(/<li /g) || []).length, 5);
  assert.doesNotMatch(html, /<h5>/, 'sin separadores de día');
  const hm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  assert.deepEqual([...html.matchAll(/<time>([^<]+)<\/time>/g)].map((m) => m[1]),
    [`HOY ${hm('2026-10-02T08:00:00+00:00')}`, `01/10 ${hm('2026-10-01T11:00:00+00:00')}`, `01/10 ${hm('2026-10-01T10:00:00+00:00')}`, `01/10 ${hm('2026-10-01T09:00:00+00:00')}`, `01/10 ${hm('2026-10-01T08:00:00+00:00')}`],
    'cada entrada con su día y hora, de la más nueva a la más antigua');
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">AL<\/span>/);
  assert.match(html, /<span class="iss-avatar unknown" aria-hidden="true">\?<\/span>/);
  assert.match(html, /<b>Ana López<\/b> cogió la issue/);
  assert.match(html, /traspasó la issue a <b>Luis &lt;x&gt;<\/b>/);
  assert.match(trailHtml([{ at: '2026-10-01T10:00:00+00:00', type: 'assigned', by: 'Guillermo', from: null, to: 'Elvis' }]), /asignó la issue a <b>Elvis<\/b> desde el Backlog/);
  assert.match(html, /<span class="iss-feed-label">Motivo<\/span>Lleva &lt;dos&gt; llamadas\./);
  assert.match(html, /<b>Luis<\/b> escribió una nota/);
  assert.match(html, /editada /);
  assert.match(html, /<b>Alguien<\/b> devolvió la issue a la cola/);
  const withTrail = workScreen({ issue: issue(), sameCenter: [], timeline: [{ at: '2026-10-01T08:00:00+00:00', type: 'claimed', by: 'Ana', to: 'Ana' }], now, mine: false, tab: 'trail' });
  assert.match(withTrail, /data-wtab="trail" aria-selected="true">Notas internas<span>1<\/span>/);
});

test('la pestaña del histórico lleva el contador solo si hay entradas; el diálogo de devolver, la issue escapada', () => {
  assert.equal(trailTab(0), 'Notas internas');
  assert.equal(trailTab(3), 'Notas internas<span>3</span>');
  const html = releaseDialogHtml('INC1', 'PDA <x>');
  assert.match(html, /iss-dlg-code">INC1</);
  assert.match(html, /PDA &lt;x&gt;/);
  assert.match(html, /Volverá a la cola/);
  assert.doesNotMatch(releaseDialogHtml('INC1'), /undefined/);
});

test('el campo de nota del histórico: un textarea y el botón de enviar apagado de inicio', () => {
  const html = noteFormHtml();
  assert.match(html, /<textarea name="note"/);
  assert.match(html, /class="iss-send"[^>]*aria-label="Enviar"[^>]*disabled/);
});

test('Intro envía y Mayús+Intro no', () => {
  assert.equal(sendsNote({ key: 'Enter', shiftKey: false }), true);
  assert.equal(sendsNote({ key: 'Enter', shiftKey: true }), false);
  assert.equal(sendsNote({ key: 'a', shiftKey: false }), false);
});

test('«Editar» solo en mis notas de las últimas 24 h; el editor lleva el texto escapado', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const mine = { at: '2026-10-29T10:00:00Z', type: 'note', id: 1, kind: 'note', by: 'Ana', byId: 'u1', text: 'a <b>', edited: null };
  const old = { ...mine, id: 2, at: '2026-10-28T11:59:00Z' };
  const other = { ...mine, id: 3, byId: 'u2' };
  const move = { at: '2026-10-29T10:00:00Z', type: 'claimed', by: 'Ana', byId: 'u1' };
  assert.equal(canEditNote(mine, 'u1', now), true);
  assert.equal(canEditNote(old, 'u1', now), false);
  assert.equal(canEditNote(other, 'u1', now), false);
  assert.equal(canEditNote(move, 'u1', now), false);
  assert.equal(canEditNote(mine, null, now), false);
  const html = trailHtml([mine, old, other], now, 'u1');
  assert.equal((html.match(/data-edit-note="/g) || []).length, 1);
  assert.match(html, /data-edit-note="1"/);
  assert.doesNotMatch(trailHtml([mine], now, null), /data-edit-note/);
  assert.match(noteEditorHtml('a <b>'), /<textarea[^>]*>a &lt;b&gt;<\/textarea>/);
});

test('las notas de Remedy: lista con quién y cuándo, escapada; vacía o sin columna, su aviso; el contador en la pestaña', () => {
  const wl = [{ at: '2026-10-06 14:40', who: 'ANA <L>', text: 'Llamada <al> centro' }, { at: '2026-10-06 15:10', who: 'LUIS', text: 'Sin respuesta' }];
  const html = worklogHtml(wl);
  assert.equal((html.match(/<details /g) || []).length, 2);
  assert.equal((html.match(/<details class="iss-wl-card" open>/g) || []).length, 1, 'solo la más reciente va abierta');
  assert.match(html, /^<div class="iss-wl"><details class="iss-wl-card" open>\s*<summary><b>LUIS<\/b>/, 'y es la primera');
  assert.match(html, /<details class="iss-wl-card">\s*<summary><b>ANA &lt;L&gt;<\/b><span class="iss-wl-peek">Llamada &lt;al&gt; centro<\/span><time>06\/10 14:40<\/time>/);
  assert.match(worklogHtml([{ at: '2026-10-01 09:30', who: 'X', text: 'hoy' }], new Date('2026-10-01T12:00:00')), /<time>HOY 09:30<\/time>/);
  const long = worklogHtml([{ at: '2026-10-06 14:40', who: 'X', text: 'a'.repeat(120) + '\nsegunda línea' }]);
  assert.match(long, new RegExp(`<span class="iss-wl-peek">${'a'.repeat(90)}…</span>`));
  assert.match(worklogHtml([]), /Sin notas de trabajo en Remedy/);
  assert.match(worklogHtml(undefined), /carga un CSV nuevo/);
  const screen = workScreen({ issue: issue({ worklog: wl }), sameCenter: [], now, mine: false, tab: 'remedy' });
  assert.match(screen, /data-wtab="remedy" aria-selected="true">Seguimiento<span>2<\/span>/);
  assert.doesNotMatch(workScreen({ issue: issue(), sameCenter: [], now, mine: false }), /Seguimiento<span>/);
});

test('la primera línea de una nota, recortada a 90; el arranque de la resolución asistida', () => {
  assert.equal(firstLine('  una línea corta  '), 'una línea corta');
  assert.equal(firstLine('primera\nsegunda'), 'primera');
  assert.equal(firstLine('x'.repeat(95)), 'x'.repeat(90) + '…');
  assert.match(assistHtml(), /<button class="lab-btn primary ai-start-go" data-assist >Iniciar resolución asistida por IA<\/button>/);
  assert.doesNotMatch(assistHtml(), /ai-start-hint/);
  assert.match(assistHtml('Copilot <no> está'), /data-assist disabled>[^]*<p class="ai-start-hint">Copilot &lt;no&gt; está<\/p>/);
});

test('la cabecera de la issue: volver al panel, el título en una línea con su title, y las acciones', () => {
  const html = workScreen({ issue: issue({ text: 'Cola <llena>' }), sameCenter: [], now, mine: true });
  assert.match(html, /<header class="iss-work-h">\s*<button class="lab-btn primary" data-back>Volver al panel<\/button>\s*<div class="iss-work-title">\s*<h2 title="Cola &lt;llena&gt;">Cola &lt;llena&gt;<\/h2>/);
  assert.match(html, /data-act="resolve">Resolver<[\s\S]*data-act="escalate">Escalar<[\s\S]*data-act="transfer">Traspasar<[\s\S]*data-release>Devolver a la cola</);
  assert.doesNotMatch(html, /Mi mesa|iss-state/);
  const notMine = workScreen({ issue: issue(), sameCenter: [], now, mine: false });
  assert.doesNotMatch(notMine, /data-act="transfer"|data-release/, 'sin cogerla en SIA no se traspasa ni se devuelve');
});

test('una issue pendiente de un tercero: en lugar del chat, reclamarle y traspasar, grandes', () => {
  const html = workScreen({ issue: issue({ status: 'PENDING' }), sameCenter: [], now, mine: true });
  assert.match(html, /iss-pending-acts[\s\S]*data-act="chase">[\s\S]*Reclamar respuesta<\/span><em class="iss-big-still \w+">\d+ días? sin moverse<\/em>[\s\S]*data-act="transfer">[\s\S]*Traspasar/);
  assert.doesNotMatch(html, /data-act="resolve"|data-act="escalate"|data-release|iss-chat-body/);
  assert.match(html, /<div class="iss-actions"><span class="iss-escalated"[\s\S]*Escalada[\s\S]*desde el/, 'en la cabecera, que ya está escalada y desde cuándo');
  const notMine = workScreen({ issue: issue({ status: 'PENDING' }), sameCenter: [], now, mine: false });
  assert.match(notMine, /data-act="chase"/);
  assert.doesNotMatch(notMine, /data-act="transfer"/, 'sin cogerla en SIA, solo reclamar');
});

test('la cabecera de una pendiente: a quién está escalada, desde que pasó a Pendiente, y los días en su color', () => {
  const pending = issue({ status: 'PENDING', reason: 'THIRD_PARTY_VENDOR_ACTION_REQD', modified: '2026-09-20 09:00',
    changes: [['2026-09-01 10:00', '', 'ASSIGNED'], ['2026-09-15 08:30', 'ASSIGNED', 'PENDING']] });
  const html = workScreen({ issue: pending, sameCenter: [], now, mine: true });
  assert.match(html, /<b>Escalada a Proveedor<\/b><span>desde el 15\/09 08:30<\/span>/);
  assert.match(html, /<em class="iss-big-still late">11 días sin moverse<\/em>/, 'siete días o más: hay que mirarla');
  assert.match(workScreen({ issue: { ...pending, reason: 'ESCALATED_ACCORDING_TO_PROCEDURE' }, sameCenter: [], now, mine: true }), /<b>Escalada<\/b>/);
});
