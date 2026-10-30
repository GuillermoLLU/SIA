// Los tiempos de escalado de una issue con sus tickets Jira (definiciones de la tarea #48). Dominio puro.
//
// Todo en minutos desde el 1 de enero del primer año de los datos, como el resto de las Métricas; -1 = no hay.
// ticket: { created, resolved, status } (jira.js; status, el nombre del estado de Jira).
//   THesc  apertura → creación del primer Jira creado después de la apertura. Si todos son anteriores, es un
//          ticket previo (PREVIOUS) y no cuenta en la media.
//   Tesc   creación del Jira más antiguo, también los Discarded → resolución del Jira de solución final.
//   Tcr    resolución del Jira de solución final → resolución en Remedy.
//   Tesc-r resolución del Jira de solución final → ahora; solo las que siguen abiertas en Remedy.
// Jira de solución final: el último resuelto que no está Discarded. Tesc, Tcr y Tesc-r son solo de las escaladas
// (Pendiente con motivo Third Party Vendor Action Reqd: remedy.js, THIRD_PARTY); una escalada ya cerrada sin Jira de
// solución final (sin Jira, o todos Discarded) es una mal escalada y no cuenta en esas tres.
import { toCode } from './text.js';

export const PREVIOUS = -2;
const DISCARDED = new Set(['DISCARDED', 'DESCARTADO', 'DESCARTADA']);
const NONE = { thesc: -1, tesc: -1, tcr: -1, tescr: -1, bad: false };

// i: { reported, resolved, open, escalated } de la issue; now: el minuto de la foto.
export const escalationOf = (i, tickets, now) => {
  const known = tickets.filter((t) => t.created >= 0);
  const out = { ...NONE };
  if (known.length) {
    const after = known.filter((t) => t.created >= i.reported).map((t) => t.created);
    out.thesc = after.length ? Math.min(...after) - i.reported : PREVIOUS;
  }
  if (!i.escalated) return out;
  const final = known.filter((t) => t.resolved >= 0 && !DISCARDED.has(toCode(t.status))).sort((a, b) => b.resolved - a.resolved)[0];
  if (!final) return { ...out, bad: !i.open };
  out.tesc = Math.max(final.resolved - Math.min(...known.map((t) => t.created)), 0);
  if (i.resolved >= 0 && !i.open) out.tcr = Math.max(i.resolved - final.resolved, 0);
  if (i.open) out.tescr = Math.max(now - final.resolved, 0);
  return out;
};
