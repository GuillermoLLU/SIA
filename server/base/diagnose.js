// Diagnóstico de una base (para Ajustes y el asistente de montaje).
// ¿Se llega? ¿Vale la clave? ¿Qué tablas faltan? ¿Está la función de búsqueda?
// ¿Tiene el esquema blindado (sia_status) y dueño? Con una clave de poder,
// dice además qué abre (`me`): así el asistente sabe si la clave recién
// generada es la del dueño.
// Clasifica por los errores que devuelve PostgREST: tabla ausente =
// PGRST205/42P01; función ausente = PGRST202; clave mala = 401. Una tabla con
// RLS y sin permiso responde vacío, no error: por eso «existe» se mira así y
// «qué se ve» lo dice sia_status.
import { siaHeaders } from '../access/credentials.js';

export const SCHEMA_VERSION = 2; // la que escribe supabase-schema.sql (sia_status().version)
export const SCHEMA_TABLES = ['projects', 'contexts', 'context_entries', 'context_chunks', 'skills', 'skill_files', 'access_groups', 'access_grants', 'project_links', 'power_keys'];
export const isMissingErr = (e) => e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || '');
// ¿este sia_status() es el del esquema blindado al día? (null/viejo → hay que ejecutar el SQL)
export const schemaOk = (status) => !!status && (Number(status.version) || 0) >= SCHEMA_VERSION;

// `makeClient(url, key, headers)` crea el cliente de Supabase (inyectado para
// no atar este módulo al SDK ni al fetch tolerante del bridge).
export const makeDiagnose = (makeClient, warn = () => {}) => async (conn, powerKey = '') => {
  const c = makeClient(conn.url, conn.key, siaHeaders([], powerKey));
  const out = { reachable: true, authOk: true, missing: [], hasMatchFn: false, schema: 0, needsSchema: true, hasOwner: false, me: null };
  for (const t of SCHEMA_TABLES) {
    let error;
    // ojo: sin head:true — una petición HEAD no trae cuerpo y supabase-js no
    // puede construir el error (clave mala o tabla ausente pasarían por OK)
    try { ({ error } = await c.from(t).select('*').limit(0)); }
    catch (e) { error = { message: e.message }; }
    if (!error) continue;
    if (/fetch failed|ENOTFOUND|ECONN|getaddrinfo|certificate/i.test(error.message || '')) { out.reachable = false; return out; }
    if (/invalid api key|jwt|unauthorized/i.test(error.message || '') || error.code === '401' || error.status === 401) { out.authOk = false; return out; }
    if (isMissingErr(error)) out.missing.push(t);
    else warn(`diagnóstico de ${t}: ${error.message}`);
  }
  {
    const { error } = await c.rpc('match_chunks', { query_embedding: JSON.stringify(new Array(384).fill(0)), match_threshold: 0.99, match_count: 1, filter_project_id: -1 });
    out.hasMatchFn = !error || !isMissingErr(error);
  }
  {
    const { data, error } = await c.rpc('sia_status');
    if (!error && data && typeof data === 'object') {
      out.schema = Number(data.version) || 0;
      out.hasOwner = data.owner === true;
      out.me = data.me && typeof data.me === 'object' ? data.me : null;
    } else if (error && !isMissingErr(error)) warn(`diagnóstico de sia_status: ${error.message}`);
  }
  out.needsSchema = out.missing.length > 0 || !out.hasMatchFn || out.schema < SCHEMA_VERSION;
  return out;
};
