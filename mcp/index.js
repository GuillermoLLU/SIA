// sia-mcp — servidor MCP (stdio) con el conocimiento del proyecto.
// Lo lanza el propio `claude` de cada sesión (ver server/index.js). Expone
// search_knowledge: embebe la consulta en local (Xenova multilingual-e5-small,
// 384 dims, el mismo modelo con el que se ingesta) y busca por similitud
// en Supabase vía la RPC match_chunks. Sin claves de terceros: el embedding
// corre en local. La conexión a Supabase es la DEL USUARIO (⚙️ Configuración →
// Conocimiento) y llega por entorno desde el bridge; sin ella el bridge ni
// siquiera registra este MCP, pero por si acaso aquí tampoco hay valores por
// defecto: sin conexión, las tools lo dicen y no hacen nada.
//
// Acceso: la clave es la publishable del proyecto (no abre nada por sí sola)
// y los tokens de los proyectos de la persona viajan en la cabecera x-sia-tokens de
// cada petición; la base (RLS, ver supabase-schema.sql) solo deja ver y
// escribir el conocimiento de los proyectos que esos tokens conceden.
// SIA_ALLOWED_PROJECTS es la selección del chat dentro de ese techo.
//
// OJO: stdout es el canal del protocolo MCP — cualquier log va a stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import os from 'node:os';
import path from 'node:path';

const SUPABASE_URL = process.env.SIA_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SIA_SUPABASE_KEY || '';
const ACCESS_TOKENS = (process.env.SIA_ACCESS_TOKENS || '').split(',').map((t) => t.trim()).filter((t) => /^[\x21-\x7e]+$/.test(t)).join(',');
const HAS_DB = !!(SUPABASE_URL && SUPABASE_KEY);

// El Node embebido de Electron (v20) no trae WebSocket nativo y supabase-js lo
// exige al construir el cliente — le damos el de `ws`. En Node 21+ no hace nada.
if (typeof globalThis.WebSocket === 'undefined') {
  const { WebSocket } = await import('ws');
  globalThis.WebSocket = WebSocket;
}
// Red corporativa con proxy MITM: fetch tolerante para Supabase y para la
// descarga del modelo de embeddings (este proceso solo hace ese tráfico).
{
  const { fetch: undiciFetch, Agent } = await import('undici');
  const agent = new Agent({ connect: { rejectUnauthorized: false } });
  // Response global: transformers solo guarda en caché lo que es instanceof Response
  globalThis.fetch = async (url, opts = {}) => {
    const r = await undiciFetch(url, { ...opts, dispatcher: agent });
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
  };
}
const supabase = HAS_DB
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: (u, o) => globalThis.fetch(u, o), headers: ACCESS_TOKENS ? { 'x-sia-tokens': ACCESS_TOKENS } : {} } })
  : null;

// Lazy: el modelo (~120 MB) se descarga a la caché la primera vez y se reusa.
// La caché va en ~/.sia/models y no en la de la librería (dentro de
// node_modules): en la app instalada eso es el paquete, de solo lectura, y
// además se borraría en cada actualización.
let embedderPromise = null;
const getEmbedder = () => {
  embedderPromise ??= import('@xenova/transformers').then(({ pipeline, env }) => {
    env.cacheDir = path.join(os.homedir(), '.sia', 'models');
    return pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
  });
  return embedderPromise;
};

// Prefijos E5 (contrato del modelo): "query:" para buscar, "passage:" para ingestar.
const embed = async (text, prefix) => {
  const embedder = await getEmbedder();
  const out = await embedder(`${prefix}: ${text}`, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
};
const embedQuery = (text) => embed(text, 'query');

// Contrato de troceado de la ingesta: 500 chars, solape 75,
// cortando en límites naturales (párrafo > frase > palabra) cuando se puede.
const chunkText = (text, size = 500, overlap = 75) => {
  const clean = text.trim();
  if (clean.length <= size) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '));
      if (cut > size * 0.5) end = start + cut + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
};

// Control de acceso: el bridge inyecta SIA_ALLOWED_PROJECTS (ids separados por
// coma) = techo del token ∩ selección del chat. Si no hay ninguno, no se ve
// nada (default-deny). Toda lectura/escritura se acota a estos proyectos.
const ALLOWED_PROJECTS = (process.env.SIA_ALLOWED_PROJECTS || '')
  .split(',').map((x) => Number(x.trim())).filter(Boolean);

const noAccess = () => ({
  content: [{ type: 'text', text: !HAS_DB
    ? 'No hay base de conocimiento conectada. Conecta tu Supabase en ⚙️ Configuración → Base de conocimiento (y abre un chat nuevo).'
    : 'No tienes acceso a ningún conocimiento en este chat. Configura tu token de acceso en ⚙️ Configuración → Acceso al conocimiento (y abre un chat nuevo).' }],
});
// ids de contextos que cuelgan de proyectos permitidos (cache simple por proceso)
let allowedCtxCache = null;
const allowedContextIds = async () => {
  if (allowedCtxCache) return allowedCtxCache;
  const { data } = await supabase.from('contexts').select('id, project_id').in('project_id', ALLOWED_PROJECTS);
  allowedCtxCache = new Set((data || []).map((c) => c.id));
  return allowedCtxCache;
};

const server = new McpServer({ name: 'knowledge', version: '0.0.1' });

server.tool(
  'search_knowledge',
  'Busca en la base de conocimiento del proyecto (RAG vectorial compartido del equipo). ' +
    'Úsala SIEMPRE antes de responder preguntas sobre el proyecto, sus decisiones, procesos o tecnología.',
  {
    query: z.string().describe('Pregunta o tema a buscar, en lenguaje natural'),
    top_k: z.number().int().min(1).max(20).optional().describe('Máximo de fragmentos (por defecto 5)'),
  },
  async ({ query, top_k }) => {
    if (!ALLOWED_PROJECTS.length) return noAccess();
    const k = top_k ?? 5;
    const embedding = await embedQuery(query);
    // un match_chunks por proyecto permitido; se mezcla y se queda el top-k global
    const all = [];
    for (const pid of ALLOWED_PROJECTS) {
      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.7,
        match_count: k,
        filter_project_id: pid,
      });
      if (error) return { content: [{ type: 'text', text: `Error consultando el conocimiento: ${error.message}` }], isError: true };
      if (data) all.push(...data);
    }
    if (!all.length) {
      return { content: [{ type: 'text', text: 'Sin resultados relevantes en la base de conocimiento para esa consulta.' }] };
    }
    all.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    const results = all.slice(0, k).map((r) => ({
      contexto: r.context_name,
      similitud: Number(r.similarity?.toFixed(3)),
      texto: r.chunk_text,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  },
);

server.tool(
  'list_contexts',
  'Lista los contextos disponibles en la base de conocimiento (con su id, nombre y descripción). ' +
    'Úsala para resolver a qué contexto pertenece un conocimiento antes de ingestarlo.',
  {},
  async () => {
    if (!ALLOWED_PROJECTS.length) return noAccess();
    const { data, error } = await supabase
      .from('contexts')
      .select('id, name, description, project_id')
      .in('project_id', ALLOWED_PROJECTS)
      .order('id');
    if (error) {
      return { content: [{ type: 'text', text: `Error listando contextos: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'ingest_knowledge',
  'Guarda una entry de conocimiento en la base compartida del equipo (la trocea y vectoriza automáticamente). ' +
    'REGLA INNEGOCIABLE: está PROHIBIDO llamar a esta tool sin que el usuario haya confirmado explícitamente, en este mismo turno, (a) el texto exacto de la entry y (b) el contexto destino. El contexto se pregunta SIEMPRE, nunca se infiere.',
  {
    context_id: z.number().int().describe('ID del contexto destino (ver list_contexts)'),
    content: z.string().min(50).describe('Texto de la entry: autocontenido, 200-1000 caracteres idealmente'),
    source_type: z.string().optional().describe("Origen: 'conversation' (por defecto) o 'file'"),
  },
  async ({ context_id, content, source_type }) => {
    if (!(await allowedContextIds()).has(context_id)) {
      return { content: [{ type: 'text', text: `Sin acceso al contexto ${context_id}: no puedes guardar ahí en este chat.` }], isError: true };
    }
    const { data: entry, error: entryError } = await supabase
      .from('context_entries')
      .insert({ context_id, content, source_type: source_type ?? 'conversation', source_agent: 'sia', created_by: 'sia' })
      .select('id')
      .single();
    if (entryError) {
      return { content: [{ type: 'text', text: `Error creando la entry: ${entryError.message}` }], isError: true };
    }
    const chunks = chunkText(content);
    const rows = [];
    for (let i = 0; i < chunks.length; i++) {
      rows.push({ entry_id: entry.id, chunk_text: chunks[i], chunk_index: i, embedding: JSON.stringify(await embed(chunks[i], 'passage')) });
    }
    const { error: chunkError } = await supabase.from('context_chunks').insert(rows);
    if (chunkError) {
      // No dejar una entry huérfana sin vectores: revertir para que el modelo pueda reintentar.
      await supabase.from('context_entries').delete().eq('id', entry.id);
      return { content: [{ type: 'text', text: `Error guardando los chunks (entry revertida): ${chunkError.message}` }], isError: true };
    }
    // posición DENTRO del contexto (numeración por proyecto, no el id global)
    const { count } = await supabase.from('context_entries').select('*', { count: 'exact', head: true }).eq('context_id', context_id);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, posicion_en_contexto: count, chunks: rows.length, ref_interna: entry.id }) }] };
  },
);

server.tool(
  'list_entries',
  'Lista las entries de un contexto de la base de conocimiento (id, contenido, origen, fecha). ' +
    'Útil para inventariar o auditar el conocimiento existente.',
  {
    context_id: z.number().int().describe('ID del contexto (ver list_contexts)'),
  },
  async ({ context_id }) => {
    if (!(await allowedContextIds()).has(context_id)) {
      return { content: [{ type: 'text', text: `Sin acceso al contexto ${context_id} en este chat.` }], isError: true };
    }
    // por tandas: Supabase devuelve como mucho 1000 filas por consulta y un
    // contexto grande saldría recortado sin avisar
    const data = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase
        .from('context_entries')
        .select('id, content, source_type, source_agent, created_at')
        .eq('context_id', context_id)
        .order('id')
        .range(from, from + 999);
      if (error) {
        return { content: [{ type: 'text', text: `Error listando entries: ${error.message}` }], isError: true };
      }
      data.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    // numeración local del contexto (n=1,2,3…); `id` es la ref interna para operar
    const rows = (data || []).map((e, i) => ({ n: i + 1, id: e.id, content: e.content, source_type: e.source_type, created_at: e.created_at }));
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },
);

server.tool(
  'delete_entry',
  'Elimina una entry de la base de conocimiento (y sus chunks vectorizados). DESTRUCTIVO e irreversible. ' +
    'REGLA: nunca la llames sin que el usuario haya confirmado explícitamente la eliminación de ESA entry.',
  {
    entry_id: z.number().int().describe('ID de la entry a eliminar'),
  },
  async ({ entry_id }) => {
    // la entry debe pertenecer a un contexto permitido
    const { data: e } = await supabase.from('context_entries').select('context_id').eq('id', entry_id).single();
    if (!e || !(await allowedContextIds()).has(e.context_id)) {
      return { content: [{ type: 'text', text: `Sin acceso a la entry ${entry_id} en este chat.` }], isError: true };
    }
    // chunks first: works whether or not the FK cascades
    const { error: chunkError } = await supabase.from('context_chunks').delete().eq('entry_id', entry_id);
    if (chunkError) {
      return { content: [{ type: 'text', text: `Error eliminando chunks: ${chunkError.message}` }], isError: true };
    }
    const { error: entryError } = await supabase.from('context_entries').delete().eq('id', entry_id);
    if (entryError) {
      return { content: [{ type: 'text', text: `Error eliminando la entry: ${entryError.message}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted_entry_id: entry_id }) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[sia-mcp] knowledge listo (supabase: %s)', SUPABASE_URL);
