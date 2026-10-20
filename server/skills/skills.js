// Las skills (dominio, sin E/S): qué dice el SKILL.md de cada una, qué puede
// publicar o borrar cada persona y qué se le enseña. Las comunes (scope vacío)
// son cosa del dueño; las de proyecto, de quien tiene el token de ese proyecto.

// El frontmatter YAML plano de un SKILL.md (clave: valor por línea; también
// con finales de línea de Windows).
export const parseFrontmatter = (src) => {
  const fm = {};
  const m = String(src ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return fm;
};

// Lo que se guarda y se enseña de una skill a partir de su frontmatter.
export const skillMeta = (id, fm) => ({
  id,
  label: fm.commandLabel || fm.name || id,
  description: fm.commandDescription || fm.description || '',
  category: fm.category || '',
  version: fm.version || '1.0.0',
  enabled: fm.enabled !== 'false',
});

export const validId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(s);

// Ruta de un fichero dentro de una skill: relativa, con nombre, sin salir
// de su carpeta. Con barras de Unix; null si no vale.
export const safeRelPath = (p) => {
  const parts = String(p ?? '').split(/[\\/]+/).filter((x) => x && x !== '.');
  if (!parts.length || parts.some((x) => x === '..') || /^[\\/]/.test(String(p ?? '')) || /^[a-z]:/i.test(parts[0])) return null;
  return parts.join('/');
};

export const validFiles = (files) => Array.isArray(files) && files.length > 0
  && files.every((f) => f && safeRelPath(f.path) && typeof f.content === 'string');

// Publicar toca una skill común si la nueva lo es (sin proyecto) o si la que
// se sobrescribe ya lo era.
export const touchesCommon = (newScope, existing) => !newScope || (!!existing && !existing.scope);

// Las que ve una persona en su copia local: comunes + las de los proyectos
// cuyo token tiene (los mismos tokens que el acceso al conocimiento).
export const visibleIds = (metas, tokens) => {
  const mine = new Set(tokens);
  return new Set(metas.filter((m) => !m.scope || mine.has(m.scope)).map((m) => m.id));
};

// Las que gestiona en el Laboratorio: el dueño, todas; los demás, solo las de
// SUS proyectos (ni comunes ni de otros). Con el nombre del proyecto: el dueño
// ve skills de proyectos de los que no tiene token, y sin el nombre la UI solo
// podría pintar el token (una credencial, no algo que enseñar).
export const managed = (skills, perms, tokens, groups) => {
  const names = new Map(groups.map((g) => [g.token, g.name]));
  const list = perms?.owner ? skills : skills.filter((s) => s.scope && tokens.includes(s.scope));
  return list.map((s) => ({ ...s, scopeName: s.scope ? names.get(s.scope) || null : null }));
};
