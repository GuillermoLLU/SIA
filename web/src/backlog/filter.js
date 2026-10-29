// El filtro del backlog (sin DOM): se filtra pulsando las tarjetas del panel,
// por origen (SISU / SGA), por criticidad y por priorizada por negocio. Se
// pueden marcar varias: dentro de un grupo se suman (críticas y altas) y
// entre grupos se cruzan (críticas y altas, solo de SISU, solo priorizadas).
// Y por texto: código de la issue, centro o resumen. La posición de cada
// issue es la de la cola completa: filtrar no la cambia.
import { fold } from '../ui/html.js';

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const EMPTY_FILTER = { origin: [], severity: [], prio: false, q: '' };

const matches = (i, { origin, severity, prio, q }) =>
  (!origin.length || origin.includes(i.sisu ? 'sisu' : 'sga'))
  && (!severity.length || severity.includes(i.priority))
  && (!prio || !!i.prio)
  && (!q.trim() || fold(`${i.id} ${i.center} ${i.text}`).includes(fold(q.trim())));

export const isFiltering = ({ origin, severity, prio, q }) => origin.length > 0 || severity.length > 0 || prio || q.trim() !== '';

// → [{ ...issue, rank }] con las que pasan el filtro
export const filterIssues = (issues, filter = EMPTY_FILTER) =>
  issues.map((i, n) => ({ ...i, rank: n + 1 })).filter((i) => matches(i, filter));

// Pulsar una tarjeta: se marca; pulsarla otra vez, se quita.
export const toggle = (filter, key, value) => {
  if (key === 'prio') return { ...filter, prio: !filter.prio };
  const on = filter[key].includes(value);
  return { ...filter, [key]: on ? filter[key].filter((v) => v !== value) : [...filter[key], value] };
};

// Lo que diría cada tarjeta: cuántas issues son lo suyo, contando con lo
// marcado en los otros grupos (SISU marcado → las críticas solo de SISU).
export const tileCounts = (issues, filter) => {
  const n = (f) => filterIssues(issues, f).length;
  return {
    total: issues.length,
    sisu: n({ ...filter, origin: ['sisu'] }),
    sga: n({ ...filter, origin: ['sga'] }),
    prio: n({ ...filter, prio: true }),
    severity: Object.fromEntries(SEVERITIES.map((s) => [s, n({ ...filter, severity: [s] })])),
  };
};
