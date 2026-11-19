import test from 'node:test';
import assert from 'node:assert/strict';
import { FACES, faceTabs, firstTab, faceFor, TAB_ALIAS, JOINED, HIDDEN, routeTo } from './faces.js';
import { TABS } from './tabs.js';

const TEAM = { id: 'equipo', label: 'Equipo soporte' };
const keys = (id) => faceTabs(id, TEAM).map(([k]) => k);

test('las tres vistas, en su orden: Servicio, Equipo y Técnicas; solo Servicio deja comparar con T-Systems', () => {
  assert.deepEqual(FACES.map((f) => [f.id, f.label, f.tsys]), [['servicio', 'Servicio', true], ['equipo', 'Equipo', false], ['tecnicas', 'Técnicas', false]]);
  for (const f of FACES) assert.match(f.icon, /^<svg/);
});

test('cada vista, con sus pestañas y sus nombres', () => {
  // Servicio: el Resumen (con la corona de Foto de hoy, por fechas), Backlog (lo demás de Foto de hoy), las que van
  // juntas y, al final, Equipo soporte con otro nombre, para verlo rápido
  assert.deepEqual(faceTabs('servicio', TEAM).map(([, l]) => l), ['Resumen', 'Backlog', 'Entrantes', 'Módulos y focos', 'Resolución', 'Escalados',
    'SLA y calidad', 'Uso de la IA', 'Turnos']);   // sin Equipo soporte: está en Equipo
  assert.deepEqual(keys('servicio'), ['resumen', 'backlog', 'entrada', 'modulos', 'resolucion', 'escalados', 'slaq', 'ia', 'turnos']);
  assert.deepEqual(faceTabs('equipo', TEAM).map(([, l]) => l), ['Equipo soporte', 'Calidad', 'Módulos y focos', 'Turnos']);
  assert.deepEqual(faceTabs('tecnicas', TEAM).map(([, l]) => l), ['Resumen', 'Backlog', 'Entrantes', 'Escalados', 'Módulos y focos',
    'Pendiente de cliente', 'Análisis tiempos', 'Calidad', 'Uso de la IA']);
  // SLA y calidad: SLAs y Calidad (Uso de la IA, aparte)
  assert.deepEqual(JOINED.slaq, ['sla', 'calidad']);
  assert.deepEqual(Object.keys(JOINED), ['slaq']);   // Resolución y Escalados, cada una en su pestaña
});

test('ninguna pestaña se queda sin vista, salvo el Histórico; Foto de hoy, partida entre el Resumen y Backlog', () => {
  const all = new Set(FACES.flatMap((f) => f.tabs));
  const joined = (k) => Object.keys(JOINED).some((j) => JOINED[j].includes(k) && all.has(j));
  for (const [k] of TABS) assert.ok(all.has(k) || all.has(TAB_ALIAS[k]) || joined(k) || HIDDEN.includes(k), `${k} sin vista`);
  assert.deepEqual(HIDDEN, ['historico']);
  assert.ok(!all.has('historico') && !all.has('hoy'));
  assert.equal(TAB_ALIAS.hoy, 'backlog');
  for (const k of ['modulos', 'calidad']) assert.ok(FACES.filter((f) => f.tabs.includes(k)).length >= 2, k);
  assert.deepEqual(FACES.filter((f) => f.tabs.includes('turnos')).map((f) => f.id), ['servicio', 'equipo']);
  assert.deepEqual(FACES.filter((f) => f.tabs.includes('ia')).map((f) => f.id), ['servicio', 'tecnicas']);
});

test('cada vista empieza por su primera pestaña; sin Equipo soporte, Equipo empieza por Calidad', () => {
  assert.deepEqual(FACES.map((f) => firstTab(f.id, TEAM)), ['resumen', 'equipo', 'resumen']);
  assert.equal(firstTab('equipo'), 'calidad');
  assert.equal(firstTab('nada', TEAM), null);
  assert.ok(!faceTabs('servicio').some(([k]) => k === 'equipo'));   // sin Equipo soporte, Servicio sin su pestaña
});

test('un enlace a una pestaña: en la misma vista si la tiene; si no, en la primera que la tenga', () => {
  assert.equal(faceFor('modulos', 'servicio'), 'servicio');     // está en varias: se queda
  assert.equal(faceFor('cliente', 'servicio'), 'tecnicas');      // solo en Técnicas
  assert.equal(faceFor('ia', 'equipo'), 'servicio');
  assert.equal(faceFor('desconocida', 'equipo'), 'equipo');
});

test('a dónde lleva un enlace: Foto de hoy, a Backlog; las que van juntas, a la de las dos; si no, a su vista', () => {
  assert.deepEqual(routeTo('hoy', 'servicio'), ['servicio', 'backlog']);
  assert.deepEqual(routeTo('escalados', 'servicio'), ['servicio', 'escalados']);
  assert.deepEqual(routeTo('resolucion', 'servicio'), ['servicio', 'resolucion']);
  assert.deepEqual(routeTo('escalados', 'tecnicas'), ['tecnicas', 'escalados']);   // en Técnicas, sola
  assert.deepEqual(routeTo('resolucion', 'tecnicas'), ['servicio', 'resolucion']);   // solo en Servicio
  assert.deepEqual(routeTo('cliente', 'servicio'), ['tecnicas', 'cliente']);
  assert.deepEqual(routeTo('sla', 'servicio'), ['servicio', 'slaq']);
  assert.deepEqual(routeTo('calidad', 'servicio'), ['servicio', 'slaq']);
  assert.deepEqual(routeTo('ia', 'servicio'), ['servicio', 'ia']);                 // Uso de la IA, aparte
  assert.deepEqual(routeTo('calidad', 'equipo'), ['equipo', 'calidad']);
  assert.deepEqual(routeTo('turnos', 'equipo'), ['equipo', 'turnos']);
});
