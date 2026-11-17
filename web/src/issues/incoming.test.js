import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomingCardHtml, hitsHtml, incomingReady, recentOf, incomingModalHtml, digitsOf } from './incoming.js';

const ISSUE = { id: 'INC000027680016', text: 'ECOM ZARA <TR 3> - Error RFID', priority: 'HIGH', prio: true, sisu: false, center: '101020', status: 'IN_PROGRESS', reported: '2026-11-12 12:25', notes: 'Contact Phone: 0537\nNo <entran>.', link: 'https://remedy/x', assignee: 'CESARHD', claimedBy: null,
  worklog: [
    { at: '2026-11-12 12:30', who: 'robot.siglo', text: 'Uno.' },
    { at: '2026-11-13 12:30', who: 'CESARHD', text: '[ANALISIS] Dos.' },
    { at: '2026-11-14 12:30', who: 'CESARHD', text: '[CALLKO] +90 212 555 0143' },
  ] };
const TIMELINE = [{ at: '2026-11-15T10:00:00Z', type: 'claimed', by: 'Ana', to: 'Ana' }, { at: '2026-11-15T11:00:00Z', type: 'note', id: 9, by: 'Ana', byId: 'u1', text: 'Cuatro.', visibility: 'internal', tag: null }];
const now = new Date('2026-11-17T12:00:00Z');

test('la tarjeta del panel: su título, la ayuda y el buscador, con los resultados escondidos', () => {
  const html = incomingCardHtml();
  assert.match(html, /<h3><i class="inc-ic"><svg[\s\S]*<\/i>Llamada de un centro<\/h3>/);
  assert.match(html, /Busca su incidencia para ver el detalle y dejar nota de la llamada\./);
  assert.match(html, /<input data-incoming-q type="search" inputmode="numeric"[^>]*placeholder="Número de incidencia \(INC…\)"/);
  assert.match(html, /data-incoming-hits role="listbox" hidden><\/div>/);
  assert.equal(digitsOf(' inc-2768 0'), '27680');
});

test('los resultados: el número con lo buscado resaltado, el título y centro, estado y quién la lleva; la elegida marcada; sin nada, lo dice', () => {
  const html = hitsHtml([
    { id: 'INC000027680016', text: 'Uno <a>', center: '101020', status: 'IN_PROGRESS', holder: 'glucia' },
    { id: 'INC000012768000', text: 'Dos', center: '', status: 'PENDING', holder: null },
  ], '2768 0', 1);
  assert.match(html, /aria-selected="false" data-incoming-open="INC000027680016">\s*<b class="inc-id">INC0000<u>27680<\/u>016<\/b><span class="inc-t">Uno &lt;a&gt;<\/span>\s*<small>Centro 101020 · En curso · glucia<\/small>/);
  assert.match(html, /aria-selected="true" data-incoming-open="INC000012768000">[\s\S]*<small>Centro — · Pendiente · sin coger en SIA<\/small>/);
  assert.equal(hitsHtml([], 'INC 9999'), '<p class="inc-none">Ninguna incidencia con «9999» en la foto.</p>');
});

test('se guarda con lo que se habló; el teléfono es opcional, pero si se pone, que lo sea', () => {
  assert.equal(incomingReady({ comment: 'Pregunta cuándo estará.' }), true);
  assert.equal(incomingReady({ phone: '+34 600 000 000', comment: 'Pregunta.' }), true);
  assert.equal(incomingReady({ phone: '12', comment: 'Pregunta.' }), false);
  assert.equal(incomingReady({ phone: '+34 600 000 000', comment: '  ' }), false);
  assert.equal(incomingReady(), false);
});

test('las últimas notas: las tres más recientes (de Remedy y de SIA, llamadas incluidas; sin movimientos) y cuántas hay', () => {
  const { recent, total } = recentOf(ISSUE, TIMELINE);
  assert.deepEqual(recent.map((e) => e.key), ['r1', 'r2', 'n9']);
  assert.equal(total, 4);
  assert.deepEqual(recentOf({ ...ISSUE, worklog: null }), { recent: [], total: 0 });
});

test('la ventana: el detalle de la issue (escapado), sus últimas notas plegadas y lo que se habló; solo registro', () => {
  const { recent, total } = recentOf(ISSUE, TIMELINE);
  const html = incomingModalHtml({ issue: ISSUE, recent, total, now });
  assert.match(html, /<h3><i class="inc-ic">[\s\S]*<\/i>Llamada del centro<\/h3><a href="https:\/\/remedy\/x" target="_blank" rel="noopener" title="Abrir en Remedy">INC000027680016 ↗<\/a>/);
  assert.match(html, /<p class="inc-title">ECOM ZARA &lt;TR 3&gt; - Error RFID<\/p>/);
  assert.match(html, /<dt>Criticidad<\/dt><dd>Alta <small>priorizada<\/small><\/dd>/);
  assert.match(html, /<dt>Estado<\/dt><dd>En curso<\/dd>/);
  assert.match(html, /<dt>La lleva<\/dt><dd>CESARHD <small>en Remedy<\/small><\/dd>/);
  assert.match(incomingModalHtml({ issue: { ...ISSUE, claimedBy: { name: 'Ana' } }, now }), /<dt>La lleva<\/dt><dd>Ana <small>en SIA<\/small><\/dd>/);
  assert.match(html, /No &lt;entran&gt;\./);
  assert.match(html, /Últimas notas <span class="iss-low">· 3 de 4<\/span>/);
  assert.equal((html.match(/data-note-key="/g) || []).length, 3);
  assert.doesNotMatch(html, / open"/, 'plegadas');
  assert.match(html, /name="phone" type="tel"/);
  assert.match(html, /<textarea id="inc-f-comment" name="comment"/);
  assert.match(html, /no se resuelve, no se coge ni se mueve/);
  assert.match(html, /<button type="submit" class="lab-btn primary" disabled>Guardar llamada<\/button>/);
  assert.doesNotMatch(html, /data-act=|Resolver|Escalar|Traspasar/, 'nada más que registrar la llamada');
});
