// Las columnas de la sábana de Equipo soporte (sin DOM), con el formato de la de Métricas (metrics/sheet.js). m: el modelo.
import { dur, nice } from '../metrics/format.js';
import { IA_MARKS } from '../metrics/ia.js';
import { SHEET_COLS } from '../metrics/sheet.js';

// el título: lo que viene tras el primer «-» del resumen (delante van el centro y su código); sin nada detrás, el resumen
export const shortTitle = (summary) => {
  const at = summary.indexOf('-'), rest = at < 0 ? '' : summary.slice(at + 1).trim();
  return rest || summary;
};

// lo que lleva abierta o, si está resuelta, lo que tardó en resolverse (TTR); cancelada sin resolver, nada
const ageOrTtr = (m, i) => (m.C.res[i] >= 0 ? dur(Math.max(m.C.res[i] - m.C.rep[i], 0)) : m.OPEN[i] ? dur(m.SNAP - m.C.rep[i]) : '—');

const shared = (label) => SHEET_COLS.find(([l]) => l === label);

export const TEAM_SHEET_COLS = [
  shared('Incidencia'),
  ['Título', (m, i) => shortTitle(m.C.su[i])],
  shared('Prioridad'),
  ['Estado', (m, i) => nice(m.DI.status[m.C.st[i]])],
  shared('Centro'),
  shared('Módulo'),
  shared('Vendor Ticket Number'),
  ['Antigüedad o TTR', ageOrTtr, 'num'],
  // pendiente: la nota del agente de calidad (tarea #55) aún no llega a SIA, como el %IQA de la tabla
  ['Nota final de la auditoría', () => '—', 'num'],
  // como «Con IA» en la tabla: alguna marca de IA en TAGS o en las notas
  ['IA', (m, i) => (m.C.fl[i] & IA_MARKS ? 'Sí' : 'No')],
];
