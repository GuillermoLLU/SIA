// De una fila de Remedy (la consulta de issues, con
// notas e historial) a lo que miden las Métricas de esa issue. Dominio puro.
//
// Los tiempos van en minutos desde el 1 de enero del primer año de los datos, con la
// hora tal cual viene en el dato (sin convertir zona horaria); -1 = no hay.
// readIssue es la entrada; las piezas en que se descompone (fechas, historial,
// notas, ticket, ámbito, operación) van públicas para probarse una a una.
import { readTitle } from './themes.js';
import { entries } from '../shared/remedy-entries.js';
import { fold, norm, key, toCode } from './text.js';
import { OPEN_STATES, DONE_STATES, CANCELLED, PENDING } from './states.js';

// Marcas de una issue (bits de `flags`). La web las nombra con los mismos bits.
export const FLAG = {
  SISU: 1, PRIO: 2, PETREQ: 4, AUTO_NOTICE: 8, REPROCESS: 16, IA_SOLVED: 32, IA_FAIL_TAG: 64, DB2_LOCK: 128,
  MAJOR: 256, REOPENED: 512, CALL: 1024, IA: 2048, HITL_OK: 4096, IA_FAIL: 8192, RECURRENCE: 16384, NO_RESOLUTION: 32768,
  // Métricas del servicio (#58): nota [ANALISIS_IA], [DIAGNOSTICO_IA] o [ANTECEDENTES_IA]; escalada (#48: estuvo en
  // Pendiente con motivo Third Party Vendor Action Reqd); y, de las escaladas cerradas (escalation.js), mal escalada
  // (sin ningún Jira suyo que no esté Discarded), cerrada con el Jira abierto y cerrada en Remedy antes que su Jira
  IA_NOTE: 65536, THIRD_PARTY: 131072, BAD_ESCALATION: 262144, JIRA_OPEN: 524288, CLOSED_BEFORE_JIRA: 1048576,
};

const STAMP = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/;
export const minutesSince = (base, s) => {
  const m = STAMP.exec(s || '');
  return m ? Math.floor((Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - base) / 60000) : -1;
};

// Ámbito, según los filtros de Remedy con los que el equipo reconoce su backlog:
// 2 SISU (etiqueta SISUINC); 1 SGA (resumen con ECOM, «Bloqueo DB2» o RETURNS,
// sin RBS, que no sea petición de usuario); 3 la petición que cumple lo demás
// del filtro de SGA; 0 fuera de los filtros.
export const SCOPE = { OUT: 0, SGA: 1, SISU: 2, REQUEST: 3 };
export const scopeOf = (summary, serviceType, tags) => {
  if (tags.has('SISUINC')) return SCOPE.SISU;
  const s = summary || '';
  if ((s.includes('ECOM') || s.includes('Bloqueo DB2') || s.includes('RETURNS')) && !s.includes('RBS')) {
    return serviceType === 'USER_SERVICE_REQUEST' ? SCOPE.REQUEST : SCOPE.SGA;
  }
  return SCOPE.OUT;
};

// Tipo de operación: agrupación propia por el prefijo de la categoría de producto 2.
const OPERATIONS = [['ECOM ZARA', 'ECOM Zara'], ['ECOM CADENAS', 'ECOM Cadenas'], ['ECOM BRANDS', 'ECOM Cadenas'], ['ECOM', 'ECOM (otros)'],
  ['PAQUETERIA', 'Paquetería'], ['PRENDA COLGADA', 'Prenda colgada'], ['TALLER', 'Taller / REOP'], ['ALMACEN', 'Almacén local / manual'],
  ['SERVICIOS CENTRALES', 'Servicios centrales'], ['SS. CC', 'Servicios centrales'], ['COMUNICACIONES', 'Comunicaciones'], ['PROYECTO', 'Proyectos de implantación']];
export const operationOf = (tier2) => {
  const k = key(tier2);
  const hit = OPERATIONS.find(([prefix]) => k.startsWith(prefix));
  return hit ? hit[1] : k ? 'Otros' : 'Sin clasificar';
};

// Ticket de tercero (campo «Vendor Ticket Number»): prefijo escrito delante
// («TEC: …») y la primera clave Jira que aparezca (SGAEWMSAP-7037).
const VENDOR_TYPES = new Set(['TEC', 'ITD', 'ITS', 'OPE', 'DFT', 'IOP', 'MAE', 'TGW', 'KNAPP', 'JIRA', 'SGE', 'MI']);
const VPREFIX = /^\s*([A-Za-z]{2,6})\s*:/;
const JIRA = /\b([A-Z][A-Z0-9]{2,12})-(\d{1,7})\b/;
export const vendorOf = (text) => {
  const v = (text || '').trim();
  const prefix = VPREFIX.exec(v), jira = JIRA.exec(v);
  let type = prefix ? prefix[1].toUpperCase() : jira ? 'JIRA' : v ? 'OTRO' : '';
  if (type && !VENDOR_TYPES.has(type)) type = 'OTRO';
  return { type, project: jira ? jira[1] : '', key: jira ? `${jira[1]}-${jira[2]}` : '' };
};

// Todos los tickets Jira de una issue: las claves del «Vendor Ticket Number» (puede llevar varias) y las de las
// notas, sin repetir. En las notas sale también lo que solo lo parece (FINISHED-1): Jira lo descarta (jira.js).
const JIRA_ALL = new RegExp(JIRA.source, 'g');
export const jiraKeys = (vendor, worklog) => {
  const keys = new Set();
  for (const text of [vendor, ...entries(worklog).map((e) => e.text)]) for (const m of (text || '').matchAll(JIRA_ALL)) keys.add(m[0]);
  return [...keys];
};


// Recorrido del historial de estados (los estados y motivos, con sus códigos: states.js): tiempo en cada estado,
// primera actuación (primer cambio de estado real), primer paso a En curso (SLA de inicio), devoluciones a la
// cola, pendientes, reapertura, si se escaló a un tercero (#48: Pendiente con motivo Third Party Vendor Action Reqd en
// algún momento, también si el motivo cambia sin cambiar el estado) y quién resuelve.
const [ASSIGNED, IN_PROGRESS, PENDING_ST] = OPEN_STATES, RESOLVED = DONE_STATES[0];
const THIRD_PARTY = PENDING.vendor[0];
export const statusHistory = (audit, { reported, modified, openNow, at }) => {
  const changes = [], reasonAt = new Map();
  let thirdParty = false;
  for (const e of entries(audit)) {
    const arrow = e.text.indexOf(' → ');
    if (arrow < 0) continue;
    if (e.text.startsWith('Status: ')) changes.push({ at: e.at, who: e.who, from: toCode(e.text.slice(8, arrow)), to: toCode(e.text.slice(arrow + 3)) });
    else if (e.text.startsWith('Status_Reason: ')) {
      const r = toCode(e.text.slice(arrow + 3));
      if (r) reasonAt.set(e.at, r);
      if (r === THIRD_PARTY) thirdParty = true;
    }
  }
  changes.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  const time = { queue: 0, work: 0, client: 0, vendor: 0, other: 0 };
  const out = { first: -1, start: -1, bounces: 0, pendings: 0, reopened: false, thirdParty, resolvedBy: [] };
  let cur = null, since = reported, pending = 'other';
  const spend = (minutes) => {
    if (cur === ASSIGNED) time.queue += minutes;
    else if (cur === IN_PROGRESS) time.work += minutes;
    else if (cur === PENDING_ST) time[pending] += minutes;
  };
  for (const c of changes) {
    const t = at(c.at);
    if (out.start < 0 && c.to === IN_PROGRESS) out.start = Math.max(t - reported, 0);
    if (cur === null) { cur = c.to; since = t; continue; }
    if (c.from === c.to) continue;
    spend(Math.max(t - since, 0));
    if (out.first < 0) out.first = Math.max(t - reported, 0);
    if (c.from === IN_PROGRESS && c.to === ASSIGNED) out.bounces++;
    if (DONE_STATES.includes(c.from) && ![...DONE_STATES, CANCELLED].includes(c.to)) out.reopened = true;
    if (c.to === PENDING_ST) {
      out.pendings++;
      const r = reasonAt.get(c.at) || '';
      pending = PENDING.client.includes(r) ? 'client' : PENDING.vendor.includes(r) ? 'vendor' : 'other';
    }
    if (c.to === RESOLVED) out.resolvedBy.push(c.who);
    cur = c.to; since = t;
  }
  if (openNow && OPEN_STATES.includes(cur)) spend(Math.max(modified - since, 0)); // hasta el último movimiento conocido
  return { ...out, time };
};

// Notas de trabajo: marcas entre corchetes al principio ([MAJOR INCIDENT],
// [ACT IA], [HITL_REVIEW_OK]…) y notas del agente de IA.
const NOTE_TAG = /^\s*\[([^\]]{2,25})\]/;
// Las notas que se escriben como [ANALISIS], [DIAGNOSTICO] y [ANTECEDENTES], con _IA cuando se usó la IA (#58).
const IA_NOTE_TAGS = ['ANALISIS_IA', 'DIAGNOSTICO_IA', 'ANTECEDENTES_IA'];
export const noteFlags = (worklog) => {
  let flags = 0;
  for (const e of entries(worklog)) {
    if (e.who === 'logsup.ia') flags |= FLAG.IA;
    const m = NOTE_TAG.exec(e.text.slice(0, 40));
    if (!m) continue;
    const tag = key(m[1]);
    if (tag.startsWith('MAJOR') || tag === 'MI') flags |= FLAG.MAJOR;
    else if (tag.startsWith('CALL')) flags |= FLAG.CALL;
    else if (['ACT IA', 'INFORME IA', 'IA_REPROCESS'].includes(tag)) flags |= FLAG.IA;
    else if (['HITL_REVIEW_OK', 'HITL-REVIEW-OK'].includes(tag)) flags |= FLAG.HITL_OK;
    else if (['HITL_REVIEW_NOT_OK', 'HITL_IA_FAIL', 'IA_FAIL', 'IA_WRONG_DIAG'].includes(tag)) flags |= FLAG.IA_FAIL;
    else if (tag === 'RECURRENCIA') flags |= FLAG.RECURRENCE;
    else if (IA_NOTE_TAGS.includes(tag)) flags |= FLAG.IA_NOTE;
  }
  return flags;
};

const tagFlags = (tags) => (tags.has('SISUINC') ? FLAG.SISU : 0) | (tags.has('PRIO') ? FLAG.PRIO : 0) | (tags.has('PETREQ') ? FLAG.PETREQ : 0)
  | (tags.has('AUTOTEC') ? FLAG.AUTO_NOTICE : 0) | (tags.has('RPROC') || tags.has('REPROC') ? FLAG.REPROCESS : 0)
  | ([...tags].some((t) => t.startsWith('IA_SOLVED')) ? FLAG.IA_SOLVED : 0) | (tags.has('IA_FAIL') || tags.has('HITL_IA_FAIL') ? FLAG.IA_FAIL_TAG : 0)
  | (tags.has('DB2_LOCK') ? FLAG.DB2_LOCK : 0);

// La fila entera → la issue medida. `base`: milisegundos del 1 de enero del primer año de los datos.
export const readIssue = (r, base) => {
  const at = (s) => minutesSince(base, s);
  const reported = at(r.REPORTEDDATE), modified = at(r.LASTMODIFIEDDATE);
  const tags = new Set(r.TAGS.split(/[;,:]/).map((t) => t.trim()).filter(Boolean).map((t) => t.split('=')[0]));
  const openNow = OPEN_STATES.includes(r.STATUS);
  const h = statusHistory(r.AUDIT_DETAIL, { reported, modified, openNow, at });
  const flags = tagFlags(tags) | noteFlags(r.WORKLOG_DETAIL) | (h.reopened ? FLAG.REOPENED : 0) | (r.RESOLUTION.trim() ? 0 : FLAG.NO_RESOLUTION)
    | (h.thirdParty ? FLAG.THIRD_PARTY : 0);
  return {
    id: Number(r.INCIDENTNUMBER.slice(3)),
    reported, resolved: at(r.LASTRESOLUTIONDATE), modified,
    status: r.STATUS, reason: r.STATUSREASON, priority: r.PRIORITY, service: r.SERVICETYPE,
    assignee: r.ASSIGNEE.trim(),
    centre: r.PRODUCTCATEGORIZATIONTIER1.trim().replace(/^AYS\s+/, ''),
    operation: operationOf(r.PRODUCTCATEGORIZATIONTIER2),
    module: key(r.PRODUCTCATEGORIZATIONTIER3),
    category: key(r.CATEGORIZATIONTIER3),
    scope: scopeOf(r.SUMMARY, r.SERVICETYPE, tags),
    flags,
    vendor: vendorOf(r.VENDORTICKETNUMBER),
    jira: jiraKeys(r.VENDORTICKETNUMBER, r.WORKLOG_DETAIL),
    first: h.first, start: h.start, time: h.time, bounces: h.bounces, pendings: h.pendings,
    resolvedBy: h.resolvedBy,
    ...readTitle(r.SUMMARY),   // problem y themes
    // texto de resolución sin números, para ver cuáles se repiten
    resolution: [...norm(r.RESOLUTION).replace(/\d+/g, '#')].slice(0, 90).join(''),
    title: r.SUMMARY.trim(),
  };
};
