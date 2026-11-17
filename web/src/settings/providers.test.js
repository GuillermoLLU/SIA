import test from 'node:test';
import assert from 'node:assert/strict';
import { copilotCard, usageText } from './providers.js';

test('la tarjeta de Copilot: con sesión, quién y por qué vía; sin ella, a iniciarla; sin poder comprobar, el motivo', () => {
  assert.deepEqual(copilotCard({ ok: true, loggedIn: true, login: 'ana', via: 'la sesión de gh' }), { text: 'ana · por la sesión de gh', cls: '', badge: 'Conectado', badgeCls: 'ok', button: 'Cambiar de cuenta', loggedIn: true });
  assert.equal(copilotCard({ ok: true, loggedIn: true, login: null, via: null }).text, 'Sesión iniciada');
  assert.deepEqual(copilotCard({ ok: true, loggedIn: false }), { text: 'Copilot no tiene sesión: inicia sesión para abrir chats.', cls: '', badge: 'Sin sesión', badgeCls: 'bad', button: 'Iniciar sesión', loggedIn: false });
  assert.deepEqual(copilotCard({ ok: false, error: 'Copilot no está instalado en este ordenador.' }), { text: 'Copilot no está instalado en este ordenador.', cls: 'bad', badge: 'Sin comprobar', badgeCls: '', button: 'Iniciar sesión', loggedIn: false });
  assert.equal(copilotCard(null).text, 'No se pudo comprobar.');
});

test('lo gastado, con cuándo se renueva si es en el futuro', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(usageText({ used: 30, total: 200, usedPercent: 15, resetsAt: Date.parse('2026-12-01T12:00:00Z') }, now), '30 de 200 peticiones (15 %) · se renueva el 1 de diciembre');
  assert.equal(usageText({ used: 30, total: 200, usedPercent: 15, resetsAt: null }, now), '30 de 200 peticiones (15 %)');
  assert.equal(usageText(null), '');
});
