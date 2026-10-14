// Los datos de las Métricas de este ordenador: se calculan desde el CSV
// completo de Remedy que carga la persona y se guardan ya calculados en
// <dir>/datos.json. El CSV no se copia ni sale de aquí, y nada va a la base.
import fs from 'node:fs';
import path from 'node:path';
import { csvReader } from '../shared/csv.js';
import { createDataset } from './dataset.js';

export const createMetricsStore = (dir, { year, now = () => new Date() }) => {
  const file = path.join(dir, 'datos.json');
  let cache;            // undefined: sin leer aún; null: no hay datos
  let loading = false;

  const load = () => {
    if (cache === undefined) {
      try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = null; }
    }
    return cache;
  };

  // chunks: el CSV en trozos de texto (un stream con setEncoding('utf8')).
  // Si el CSV no vale, se sigue leyendo hasta el final sin procesar, para que
  // quien lo envía reciba la respuesta y no un corte.
  const importCsv = async (chunks, name) => {
    if (loading) throw Object.assign(new Error('Ya se está cargando un CSV: espera a que termine.'), { status: 409 });
    loading = true;
    try {
      const dataset = createDataset({ year });
      const reader = csvReader(dataset.add);
      let failure = null;
      for await (const chunk of chunks) {
        if (failure) continue;
        try { reader.push(chunk); } catch (e) { failure = e; }
      }
      if (failure) throw failure;
      reader.end();
      const data = dataset.build({ file: name, generated: now().toISOString() });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
      fs.renameSync(`${file}.tmp`, file);
      cache = data;
      return data.meta;
    } finally {
      loading = false;
    }
  };

  return { load, importCsv };
};
