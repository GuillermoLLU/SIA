// El vigía de Jira (#136): cada media hora, y al pulsar Refrescar, mira de golpe
// los Jira de las issues pendientes del equipo y se queda con su estado.
// jira.states(keys) → Map clave → { state, at }. Hasta mirar Jira con el token
// de cada persona, es de prueba (jira-mock.js).
import { pendingKeys } from './escalations.js';

const EVERY_MS = 30 * 60000;

export const createJiraWatch = ({ source, jira, now = () => new Date(), log = () => {} }) => {
  let states = new Map(), checkedAt = null, running = null;
  // dos a la vez (el cron y Refrescar) esperan a la misma consulta
  const check = () => (running ??= (async () => {
    try {
      const keys = pendingKeys(source.load().issues);
      states = keys.length ? await jira.states(keys) : new Map();
      checkedAt = now().toISOString();
    } catch (e) {
      log(`[sia] no se pudo mirar Jira: ${e.message}`);
    } finally {
      running = null;
    }
  })());
  const start = () => {
    check();
    setInterval(check, EVERY_MS).unref();
  };
  return { check, start, states: () => states, checkedAt: () => checkedAt };
};
