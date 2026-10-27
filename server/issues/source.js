// Dónde vive la foto de las issues (snapshot.js): en <dir>/foto.json de este
// ordenador. Hasta leer de Remedy, la foto sale del CSV de la consulta que
// carga la persona desde la vista Issues (puede ser el mismo fichero que el
// de Métricas, pero cada vista lo lee a su manera); el CSV no se copia ni
// sale de aquí.
import fs from 'node:fs';
import path from 'node:path';
import { csvReader } from '../shared/csv.js';
import { createSnapshot } from './snapshot.js';

const EMPTY = { taken: null, issues: [] };

export const createIssuesSource = (dir, { now } = {}) => {
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
  // Si no vale, se sigue leyendo hasta el final sin procesar, para que quien
  // lo envía reciba la respuesta y no un corte; y no se guarda nada.
  const importCsv = async (chunks, name) => {
    if (loading) throw Object.assign(new Error('Ya se está cargando un CSV: espera a que termine.'), { status: 409 });
    loading = true;
    try {
      const snapshot = createSnapshot({ now });
      const reader = csvReader(snapshot.add);
      let failure = null;
      for await (const chunk of chunks) {
        if (failure) continue;
        try { reader.push(chunk); } catch (e) { failure = e; }
      }
      if (failure) throw failure;
      reader.end();
      const data = snapshot.build();
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
