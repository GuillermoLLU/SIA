// El periodo que se mira (sin DOM): el texto de su botón y el panel para elegirlo, con dos selectores iguales, «Desde»
// a la izquierda y «Hasta» a la derecha. Cada uno tiene su año (‹ 2026 ›), sus meses y los días del mes que enseña:
// un mes en «Desde» empieza el periodo el día 1 y en «Hasta» lo acaba el último día con datos de ese mes; con doble
// clic, el periodo es ese mes entero; un día fija ese extremo. Lo usan Métricas y Equipo soporte; los eventos, en period-panel.js. m: el modelo (model.js), que guarda
// el periodo como un rango de minutos (S.d0, S.d1; d1 excluido) y lo limita a lo cargado (setPeriod). Los meses van
// numerados desde el enero del primer año de los datos.
import { MONTHS, dmy } from './format.js';
import { DAY } from './rules.js';

const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const SIDES = { from: 'Desde', to: 'Hasta' };

// «01/10/2026 – 13/10/2026»
export const periodLabel = (m) => `${dmy(m.BASE + m.S.d0 * 6e4)} – ${dmy(m.BASE + (m.S.d1 - 1) * 6e4)}`;
// «13 días»
export const daysLabel = (m) => { const n = Math.round((m.S.d1 - m.S.d0) / DAY); return `${n} ${n === 1 ? 'día' : 'días'}`; };
// la cabecera del panel: «01/10/2026 – 13/10/2026 · 13 días»
export const periodSummary = (m) => `${periodLabel(m)} · ${daysLabel(m)}`;

// el fin de un mes, sin pasar de lo cargado (el mes en curso acaba el día de la foto)
const monthEnd = (m, k) => Math.min(m.minuteOf(k + 1), m.END_D);
// el día (sus 00:00) de cada extremo del periodo
export const sideDay = (m, side) => (side === 'from' ? m.S.d0 : m.S.d1 - DAY);

// Un mes elegido en un lado → el periodo nuevo [d0, d1). «Desde»: empieza el día 1 de ese mes; «Hasta»: acaba el último
// día con datos de ese mes. Si el otro extremo queda al revés, se mueve a ese mismo mes (su fin o su principio).
export const pickMonth = (m, side, k) => {
  const { d0, d1 } = m.S;
  if (side === 'from') { const a = m.minuteOf(k); return [a, d1 > a ? d1 : monthEnd(m, k)]; }
  const b = monthEnd(m, k);
  return [d0 < b ? d0 : m.minuteOf(k), b];
};

// Doble clic en un mes, en cualquier lado: ese mes entero, del día 1 al último día con datos.
export const wholeMonth = (m, k) => [m.minuteOf(k), monthEnd(m, k)];

// Un día elegido en un lado (sus 00:00) → el periodo nuevo. Si el otro extremo queda al revés, pasa al fin o al
// principio del mes de ese día.
export const pickDay = (m, side, day) => {
  const { d0, d1 } = m.S, k = m.monthAt(day);
  if (side === 'from') return [day, d1 > day ? d1 : monthEnd(m, k)];
  return [d0 <= day ? d0 : m.minuteOf(k), day + DAY];
};

// Mover el año que enseña un lado (k: el mes que enseña; dir: -1 o +1), sin salir de los meses con datos.
export const shiftYear = (m, k, dir) => Math.min(m.LASTM, Math.max(m.monthAt(m.MIN_D), k + 12 * dir));

// Un lado del panel. k: el mes que enseña (sus días, a la derecha de los meses). Su mes elegido (el de su extremo) va sólido; si enseña
// otro (tras cambiar de año), ese lleva el borde. En los días, el periodo en tinte y sus dos extremos sólidos; el
// día de la foto, subrayado. Lo que no tiene datos no se puede elegir.
export const sideHtml = (m, side, k) => {
  const { S, MIN_D, END_D, LASTM, data: { meta } } = m, first = m.monthAt(MIN_D), y = Math.floor(k / 12);
  const picked = m.monthAt(sideDay(m, side)), edges = [S.d0, S.d1 - DAY];
  const months = MONTHS.map((mm, j) => {
    const mk = y * 12 + j, cls = [mk === picked ? 'mt-edge' : '', mk === k && mk !== picked ? 'mt-shown' : ''].filter(Boolean).join(' ');
    return `<button data-pick-month="${side}:${mk}" class="${cls}" ${mk < first || mk > LASTM ? 'disabled' : ''}>${mm}</button>`;
  }).join('');
  const start = m.minuteOf(k), lead = (new Date(m.BASE + start * 6e4).getUTCDay() + 6) % 7;
  const days = Array.from({ length: Math.round((m.minuteOf(k + 1) - start) / DAY) }, (_, j) => {
    const d = start + j * DAY;
    const cls = [d >= S.d0 && d < S.d1 ? 'mt-in' : '', edges.includes(d) ? 'mt-edge' : '', d === END_D - DAY ? 'mt-today' : ''].filter(Boolean).join(' ');
    return `<button data-pick-day="${side}:${d}" class="${cls}" ${d < MIN_D || d >= END_D ? 'disabled' : ''}>${j + 1}</button>`;
  }).join('');
  return `<div class="mt-side">
      <p class="mt-pp-title">${SIDES[side]}</p>
      <b class="mt-side-date">${dmy(m.BASE + sideDay(m, side) * 6e4)}</b>
      <div class="mt-side-body">
        <div class="mt-mcol">
          <div class="mt-ynav">
            <button data-year="${side}:-1" aria-label="Año anterior" ${y * 12 <= first ? 'disabled' : ''}>‹</button>
            <b>${meta.start + y}</b>
            <button data-year="${side}:1" aria-label="Año siguiente" ${(y + 1) * 12 > LASTM ? 'disabled' : ''}>›</button>
          </div>
          <div class="mt-months">${months}</div>
        </div>
        <div class="mt-days">${WEEK.map((w) => `<span>${w}</span>`).join('')}${'<span></span>'.repeat(lead)}${days}</div>
      </div>
    </div>`;
};

// El panel: cabecera con el periodo y los dos lados (cada elección se aplica al momento). shown: el mes que enseña
// cada lado ({ from, to }).
export const periodPanel = (m, shown) => `<div class="mt-cal-head">
    <span class="mt-pp-title">Periodo</span><b>${periodSummary(m)}</b>
  </div>
  <div class="mt-pp">${sideHtml(m, 'from', shown.from)}${sideHtml(m, 'to', shown.to)}</div>`;
