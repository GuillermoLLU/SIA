// El workspace: lo escribible de SIA, fuera del código. Empaquetado
// (Electron) el .app es de solo lectura, así que todo vive en SIA_WORKSPACE
// (userData); en dev, en ~/.sia/workspace, FUERA del repo: así el cwd de los
// CLIs no cae dentro del código de SIA y claude no husmea el repo (README,
// package.json…) creyéndolo «el proyecto». El conocimiento del equipo llega
// solo por el RAG, no por el cwd.
//
// Los CLIs corren en un directorio por modo cuyo CLAUDE.md/AGENTS.md fija cómo
// usan el conocimiento: «auto» consulta el RAG por su cuenta, «demand» solo
// con la skill de buscar. Cada directorio de modo lleva un symlink a las skills
// para que las rutas relativas de la paleta sigan valiendo. La base de
// conocimiento tiene su rincón, bases/<id>/: sus skills sincronizadas y sus
// modos; sin base (sin sesión) se usa modes/<modo>, con las skills vacías.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mcpRename } from '../launchers/mcp.js';

export const MODES = ['auto', 'demand'];

// Misma ruta aunque venga con prefijo largo de Windows, barra final o mayúsculas.
export const samePath = (a, b) => {
  const norm = (p) => path.resolve(String(p).replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase();
  return norm(a) === norm(b);
};

export const createWorkspace = ({ root, dir }) => {
  const templates = path.join(root, 'workspace', 'modes'); // plantillas empaquetadas
  const basesDir = path.join(dir, 'bases');
  const skillsDir = path.join(dir, 'skills'); // sin base: vacío
  const skillsDirFor = (base) => path.join(basesDir, base.id, 'skills');

  const prepareModeDir = (modeDir, mode, skills) => {
    try {
      fs.mkdirSync(modeDir, { recursive: true });
      // instrucciones del modo: sembrar desde la plantilla si aún no existen
      for (const f of ['CLAUDE.md', 'AGENTS.md']) {
        const dest = path.join(modeDir, f);
        const src = path.join(templates, mode, f);
        if (!fs.existsSync(dest) && fs.existsSync(src) && dest !== src) fs.copyFileSync(src, dest);
        // las sembradas por una versión anterior: solo se corrige el nombre del
        // servidor MCP, sin tocar lo demás (el fichero puede estar retocado a mano)
        if (fs.existsSync(dest) && dest !== src) {
          const text = fs.readFileSync(dest, 'utf8');
          if (mcpRename(text) !== text) fs.writeFileSync(dest, mcpRename(text));
        }
      }
      // ojo: existsSync sigue el symlink (un enlace roto da false) → readlink
      const link = path.join(modeDir, 'skills');
      let linked = false;
      try { linked = samePath(fs.readlinkSync(link), skills); if (!linked) fs.unlinkSync(link); } catch { /* no existe o no es enlace */ }
      if (!linked) {
        fs.mkdirSync(skills, { recursive: true });
        fs.symlinkSync(skills, link, os.platform() === 'win32' ? 'junction' : 'dir');
      }
    } catch (err) {
      console.error(`[sia] no se pudo preparar ${modeDir}: ${err.message}`);
    }
  };
  for (const mode of MODES) prepareModeDir(path.join(dir, 'modes', mode), mode, skillsDir);

  return {
    dir,
    basesDir,
    skillsDir,
    uploadsDir: path.join(dir, 'uploads'),
    draftsDir: path.join(dir, 'lab-drafts'),
    issuesDir: path.join(dir, 'issues'),
    metricsDir: path.join(dir, 'metrics'),
    skillsDirFor,
    // el cwd de un chat: el directorio de ese modo, en la base si la hay
    modeDirFor(mode, base) {
      if (!base) return path.join(dir, 'modes', mode);
      const modeDir = path.join(basesDir, base.id, 'modes', mode);
      prepareModeDir(modeDir, mode, skillsDirFor(base));
      return modeDir;
    },
    // otra base (o ninguna): fuera el rincón de las anteriores
    keepOnlyBase(base) {
      try { for (const d of fs.readdirSync(basesDir)) if (d !== base?.id) fs.rmSync(path.join(basesDir, d), { recursive: true, force: true }); } catch { /* sin bases */ }
    },
  };
};
