// La config personal (dominio, sin E/S): lo que guarda ~/.sia/config.json por
// máquina y fuera del proyecto. Credenciales de Jira y de GitHub (varias
// claves, solo una activa, que viaja a los chats que se abran a partir de
// entonces), el usuario de Snowflake de las Métricas, las sesiones guardadas (auth/) y el
// candado (lock/). Aquí, cómo se sanea lo que llega de la web y qué entorno
// reciben los CLIs.

// Claves de GitHub: entradas completas y acotadas, y la activa tiene que
// existir de verdad (si no, ninguna).
export const cleanGithub = (g) => {
  const keys = (Array.isArray(g?.keys) ? g.keys : [])
    .filter((k) => k && typeof k.token === 'string' && k.token.trim())
    .slice(0, 20)
    .map((k, i) => ({
      id: String(k.id || `gh${i + 1}`).slice(0, 40),
      name: String(k.name || '').trim().slice(0, 24) || `Clave ${i + 1}`,
      token: k.token.trim(),
    }));
  return { keys, activeId: keys.some((k) => k.id === g?.activeId) ? g.activeId : null };
};

export const cleanJira = (j) => ({ baseUrl: String(j?.baseUrl || '').trim(), token: String(j?.token || '').trim() });

// Snowflake (Métricas): quién consulta. Sin secretos: se entra por SSO. El rol y el
// warehouse, los de soporte si no se dice otro.
export const SNOWFLAKE = { role: 'R_SGA_USERS', warehouse: 'COMMON_USERS_WH' };
const field = (v, fallback = '') => String(v || '').trim().slice(0, 200) || fallback;
export const cleanSnowflake = (s) => ({ user: field(s?.user), role: field(s?.role, SNOWFLAKE.role), warehouse: field(s?.warehouse, SNOWFLAKE.warehouse) });

export const activeGithubToken = (cfg) => {
  const g = cfg.github || {};
  const keys = Array.isArray(g.keys) ? g.keys : [];
  return keys.find((k) => k.id === g.activeId)?.token || '';
};

// Las credenciales personales que recibe un chat por entorno: así los CLIs las
// usan sin que el secreto entre en la conversación.
export const userEnv = (cfg) => {
  const env = {};
  const { jira } = cfg;
  if (jira?.baseUrl) env.JIRA_BASE_URL = jira.baseUrl;
  if (jira?.token) env.JIRA_API_TOKEN = jira.token;
  const gh = activeGithubToken(cfg);
  if (gh) { env.GH_TOKEN = gh; env.GITHUB_TOKEN = gh; }
  return env;
};

// Limpia del entorno heredado las marcas de «estoy dentro de Claude Code», para
// que el CLI lanzado por SIA no se niegue por sesión anidada, y los tokens de
// GitHub: quién manda ahí es la clave activa (userEnv), no lo que llevara puesto
// el proceso que arrancó el bridge; si no hay ninguna marcada, el chat va sin.
export const cleanEnv = (env) => {
  const e = { ...env };
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'GH_TOKEN', 'GITHUB_TOKEN']) delete e[k];
  return e;
};

// Formatos de versiones anteriores → el actual; null si no hay nada que migrar.
// - Usuarios locales y sus sesiones (sin refresh token): fuera, se entra con la
//   cuenta de la instancia.
// - { github: { token } } → una entrada «Principal», activa.
export const migrate = (cfg, liveSessions) => {
  let out = null;
  if (cfg.users || (cfg.sessions || []).some((s) => !s?.refreshToken)) {
    out = { ...cfg, sessions: liveSessions(cfg.sessions) };
    delete out.users;
  }
  const g = cfg.github;
  if (g?.token && !Array.isArray(g.keys)) {
    out = { ...(out || cfg), github: { keys: [{ id: 'gh1', name: 'Principal', token: g.token }], activeId: 'gh1' } };
  }
  return out;
};
