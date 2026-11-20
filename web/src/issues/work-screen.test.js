import test from 'node:test';
import assert from 'node:assert/strict';
import { workScreen, releaseDialogHtml, worklogHtml, firstLine, assistHtml, assistWaitHtml } from './work-screen.js';

const issue = (o = {}) => ({ id: 'INC1', text: 'PDA <sin imagen>', priority: 'HIGH', status: 'ASSIGNED', reason: '', notes: 'no <arranca>',
  resolution: '', category: 'SGA', group: 'AYS SOPORTE', assignee: '', reported: '2026-10-01 10:00', modified: '2026-10-01 11:00',
  vendorTicket: '', changes: [['2026-10-01 10:00', '', 'ASSIGNED']], related: '', prio: false, sisu: false, center: '100', link: '', claimedBy: null, ...o });
const now = new Date('2026-10-01T12:00:00');

test('la pantalla: tres pestañas (Detalle, Notas y Relacionadas), Detalle por defecto, sin análisis de la IA y el texto escapado', () => {
  const html = workScreen({ issue: issue(), sameCenter: [], now, mine: false });
  assert.deepEqual([...html.matchAll(/data-wtab="([a-z]+)"/g)].map((m) => m[1]), ['detail', 'notes', 'related'], 'las notas de Remedy y las del equipo, en una sola: Seguimiento');
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
  assert.match(html, /data-wtab="notes" aria-selected="false">Seguimiento</);
  assert.doesNotMatch(html, /Análisis de la IA|data-wpanel="ai"|data-wpanel="remedy"|data-wpanel="trail"/);
  assert.match(html, /data-wpanel="notes" hidden/);
  assert.match(html, /La foto cargada no trae las notas de Remedy/, 'sin la columna de notas, se avisa en Notas');
  assert.doesNotMatch(html, /data-chat-head|iss-chat-note/, 'la cabecera del chat la pinta el propio chat');
  assert.match(html, /<div class="iss-chat-body"><\/div>/);
  assert.doesNotMatch(html, /data-act="note"/);
  assert.match(html, /data-note-form/);
  assert.match(html, /Por conectar/);
  assert.equal((html.match(/iss-pending/g) || []).length, 1);
  assert.match(html, /PDA &lt;sin imagen&gt;/);
  assert.match(html, /no &lt;arranca&gt;/);
  assert.doesNotMatch(html, /data-release/);
});

test('Notas: las de Remedy y las de SIA juntas, con su número en la pestaña; abierta, la conversación', () => {
  const wl = [{ at: '2026-10-01 09:30', who: 'robot.siglo', text: 'No entra. Gracias.' }];
  const timeline = [{ at: '2026-10-01T08:00:00+00:00', type: 'claimed', by: 'Ana', to: 'Ana' }, { at: '2026-10-01T10:00:00+00:00', type: 'note', id: 4, by: 'Ana', byId: 'u1', text: 'Revisado.', visibility: 'internal', tag: null }];
  const html = workScreen({ issue: issue({ worklog: wl }), sameCenter: [], timeline, now, mine: false, tab: 'notes' });
  assert.match(html, /data-wtab="notes" aria-selected="true">Seguimiento<span>2<\/span>/, 'cuenta las notas, no los movimientos');
  assert.match(html, /data-wpanel="notes">/);
  assert.match(html, /data-note-key="r0"/);
  assert.match(html, /data-note-key="n4"/);
  assert.doesNotMatch(html, /La foto cargada no trae/);
});

test('mía y cogida en SIA: se puede devolver y se ve quién la tiene', () => {
  const html = workScreen({ issue: issue({ claimedBy: { id: 'u', name: 'Ana', at: '2026-10-01T10:30:00Z' } }), sameCenter: [], now, mine: true, tab: 'detail' });
  assert.match(html, /data-release/);
  assert.match(html, /en SIA, Ana/);
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
});

test('el diálogo de devolver, la issue escapada', () => {
  const html = releaseDialogHtml('INC1', 'PDA <x>');
  assert.match(html, /iss-dlg-code">INC1</);
  assert.match(html, /PDA &lt;x&gt;/);
  assert.match(html, /Volverá a la cola/);
  assert.doesNotMatch(releaseDialogHtml('INC1'), /undefined/);
});

test('las notas de Remedy en tarjetas (el panel del Backlog): con quién y cuándo, escapadas; vacías o sin columna, su aviso', () => {
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
});

test('la primera línea de una nota, recortada a 90; el arranque de la resolución asistida', () => {
  assert.equal(firstLine('  una línea corta  '), 'una línea corta');
  assert.equal(firstLine('primera\nsegunda'), 'primera');
  assert.equal(firstLine('x'.repeat(95)), 'x'.repeat(90) + '…');
  assert.match(assistHtml(), /<button class="lab-btn primary ai-start-go" data-assist >Iniciar resolución asistida por IA<\/button>/);
  assert.doesNotMatch(assistHtml(), /ai-start-hint/);
  assert.match(assistWaitHtml(), /<div class="ai-start"><div class="ai-wait" data-wait><i class="ai-wait-spin"><\/i><span>Iniciando agente…<\/span>/); // pulsado: el aviso de arranque
  assert.match(assistHtml('Copilot <no> está'), /data-assist disabled>[^]*<p class="ai-start-hint">Copilot &lt;no&gt; está<\/p>/);
});

test('la cabecera de la issue: volver al panel, el título en una línea con su title, y las acciones', () => {
  const html = workScreen({ issue: issue({ text: 'Cola <llena>', priority: 'CRITICAL' }), sameCenter: [], now, mine: true });
  assert.match(html, /<header class="iss-work-h">\s*<button class="lab-btn primary" data-back>Volver al panel<\/button>\s*<h2 title="Cola &lt;llena&gt;">Cola &lt;llena&gt;<\/h2>/);
  assert.match(html, /<div class="iss-actions"><button class="lab-btn primary" data-act="resolve">Resolver<\/button><button class="lab-btn" data-act="escalate">Escalar<\/button><div class="iss-more">/, 'a la vista, Resolver y Escalar');
  assert.match(html, /data-more aria-expanded="false" aria-controls="iss-more-menu">Otras acciones<svg/);
  const menu = html.match(/<div class="iss-more-menu" id="iss-more-menu" hidden>([\s\S]*?)<\/div><\/div>/)[1];
  assert.deepEqual([...menu.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ['Llamada', 'Contactar con el centro', 'Abrir WAR-ROOM', 'Dividir la issue', 'Traspasar', 'Devolver a la cola'], 'el resto, en «Otras acciones»');
  assert.match(menu, /Escribirle tus dudas como nota pública<\/small><\/button><hr><button type="button" data-act="warroom">[\s\S]*<b>Abrir WAR-ROOM<\/b><\/button><hr><button type="button" data-act="split">[\s\S]*<b>Dividir la issue<\/b><small>Si trae dos problemas: el segundo, a otra issue<\/small><\/button><hr><button type="button" data-act="transfer">/, 'hablar con el centro, el WAR-ROOM, dividirla y soltarla, separados por una línea');
  assert.match(menu, /data-release>/);
  assert.doesNotMatch(html, /Mi mesa|iss-state/);
  const notMine = workScreen({ issue: issue({ priority: 'CRITICAL' }), sameCenter: [], now, mine: false });
  assert.doesNotMatch(notMine, /data-act="split"|data-act="transfer"|data-release/, 'sin cogerla en SIA no se divide, ni se traspasa ni se devuelve');
  assert.match(notMine, /data-act="call">[\s\S]*data-act="contact">[\s\S]*<\/button><hr><button type="button" data-act="warroom">[\s\S]*<\/button><\/div><\/div>/, 'sin la línea de soltarla');
  const high = workScreen({ issue: issue({ priority: 'HIGH' }), sameCenter: [], now, mine: true });
  assert.doesNotMatch(high, /data-act="warroom"/, 'una alta, sin WAR-ROOM');
  assert.match(high, /Escribirle tus dudas como nota pública<\/small><\/button><hr><button type="button" data-act="split">[\s\S]*<\/button><hr><button type="button" data-act="transfer">/, 'y sin su grupo: del centro a dividirla y soltarla');
});

test('una issue pendiente de un tercero: en lugar del chat, reclamarle y traspasar, grandes', () => {
  const html = workScreen({ issue: issue({ status: 'PENDING' }), sameCenter: [], now, mine: true });
  assert.match(html, /iss-pending-acts[\s\S]*data-act="chase">[\s\S]*Reclamar respuesta<\/span><em class="iss-big-still \w+">\d+ días? sin moverse<\/em>[\s\S]*data-act="transfer">[\s\S]*Traspasar/);
  assert.doesNotMatch(html, /data-act="resolve"|data-act="escalate"|data-release|iss-chat-body/);
  assert.match(html, /iss-escalated[\s\S]*<div class="iss-more">[\s\S]*data-act="call">[\s\S]*data-act="contact">[\s\S]*<\/div><\/div><\/div>/, 'pendiente: a quién se escaló y, al lado, hablar con el centro en «Otras acciones»');
  assert.equal((html.match(/data-act="transfer"/g) || []).length, 1, 'Traspasar, solo el grande');
  assert.doesNotMatch(html, /data-act="warroom"/, 'pendiente de un tercero, sin WAR-ROOM');
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

test('datos de la issue: el primero, su estado ahora, desde cuándo y, si está pendiente, a quién espera', () => {
  const grid = (i) => workScreen({ issue: issue(i), sameCenter: [], now, mine: false }).split('iss-keys-grid">')[1];
  assert.match(grid({}), /^\s*<div class="k-status"><span>Estado<\/span><b>Asignada<\/b><small>desde el 01\/10 10:00<\/small><\/div>\s*<div class="k-sev/);
  assert.match(grid({ status: 'PENDING', reason: 'THIRD_PARTY_VENDOR_ACTION_REQD', changes: [['2026-10-01 11:30', 'In Progress', 'Pending']] }),
    /<b>Pendiente<\/b><small>Proveedor · 01\/10 11:30<\/small>/);
});
