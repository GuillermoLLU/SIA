// Del CSV completo de Remedy a los datos de las Métricas: solo las issues del
// grupo de soporte abiertas en el año, medidas una a una (remedy.js) y
// guardadas por columnas, con los textos repetidos en diccionarios. Los
// avisos automáticos de ruta y etiqueta (AUTOTEC) se abren y se cierran
// solos: no son trabajo del equipo y no se guardan.
//
// Lo que sale (lo lee web/src/metrics/):
//   meta    { file, year, group, rows, total, snapshot, generated }
//           rows: issues del grupo y del año; total: filas del CSV;
//           snapshot: el último minuto con movimiento (la «hora de la foto»).
//   dict    textos por columna; el 0 es siempre ''.
//   themes  nombres de los temas (bit i de `th`).
//   company empresa de cada persona de dict.person (companies.js).
//   cols    una lista por columna, una posición por issue:
//           id número · rep/res abierta y resuelta · lm último cambio (minutos desde el 1 de enero; -1 no hay)
//           st estado · rs motivo · pr prioridad · sv tipo de servicio · as responsable
//           ce centro · op operación · mo módulo · k3 tipología · sc ámbito · fl marcas (remedy.js FLAG)
//           vt/vp/vk ticket de tercero: tipo, proyecto Jira y clave · th temas · su título
//           fr primera actuación · ip primer paso a En curso (minutos desde la apertura; -1 no hay)
//           tA/tI/tPc/tPv/tPo minutos en cola, en curso y pendiente del centro, de un tercero u otros
//           nb devoluciones a la cola · np pendientes · rz resolución repetida (4 veces o más; 0 si no)
import { readIssue, FLAG } from './remedy.js';
import { loginsOf, companyOf } from './companies.js';
import { THEME_NAMES } from './themes.js';

export const GROUP = 'AYS SOPORTE';

export const REQUIRED = ['INCIDENTNUMBER', 'ASSIGNEDGROUP', 'ASSIGNEE', 'SUMMARY', 'PRIORITY', 'STATUS', 'STATUSREASON', 'SERVICETYPE', 'TAGS',
  'REPORTEDDATE', 'LASTRESOLUTIONDATE', 'LASTMODIFIEDDATE', 'RESOLUTION', 'VENDORTICKETNUMBER', 'PRODUCTCATEGORIZATIONTIER1',
  'PRODUCTCATEGORIZATIONTIER2', 'PRODUCTCATEGORIZATIONTIER3', 'CATEGORIZATIONTIER3', 'AUDIT_DETAIL', 'WORKLOG_DETAIL'];

// El CSV no es el de la consulta (status 400 para la ruta).
export class CsvError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

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
  'fr', 'ip', 'tA', 'tI', 'tPc', 'tPv', 'tPo', 'nb', 'np', 'th', 'su'];

export const createDataset = ({ year, group = GROUP }) => {
  const base = Date.UTC(year, 0, 1), yearEnd = (Date.UTC(year + 1, 0, 1) - base) / 60000;
  const D = Object.fromEntries(['status', 'reason', 'prio', 'svc', 'person', 'centre', 'op', 'module', 'cat', 'vtype', 'vproj', 'vkey', 'resol'].map((k) => [k, dictionary()]));
  const cols = Object.fromEntries(COLS.map((c) => [c, []]));
  const resolutions = [], resolutionCount = new Map(), resolvers = new Map();
  let total = 0, snapshot = 0, checked = false;

  const add = (r) => {
    if (!checked) {
      const missing = REQUIRED.filter((c) => !(c in r));
      if (missing.length) throw new CsvError(`Ese CSV no es el de la consulta de issues: le falta ${missing.join(', ')}.`);
      checked = true;
    }
    total++;
    if (r.ASSIGNEDGROUP.trim() !== group) return;
    const i = readIssue(r, base);
    if (i.reported < 0 || i.reported >= yearEnd) return;
    snapshot = Math.max(snapshot, i.reported, i.modified);
    if (i.flags & FLAG.AUTO_NOTICE) return;
    if (i.resolvedBy.length) {
      const name = own(i.assignee), counts = resolvers.get(name) || new Map();
      for (const who of i.resolvedBy) counts.set(counts.has(who) ? who : own(who), (counts.get(who) || 0) + 1);
      resolvers.set(name, counts);
    }
    const resolution = own(i.resolution);
    resolutionCount.set(resolution, (resolutionCount.get(resolution) || 0) + 1);
    resolutions.push(resolution);
    const row = {
      id: i.id, rep: i.reported, res: i.resolved, lm: i.modified, st: D.status.id(i.status), rs: D.reason.id(i.reason), pr: D.prio.id(i.priority),
      sv: D.svc.id(i.service), as: D.person.id(i.assignee), ce: D.centre.id(i.centre), op: D.op.id(i.operation), mo: D.module.id(i.module),
      k3: D.cat.id(i.category), sc: i.scope, fl: i.flags, vt: D.vtype.id(i.vendor.type), vp: D.vproj.id(i.vendor.project), vk: D.vkey.id(i.vendor.key),
      fr: i.first, ip: i.start, tA: i.time.queue, tI: i.time.work, tPc: i.time.client, tPv: i.time.vendor, tPo: i.time.other,
      nb: i.bounces, np: i.pendings, th: i.themes, su: own(i.title),
    };
    for (const c of COLS) cols[c].push(row[c]);
  };

  const build = ({ file, generated }) => {
    if (!cols.id.length) throw new CsvError(`Ese CSV no tiene issues del grupo ${group} abiertas en ${year}.`);
    cols.rz = resolutions.map((z) => (z && resolutionCount.get(z) >= 4 ? D.resol.id(z) : 0));
    const logins = new Map();
    for (const [login, name] of loginsOf(resolvers)) logins.set(name, [...(logins.get(name) || []), login]);
    const people = D.person.values;
    return {
      meta: { file, year, group, rows: cols.id.length, total, snapshot, generated },
      dict: Object.fromEntries(Object.entries(D).map(([k, d]) => [k, d.values])),
      themes: THEME_NAMES,
      company: people.map((name) => companyOf(name, logins.get(name) || [])),
      cols,
    };
  };

  return { add, build };
};
