import test from 'node:test';
import assert from 'node:assert/strict';
import { isNetWarning, warning } from './net-warning.js';

test('certificados: con guía, el enlace; sin ella, a soporte', () => {
  const w = warning({ code: 'certs' }, true);
  assert.match(w.title, /certificados/);
  assert.match(w.line, /\{guía\}/);
  assert.equal(w.tips.length, 1);
  assert.match(warning({ code: 'certs' }, false).line, /soporte/);
});

test('VPN: conectarse y «Reintentar», sin guía', () => {
  const w = warning({ code: 'vpn' }, true);
  assert.match(w.title, /VPN/);
  assert.doesNotMatch(w.line, /\{guía\}/);
  assert.equal(w.tips.length, 1);
});

test('las dos a la vez: lo que falta de cada una y los dos porqués', () => {
  const w = warning({ code: 'certs-vpn' }, true);
  assert.match(w.line, /\{guía\}.*VPN/);
  assert.equal(w.tips.length, 2);
  assert.match(warning({ code: 'certs-vpn' }, false).line, /soporte.*VPN/);
});

test('otro fallo: el texto del bridge o el de serie, sin ayuda', () => {
  assert.deepEqual(warning({ error: 'Sin conexión con la base de la instancia.' }, true), { title: 'Sin conexión con la base de la instancia.', line: '', tips: [] });
  assert.equal(warning({}, false).title, 'Sin conexión con SIA.');
});

test('isNetWarning: solo lo que falta para la red del cliente', () => {
  for (const code of ['certs', 'vpn', 'certs-vpn']) assert.equal(isNetWarning(code), true);
  for (const code of [undefined, '', 'otro', '42501']) assert.equal(isNetWarning(code), false);
});
