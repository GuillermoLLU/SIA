import test from 'node:test';
import assert from 'node:assert/strict';
import { workScreen, trailHtml, trailTab, releaseDialogHtml, noteFormHtml, groupByDay, sendsNote } from './work-screen.js';

const issue = (o = {}) => ({ id: 'INC1', text: 'PDA <sin imagen>', priority: 'HIGH', status: 'ASSIGNED', reason: '', notes: 'no <arranca>',
  resolution: '', category: 'SGA', group: 'AYS SOPORTE', assignee: '', reported: '2026-10-01 10:00', modified: '2026-10-01 11:00',
  vendorTicket: '', changes: [['2026-10-01 10:00', '', 'ASSIGNED']], related: '', prio: false, sisu: false, center: '100', link: '', claimedBy: null, ...o });
const now = new Date('2026-10-01T12:00:00');

test('la pantalla: tres pestañas, Detalle por defecto, sin análisis de la IA y el texto escapado', () => {
  const html = workScreen({ issue: issue(), sameCenter: [], now, mine: false });
  assert.equal((html.match(/data-wtab="/g) || []).length, 3);
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
  assert.doesNotMatch(html, /Análisis de la IA|data-wpanel="ai"/);
  assert.match(html, /Nadie la ha movido ni anotado en SIA todavía/);
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
  assert.match(html, /en SIA, Ana/);
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
});

test('el feed: por días, con avatar, quién hizo qué y la hora; el motivo del traspaso como comentario; todo escapado', () => {
  const html = trailHtml([
    { at: '2026-10-01T08:00:00+00:00', type: 'claimed', by: 'Ana López', from: null, to: 'Ana López' },
    { at: '2026-10-01T09:00:00+00:00', type: 'transferred', by: 'Ana López', from: 'Ana López', to: 'Luis <x>', text: 'Lleva <dos> llamadas.' },
    { at: '2026-10-01T10:00:00+00:00', type: 'note', id: 2, kind: 'note', by: 'Luis', text: 'El centro confirma.', edited: '2026-10-01T10:30:00+00:00' },
    { at: '2026-10-01T11:00:00+00:00', type: 'released', by: null, from: null, to: null },
    { at: '2026-10-02T08:00:00+00:00', type: 'claimed', by: 'Luis', from: null, to: 'Luis' },
  ], new Date('2026-10-02T12:00:00'));
  assert.equal((html.match(/<li /g) || []).length, 5);
  assert.deepEqual([...html.matchAll(/<h5><span>([^<]+)<\/span><\/h5>/g)].map((m) => m[1]), ['Ayer', 'Hoy']);
  assert.match(html, /<span class="iss-avatar" aria-hidden="true">AL<\/span>/);
  assert.match(html, /<span class="iss-avatar unknown" aria-hidden="true">\?<\/span>/);
  assert.match(html, /<b>Ana López<\/b> cogió la issue/);
  assert.match(html, /traspasó la issue a <b>Luis &lt;x&gt;<\/b>/);
  assert.match(html, /<span class="iss-feed-label">Motivo<\/span>Lleva &lt;dos&gt; llamadas\./);
  assert.match(html, /<b>Luis<\/b> escribió una nota/);
  assert.match(html, /editada /);
  assert.match(html, /<b>Alguien<\/b> devolvió la issue a la cola/);
  const withTrail = workScreen({ issue: issue(), sameCenter: [], timeline: [{ at: '2026-10-01T08:00:00+00:00', type: 'claimed', by: 'Ana', to: 'Ana' }], now, mine: false, tab: 'trail' });
  assert.match(withTrail, /data-wtab="trail" aria-selected="true">Histórico y notas<span>1<\/span>/);
});

test('la pestaña del histórico lleva el contador solo si hay entradas; el diálogo de devolver, la issue escapada', () => {
  assert.equal(trailTab(0), 'Histórico y notas');
  assert.equal(trailTab(3), 'Histórico y notas<span>3</span>');
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

test('agrupar por día conserva el orden y parte donde cambia el día; Intro envía y Mayús+Intro no', () => {
  const now = new Date('2026-10-02T12:00:00');
  const a = { at: '2026-10-01T08:00:00', type: 'claimed' }, b = { at: '2026-10-01T09:00:00', type: 'released' }, c = { at: '2026-10-02T08:00:00', type: 'claimed' };
  assert.deepEqual(groupByDay([a, b, c], now), [{ day: 'Ayer', items: [a, b] }, { day: 'Hoy', items: [c] }]);
  assert.deepEqual(groupByDay([], now), []);
  assert.equal(sendsNote({ key: 'Enter', shiftKey: false }), true);
  assert.equal(sendsNote({ key: 'Enter', shiftKey: true }), false);
  assert.equal(sendsNote({ key: 'a', shiftKey: false }), false);
});
