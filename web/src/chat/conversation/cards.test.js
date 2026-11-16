import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHtml, askHtml } from './cards.js';

const q = (extra = {}) => ({ question: '¿Qué bebida?', header: 'Bebida', multi: false, options: [{ label: 'Té', description: '' }, { label: 'Café', description: 'Con leche' }], ...extra });

test('una pregunta de una respuesta: botones que contestan con un clic, y «Ninguna» para descartarlas', () => {
  const html = askHtml({ ask: [q()], done: false, result: '' });
  assert.match(html, /data-opt="1"/);
  assert.doesNotMatch(html, /data-send/);
  assert.match(html, /data-none[^>]*>Ninguna/);
  assert.match(html, /cv-ask-hint">o escribe abajo/);
  assert.match(html, /Copilot te pregunta/);
});

test('varias preguntas o de varias respuestas: casillas y «Enviar respuestas»', () => {
  const html = askHtml({ ask: [q(), q({ multi: true })], done: false, result: '' });
  assert.match(html, /cv-opt radio/);
  assert.match(html, /cv-opt check/);
  assert.match(html, /data-send disabled>Enviar respuestas<\/button><button[^>]*data-none/);
  assert.match(html, /elige una o varias/);
});

test('el plan: aprobar o rechazar mientras lo espera; si no lo espera aún, sin botones', () => {
  assert.match(askHtml({ plan: '1. Hacer X', done: false, result: '', pending: true }), /data-approve>Aprobar<\/button><button[^>]*data-deny>Rechazar/);
  assert.doesNotMatch(askHtml({ plan: '1. Hacer X', done: false, result: '' }), /data-approve/);
  assert.match(askHtml({ plan: '1. Hacer X', done: false, result: '' }), /te propone un plan/);
});

test('descartada (sin elegir): se dice así, sin el aviso en inglés del CLI', () => {
  const html = askHtml({ ask: [q()], done: true, result: '[Request interrupted by user]' });
  assert.match(html, /Descartada/);
  assert.match(html, /Sin elegir ninguna opción\./);
  assert.doesNotMatch(html, /Request interrupted/);
});

test('ya contestada: pregunta → respuesta y el detalle plegado', () => {
  const html = askHtml({ ask: [q()], done: true, result: '"¿Qué bebida?"="Café"' });
  assert.match(html, /<span>¿Qué bebida\?<\/span><b>→<\/b><strong>Café<\/strong>/);
  assert.match(html, /<details class="cv-ask-more"><summary>Ver detalle/);
  assert.doesNotMatch(html, /<button/);
});

test('lo de fuera va escapado', () => {
  assert.match(askHtml({ ask: [q({ question: '<b>¿?</b>' })], done: false, result: '' }), /&lt;b&gt;/);
});

// ── Copilot no tiene sesión iniciada: su tarjeta ──
const authRow = (extra = {}) => ({ kind: 'auth', id: 'a1', detail: 'Not logged in', retry: 'hola', state: 'needed', live: true, ...extra });
const authActions = (html) => [...html.matchAll(/data-auth="(\w+)"/g)].map((m) => m[1]);

test('sin sesión: lleva a Proveedores IA y deja decir que ya está', () => {
  const html = authHtml(authRow());
  assert.match(html, /Copilot no tiene sesión iniciada/);
  assert.match(html, /Proveedores IA/);
  assert.match(html, /no le ha llegado a Copilot/);
  assert.deepEqual(authActions(html), ['login', 'check']);
  assert.doesNotMatch(html, /\/login/); // nada de mandar a un terminal
  assert.doesNotMatch(authHtml(authRow({ retry: null })), /no le ha llegado/); // al arrancar no hay mensaje perdido
});

test('con sesión en el equipo pero sin poder usarla: cerrar el chat y abrir otro, o volver a entrar', () => {
  const html = authHtml(authRow({ state: 'logged', detail: 'OAuth token revoked' }));
  assert.match(html, /no ha podido usar tu sesión/);
  assert.match(html, /Cierra el chat y abre otro/);
  assert.match(html, /Copilot dice: OAuth token revoked/);
  assert.deepEqual(authActions(html), ['login']);
});

test('la sesión ya está: ofrece reenviar lo que no llegó; sin mensaje perdido, solo lo dice', () => {
  assert.deepEqual(authActions(authHtml(authRow({ state: 'ready' }))), ['retry']);
  assert.match(authHtml(authRow({ state: 'ready' })), /Sesión de Copilot iniciada/);
  assert.deepEqual(authActions(authHtml(authRow({ state: 'ready', retry: null }))), []);
});

test('con algo escrito después queda en una línea, sin botones; lo que dijo Copilot va escapado', () => {
  assert.deepEqual(authActions(authHtml(authRow({ live: false }))), []);
  assert.match(authHtml(authRow({ live: false })), /Copilot no tenía sesión iniciada/);
  assert.match(authHtml(authRow({ live: false, state: 'ready' })), /Sesión de Copilot iniciada/);
  assert.match(authHtml(authRow({ state: 'logged', detail: '<b>x</b>' })), /&lt;b&gt;x&lt;\/b&gt;/);
});
