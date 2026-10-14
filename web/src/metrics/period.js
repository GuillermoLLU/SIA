// El periodo que se mira (sin DOM): el texto de su botón y el calendario de
// meses. Lo usan Métricas y Equipo soporte; cada vista lleva sus clics.
import { MONTHS } from './format.js';

// «Todo 2026», «sep» o «abr – jul»
export const periodLabel = ({ from, to }, last, year) => (from === 0 && to === last ? `Todo ${year}` : from === to ? MONTHS[from] : `${MONTHS[from]} – ${MONTHS[to]}`);

// Un mes por casilla: primer clic, el primer mes (anchor); segundo, el último. Los meses sin datos aún no se marcan.
export const calendarHtml = ({ from, to }, last, year, anchor) => {
  const on = (k) => (anchor == null ? k >= from && k <= to : k === anchor);
  return `<p>${anchor == null ? 'Marca el primer mes' : 'Ahora, el último (o sal para ver solo este)'}</p>
    <div class="mt-months">${MONTHS.map((mm, k) => `<button data-month="${k}" class="${on(k) ? 'mt-on' : ''}" ${k > last ? 'disabled' : ''}>${mm}</button>`).join('')}</div>
    <button class="mt-more" data-month-all>Todo ${year}</button>`;
};
