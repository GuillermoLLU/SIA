// La sábana de incidencias (sin DOM): una fila por incidencia y de la más antigua a la más reciente, con sus columnas,
// para verla y para exportarla a CSV. En el Resumen, lo abierto ahora que pasa los filtros y los lados de arriba
// (sheetOf); en Equipo soporte, lo que hay en su panel. m: el modelo (model.js).
import { esc } from '../ui/html.js';
import { nice, title, num, dur, dmy } from './format.js';

export const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
export const incId = (id) => `INC${String(id).padStart(12, '0')}`;
export const remedyUrl = (id) => `${REMEDY}${incId(id)}%22`;

const TOP = 50;   // las primeras filas; el resto, con «Ver todos»
const two = (n) => String(n).padStart(2, '0');
// minutos desde BASE → «dd/mm/aaaa hh:mm», con la hora tal cual viene en el dato
const when = (m, min) => { const d = new Date(m.BASE + min * 6e4); return `${dmy(d.getTime())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };

// Las columnas: [nombre, valor de la issue i como texto, 'num' si va como cifra]
export const SHEET_COLS = [
  ['Incidencia', (m, i) => incId(m.C.id[i])],
  ['Abierta', (m, i) => when(m, m.C.rep[i])],
  ['Título', (m, i) => m.C.su[i]],
  ['Prioridad', (m, i) => nice(m.DI.prio[m.C.pr[i]])],
  ['Estado', (m, i) => `${nice(m.DI.status[m.C.st[i]])}${m.C.rs[i] ? ` · ${title(m.DI.reason[m.C.rs[i]])}` : ''}`],
  ['Responsable', (m, i) => m.DIMS.as.label(m.C.as[i])],
  ['Centro', (m, i) => m.DIMS.ce.label(m.C.ce[i])],
  ['Módulo', (m, i) => m.DIMS.mo.label(m.C.mo[i])],
  ['SISU o SGA', (m, i) => m.DIMS.ss.label(m.DIMS.ss.get(i))],
  ['Antigüedad', (m, i) => dur(m.SNAP - m.C.rep[i]), 'num'],
  // el campo de Remedy tal cual (puede llevar varias claves y su prefijo: «TEC: ITSMECOM-5356582 / ITSMECOM-5321940»)
  ['Vendor Ticket Number', (m, i) => m.DI.vtext?.[m.C.vn?.[i]] ?? ''],
];

// Las incidencias de la sábana: abiertas ahora, con los filtros y los lados de arriba, de la más antigua a la más reciente.
export const sheetOf = (m) => m.today().filter((i) => m.OPEN[i]).sort((a, b) => m.C.rep[a] - m.C.rep[b]);

// La tabla y su barra: cuántas son y el botón que las exporta enteras (data-export, en la vista). list: las incidencias;
// id: el de su «Ver todos» (ui.exp[id], expanded); more: el botón (charts.js); empty: el texto sin ninguna; cols: sus columnas.
export const sheetBody = (m, list, { id, expanded, more, empty, cols = SHEET_COLS }) => {
  const shown = expanded ? list : list.slice(0, TOP);
  const cellOf = ([label, f, kind], i) => {
    const v = f(m, i);
    if (label === 'Incidencia') return `<td><a href="${remedyUrl(m.C.id[i])}" target="_blank" rel="noopener">${esc(v)}</a></td>`;
    if (label === 'Título') return `<td class="mt-subj" data-tip="${esc(v)}">${esc(v)}</td>`;
    return `<td${kind === 'num' ? ' class="mt-num"' : ''}>${esc(v)}</td>`;
  };
  const table = list.length ? `<div class="mt-tablewrap ${expanded ? 'mt-scroll' : ''}"><table class="mt-list"><thead><tr>${cols.map(([l, , kind]) => `<th${kind === 'num' ? ' class="mt-num"' : ''}>${l}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((i) => `<tr>${cols.map((c) => cellOf(c, i)).join('')}</tr>`).join('')}</tbody></table></div>${more(id, list.length, TOP)}`
    : `<p class="mt-mut mt-small">${empty}</p>`;
  return `<div class="mt-sheet-bar"><span class="mt-mut">${num(list.length)} incidencias</span><button class="mt-btn" data-export ${list.length ? '' : 'disabled'}>Exportar a CSV</button></div>${table}`;
};

// En CSV para Excel en español: separado por «;», cada campo entre comillas, UTF-8 con BOM (para las tildes) y, al
// final, el enlace a Remedy de cada una.
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const sheetCsv = (m, list, cols = SHEET_COLS) => '﻿' + [[...cols.map(([l]) => l), 'Enlace a Remedy'],
  ...list.map((i) => [...cols.map(([, f]) => f(m, i)), remedyUrl(m.C.id[i])])].map((r) => r.map(cell).join(';')).join('\r\n');

// El nombre del fichero: «incidencias-abiertas-aaaa-mm-dd.csv», con el día de la última carga.
export const sheetFile = (m, name = 'incidencias-abiertas') => { const d = new Date(m.BASE + m.SNAP * 6e4); return `${name}-${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}.csv`; };
