// Copia el conocimiento (RAG) de otra base de SIA a la conectada:
// proyectos → contextos → entries → chunks (con sus vectores: mismo modelo,
// no hace falta re-embeber), y opcionalmente grupos de acceso y sus permisos.
// Remapea los ids autogenerados y traduce las claves foráneas.
//
//   SRC_SUPABASE_URL=… SRC_SUPABASE_KEY=… node scripts/copy-knowledge.mjs [--with-access] [--only=proj1,proj2]
//
// Destino: SIA_SUPABASE_URL/KEY. Las dos claves tienen que ser la SECRET de
// cada proyecto (saltan las políticas de acceso); SIA no la guarda, así que
// se pasa por entorno en el momento y no se deja en ningún fichero.
// Aborta si el destino ya tiene proyectos, para no duplicar en re-ejecuciones.
import { createClient } from '@supabase/supabase-js';

const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const withAccess = args.includes('--with-access');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const src = { url: process.env.SRC_SUPABASE_URL, key: process.env.SRC_SUPABASE_KEY };
if (!src.url || !src.key) die('faltan SRC_SUPABASE_URL / SRC_SUPABASE_KEY (la base de origen)');
const dst = { url: process.env.SIA_SUPABASE_URL, key: process.env.SIA_SUPABASE_KEY };
if (!dst.url || !dst.key) die('faltan SIA_SUPABASE_URL / SIA_SUPABASE_KEY (la base destino, con su clave secret)');
if (src.url === dst.url) die('origen y destino son la misma base');

const SRC = createClient(src.url, src.key);
const DST = createClient(dst.url, dst.key);

// lecturas completas (PostgREST pagina a 1000): traer en tandas
const all = async (client, table, select, order = 'id') => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).order(order).range(from, from + 999);
    if (error) die(`leyendo ${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};
const insert = async (table, rows, select = 'id') => {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await DST.from(table).insert(rows.slice(i, i + 200)).select(select);
    if (error) die(`insertando en ${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
};

const { count: existing, error: e0 } = await DST.from('projects').select('*', { count: 'exact', head: true });
if (e0) die(`el destino no responde (¿tablas creadas?): ${e0.message}`);
if (existing) die(`el destino ya tiene ${existing} proyectos — vacíalo antes de volver a copiar`);

// 1) proyectos
let projects = await all(SRC, 'projects', 'id, name, description');
if (only.length) projects = projects.filter((p) => only.includes(p.name));
if (!projects.length) die('no hay proyectos que copiar');
const projMap = {};
for (const p of projects) {
  const [n] = await insert('projects', [{ name: p.name, description: p.description || '' }]);
  projMap[p.id] = n.id;
}
console.log(`proyectos: ${projects.length}`);

// 2) contextos
const contexts = (await all(SRC, 'contexts', 'id, project_id, name, description')).filter((c) => projMap[c.project_id]);
const ctxMap = {};
for (const c of contexts) {
  const [n] = await insert('contexts', [{ project_id: projMap[c.project_id], name: c.name, description: c.description || '' }]);
  ctxMap[c.id] = n.id;
}
console.log(`contextos: ${contexts.length}`);

// 3) entries (una a una para conservar el orden de ids dentro del contexto)
const entries = (await all(SRC, 'context_entries', 'id, context_id, content, source_type, source_agent, created_by, created_at')).filter((e) => ctxMap[e.context_id]);
const entryMap = {};
for (const e of entries) {
  const [n] = await insert('context_entries', [{ context_id: ctxMap[e.context_id], content: e.content, source_type: e.source_type, source_agent: e.source_agent, created_by: e.created_by, created_at: e.created_at }]);
  entryMap[e.id] = n.id;
}
console.log(`entries: ${entries.length}`);

// 4) chunks con sus vectores (PostgREST devuelve el vector como texto y lo acepta igual)
const chunks = (await all(SRC, 'context_chunks', 'entry_id, chunk_text, chunk_index, embedding', 'entry_id')).filter((c) => entryMap[c.entry_id]);
await insert('context_chunks', chunks.map((c) => ({ entry_id: entryMap[c.entry_id], chunk_text: c.chunk_text, chunk_index: c.chunk_index, embedding: c.embedding })), 'entry_id');
console.log(`chunks: ${chunks.length}`);

// 5) grupos de acceso y permisos (mismos tokens: valen en las dos bases)
if (withAccess) {
  const groups = await all(SRC, 'access_groups', 'token, name, created_at', 'token');
  await insert('access_groups', groups.map((g) => ({ token: g.token, name: g.name, created_at: g.created_at })), 'token');
  const grants = (await all(SRC, 'access_grants', 'token, project_id', 'token')).filter((g) => projMap[g.project_id]);
  await insert('access_grants', grants.map((g) => ({ token: g.token, project_id: projMap[g.project_id] })), 'token');
  console.log(`grupos: ${groups.length}, permisos: ${grants.length}`);
}
console.log('✓ conocimiento copiado');
