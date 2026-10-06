// Fuente provisional de issues hasta leer de Snowflake: el CSV más reciente
// de una carpeta (el que exporta hoy la consulta del equipo). «taken» es la
// hora del fichero: los plazos se miden contra ella, no contra ahora.
// Se relee solo si cambia el fichero.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv.js';
import { toIssue } from './issue.js';

export const createIssuesSource = (dir) => {
  let cache = { key: null, data: null };
  const latest = () => {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')); } catch { return null; }
    return files.map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0] || null;
  };
  return {
    load: () => {
      const f = latest();
      if (!f) return { taken: null, issues: [] };
      const key = `${f.file}:${f.mtime}`;
      if (cache.key !== key) {
        const issues = parseCsv(fs.readFileSync(f.file, 'utf8')).map(toIssue);
        cache = { key, data: { taken: new Date(f.mtime).toISOString(), issues } };
      }
      return cache.data;
    },
  };
};
