// De las incidencias del repositorio local (repository.js) a los datos de las
// Métricas: solo las issues del grupo de soporte, de cualquier año, medidas una
// a una (remedy.js) y guardadas por columnas, con los textos repetidos en
// diccionarios. Los avisos automáticos de ruta y etiqueta (AUTOTEC) se abren y
// se cierran solos: no son trabajo del equipo y no se guardan.
//
// Lo que sale (lo lee web/src/metrics/):
//   meta    { format, file, start, group, rows, total, snapshot, first, last, generated, jira }
//           format: FORMAT; unos datos de otro formato se vuelven a calcular desde el repositorio.
//           start: el año de la primera issue; el 1 de enero de ese año es el origen de los minutos.
//           rows: issues del grupo; total: incidencias guardadas;
//           snapshot: el último minuto con movimiento (la «hora de la foto»);
//           first/last: la apertura de la primera y de la última issue (minutos).
//           jira: { at, tickets, message }: cuándo se trajo de Jira, cuántos tickets hay y, si no se pudo, por qué.
//   dict    textos por columna; el 0 es siempre ''.
//   themes  nombres de los temas (bit i de `th`).
//   reasons los motivos de Pendiente que son esperar al cliente o a un tercero (states.js), para la situación.
//   company empresa de cada persona de dict.person (companies.js).
//   cols    una lista por columna, una posición por issue:
//           id número · rep/res abierta y resuelta · lm último cambio (minutos desde el 1 de enero de start; -1 no hay)
//           st estado · rs motivo · pr prioridad · sv tipo de servicio · as responsable
//           ce centro · op operación · mo módulo · k3 tipología · sc ámbito · fl marcas (remedy.js FLAG)
//           vt/vp/vk ticket de tercero: tipo, proyecto Jira y clave · th temas · su título
//           de problema (themes.js): las formas de escribir lo mismo, juntas; dict.problem, la más escrita
//           fr primera actuación · ip primer paso a En curso (minutos desde la apertura; -1 no hay)
//           tA/tI/tPc/tPv/tPo minutos en cola, en curso y pendiente del centro, de un tercero u otros
//           nb devoluciones a la cola · np pendientes · rz resolución repetida (4 veces o más; 0 si no)
//           the/tes/tcr/tsr THesc, Tesc, Tcr y Tesc-r con sus tickets Jira (escalation.js; minutos, -1 no hay,
//           the -2 ticket previo); fl lleva además las marcas de mal escalada, cerrada con el Jira abierto y
//           cerrada en Remedy antes que su Jira
import { readIssue, minutesSince, FLAG } from './remedy.js';
import { loginsOf, companyOf } from './companies.js';
import { THEME_NAMES, problemKey } from './themes.js';
import { PENDING, OPEN_STATES } from './states.js';
import { escalationOf } from './escalation.js';

export const GROUP = 'AYS SOPORTE';
export const FORMAT = 6;

export const REQUIRED = ['INCIDENTNUMBER', 'ASSIGNEDGROUP', 'ASSIGNEE', 'SUMMARY', 'PRIORITY', 'STATUS', 'STATUSREASON', 'SERVICETYPE', 'TAGS',
  'REPORTEDDATE', 'LASTRESOLUTIONDATE', 'LASTMODIFIEDDATE', 'RESOLUTION', 'VENDORTICKETNUMBER', 'PRODUCTCATEGORIZATIONTIER1',
  'PRODUCTCATEGORIZATIONTIER2', 'PRODUCTCATEGORIZATIONTIER3', 'CATEGORIZATIONTIER3', 'AUDIT_DETAIL', 'WORKLOG_DETAIL'];

// Los datos no son los de la consulta de issues (status 400 para la ruta).
export class DataError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

// La primera fila dice si los datos son los de la consulta de issues.
export const checkColumns = (row) => {
  const missing = REQUIRED.filter((c) => !(c in row));
  if (missing.length) throw new DataError(`La consulta de issues no trae ${missing.join(', ')}.`);
};

// Copia propia de un texto que se guarda. Los trozos de un campo del CSV
// pueden ser vistas del trozo leído (64 KB): guardar la vista retendría el
// trozo entero en memoria por cada issue.
const own = (s) => Buffer.from(s, 'utf8').toString('utf8');

const dictionary = () => {
  const index = new Map([['', 0]]), values = [''];
  const id = (s) => { let i = index.get(s); if (i === undefined) { s = own(s); i = values.length; index.set(s, i); values.push(s); } return i; };
  return { id, values };
};

const COLS = ['id', 'rep', 'res', 'lm', 'st', 'rs', 'pr', 'sv', 'as', 'ce', 'op', 'mo', 'k3', 'sc', 'fl', 'vt', 'vp', 'vk',
  'fr', 'ip', 'tA', 'tI', 'tPc', 'tPv', 'tPo', 'nb', 'np', 'th', 'su', 'de'];

// start: el año de la primera issue del grupo.
export const createDataset = ({ start }) => {
  const base = Date.UTC(start, 0, 1);
  const D = Object.fromEntries(['status', 'reason', 'prio', 'svc', 'person', 'centre', 'op', 'module', 'cat', 'vtype', 'vproj', 'vkey', 'resol', 'problem'].map((k) => [k, dictionary()]));
  const cols = Object.fromEntries(COLS.map((c) => [c, []]));
  const resolutions = [], resolutionCount = new Map(), resolvers = new Map();
  const spellings = [];   // por problema: cuántas veces se escribe de cada forma
  const jira = [], keys = new Set();   // las claves Jira de cada issue (las cuentas de escalado se hacen en build)
  let total = 0, snapshot = 0, first = Infinity, last = -1;

  const add = (r) => {
    total++;
    if (r.ASSIGNEDGROUP.trim() !== GROUP) return;
    const i = readIssue(r, base);
    if (i.reported < 0) return;
    snapshot = Math.max(snapshot, i.reported, i.modified);
    if (i.flags & FLAG.AUTO_NOTICE) return;
    first = Math.min(first, i.reported);
    last = Math.max(last, i.reported);
    if (i.resolvedBy.length) {
      const name = own(i.assignee), counts = resolvers.get(name) || new Map();
      for (const who of i.resolvedBy) counts.set(counts.has(who) ? who : own(who), (counts.get(who) || 0) + 1);
      resolvers.set(name, counts);
    }
    const resolution = own(i.resolution);
    resolutionCount.set(resolution, (resolutionCount.get(resolution) || 0) + 1);
    resolutions.push(resolution);
    const de = D.problem.id(problemKey(i.problem));
    if (de) { const w = spellings[de] || (spellings[de] = new Map()); w.set(i.problem, (w.get(i.problem) || 0) + 1); }
    const row = {
      id: i.id, rep: i.reported, res: i.resolved, lm: i.modified, st: D.status.id(i.status), rs: D.reason.id(i.reason), pr: D.prio.id(i.priority),
      sv: D.svc.id(i.service), as: D.person.id(i.assignee), ce: D.centre.id(i.centre), op: D.op.id(i.operation), mo: D.module.id(i.module),
      k3: D.cat.id(i.category), sc: i.scope, fl: i.flags, vt: D.vtype.id(i.vendor.type), vp: D.vproj.id(i.vendor.project), vk: D.vkey.id(i.vendor.key),
      fr: i.first, ip: i.start, tA: i.time.queue, tI: i.time.work, tPc: i.time.client, tPv: i.time.vendor, tPo: i.time.other,
      nb: i.bounces, np: i.pendings, th: i.themes, su: own(i.title), de,
    };
    for (const c of COLS) cols[c].push(row[c]);
    jira.push({ keys: i.jira, open: OPEN_STATES.includes(i.status) });
    for (const k of i.jira) keys.add(k);
  };

  // Los tiempos de escalado de cada issue con sus tickets (Map clave → { created, resolved, status, found }, en hora
  // de Madrid como Remedy); «ahora», la foto. Una clave sin ticket guardado no cuenta.
  const escalations = (tickets) => {
    const at = (s) => minutesSince(base, s), out = { the: [], tes: [], tcr: [], tsr: [] };
    jira.forEach(({ keys: ks, open }, n) => {
      const ts = ks.map((k) => tickets.get(k)).filter((t) => t?.found).map((t) => ({ created: at(t.created), resolved: at(t.resolved), status: t.status }));
      const e = escalationOf({ reported: cols.rep[n], resolved: cols.res[n], open, escalated: !!(cols.fl[n] & FLAG.THIRD_PARTY) }, ts, snapshot);
      out.the.push(e.thesc); out.tes.push(e.tesc); out.tcr.push(e.tcr); out.tsr.push(e.tescr);
      cols.fl[n] |= (e.bad ? FLAG.BAD_ESCALATION : 0) | (e.jiraOpen ? FLAG.JIRA_OPEN : 0) | (e.early ? FLAG.CLOSED_BEFORE_JIRA : 0);
    });
    return out;
  };

  // tickets: los tickets Jira guardados (repository.js: jiraTickets); jiraMeta: lo que va en meta.jira.
  const build = ({ file, generated, tickets = new Map(), jira: jiraMeta = null }) => {
    if (!cols.id.length) throw new DataError(`No hay issues del grupo ${GROUP} en los datos cargados.`);
    Object.assign(cols, escalations(tickets));
    cols.rz = resolutions.map((z) => (z && resolutionCount.get(z) >= 4 ? D.resol.id(z) : 0));
    const logins = new Map();
    for (const [login, name] of loginsOf(resolvers)) logins.set(name, [...(logins.get(name) || []), login]);
    const people = D.person.values;
    const dict = Object.fromEntries(Object.entries(D).map(([k, d]) => [k, d.values]));
    dict.problem = dict.problem.map((k, n) => (n ? [...spellings[n]].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : ''));
    return {
      meta: { format: FORMAT, file, start, group: GROUP, rows: cols.id.length, total, snapshot, first, last, generated, jira: jiraMeta },
      dict,
      themes: THEME_NAMES,
      reasons: PENDING,
      company: people.map((name) => companyOf(name, logins.get(name) || [])),
      cols,
    };
  };

  // Las claves Jira de todas las issues, sin repetir (para pedirlas a Jira antes de build).
  return { add, build, jiraKeys: () => [...keys] };
};
