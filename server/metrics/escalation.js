// Los tiempos de escalado de una issue con sus tickets Jira (definiciones de la tarea #48). Dominio puro.
//
// Todo en minutos desde el 1 de enero del primer año de los datos, como el resto de las Métricas; -1 = no hay.
// ticket: { created, resolved, status } (jira.js; status, el nombre del estado de Jira).
// Los tickets de la issue son los creados entre su apertura y su resolución (o la foto, si sigue abierta): las notas
// citan también tickets de otras incidencias (antecedentes) y los que ya existían cuando se abrió (ticket previo:
// la issue se ligó a un escalado que ya estaba en marcha, y su tiempo no es el de esta issue).
//   THesc  apertura → creación del primero de sus tickets. Si solo los hay anteriores, es un ticket previo
//          (PREVIOUS) y no cuenta en la media.
//   Tesc   creación del más antiguo de sus tickets, también los Discarded → resolución del Jira de solución final.
//   Tcr    resolución del Jira de solución final → resolución en Remedy. Si Remedy se cerró antes (early), no hay.
//   Tesc-r resolución del Jira de solución final → ahora; solo las que siguen abiertas en Remedy.
// Jira de solución final: el último resuelto de sus tickets que no está Discarded (ni cancelado). Tesc, Tcr y Tesc-r
// son solo de las escaladas (Pendiente con motivo Third Party Vendor Action Reqd: remedy.js, THIRD_PARTY). De las
// escaladas ya cerradas sin solución final: mal escalada (bad) si no tiene ningún ticket suyo que no esté Discarded,
// y cerrada con el Jira abierto (jiraOpen) si lo tiene pero sin resolver; con ticket previo, ninguna de las dos.
import { toCode } from './text.js';

export const PREVIOUS = -2;
// Los que no son la solución: descartados y, aunque la #48 solo dice Discarded, también los cancelados (en Jira hay
// 87 «Cancelado» con fecha de resolución que, si no, contarían como la solución final).
const DISCARDED = new Set(['DISCARDED', 'DESCARTADO', 'DESCARTADA', 'CANCELADO', 'CANCELADA', 'CANCELLED', 'CANCELED']);
const NONE = { thesc: -1, tesc: -1, tcr: -1, tescr: -1, bad: false, jiraOpen: false, early: false };

// i: { reported, resolved, open, escalated } de la issue; now: el minuto de la foto.
export const escalationOf = (i, tickets, now) => {
  const known = tickets.filter((t) => t.created >= 0);
  const closed = !i.open && i.resolved >= 0, end = closed ? i.resolved : now;
  const mine = known.filter((t) => t.created >= i.reported && t.created <= end);
  const previous = known.some((t) => t.created < i.reported);
  const out = { ...NONE, thesc: mine.length ? Math.min(...mine.map((t) => t.created)) - i.reported : previous ? PREVIOUS : -1 };
  if (!i.escalated) return out;
  const valid = mine.filter((t) => !DISCARDED.has(toCode(t.status)));
  if (!valid.length) return { ...out, bad: !i.open && !previous };
  const final = valid.filter((t) => t.resolved >= 0).sort((a, b) => b.resolved - a.resolved)[0];
  if (!final) return { ...out, jiraOpen: !i.open };
  out.tesc = Math.max(final.resolved - Math.min(...mine.map((t) => t.created)), 0);
  if (closed) {
    if (i.resolved >= final.resolved) out.tcr = i.resolved - final.resolved;
    else out.early = true;
  }
  if (i.open) out.tescr = Math.max(now - final.resolved, 0);
  return out;
};
