// El servidor MCP de conocimiento que ve cada chat (dominio, sin E/S): su
// nombre, el entorno con el que arranca y cómo se le da a cada CLI. La config
// va POR SESIÓN con los proyectos elegidos para ese chat (SIA_ALLOWED_PROJECTS:
// la selección dentro del techo de la persona). La conexión viaja al MCP por
// entorno, nunca por la conversación: la clave publishable de la base y los
// tokens de los proyectos, que es lo que la base exige para dejar ver algo. Sin
// base no se registra el MCP: el chat arranca igual, solo que sin conocimiento.
import { headerValue } from '../shared/credentials.js';

// Es el nombre que sale en pantalla cada vez que un chat busca o guarda
// («knowledge - search_knowledge»).
export const MCP_NAME = 'knowledge';

// Instrucciones ya sembradas en un equipo o skills guardadas en una base
// pueden nombrarlo con el nombre antiguo del servidor: al escribirlas en
// disco se les pone el vigente.
export const mcpRename = (text) => (typeof text === 'string' ? text.replace(/ITX-knowledge/g, MCP_NAME) : text);

// ELECTRON_RUN_AS_NODE: bajo Electron, process.execPath es el binario de la
// app y con esa variable actúa como Node puro (bajo node normal es inocua).
export const mcpEnv = (allowedProjects, base) => ({
  ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: allowedProjects.join(','),
  ...(base ? { SIA_SUPABASE_URL: base.url, SIA_SUPABASE_KEY: base.key, SIA_ACCESS_TOKENS: headerValue(base.tokens) } : {}),
});

// Los servidores de la sesión ({ nombre: { command, args, env } }): el de
// conocimiento, o ninguno sin base. Copilot los recibe así al crear la sesión.
export const mcpServers = (env, base, { execPath, server }) => (base ? { [MCP_NAME]: { command: execPath, args: [server], env } } : null);

// El fichero de MCP de Claude ({ mcpServers }); vacío sin base.
export const mcpConfig = (env, base, bin) => ({ mcpServers: mcpServers(env, base, bin) || {} });

// Codex no lee un fichero de MCP por sesión: se le escribe un PERFIL que se
// apila sobre su config.toml sin tocarlo y se lanza con -p. Un perfil en vez
// de -c porque así los argumentos no llevan comillas ni llaves, que en
// Windows pasan por cmd.exe y se rompen.
export const codexProfile = (sessionId) => `sia-${sessionId}`;
export const tomlStr = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export const codexProfileToml = (env, { execPath, server }) => [
  '# perfil temporal de SIA para esta sesión (se borra al cerrarla)',
  `[mcp_servers.${MCP_NAME}]`,
  `command = ${tomlStr(execPath)}`,
  `args = [${tomlStr(server)}]`,
  `[mcp_servers.${MCP_NAME}.env]`,
  ...Object.entries(env).map(([k, v]) => `${k} = ${tomlStr(v)}`),
  '',
].join('\n');
