// La foto de las issues del equipo, fila a fila del CSV de la consulta de
// Remedy: qué filas cuentan y cuál es la hora de la foto. Dominio puro
// (sin E/S); source.js la guarda y la lee.
//
// Cuentan las abiertas del grupo y las resueltas o cerradas en la semana
// anterior a la foto (lo que se ve en la mesa: «resueltas hoy»). La hora de
// la foto es la del dato más reciente del fichero, no la de ahora.
import { toIssue } from './issue.js';

const GROUP = 'AYS SOPORTE';
const OPEN = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING']);
const DONE = new Set(['RESOLVED', 'CLOSED']);
const KEEP_DONE_DAYS = 7;
export const REQUIRED = ['INCIDENTNUMBER', 'SUMMARY', 'TAGS', 'PRIORITY', 'STATUS', 'STATUSREASON', 'ASSIGNEE', 'ASSIGNEDGROUP',
  'REPORTEDDATE', 'LASTMODIFIEDDATE', 'LASTRESOLUTIONDATE', 'NOTES', 'CATEGORIZATIONTIER1', 'CATEGORIZATIONTIER2', 'CATEGORIZATIONTIER3',
  'RESOLUTION', 'VENDORTICKETNUMBER', 'CHILDREQUEST', 'LINKREMEDY', 'AUDIT_DETAIL', 'WORKLOG_DETAIL'];

// El CSV no es el de la consulta (status 400 para la ruta).
class CsvError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const isoOf = (minute) => new Date(minute.replace(' ', 'T')).toISOString();
const dayBefore = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// add(fila) con cada fila del CSV; build() → { taken, issues }. Las resueltas
// solo se retienen si son del último mes contra `now` (el fichero se carga
// recién exportado), para no guardar en memoria las de todo el año.
export const createSnapshot = ({ group = GROUP, now = () => new Date() } = {}) => {
  const issues = [];
  const recent = dayBefore(now(), 30);
  let latest = '', checked = false;

  const add = (r) => {
    if (!checked) {
      const missing = REQUIRED.filter((c) => !(c in r));
      if (missing.length) throw new CsvError(`Ese CSV no es el de la consulta de incidencias: le falta ${missing.join(', ')}.`);
      checked = true;
    }
    if (r.ASSIGNEDGROUP.trim() !== group) return;
    const i = toIssue(r);
    latest = [latest, i.reported, i.modified, i.resolved].reduce((a, b) => (b > a ? b : a));
    if (OPEN.has(i.status) || (DONE.has(i.status) && i.resolved >= recent)) issues.push(i);
  };

  const build = () => {
    if (!latest) throw new CsvError(`Ese CSV no tiene incidencias del grupo ${group}.`);
    const since = dayBefore(latest.replace(' ', 'T'), KEEP_DONE_DAYS);
    return { taken: isoOf(latest), issues: issues.filter((i) => OPEN.has(i.status) || i.resolved >= since) };
  };

  return { add, build };
};
