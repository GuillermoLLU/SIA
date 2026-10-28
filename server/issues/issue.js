// De una fila de la consulta de Remedy (la que usa hoy el equipo) a una issue
// de SIA. Solo lo que el equipo ha explicado:
// - el número del summary es el código del centro afectado; tras él va la
//   criticidad escrita a mano, que no hace falta repetir;
// - en TAGS, SISUINC = abierta desde SISU; PRIO = priorizada por negocio.

const SUMMARY = /^(\d{6})\s+(?:(?:cr[ií]tic[ao]|critical|alta|high|m[eé]dia|medium|baja|baixa|low)\b\s*)?/i;

const minute = (s) => String(s || '').slice(0, 16);

// AUDIT_DETAIL: «fecha - quién - Campo: antes → después | …». Nos quedamos
// con los cambios de estado: [fecha, antes, después].
export const statusChanges = (audit) => String(audit || '').split(' | ')
  .map((e) => e.match(/^(\S+ \S+) - .*? - Status: (.*?) → (.*)$/))
  .filter(Boolean)
  .map(([, at, from, to]) => [minute(at), from.trim(), to.trim()]);

// WORKLOG_DETAIL: las notas, «fecha - quién - texto» separadas por « | »
// delante de una fecha. Las 120 últimas y recortadas: la foto se guarda
// entera en este ordenador y hay notas automáticas enormes (en octubre de
// 2026, la abierta con más notas tenía 65).
const ENTRY = / \| (?=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} - )/;
const MAX_NOTES = 120, MAX_TEXT = 1000;
export const worklog = (text) => String(text || '').split(ENTRY).flatMap((e) => {
  const a = e.indexOf(' - '), b = a < 0 ? -1 : e.indexOf(' - ', a + 3);
  return b < 0 ? [] : [{ at: minute(e.slice(0, a)), who: e.slice(a + 3, b).trim(), text: e.slice(b + 3).trim().slice(0, MAX_TEXT) }];
}).sort((x, y) => x.at.localeCompare(y.at)).slice(-MAX_NOTES);

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
    worklog: worklog(r.WORKLOG_DETAIL), // columna opcional: las consultas antiguas no la traen
  };
};
