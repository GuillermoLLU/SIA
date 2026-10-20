// La config personal en disco: ~/.sia/config.json, por máquina y fuera del
// proyecto, con permisos 0600. Se lee entera y se escribe entera; cada cambio
// parte de lo que hay en el fichero para no pisar lo que guardan otros
// (sesiones, candado…).
import fs from 'node:fs';
import path from 'node:path';
import { liveSessions } from '../auth/sessions.js';
import { migrate } from './config.js';

export const createConfigStore = (file) => {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  const write = (cfg) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  };
  const patch = (changes) => write({ ...read(), ...changes });
  // formatos de versiones anteriores, al arrancar
  const migrated = migrate(read(), liveSessions);
  if (migrated) { write(migrated); console.log('[sia] config personal puesta al día'); }
  return { read, write, patch };
};
