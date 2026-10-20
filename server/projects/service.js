// Proyectos de la base de conocimiento (vista Administración). Es lo único que
// se gestiona: no hay grupos a la vista. Por dentro, cada proyecto lleva su
// propio token de acceso (un access_group con su nombre y un único grant),
// porque la base solo abre conocimiento por token: así cada persona se
// habilita proyecto a proyecto (en Personas) y la base lo hace cumplir.
// `db` es el cliente de la base con la clave de poder de quien actúa;
// newId y fetchAll llegan inyectados.

const fail = (status, message) => Object.assign(new Error(message), { status });

const projectToken = (id) => `prj-${id}`;

export const projectName = (raw) => {
  const name = String(raw ?? '').trim();
  if (!name || name.length > 80) throw fail(400, 'El nombre del proyecto necesita de 1 a 80 caracteres.');
  return name;
};

export const createProjects = ({ newId, fetchAll }) => ({
  // [{ id, name, entries }]
  async list(db) {
    const [{ data: projects, error }, { data: contexts }, { data: entries }] = await Promise.all([
      db.from('projects').select('id, name').order('name'),
      db.from('contexts').select('id, project_id'),
      fetchAll(() => db.from('context_entries').select('id, context_id').order('id')),
    ]);
    if (error) throw fail(500, error.message);
    const projectOf = new Map((contexts || []).map((c) => [c.id, c.project_id]));
    const count = new Map();
    for (const e of entries || []) { const p = projectOf.get(e.context_id); count.set(p, (count.get(p) || 0) + 1); }
    return (projects || []).map((p) => ({ id: p.id, name: p.name, entries: count.get(p.id) || 0 }));
  },

  // Proyecto + su contexto inicial + su token. Si algo falla, no queda a medias.
  async create(db, raw) {
    const name = projectName(raw);
    const { data: project, error } = await db.from('projects').insert({ name, description: `Conocimiento de ${name}` }).select('id, name').single();
    if (error) throw fail(500, error.message);
    const token = projectToken(newId());
    const steps = [
      () => db.from('access_groups').insert({ token, name }),
      () => db.from('access_grants').insert({ token, project_id: project.id }),
      () => db.from('contexts').insert({ project_id: project.id, name, description: `Contexto inicial de ${name}` }),
    ];
    for (const step of steps) {
      const { error: e } = await step();
      if (e) {
        await db.from('access_groups').delete().eq('token', token);
        await db.from('projects').delete().eq('id', project.id);
        throw fail(500, e.message);
      }
    }
    return { id: project.id, name: project.name, entries: 0 };
  },

  // Fuera el proyecto con su token: sus entradas, enlaces y skills se van con él.
  async remove(db, id) {
    const { data: grants, error } = await db.from('access_grants').select('token').eq('project_id', id);
    if (error) throw fail(500, error.message);
    const tokens = (grants || []).map((g) => g.token);
    if (tokens.length) {
      const { error: e } = await db.from('access_groups').delete().in('token', tokens);
      if (e) throw fail(500, e.message);
    }
    const { error: e2 } = await db.from('projects').delete().eq('id', id);
    if (e2) throw fail(500, e2.message);
  },

  // Las entradas de un proyecto (las de todos sus contextos), por id.
  async entries(db, projectId) {
    const { data: ctxs } = await db.from('contexts').select('id').eq('project_id', projectId);
    const ids = (ctxs || []).map((c) => c.id);
    if (!ids.length) return [];
    const { data, error } = await fetchAll(() => db.from('context_entries').select('id, content, source_type, created_at').in('context_id', ids).order('id'));
    if (error) throw fail(500, error.message);
    return data || [];
  },

  // Fuera una entrada con sus trozos vectorizados.
  async removeEntry(db, id) {
    await db.from('context_chunks').delete().eq('entry_id', id);
    const { error } = await db.from('context_entries').delete().eq('id', id);
    if (error) throw fail(500, error.message);
  },
});
