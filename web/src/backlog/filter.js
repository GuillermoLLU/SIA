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

// Lo que hay en la cola, de un vistazo.
export const summary = (issues) => ({
  total: issues.length,
  sisu: issues.filter((i) => i.sisu).length,
  sga: issues.filter((i) => !i.sisu).length,
  urgent: issues.filter((i) => i.priority === 'CRITICAL' || i.priority === 'HIGH').length,
  prio: issues.filter((i) => i.prio).length,
});
