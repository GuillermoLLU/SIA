// Los datos de las Métricas de este ordenador. Cada CSV de Remedy se suma al
// repositorio local de incidencias (repository.js, SQLite) y de él se calculan
// las métricas; el cálculo se guarda en <dir>/datos.json para abrir la vista al
// instante. El CSV no se copia ni sale de aquí, y nada va a la base.
import fs from 'node:fs';
import path from 'node:path';
import { csvReader } from '../shared/csv.js';
import { createDataset, checkColumns, CsvError, FORMAT, GROUP } from './dataset.js';

export const createMetricsStore = (dir, { repo, now = () => new Date() }) => {
  const file = path.join(dir, 'datos.json');
  let cache;            // undefined: sin leer aún; null: no hay datos
  let loading = false;

  // Las métricas de todo lo guardado en el repositorio.
  const compute = (name) => {
    const dataset = createDataset({ start: repo.firstYear(GROUP) ?? now().getUTCFullYear() });
    repo.eachIncident(dataset.add);
    return dataset.build({ file: name, generated: now().toISOString() });
  };

  // datos.json es una copia: si falta o es de otro formato, se recalcula desde el repositorio.
  const load = () => {
    if (cache === undefined) {
      try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = null; }
      if (cache?.meta?.format !== FORMAT) {
        try { cache = compute('repositorio local'); } catch { cache = null; }
      }
    }
    return cache;
  };

  // chunks: el CSV en trozos de texto (un stream con setEncoding('utf8')).
  // Si el CSV no vale, se sigue leyendo hasta el final sin procesar, para que
  // quien lo envía reciba la respuesta y no un corte.
  const importCsv = async (chunks, name) => {
    if (loading) throw Object.assign(new Error('Ya se está cargando un CSV: espera a que termine.'), { status: 409 });
    loading = true;
    const run = repo.begin();
    try {
      let failure = null, rows = 0;
      const reader = csvReader((row) => {
        if (!rows++) checkColumns(row);
        run.add(row);
      });
      for await (const chunk of chunks) {
        if (failure) continue;
        try { reader.push(chunk); } catch (e) { failure = e; }
      }
      if (failure) throw failure;
      reader.end();
      if (!rows) throw new CsvError('Ese CSV no tiene filas.');
    } catch (e) {
      run.rollback();
      throw e;
    } finally {
      loading = false;
    }
    const counts = run.commit();
    const data = compute(name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
    cache = data;
    return { meta: data.meta, counts };
  };

  return { load, importCsv };
};
