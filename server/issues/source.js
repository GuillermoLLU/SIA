// La foto de las issues del equipo: lo que hay abierto en Remedy y lo
// resuelto en la última semana (lo que cuenta en la mesa). Hasta leer de
// Remedy, la foto sale del CSV de la consulta que carga la persona desde la
// vista Issues (puede ser el mismo fichero que el de Métricas, pero cada
// vista lo lee a su manera) y se guarda en <dir>/foto.json. «taken» es la
// hora del dato más reciente del fichero: los plazos se miden contra ella,
// no contra ahora.
import fs from 'node:fs';
import path from 'node:path';
import { csvReader } from '../shared/csv.js';
import { toIssue } from './issue.js';

const GROUP = 'AYS SOPORTE';
const OPEN = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING']);
const DONE = new Set(['RESOLVED', 'CLOSED']);
const KEEP_DONE_DAYS = 7;
const EMPTY = { taken: null, issues: [] };
export const REQUIRED = ['INCIDENTNUMBER', 'SUMMARY', 'TAGS', 'PRIORITY', 'STATUS', 'STATUSREASON', 'ASSIGNEE', 'ASSIGNEDGROUP',
  'REPORTEDDATE', 'LASTMODIFIEDDATE', 'LASTRESOLUTIONDATE', 'NOTES', 'CATEGORIZATIONTIER1', 'CATEGORIZATIONTIER2', 'CATEGORIZATIONTIER3',
  'RESOLUTION', 'VENDORTICKETNUMBER', 'CHILDREQUEST', 'LINKREMEDY', 'AUDIT_DETAIL'];

// El CSV no es el de la consulta (status 400 para la ruta).
class CsvError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const isoOf = (minute) => (minute ? new Date(minute.replace(' ', 'T')).toISOString() : null);
const dayBefore = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const createIssuesSource = (dir, { group = GROUP, now = () => new Date() } = {}) => {
  const file = path.join(dir, 'foto.json');
  let cache;            // undefined: sin leer aún
  let loading = false;

  const load = () => {
    if (cache === undefined) {
      try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = EMPTY; }
    }
    return cache;
  };

  // chunks: el CSV en trozos de texto (un stream con setEncoding('utf8')).
  // Si no vale, se lee hasta el final sin procesar y no se guarda nada. Las
  // resueltas se quedan en memoria solo si son del último mes (contra la
  // hora de ahora: el fichero se carga recién exportado); al final quedan
  // las de la semana anterior a la foto.
  const importCsv = async (chunks, name) => {
    if (loading) throw Object.assign(new Error('Ya se está cargando un CSV: espera a que termine.'), { status: 409 });
    loading = true;
    try {
      const issues = [];
      const recent = dayBefore(now(), 30);
      let latest = '', checked = false, failure = null;
      const reader = csvReader((r) => {
        if (!checked) {
          const missing = REQUIRED.filter((c) => !(c in r));
          if (missing.length) throw new CsvError(`Ese CSV no es el de la consulta de issues: le falta ${missing.join(', ')}.`);
          checked = true;
        }
        if (r.ASSIGNEDGROUP.trim() !== group) return;
        const i = toIssue(r);
        latest = [latest, i.reported, i.modified, i.resolved].reduce((a, b) => (b > a ? b : a));
        if (OPEN.has(i.status) || (DONE.has(i.status) && i.resolved >= recent)) issues.push(i);
      });
      for await (const chunk of chunks) {
        if (failure) continue;
        try { reader.push(chunk); } catch (e) { failure = e; }
      }
      if (failure) throw failure;
      reader.end();
      if (!latest) throw new CsvError(`Ese CSV no tiene issues del grupo ${group}.`);
      const since = dayBefore(latest.replace(' ', 'T'), KEEP_DONE_DAYS);
      const data = { taken: isoOf(latest), issues: issues.filter((i) => OPEN.has(i.status) || i.resolved >= since) };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
      fs.renameSync(`${file}.tmp`, file);
      cache = undefined; // se relee del fichero: los textos recién leídos del CSV arrastran sus trozos
      return { file: name, taken: data.taken, issues: data.issues.length };
    } finally {
      loading = false;
    }
  };

  return { load, importCsv };
};
