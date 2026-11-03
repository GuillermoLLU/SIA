// La sábana de incidencias (sin DOM): lo abierto ahora que pasa los filtros y los lados de arriba (como el resto del
// Resumen), una fila por incidencia y de la más antigua a la más reciente, con sus columnas, para verla y para
// exportarla a CSV. m: el modelo (model.js).
import { nice, title, dur, dmy } from './format.js';

export const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
export const incId = (id) => `INC${String(id).padStart(12, '0')}`;
export const remedyUrl = (id) => `${REMEDY}${incId(id)}%22`;

const two = (n) => String(n).padStart(2, '0');
// minutos desde BASE → «dd/mm/aaaa hh:mm», con la hora tal cual viene en el dato
const when = (m, min) => { const d = new Date(m.BASE + min * 6e4); return `${dmy(d.getTime())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };

// Las columnas: [nombre, valor de la issue i como texto]
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
  ['Antigüedad', (m, i) => dur(m.SNAP - m.C.rep[i])],
  // el campo de Remedy tal cual (puede llevar varias claves y su prefijo: «TEC: ITSMECOM-5356582 / ITSMECOM-5321940»)
  ['Vendor Ticket Number', (m, i) => m.DI.vtext?.[m.C.vn?.[i]] ?? ''],
];

// Las incidencias de la sábana: abiertas ahora, con los filtros y los lados de arriba, de la más antigua a la más reciente.
export const sheetOf = (m) => m.today().filter((i) => m.OPEN[i]).sort((a, b) => m.C.rep[a] - m.C.rep[b]);

// En CSV para Excel en español: separado por «;», cada campo entre comillas, UTF-8 con BOM (para las tildes) y, al
// final, el enlace a Remedy de cada una.
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const sheetCsv = (m, list) => '﻿' + [[...SHEET_COLS.map(([l]) => l), 'Enlace a Remedy'],
  ...list.map((i) => [...SHEET_COLS.map(([, f]) => f(m, i)), remedyUrl(m.C.id[i])])].map((r) => r.map(cell).join(';')).join('\r\n');

// El nombre del fichero: «incidencias-abiertas-aaaa-mm-dd.csv», con el día de la última carga.
export const sheetFile = (m) => { const d = new Date(m.BASE + m.SNAP * 6e4); return `incidencias-abiertas-${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}.csv`; };
