// El filtro del backlog (sin DOM): se filtra pulsando las tarjetas del panel,
// por origen (SISU / SGA), por criticidad y por priorizada por negocio. La
// posición de cada issue es la de la cola completa: filtrar no la cambia (la
// 7ª sigue siendo la 7ª).

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const EMPTY_FILTER = { origin: 'all', severity: 'all', prio: false };

const matches = (i, { origin, severity, prio }) =>
  (origin === 'all' || (origin === 'sisu') === !!i.sisu)
  && (severity === 'all' || i.priority === severity)
  && (!prio || !!i.prio);

// → [{ ...issue, rank }] con las que pasan el filtro
export const filterIssues = (issues, filter = EMPTY_FILTER) =>
  issues.map((i, n) => ({ ...i, rank: n + 1 })).filter((i) => matches(i, filter));

// Pulsar una tarjeta: la misma la quita; otra del mismo grupo la sustituye.
export const toggle = (filter, key, value) => ({ ...filter, [key]: filter[key] === value ? EMPTY_FILTER[key] : value });

// Lo que diría cada tarjeta: cuántas issues quedarían al pulsarla, contando
// con lo demás que ya está pulsado (SISU pulsado → las críticas solo de SISU).
export const tileCounts = (issues, filter) => {
  const n = (f) => filterIssues(issues, f).length;
  return {
    total: issues.length,
    shown: n(filter),
    sisu: n({ ...filter, origin: 'sisu' }),
    sga: n({ ...filter, origin: 'sga' }),
    prio: n({ ...filter, prio: true }),
    severity: Object.fromEntries(SEVERITIES.map((s) => [s, n({ ...filter, severity: s })])),
  };
};
