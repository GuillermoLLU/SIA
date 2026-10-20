// El Laboratorio: skills publicadas en la base, borradores locales y los
// proyectos para la visibilidad. La vista la exige el bridge antes; aquí, el
// permiso «lab» de la clave de poder para lo que escribe, y las comunes solo
// para el dueño.
//   GET    /groups              → [{ token, name }]  (solo los proyectos que la persona ve)
//   GET    /skills              → [skill + scopeName]
//   GET    /skills/:id          → { ...skill, files }
//   POST   /skills/refresh      → { ok, skills }     (base → copia local)
//   POST   /skills/publish      { id, files, scope? } → { ok, id, files }
//   DELETE /skills/:id          → { ok, deleted }
//   GET    /drafts  ·  GET|PUT|DELETE /drafts/:id
// Cada petición llega con { db, base, perms }: el cliente de la base, la base
// y lo que abre en ella la clave de poder de quien llama.
import { validId, validFiles, safeRelPath, touchesCommon, parseFrontmatter, skillMeta, managed } from './skills.js';
import { skillList, removeSkillDir } from './catalog.js';

const isLabWrite = (area, sub, method) => area === 'drafts' || area === 'groups' || (area === 'skills' && (method === 'DELETE' || sub === 'publish'));

export const skillsRoutes = ({ json, readBody, sync, drafts, workspace }) => async (req, res, [area, sub], { db, base, perms }) => {
  if (isLabWrite(area, sub, req.method) && !perms?.lab) return json(res, 403, { error: 'Sin acceso al Laboratorio.' });
  const tokens = base ? base.tokens : [];

  if (area === 'groups' && req.method === 'GET') {
    const { data, error } = await db.from('access_groups').select('token, name').order('name');
    if (error) return json(res, 500, { error: error.message });
    const mine = new Set(tokens);
    return json(res, 200, (data || []).filter((g) => mine.has(g.token)));
  }

  if (area === 'skills') {
    if (req.method === 'GET' && !sub) {
      const { data, error } = await db.from('skills').select('*').order('id');
      if (error) return json(res, 500, { error: error.message });
      const { data: groups } = await db.from('access_groups').select('token, name');
      return json(res, 200, managed(data, perms, tokens, groups || []));
    }
    if (req.method === 'POST' && sub === 'refresh') {
      await sync.sync(base); // la paleta lo ve al momento
      return json(res, 200, { ok: true, skills: skillList(workspace.skillsDirFor(base)) });
    }
    if (req.method === 'POST' && sub === 'publish') {
      const { id, files, scope } = await readBody(req);
      if (!validId(id) || !validFiles(files)) return json(res, 400, { error: 'payload inválido' });
      const newScope = scope || null; // '' / undefined → común
      const { data: existing } = await db.from('skills').select('scope').eq('id', id).maybeSingle();
      if (touchesCommon(newScope, existing) && !perms?.owner) {
        return json(res, 403, { error: 'Las skills comunes solo las crea o edita quien tiene Administración. Elige un proyecto en «Visibilidad».' });
      }
      const skillMd = files.find((f) => f.path === 'SKILL.md');
      if (!skillMd) return json(res, 400, { error: 'falta SKILL.md' });
      const { error: e1 } = await db.from('skills').upsert({ ...skillMeta(id, parseFrontmatter(skillMd.content)), scope: newScope, updated_at: new Date().toISOString() });
      if (e1) return json(res, 500, { error: e1.message });
      const { error: e2 } = await db.from('skill_files').delete().eq('skill_id', id);
      if (e2) return json(res, 500, { error: e2.message });
      const { error: e3 } = await db.from('skill_files').insert(files.map((f) => ({ skill_id: id, path: safeRelPath(f.path), content: f.content })));
      if (e3) return json(res, 500, { error: e3.message });
      await sync.sync(base);
      return json(res, 200, { ok: true, id, files: files.length });
    }
    if (req.method === 'DELETE' && sub) {
      const id = decodeURIComponent(sub);
      if (!validId(id)) return json(res, 400, { error: 'id inválido' });
      const { data: existing } = await db.from('skills').select('scope').eq('id', id).maybeSingle();
      if (existing && !existing.scope && !perms?.owner) return json(res, 403, { error: 'Las skills comunes solo las borra quien tiene Administración.' });
      const { error } = await db.from('skills').delete().eq('id', id); // skill_files cae por cascade
      if (error) return json(res, 500, { error: error.message });
      removeSkillDir(workspace.skillsDirFor(base), id); // por si la base queda sin skills y la copia local no se rehace
      await sync.sync(base);
      return json(res, 200, { ok: true, deleted: id });
    }
    if (req.method === 'GET' && sub) {
      const id = decodeURIComponent(sub);
      const [meta, files] = await Promise.all([
        db.from('skills').select('*').eq('id', id).single(),
        db.from('skill_files').select('path, content').eq('skill_id', id).order('path'),
      ]);
      if (meta.error || files.error) return json(res, 404, { error: (meta.error || files.error).message });
      return json(res, 200, { ...meta.data, files: files.data });
    }
  }

  if (area === 'drafts') {
    if (req.method === 'GET' && !sub) return json(res, 200, drafts.list());
    if (sub) {
      const id = decodeURIComponent(sub);
      if (!validId(id)) return json(res, 400, { error: 'id inválido' });
      if (req.method === 'GET') {
        const d = drafts.read(id);
        return d ? json(res, 200, d) : json(res, 404, { error: 'borrador no encontrado' });
      }
      if (req.method === 'PUT') {
        const { files } = await readBody(req);
        if (!validFiles(files)) return json(res, 400, { error: 'payload inválido' });
        drafts.write(id, files);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { drafts.remove(id); return json(res, 200, { ok: true }); }
    }
  }
  return json(res, 404, { error: 'no encontrado' });
};
