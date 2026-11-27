// Lo que decide la vista Métricas sin tocar el DOM: los colores de los lados, qué empresa va a un lado nuevo, qué
// pasa al quitar un lado o marcar a una persona, los meses del calendario y las claves de los filtros.
import { MONTHS, dmy } from './format.js';

// colores para elegir en cada lado (no el rojo ni el verde: son peor y mejor); de partida, azul y ocre
export const COLORS = [['#2f6fb5', 'azul'], ['#c98a3a', 'ocre'], ['#7c4dcc', 'morado'], ['#14919b', 'turquesa'], ['#d6457f', 'rosa'],
  ['#e07b24', 'naranja'], ['#6d7a1f', 'oliva'], ['#5b6472', 'gris']];
export const defaultColors = () => [COLORS[0][0], COLORS[1][0]];
// el primer color que no sea el que ya se usa
export const freeColor = (taken) => COLORS.find(([c]) => c !== taken)[0];

// «Datos desde 03/01/2026 hasta 13/10/2026»: el periodo elegido, recortado a la primera y la última apertura de lo cargado
export const coverage = (m) => {
  const { S, BASE, data: { meta } } = m, from = Math.max(S.d0, meta.first), to = Math.min(S.d1 - 1, meta.last);
  return from <= to ? `Datos desde ${dmy(BASE + from * 6e4)} hasta ${dmy(BASE + to * 6e4)}` : `Sin incidencias del ${dmy(BASE + S.d0 * 6e4)} al ${dmy(BASE + (S.d1 - 1) * 6e4)}`;
};
// «14 de oct», en UTC como el resto de las fechas de las Métricas
export const dayOf = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };

// la empresa que se pone por defecto a un lado: la primera que no tenga ya el otro
export const freeCompany = (other) => ({ company: [0, 1, 2].find((c) => other?.people || other?.company !== c) });

// quitar un lado: queda el otro, que pasa a ser A con su color
export const withoutSide = (sides, colors, k) => (k === 0 ? { sides: [sides[1], null], colors: [colors[1], colors[0]] } : { sides: [sides[0], null], colors });

// marcar o desmarcar a una persona en un lado; sin ninguna marcada, el lado vuelve a ser una empresa libre
export const togglePerson = (sides, k, p) => {
  const set = new Set(sides[k]?.people || []);
  if (set.has(p)) set.delete(p); else set.add(p);
  return set.size ? { people: set } : freeCompany(sides[1 - k]);
};

// Equipo soporte (work-view.js) y el selector de Indra y técnicos de la barra de arriba: a quién mira su tabla (los técnicos
// marcados, como mucho dos: se comparan) según los lados, y los lados según los marcados en la tabla (ninguno: Indra)
export const teamPeopleOf = (sides) => [...(sides[0]?.people || []), ...(sides[1]?.people || [])].slice(0, 2);
export const sidesOfPeople = (cmp) => (!cmp.length ? [{ company: 0 }, null] : [{ people: new Set([cmp[0]]) }, cmp[1] != null ? { people: new Set([cmp[1]]) } : null]);

// el periodo entre dos meses marcados, en cualquier orden

// «dim:clave» → [dim, clave]
export const filterKey = (s) => { const p = s.indexOf(':'); return [s.slice(0, p), Number(s.slice(p + 1))]; };

// Un selector de un filtro (data-only, «dim:clave»; sin clave, todos): clic, solo ese (y otro clic en el ya marcado lo
// quita); con Ctrl (o Cmd), sumarlo o, si ya estaba, quitarlo (sin ninguno, todos). f: los filtros (S.f).
export const pickOnly = (f, dim, k, multi = false) => {
  if (k == null) { delete f[dim]; return; }
  if (!multi && !f[dim]?.has(k)) { f[dim] = new Set([k]); return; }
  const s = f[dim] || (f[dim] = new Set());
  if (s.has(k)) s.delete(k); else s.add(k);
  if (!s.size) delete f[dim];
};
// Algo que filtra por varias cosas a la vez (data-f2, [[dim, clave]…]: una celda, un estado de la corona que junta dos
// situaciones…), como un selector: clic, centrarse en eso (cambia lo de esas dimensiones); otro clic, si ya lo estaba,
// soltarlo; con Ctrl (o Cmd), sumarlo o, si ya estaba, quitarlo.
export const pickBoth = (f, keys, multi = false) => {
  const has = ([dim, k]) => !!f[dim]?.has(k);
  const off = () => { for (const [dim, k] of keys) { f[dim]?.delete(k); if (f[dim] && !f[dim].size) delete f[dim]; } };
  if (keys.every(has) && (multi || keys.every(([dim]) => f[dim].size === keys.filter(([d]) => d === dim).length))) return off();
  if (multi) { for (const [dim, k] of keys) (f[dim] || (f[dim] = new Set())).add(k); return; }
  for (const dim of new Set(keys.map(([d]) => d))) f[dim] = new Set(keys.filter(([d]) => d === dim).map(([, k]) => k));
};
// El selector SISU / SGA de la corona (hoy.js, sysBar): clic, solo ese (el filtro de toda la página, S.f.ss); clic en el
// otro, cambiar a él; otra vez en el único elegido, los dos (sin filtro). Ctrl+clic: compararlos (ui.ssCmp, una corona por
// sistema, con los dos dentro), o dejar de compararlos.
export const pickSys = (S, ui, k, ctrl) => {
  const was = !ui.ssCmp && S.f.ss?.size === 1 && S.f.ss.has(k);
  delete S.f.ss;
  if (ctrl) { ui.ssCmp = !ui.ssCmp; return; }
  ui.ssCmp = false;
  if (!was) S.f.ss = new Set([k]);
};
// si una opción de un selector está marcada (k null: «todos», sin filtro)
export const isPicked = (f, dim, k) => (k == null ? !f[dim]?.size : !!f[dim]?.has(k));

// «Quitar filtros» (metrics-view.js): si hay alguno puesto y quitarlos todos. Son los de la barra (S.f, los chips), la
// búsqueda y los de cada pestaña: los proyectos Jira y «Sin Jira» de Escalados, y el de la sábana de Pendiente de
// cliente. No son filtros, y se quedan: el periodo, lo que se compara, Actual o Histórico y cómo se ordena.
export const anyFilter = (S, ui) => Object.values(S.f).some((s) => s.size) || !!S.q.trim() || !!ui.cliFilter || !!ui.jiraPick?.length || !!ui.escNoJira;
export const clearFilters = (S, ui) => { S.f = {}; S.q = ''; ui.cliFilter = null; ui.jiraPick = []; ui.escNoJira = false; };
