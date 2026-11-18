// Los escalados del equipo (#136): las issues pendientes de un tercero con un
// Jira, de quien sean, con lo último que se sabe de su Jira. Todos los tickets
// son de todos: si se resuelve el Jira de alguien que no está, otro la cierra.
import { jiraKey } from '../shared/jira.js';
import { sameName, brief } from './desk.js';

const waiting = (issues) => issues.filter((i) => i.status === 'PENDING').map((i) => ({ i, k: jiraKey(i.vendorTicket) })).filter((x) => x.k);

// Los Jira que hay que mirar, sin repetir.
export const pendingKeys = (issues) => [...new Set(waiting(issues).map(({ k }) => k.key))];

// states: Map clave → { state: 'open' | 'resolved' | 'discarded', at } (sin dato, abierto).
// Dueño: quien la cogió en SIA o, si no, el asignado de Remedy. Primero los Jira
// resueltos (hay que cerrar la issue); después, lo que más lleva sin moverse.
// jiraUrl: la base de Jira de la persona (Configuración → Conexiones), para el enlace.
export const teamEscalations = (issues, claims, states, me, jiraUrl = '') => {
  const holder = new Map(claims.map((c) => [c.issue_id, c]));
  const done = (e) => (e.jira.state === 'resolved' ? 0 : 1);
  return waiting(issues).map(({ i, k }) => {
    const c = holder.get(i.id);
    return {
      ...brief(i),
      jira: { key: k.key, state: 'open', ...states.get(k.key), ...(jiraUrl ? { url: `${jiraUrl.replace(/\/+$/, '')}/browse/${k.key}` } : {}) },
      owner: c ? c.user_name : i.assignee || '',
      mine: c ? c.user_id === me.id : sameName(i.assignee, me.name),
    };
  }).sort((a, b) => done(a) - done(b) || a.modified.localeCompare(b.modified));
};
