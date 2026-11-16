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

// el periodo entre dos meses marcados, en cualquier orden

// «dim:clave» → [dim, clave]
export const filterKey = (s) => { const p = s.indexOf(':'); return [s.slice(0, p), Number(s.slice(p + 1))]; };

// Un selector de un filtro (data-only, «dim:clave»; sin clave, todos): clic, solo ese; con Ctrl (o Cmd), sumarlo o, si
// ya estaba, quitarlo (sin ninguno, todos). f: los filtros (S.f).
export const pickOnly = (f, dim, k, multi = false) => {
  if (k == null) { delete f[dim]; return; }
  if (!multi) { f[dim] = new Set([k]); return; }
  const s = f[dim] || (f[dim] = new Set());
  if (s.has(k)) s.delete(k); else s.add(k);
  if (!s.size) delete f[dim];
};
// Una celda que filtra por dos cosas a la vez (data-f2, [[dim, clave]…]): las suma; con Ctrl (o Cmd), si ya estaban
// todas, las quita.
export const pickBoth = (f, keys, multi = false) => {
  const has = ([dim, k]) => !!f[dim]?.has(k);
  if (multi && keys.every(has)) { for (const [dim, k] of keys) { f[dim].delete(k); if (!f[dim].size) delete f[dim]; } return; }
  for (const [dim, k] of keys) (f[dim] || (f[dim] = new Set())).add(k);
};
// si una opción de un selector está marcada (k null: «todos», sin filtro)
export const isPicked = (f, dim, k) => (k == null ? !f[dim]?.size : !!f[dim]?.has(k));

// «Quitar filtros» (metrics-view.js): si hay alguno puesto y quitarlos todos. Son los de la barra (S.f, los chips), la
// búsqueda y los de cada pestaña: los proyectos Jira y «Sin Jira» de Escalados, y el de la sábana de Pendiente de
// cliente. No son filtros, y se quedan: el periodo, lo que se compara, Actual o Histórico y cómo se ordena.
export const anyFilter = (S, ui) => Object.values(S.f).some((s) => s.size) || !!S.q.trim() || !!ui.cliFilter || !!ui.jiraPick?.length || !!ui.escNoJira;
export const clearFilters = (S, ui) => { S.f = {}; S.q = ''; ui.cliFilter = null; ui.jiraPick = []; ui.escNoJira = false; };
