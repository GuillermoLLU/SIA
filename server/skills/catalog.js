// Las skills en disco: el catálogo de una carpeta (lo que ve la paleta) y los
// borradores del Laboratorio (locales, no salen en la paleta).
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, skillMeta, safeRelPath } from './skills.js';

// <dir>/<id>/SKILL.md → lo que enseña la paleta. Se lee cada vez: una
// sincronización se ve sin reiniciar.
export const skillList = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const md = path.join(dir, d.name, 'SKILL.md');
        if (!fs.existsSync(md)) return null;
        const { id, label, description, category, enabled } = skillMeta(d.name, parseFrontmatter(fs.readFileSync(md, 'utf8')));
        return enabled ? { id, label, description, category } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

// Los ficheros de una carpeta, por nombre: readdir los da en el orden del sistema de ficheros (Windows, sin distinguir
// mayúsculas; Linux, cualquiera), y así una skill sale igual en todas partes.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
export const walkDir = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).sort(byName).flatMap((e) =>
  e.isDirectory() ? walkDir(path.join(dir, e.name), path.posix.join(base, e.name))
    : [{ path: path.posix.join(base, e.name), content: fs.readFileSync(path.join(dir, e.name), 'utf8') }]);

// Escribe los ficheros de una skill (ya validados) en su carpeta, desde cero.
export const writeSkillDir = (dir, files) => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const dest = path.join(dir, ...safeRelPath(f.path).split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content);
  }
};

export const removeSkillDir = (dir, id) => fs.rmSync(path.join(dir, id), { recursive: true, force: true });

export const createDrafts = (dir) => ({
  list: () => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []),
  read: (id) => (fs.existsSync(path.join(dir, id)) ? { id, files: walkDir(path.join(dir, id)) } : null),
  write: (id, files) => writeSkillDir(path.join(dir, id), files),
  remove: (id) => fs.rmSync(path.join(dir, id), { recursive: true, force: true }),
});
