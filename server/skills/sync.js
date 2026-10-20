// Las skills publicadas en la base de conocimiento son la verdad: el bridge
// las baja a la copia local de esa base (workspace/bases/<id>/skills), que es
// lo que ve la paleta. Las ediciones locales se pisan (publicar es el camino);
// si la base no responde, sigue valiendo la última copia. Como mucho una
// sincronización por minuto por base, salvo que se pida.
import fs from 'node:fs';
import path from 'node:path';
import { fetchAll } from '../base/client.js';
import { mcpRename } from '../launchers/mcp.js';
import { visibleIds, safeRelPath } from './skills.js';

const MIN_INTERVAL_MS = 60_000;

export const createSkillSync = ({ clientFor, needsSchema, workspace, now = Date.now }) => {
  const lastSync = new Map(); // base.id → cuándo

  const sync = async (base) => {
    if (!base) return;
    const dir = workspace.skillsDirFor(base);
    try {
      // sin el esquema blindado la base no se usa (ni para skills): aviso y fuera
      if (await needsSchema(base)) { console.warn(`[sia] «${base.name}» necesita el SQL del esquema nuevo: no se usa hasta entonces`); lastSync.set(base.id, now()); return; }
      const db = clientFor(base);
      const { data: metas, error: e1 } = await db.from('skills').select('id, scope').eq('enabled', true);
      if (e1) throw new Error(e1.message);
      if (!metas?.length) { console.warn(`[sia] sync ${base.name}: 0 skills en la base — conservo la copia local`); lastSync.set(base.id, now()); return; }
      const { data: files, error: e2 } = await fetchAll(() => db.from('skill_files').select('skill_id, path, content').order('skill_id').order('path'));
      if (e2) throw new Error(e2.message);
      const enabled = visibleIds(metas, base.tokens);
      fs.rmSync(dir, { recursive: true, force: true });
      let written = 0;
      for (const f of files) {
        const rel = enabled.has(f.skill_id) ? safeRelPath(f.path) : null;
        if (!rel) continue;
        const dest = path.join(dir, f.skill_id, ...rel.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, mcpRename(f.content));
        written++;
      }
      lastSync.set(base.id, now());
      console.log(`[sia] skills de «${base.name}» sincronizadas: ${enabled.size} skills, ${written} ficheros`);
    } catch (err) {
      console.error(`[sia] sync de skills de «${base.name}» falló (sigo con la copia local): ${err.message}`);
    }
  };

  return {
    sync,
    // si hace más de un minuto: en segundo plano (el siguiente chat lo ve)
    maybe(base) { if (base && now() - (lastSync.get(base.id) || 0) > MIN_INTERVAL_MS) sync(base); },
    // otra base (o ninguna): fuera la copia de la anterior y a traer la nueva
    async switchTo(base) { lastSync.clear(); workspace.keepOnlyBase(base); await sync(base); },
  };
};
