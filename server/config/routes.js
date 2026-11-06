// /api/config: la config personal por la API, solo lo que la web lee y
// escribe (Jira, claves de GitHub, usuario de Snowflake y tema). Sesiones y candado no salen ni
// entran por aquí: cada cosa tiene su ruta. Es de cada persona: sin gate.
//   GET  → { jira, github, snowflake, version }
//   PUT  { jira?, github?, snowflake?, theme? } → { ok }   onTheme(theme) si cambia el tema
import { cleanTheme, cleanGithub, cleanJira, cleanSnowflake } from './config.js';

export const configRoutes = (store, { json, readBody, version, onTheme }) => async (req, res) => {
  if (req.method === 'GET') {
    const { jira, github, snowflake } = store.read();
    return json(res, 200, { jira, github, snowflake: cleanSnowflake(snowflake), version });
  }
  if (req.method === 'PUT') {
    const body = await readBody(req);
    const changes = {};
    if (body.jira !== undefined) changes.jira = cleanJira(body.jira);
    if (body.github !== undefined) changes.github = cleanGithub(body.github);
    // Solo el usuario se cambia desde la pantalla: el rol y el warehouse se quedan tal como están en la configuración.
    if (body.snowflake !== undefined) {
      const current = store.read().snowflake || {};
      changes.snowflake = cleanSnowflake({ user: body.snowflake.user, role: current.role, warehouse: current.warehouse });
    }
    const theme = body.theme !== undefined ? cleanTheme(body.theme) : null;
    if (theme) { changes.theme = theme; onTheme(theme); }
    store.patch(changes);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no encontrado' });
};
