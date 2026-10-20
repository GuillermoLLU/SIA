// Lo que decide la vista Métricas sin tocar el DOM: los colores de los lados, qué empresa va a un lado nuevo, qué
// pasa al quitar un lado o marcar a una persona, los meses del calendario y las claves de los filtros.
import { MONTHS } from './format.js';

// colores para elegir en cada lado (no el rojo ni el verde: son peor y mejor); de partida, azul y ocre
export const COLORS = [['#2f6fb5', 'azul'], ['#c98a3a', 'ocre'], ['#7c4dcc', 'morado'], ['#14919b', 'turquesa'], ['#d6457f', 'rosa'],
  ['#e07b24', 'naranja'], ['#6d7a1f', 'oliva'], ['#5b6472', 'gris']];
export const defaultColors = () => [COLORS[0][0], COLORS[1][0]];
// el primer color que no sea el que ya se usa
export const freeColor = (taken) => COLORS.find(([c]) => c !== taken)[0];

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
export const monthRange = (a, b) => [Math.min(a, b), Math.max(a, b)];

// «dim:clave» → [dim, clave]
export const filterKey = (s) => { const p = s.indexOf(':'); return [s.slice(0, p), Number(s.slice(p + 1))]; };
