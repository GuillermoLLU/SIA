import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting, heroHtml } from './hero.js';

test('el saludo lleva el nombre de pila; sin nombre, solo «Hola.»', () => {
  assert.equal(greeting('Ana María López'), 'Hola, Ana.');
  assert.equal(greeting('  glucia '), 'Hola, glucia.');
  assert.equal(greeting(null), 'Hola.');
  assert.equal(greeting(''), 'Hola.');
});

test('la portada: saludo, campo encendido y sin aviso; con error, campo apagado y el motivo debajo', () => {
  const ok = heroHtml({ me: 'Ana' });
  assert.match(ok, /<h1 class="ai-hero-hi">Hola, Ana\.<\/h1>/);
  assert.match(ok, /<textarea name="ask"[^>]*placeholder="¿En qué te puedo ayudar hoy\?"[^>]*><\/textarea>/);
  assert.doesNotMatch(ok, /disabled|ai-hero-err/);
  assert.match(ok, /<div class="ai-hero-wait" data-wait hidden><i class="ld-spin small"/); // el giro, escondido hasta que arranca
  const bad = heroHtml({ me: '<b>', error: 'Copilot <no> está' });
  assert.match(bad, /Hola, &lt;b&gt;\./);
  assert.match(bad, /<textarea[^>]* disabled>/);
  assert.match(bad, /<p class="ai-hero-err">Copilot &lt;no&gt; está<\/p>/);
});
