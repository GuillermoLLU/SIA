// Hablar con la base de conocimiento de la instancia. Una sola, la misma para
// todo el mundo: ahí viven el RAG, las skills, los proyectos y los enlaces.
// QUIÉN VE QUÉ lo decide la base, no el bridge: sus tablas están cerradas con
// Row Level Security y las políticas leen dos cabeceras que SIA manda en cada
// petición, x-sia-tokens (los tokens de sus proyectos) y x-sia-power (la clave
// de poder). Con la clave publishable a secas no se ve nada. Las comprobaciones
// de aquí (techo de proyectos, permisos de cada vista) son para dar mensajes
// claros, no la barrera. La clave secret del proyecto nunca entra en SIA.
import { siaHeaders } from '../shared/credentials.js';
import { permsFromRow } from '../shared/perms.js';

// ¿Tiene la base el esquema blindado al día? Lo dice sia_status().version:
// sin ella (o vieja) hay que ejecutar el SQL de SIA en la base, y hasta
// entonces no se usa. Es la versión que escribe supabase-schema.sql.
const SCHEMA_VERSION = 2;
export const schemaOk = (status) => !!status && (Number(status.version) || 0) >= SCHEMA_VERSION;

export const NO_DB_MSG = 'Sin base de conocimiento: la instancia aún no tiene la suya o no has iniciado sesión.';

// Sin conexión: un cliente «hueco» que acepta cualquier cadena de llamadas
// (from().select().eq()…, rpc()…) y resuelve siempre con el mismo error. Los
// puntos que usan supabase ya tratan `error`, así que no necesitan comprobar
// nada; la API además corta antes con un 503 claro para la UI.
export const noDbClient = (() => {
  const result = { data: null, error: { message: NO_DB_MSG, code: 'NO_DB' }, count: null };
  const chain = new Proxy(() => {}, {
    get: (_, p) => (p === 'then' ? (res, rej) => Promise.resolve(result).then(res, rej) : () => chain),
    apply: () => chain,
  });
  return chain;
})();

// Supabase (PostgREST) devuelve como mucho 1000 filas por consulta, sin avisar:
// una lectura que pueda pasar de ahí se pide por tandas hasta agotarla. `build`
// crea la consulta cada vez y debe llevar un orden estable (sin él, las tandas
// podrían solaparse o saltarse filas). Devuelve { data, error } como supabase-js.
const PAGE_ROWS = 1000;
export const fetchAll = async (build) => {
  const out = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await build().range(from, from + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE_ROWS) return { data: out, error: null };
  }
};

const STATUS_TTL_MS = 15_000;

// `createClient` y `fetch`: los de supabase-js y el que tolera el proxy
// corporativo; llegan inyectados para poder probar sin red.
export const createBaseAccess = ({ createClient, fetch, now = Date.now }) => {
  const clients = new Map(); // un cliente por base, conexión, tokens y clave de poder
  const status = new Map();  // `${baseId}|${powerKey}` → { at, status }

  // Lleva en cada petición las cabeceras con las que la base decide qué dejar
  // ver. `powerKey` fuerza otra clave de poder (dev/pruebas).
  const clientFor = (base, powerKey = base.powerKey) => {
    const headers = siaHeaders(base.tokens, powerKey);
    const k = `${base.url}|${base.key}|${JSON.stringify(headers)}`;
    if (!clients.has(k)) clients.set(k, createClient(base.url, base.key, { global: { fetch, headers } }));
    return clients.get(k);
  };

  // sia_status() de una base con una clave de poder dada: { version, owner,
  // me: { name, owner, perms } | null, projects } o null si la base no responde
  // o no tiene el esquema blindado. Cacheado 15 s.
  const baseStatus = async (base, powerKey = base?.powerKey) => {
    if (!base) return null;
    const k = `${base.id}|${powerKey || ''}`;
    const cached = status.get(k);
    if (cached && now() - cached.at < STATUS_TTL_MS) return cached.status;
    const { data, error } = await clientFor(base, powerKey).rpc('sia_status');
    const st = !error && data && typeof data === 'object' ? data : null;
    status.set(k, { at: now(), status: st });
    return st;
  };
  // ¿la base aún no tiene el esquema blindado? (sin sia_status o versión vieja)
  const needsSchema = async (base) => !schemaOk(await baseStatus(base));

  return {
    clientFor,
    needsSchema,
    // permisos en la base: { name, owner, lab, admin, links } o null, según la
    // clave de poder que la instancia dio a quien ha iniciado sesión
    permsFor: async (base) => (base?.powerKey ? permsFromRow((await baseStatus(base))?.me) : null),
    // Los tokens de la persona → proyectos permitidos (unión de lo que concede
    // cada token). Sin tokens válidos no se ve nada; la base aplica la misma
    // regla por su cuenta: esto solo devuelve lo que ella deja ver.
    async accessibleProjects(base) {
      if (!base?.key || !base.tokens.length || await needsSchema(base)) return [];
      const { data, error } = await clientFor(base).from('access_grants').select('project_id, projects(id, name)').in('token', base.tokens);
      if (error || !data) return [];
      const byId = new Map();
      for (const g of data) if (g.projects) byId.set(g.projects.id, g.projects.name);
      return [...byId].map(([id, name]) => ({ id, name }));
    },
    clearStatus: () => status.clear(),
  };
};
