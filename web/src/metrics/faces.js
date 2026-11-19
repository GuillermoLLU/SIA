// Las tres vistas de Métricas (sin DOM): al entrar, un menú con una caja por vista (metrics-view.js); cada una abre
// sus pestañas, empezando por la primera.
//   Servicio: el estado del servicio de un vistazo, comparable con T-Systems (SLAs, tiempos, evolución…).
//   Equipo: qué hace cada técnico (Equipo soporte, con su propio periodo, y los turnos).
//   Técnicas: el detalle para entender el porqué (escalados, módulos y focos, pendiente de cliente…).
// tsys: si la vista deja mirar o comparar con T-Systems; sin él, solo Indra (y sus personas, frente a frente).
// Una pestaña puede ir en más de una vista: Servicio lleva todas las que tenía antes Métricas del servicio, y Técnicas y
// Equipo repiten algunas (Resumen, Histórico, Entrantes, Calidad, Módulos y focos).
import { svg } from '../ui/html.js';
import { TABS } from './tabs.js';

const ICONS = {
  servicio: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  equipo: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2a6.5 6.5 0 0 1 3 5.8"/>'),
  tecnicas: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
};

// La pestaña de Equipo soporte no está en TABS: la monta main.js aparte (team.id), con su propio periodo.
export const TEAM_TAB = 'equipo';

// labels: el nombre de una pestaña en esa vista, si no es el de siempre.
export const FACES = [
  { id: 'servicio', label: 'Servicio', tsys: true, note: 'El estado del servicio y frente a T-Systems',
    tabs: ['resumen', 'backlog', 'entrada', 'modulos', 'resolucion', 'escalados', 'slaq', 'ia', 'turnos'] },   // Equipo soporte, solo en Equipo
  { id: 'equipo', label: 'Equipo', tsys: false, note: 'Qué hace cada técnico',
    tabs: [TEAM_TAB, 'calidad', 'modulos', 'turnos'] },
  { id: 'tecnicas', label: 'Técnicas', tsys: false, note: 'Por qué pasa: escalados, módulos, esperas',
    tabs: ['resumen', 'backlog', 'entrada', 'escalados', 'modulos', 'cliente', 'tiempos', 'calidad', 'ia'] },
].map((f) => ({ ...f, icon: ICONS[f.id] }));

export const faceOf = (id) => FACES.find((f) => f.id === id) || null;

// Pestañas que ya no van solas: Foto de hoy, partida entre el Resumen (la corona) y Backlog (lo demás). Un enlace a
// ella, a Backlog. El Histórico ya no está en ninguna vista.
export const TAB_ALIAS = { hoy: 'backlog' };
export const HIDDEN = ['historico'];
// Pestañas que van juntas en una (tabs.js): en una vista que tiene la de las dos, un enlace a una de ellas lleva a esa.
export const JOINED = { slaq: ['sla', 'calidad'] };

// Las pestañas de una vista, [clave, nombre], en su orden. team: { id, label } de Equipo soporte (sin él, no sale).
export const faceTabs = (id, team = null) => {
  const names = new Map([...TABS, ...(team ? [[team.id, team.label]] : [])]);
  const f = faceOf(id);
  return (f?.tabs || []).filter((k) => names.has(k)).map((k) => [k, f.labels?.[k] || names.get(k)]);
};
export const firstTab = (id, team = null) => faceTabs(id, team)[0]?.[0] || null;

// Un enlace a una pestaña (data-go): si está en la vista en la que se está, se queda en ella; si no, la primera
// vista que la tiene.
export const faceFor = (tab, current) => (faceOf(current)?.tabs.includes(tab) ? current : FACES.find((f) => f.tabs.includes(tab))?.id || current);
// A dónde lleva un enlace a una pestaña desde una vista: [vista, pestaña]. Foto de hoy, al Resumen (TAB_ALIAS); en la
// misma vista, a la pestaña o a la que la junta con otra (JOINED); si no, a la primera vista que la tiene.
export const routeTo = (tab, current) => {
  const k = TAB_ALIAS[tab] || tab, here = faceOf(current)?.tabs || [];
  if (here.includes(k)) return [current, k];
  const joined = Object.keys(JOINED).find((j) => JOINED[j].includes(k) && here.includes(j));
  if (joined) return [current, joined];
  const other = FACES.find((f) => f.tabs.includes(k));
  if (other) return [other.id, k];
  // solo junta con otras, en otra vista (Resolución, en Servicio)
  const far = FACES.map((f) => [f.id, Object.keys(JOINED).find((j) => JOINED[j].includes(k) && f.tabs.includes(j))]).find(([, j]) => j);
  return far || [current, k];
};
