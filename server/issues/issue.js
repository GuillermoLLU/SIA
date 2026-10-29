// De una fila de la consulta de Remedy (la que usa hoy el equipo) a una issue
// de SIA. Solo lo que el equipo ha explicado:
// - el número del summary es el código del centro afectado; tras él va la
//   criticidad escrita a mano, que no hace falta repetir;
// - en TAGS, SISUINC = abierta desde SISU; PRIO = priorizada por negocio;
// - WORKLOG_DETAIL son las notas de trabajo de Remedy: cada una con fecha,
//   quién y texto (worklog), de la más antigua a la más reciente.
import { entries } from '../shared/remedy-entries.js';

const SUMMARY = /^(\d{6})\s+(?:(?:cr[ií]tic[ao]|critical|alta|high|m[eé]dia|medium|baja|baixa|low)\b\s*)?/i;

const minute = (s) => String(s || '').slice(0, 16);

// AUDIT_DETAIL: «fecha - quién - Campo: antes → después | …». Nos quedamos
// con los cambios de estado: [fecha, antes, después].
export const statusChanges = (audit) => String(audit || '').split(' | ')
  .map((e) => e.match(/^(\S+ \S+) - .*? - Status: (.*?) → (.*)$/))
  .filter(Boolean)
  .map(([, at, from, to]) => [minute(at), from.trim(), to.trim()]);

export const toIssue = (r) => {
  const m = r.SUMMARY.match(SUMMARY);
  const tags = r.TAGS.split(';').map((t) => t.trim().split('=')[0]);
  return {
    id: r.INCIDENTNUMBER,
    center: m ? m[1] : '',
    text: (m ? r.SUMMARY.slice(m[0].length) : r.SUMMARY).trim() || r.SUMMARY,
    priority: r.PRIORITY,
    status: r.STATUS,
    reason: r.STATUSREASON,
    assignee: r.ASSIGNEE,
    group: r.ASSIGNEDGROUP,
    sisu: tags.includes('SISUINC'),
    prio: tags.includes('PRIO'),
    reported: minute(r.REPORTEDDATE),
    modified: minute(r.LASTMODIFIEDDATE),
    resolved: minute(r.LASTRESOLUTIONDATE),
    notes: r.NOTES,
    category: [r.CATEGORIZATIONTIER1, r.CATEGORIZATIONTIER2, r.CATEGORIZATIONTIER3].filter(Boolean).join(' › '),
    resolution: r.RESOLUTION,
    vendorTicket: r.VENDORTICKETNUMBER,
    related: r.CHILDREQUEST,
    link: r.LINKREMEDY,
    changes: statusChanges(r.AUDIT_DETAIL),
    worklog: entries(r.WORKLOG_DETAIL).map(({ at, who, text }) => ({ at: minute(at), who, text })),
  };
};
