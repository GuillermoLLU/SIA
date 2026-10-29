// Filtros del backlog (sin DOM): texto (código de la issue, centro o
// resumen), origen (SISU / SGA) y criticidad. La posición de cada issue es la
// de la cola completa: filtrar no la cambia (la 7ª sigue siendo la 7ª).
import { fold } from '../ui/html.js';

export const EMPTY_FILTER = { q: '', origin: 'all', severity: 'all' };

const matches = (i, { q, origin, severity }) =>
  (origin === 'all' || (origin === 'sisu') === !!i.sisu)
  && (severity === 'all' || i.priority === severity)
  && (!q || fold(`${i.id} ${i.center} ${i.text}`).includes(fold(q.trim())));

// → [{ ...issue, rank }] con las que pasan el filtro
export const filterIssues = (issues, filter = EMPTY_FILTER) =>
  issues.map((i, n) => ({ ...i, rank: n + 1 })).filter((i) => matches(i, filter));

// Lo que hay en la cola, de un vistazo: el total y cuántas urgen (críticas o
// altas) o van priorizadas por negocio, en total y por origen; el reparto por
// criticidad; y la más antigua.
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const isUrgent = (i) => i.priority === 'CRITICAL' || i.priority === 'HIGH';
const count = (list) => ({ total: list.length, urgent: list.filter(isUrgent).length, prio: list.filter((i) => i.prio).length });

export const summary = (issues) => ({
  ...count(issues),
  sisu: count(issues.filter((i) => i.sisu)),
  sga: count(issues.filter((i) => !i.sisu)),
  bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, issues.filter((i) => i.priority === s).length])),
  oldest: issues.reduce((o, i) => (!o || i.reported < o.reported ? i : o), null),
});
