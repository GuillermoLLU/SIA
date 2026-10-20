// /api/links: enlaces rápidos por proyecto. LEER puede cualquiera con la
// vista, acotado a los proyectos que dan sus tokens (mismo techo que el
// conocimiento, y misma regla de default-deny). CREAR, EDITAR y BORRAR exige
// el permiso «links» de la clave de poder.
//   GET    /      → [link]        POST /  { project_id, title, url, image?, notes? } → link
//   PUT    /:id   { campos que cambian } → link       DELETE /:id → { ok }
// Cada petición llega con { db, perms, projects }: el cliente de la base, lo
// que abre en ella la clave de poder y los proyectos que ve la persona.
import { linkFields, mergeLink } from './links.js';

const COLS = 'id, project_id, title, url, image, notes, created_at';

export const linksRoutes = ({ json, readBody }) => async (req, res, [id], { db, perms, projects }) => {
  const reach = projects.map((p) => p.id);
  const inReach = (pid) => reach.includes(Number(pid));

  if (req.method === 'GET' && !id) {
    if (!reach.length) return json(res, 200, []);
    const { data, error } = await db.from('project_links').select(COLS).in('project_id', reach).order('title');
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data || []);
  }
  if (!perms?.links) return json(res, 403, { error: 'Tu clave de poder no permite editar enlaces.' });

  if (req.method === 'POST' && !id) {
    const { project_id, ...fields } = await readBody(req);
    if (!inReach(project_id)) return json(res, 403, { error: 'Sin acceso a ese conocimiento.' });
    const clean = linkFields(fields);
    if (clean.error) return json(res, 400, { error: clean.error });
    const { data, error } = await db.from('project_links').insert({ project_id: Number(project_id), ...clean.value }).select(COLS).single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'PUT' && id) {
    const body = await readBody(req);
    const { data: cur } = await db.from('project_links').select('project_id, title, url, image, notes').eq('id', id).maybeSingle();
    if (!cur || !inReach(cur.project_id)) return json(res, 403, { error: 'Sin acceso a ese enlace.' });
    if (body.project_id !== undefined && !inReach(body.project_id)) return json(res, 403, { error: 'Sin acceso a ese conocimiento.' });
    const clean = linkFields(mergeLink(cur, body));
    if (clean.error) return json(res, 400, { error: clean.error });
    const patch = { ...clean.value, updated_at: new Date().toISOString(), ...(body.project_id !== undefined ? { project_id: Number(body.project_id) } : {}) };
    const { data, error } = await db.from('project_links').update(patch).eq('id', id).select(COLS).single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'DELETE' && id) {
    const { data: cur } = await db.from('project_links').select('project_id').eq('id', id).maybeSingle();
    if (!cur) return json(res, 404, { error: 'ese enlace ya no existe' });
    if (!inReach(cur.project_id)) return json(res, 403, { error: 'Sin acceso a ese enlace.' });
    const { error } = await db.from('project_links').delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no encontrado' });
};
