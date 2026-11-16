import test from 'node:test';
import assert from 'node:assert/strict';
import { FACES, faceTabs, firstTab, faceFor } from './faces.js';
import { TABS } from './tabs.js';

const TEAM = { id: 'equipo', label: 'Equipo soporte' };

test('las tres vistas, en su orden: Servicio, Equipo y Técnicas; solo Servicio deja comparar con T-Systems', () => {
  assert.deepEqual(FACES.map((f) => [f.id, f.label, f.tsys]), [['servicio', 'Servicio', true], ['equipo', 'Equipo', false], ['tecnicas', 'Técnicas', false]]);
  for (const f of FACES) assert.match(f.icon, /^<svg/);
});

test('cada vista, con sus pestañas y sus nombres de siempre; Equipo, con Equipo soporte unificado y los turnos', () => {
  assert.deepEqual(faceTabs('servicio', TEAM).map(([k]) => k), ['resumen', 'hoy', 'historico', 'entrada', 'sla', 'resolucion', 'calidad', 'ia']);
  assert.deepEqual(faceTabs('equipo', TEAM), [['equipo', 'Equipo soporte'], ['turnos', 'Turnos']]);
  assert.deepEqual(faceTabs('tecnicas', TEAM).map(([k]) => k), ['escalados', 'modulos', 'cliente', 'tiempos', 'ia']);
  assert.equal(faceTabs('servicio', TEAM)[0][1], 'Resumen');
});

test('ninguna pestaña se queda sin vista, y la de IA va en dos', () => {
  const all = new Set(FACES.flatMap((f) => f.tabs));
  for (const [k] of TABS) assert.ok(all.has(k), `${k} sin vista`);
  assert.deepEqual(FACES.filter((f) => f.tabs.includes('ia')).map((f) => f.id), ['servicio', 'tecnicas']);
});

test('cada vista empieza por su primera pestaña; sin Equipo soporte, Equipo empieza por Turnos', () => {
  assert.deepEqual(FACES.map((f) => firstTab(f.id, TEAM)), ['resumen', 'equipo', 'escalados']);
  assert.equal(firstTab('equipo'), 'turnos');
  assert.equal(firstTab('nada', TEAM), null);
});

test('un enlace a una pestaña: en la misma vista si la tiene; si no, en la primera que la tenga', () => {
  assert.equal(faceFor('hoy', 'servicio'), 'servicio');
  assert.equal(faceFor('escalados', 'servicio'), 'tecnicas');   // Resumen → Escalados
  assert.equal(faceFor('ia', 'tecnicas'), 'tecnicas');          // está en las dos: se queda
  assert.equal(faceFor('ia', 'equipo'), 'servicio');
  assert.equal(faceFor('desconocida', 'equipo'), 'equipo');
});
