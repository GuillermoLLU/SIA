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
//   sessions por persona de dict.person, sus sesiones de actividad: [desde, hasta, turnos] (sessions.js).
//   cols    una lista por columna, una posición por issue:
//           id número · rep/res abierta y resuelta · lm último cambio (minutos desde el 1 de enero de start; -1 no hay)
//           st estado · rs motivo · pr prioridad · sv tipo de servicio · as responsable
//           ce centro · op operación · mo módulo · k3 tipología · sc ámbito · fl marcas (remedy.js FLAG)
//           vt/vp/vk ticket de tercero: tipo, proyecto Jira (de ITSMECOM, con su equipo asignado en Jira) y clave · vn su texto tal cual (VENDORTICKETNUMBER) · th temas · su título
//           de problema (themes.js): las formas de escribir lo mismo, juntas; dict.problem, la más escrita
//           fr primera actuación · ip primer paso a En curso (minutos desde la apertura; -1 no hay)
//           tA/tI/tPc/tPv/tPo minutos en cola, en curso y pendiente del centro, de un tercero u otros
//           nb devoluciones a la cola · np pendientes · rz resolución repetida (4 veces o más; 0 si no)
//           eR/eV/eC los días (desde el 1 de enero de start) en que pasó a Resuelta, a Pendiente de proveedor y a
//           Pendiente de cliente, una vez por día (lo atendido cada día: remedy.js, statusHistory events)
//           sp los pasos con quien los hizo: [0 resuelta, 1 a proveedor o 2 a cliente, instante, persona de dict.person]
//           sR/sV/sC lo mismo, por turno: el número de cada turno de 8 h desde las 7:00 del 1 de enero de start (web
//           shifts.js, slotOf), una vez por turno (lo atendido en el turno en que entró)
//           vh de sus tickets Jira que cambiaron de equipo, el original y el final (dict.vhops; 0, ninguno o aún no se sabe)
//           the/tes/tcr/tsr THesc, Tesc, Tcr y Tesc-r con sus tickets Jira (escalation.js; minutos, -1 no hay,
//           the -2 ticket previo); fl lleva además las marcas de sin Jira válido, cerrada con el Jira abierto,
//           cerrada en Remedy antes que su Jira y mal escalada (algún Jira suyo descartado o que pasó de un equipo a otro)
//           pc problema común (problems.js, PROBLEM_NAMES; 0 sin clasificar), por el título y la descripción del centro
//           nC veces que pasó a Pendiente de cliente · pn nuestra última nota pública (minutos desde el 1 de enero de
//           start; -1 ninguna) y pm su motivo (pending-reason.js, PENDING_REASONS; 0 sin nota): de alguien del equipo
//           (dict.person), aproximando lo público (pending-reason.js, isPublicNote)
//           hQ/hI/hPc/hPo el THesc de las escaladas repartido por estados (en cola, en curso, esperando al centro y
//           otras esperas, también de un tercero; minutos, -1 no hay): lo de antes del primer Jira, que suma su THesc
import { readIssue, minutesSince, timeUntil, FLAG } from './remedy.js';
import { PENDING_REASONS } from './pending-reason.js';
import { PROBLEM_NAMES } from './problems.js';
import { loginsOf, companyOf } from './companies.js';
import { sessionsOf } from './sessions.js';
import { THEME_NAMES, problemKey } from './themes.js';
import { PENDING, OPEN_STATES } from './states.js';
import { escalationOf } from './escalation.js';

export const GROUP = 'AYS SOPORTE';
export const FORMAT = 17;
// el proyecto Jira con muchos equipos: a quién se escala, su equipo (vp: «ITSMECOM · N2 Courier Support»)
export const TEAM_PROJECT = 'ITSMECOM';

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
  if (missing.length) throw new DataError(`La consulta de incidencias no trae ${missing.join(', ')}.`);
};

// Copia propia de un texto que se guarda. Los trozos de un campo pueden ser
// vistas del trozo recibido (64 KB): guardar la vista retendría el
// trozo entero en memoria por cada issue.
const own = (s) => Buffer.from(s, 'utf8').toString('utf8');

const dictionary = () => {
  const index = new Map([['', 0]]), values = [''];
  const id = (s) => { let i = index.get(s); if (i === undefined) { s = own(s); i = values.length; index.set(s, i); values.push(s); } return i; };
  return { id, values };
};

const COLS = ['id', 'rep', 'res', 'lm', 'st', 'rs', 'pr', 'sv', 'as', 'ce', 'op', 'mo', 'k3', 'sc', 'fl', 'vt', 'vp', 'vk', 'vn',
  'fr', 'ip', 'tA', 'tI', 'tPc', 'tPv', 'tPo', 'nb', 'np', 'nC', 'pc', 'th', 'su', 'de', 'eR', 'eV', 'eC', 'sR', 'sV', 'sC'];
// los días (desde el 1 de enero de start) de cada evento de una issue, sin repetir: una vez por issue, tipo y día
const daysOf = (mins) => [...new Set(mins.filter((t) => t >= 0).map((t) => Math.floor(t / 1440)))];
// y de cada turno de 8 h desde las 7:00 (mañana de 7 a 15, tarde de 15 a 23 y noche de 23 a 7: web shifts.js, slotOf)
const slotsOf = (mins) => [...new Set(mins.filter((t) => t >= 0).map((t) => Math.floor((t - 420) / 480)))];

// start: el año de la primera issue del grupo.
export const createDataset = ({ start }) => {
  const base = Date.UTC(start, 0, 1);
  const D = Object.fromEntries(['status', 'reason', 'prio', 'svc', 'person', 'centre', 'op', 'module', 'cat', 'vtype', 'vproj', 'vkey', 'vtext', 'vhops', 'resol', 'problem'].map((k) => [k, dictionary()]));
  const cols = Object.fromEntries(COLS.map((c) => [c, []]));
  const resolutions = [], resolutionCount = new Map(), resolvers = new Map();
  const stepsByRow = [], actionsBy = new Map(), notesByRow = [];   // los pasos y las acciones, con el autor tal cual: la persona se sabe en build
  const spellings = [];   // por problema: cuántas veces se escribe de cada forma
  const jira = [], keys = new Set(), spans = [];   // las claves Jira de cada issue (las cuentas de escalado se hacen en build)
  let total = 0, snapshot = 0, first = Infinity, last = -1;

  // Devuelve true si la incidencia entra en el informe (del grupo y sin avisos automáticos).
  const add = (r) => {
    total++;
    if (r.ASSIGNEDGROUP.trim() !== GROUP) return false;
    const i = readIssue(r, base);
    if (i.reported < 0) return false;
    snapshot = Math.max(snapshot, i.reported, i.modified);
    if (i.flags & FLAG.AUTO_NOTICE) return false;
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
      k3: D.cat.id(i.category), sc: i.scope, fl: i.flags, vt: D.vtype.id(i.vendor.type), vp: D.vproj.id(i.vendor.project), vk: D.vkey.id(i.vendor.key), vn: D.vtext.id(i.vendorText),
      fr: i.first, ip: i.start, tA: i.time.queue, tI: i.time.work, tPc: i.time.client, tPv: i.time.vendor, tPo: i.time.other,
      nb: i.bounces, np: i.pendings, nC: i.clientPendings, pc: i.common, th: i.themes, su: own(i.title), de,
      eR: daysOf(i.events.resolved), eV: daysOf(i.events.vendor), eC: daysOf(i.events.client),
      sR: slotsOf(i.events.resolved), sV: slotsOf(i.events.vendor), sC: slotsOf(i.events.client),
    };
    for (const c of COLS) cols[c].push(row[c]);
    stepsByRow.push(i.steps);
    notesByRow.push(i.publicNotes);
    for (const [t, who] of i.actions) { const l = actionsBy.get(who); if (l) l.push(t); else actionsBy.set(who, [t]); }
    const open = OPEN_STATES.includes(i.status);
    jira.push({ keys: i.jira, open });
    spans.push(i.flags & FLAG.THIRD_PARTY ? i.spans : null);   // solo de las escaladas: para partir su THesc
    for (const k of i.jira) keys.add(k);
    return true;
  };

  // Los tiempos de escalado de cada issue con sus tickets (Map clave → { created, resolved, status, found, moves }, en
  // hora de Madrid como Remedy); «ahora», la foto. Una clave sin ticket guardado no cuenta.
  const escalations = (tickets) => {
    const at = (s) => minutesSince(base, s), out = { the: [], tes: [], tcr: [], tsr: [], hQ: [], hI: [], hPc: [], hPo: [], vh: [] };
    jira.forEach(({ keys: ks, open }, n) => {
      const ts = ks.map((k) => tickets.get(k)).filter((t) => t?.found).map((t) => ({ created: at(t.created), resolved: at(t.resolved), status: t.status, moves: t.moves ?? 0, hops: t.hops ? JSON.parse(t.hops) : [] }));
      const e = escalationOf({ reported: cols.rep[n], resolved: cols.res[n], open, escalated: !!(cols.fl[n] & FLAG.THIRD_PARTY) }, ts, snapshot);
      out.vh.push(D.vhops.id(e.routes.map(([from, to]) => `${from} → ${to}`).join('; ')));
      out.the.push(e.thesc); out.tes.push(e.tesc); out.tcr.push(e.tcr); out.tsr.push(e.tescr);
      // su THesc, por estados: lo de cada uno hasta el primer Jira; la cola, lo que queda (lo de antes del primer cambio,
      // también), como en lo que no se escala (web phases.js)
      const h = e.thesc >= 0 && spans[n] ? timeUntil(spans[n], cols.rep[n], cols.rep[n] + e.thesc) : null;
      const wait = h ? h.vendor + h.other : -1;
      out.hI.push(h ? h.work : -1); out.hPc.push(h ? h.client : -1); out.hPo.push(wait);
      out.hQ.push(h ? Math.max(e.thesc - h.work - h.client - wait, h.queue) : -1);
      // ITSMECOM tiene muchos equipos: el proyecto, con el equipo asignado de su ticket
      const team = D.vproj.values[cols.vp[n]] === TEAM_PROJECT ? tickets.get(D.vkey.values[cols.vk[n]])?.team : '';
      if (team) cols.vp[n] = D.vproj.id(`${TEAM_PROJECT} · ${team}`);
      cols.fl[n] |= (e.bad ? FLAG.BAD_ESCALATION : 0) | (e.jiraOpen ? FLAG.JIRA_OPEN : 0) | (e.early ? FLAG.CLOSED_BEFORE_JIRA : 0)
        | (e.misrouted ? FLAG.MISROUTED : 0) | (e.discarded ? FLAG.JIRA_DISCARDED : 0) | (e.moved ? FLAG.JIRA_MOVED : 0);
    });
    return out;
  };

  // tickets: los tickets Jira guardados (repository.js: jiraTickets); jiraMeta: lo que va en meta.jira.
  const build = ({ file, generated, tickets = new Map(), jira: jiraMeta = null }) => {
    if (!cols.id.length) throw new DataError(`No hay incidencias del grupo ${GROUP} en los datos cargados.`);
    Object.assign(cols, escalations(tickets));
    cols.rz = resolutions.map((z) => (z && resolutionCount.get(z) >= 4 ? D.resol.id(z) : 0));
    const logins = new Map(), byLogin = loginsOf(resolvers);
    for (const [login, name] of byLogin) logins.set(name, [...(logins.get(name) || []), login]);
    const people = D.person.values, ids = new Map(people.map((name, n) => [name, n]));
    // el autor viene por usuario o por nombre; las cuentas de sistema y quien no es de la lista, de nadie (0)
    const personOf = (who) => ids.get(byLogin.get(who) ?? who) || 0;
    // nuestra última nota pública: la última de alguien del equipo (personOf), con su motivo
    const lastOurs = notesByRow.map((notes) => notes.filter(([, who]) => personOf(who)).reduce((a, b) => (!a || b[0] >= a[0] ? b : a), null));
    cols.pn = lastOurs.map((n) => (n ? n[0] : -1));
    cols.pm = lastOurs.map((n) => (n ? n[2] : 0));
    cols.sp = stepsByRow.map((steps) => steps.filter(([, t]) => t >= 0).map(([kind, t, who]) => [kind, t, personOf(who)]).filter(([, , p]) => p));
    const actionsOf = people.map(() => []);
    for (const [who, times] of actionsBy) { const p = personOf(who); if (p) actionsOf[p].push(...times); }
    const dict = Object.fromEntries(Object.entries(D).map(([k, d]) => [k, d.values]));
    dict.problem = dict.problem.map((k, n) => (n ? [...spellings[n]].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : ''));
    return {
      meta: { format: FORMAT, file, start, group: GROUP, rows: cols.id.length, total, snapshot, first, last, generated, jira: jiraMeta },
      dict,
      themes: THEME_NAMES,
      reasons: PENDING,
      pendingReasons: PENDING_REASONS,   // los motivos de Pendiente de cliente (cols.pm)
      problems: PROBLEM_NAMES,           // los problemas comunes (cols.pc)
      company: people.map((name) => companyOf(name, logins.get(name) || [])),
      sessions: actionsOf.map(sessionsOf),
      cols,
    };
  };

  // Las claves Jira de todas las issues, sin repetir (para pedirlas a Jira antes de build).
  return { add, build, jiraKeys: () => [...keys] };
};
