// /api/config: la config personal por la API, solo lo que la web lee y
// escribe (Jira, claves de GitHub y usuario de Snowflake). Sesiones y candado no salen ni
// entran por aquí: cada cosa tiene su ruta. Es de cada persona: sin gate.
//   GET  → { jira, github, snowflake, version }
//   PUT  { jira?, github?, snowflake? } → { ok }
import { cleanGithub, cleanJira, cleanSnowflake } from './config.js';

export const configRoutes = (store, { json, readBody, version }) => async (req, res) => {
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
      changes.snowflake = cleanSnowflake({ user: body.snowflake?.user, role: current.role, warehouse: current.warehouse });   // null: sin usuario
    }
    store.patch(changes);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no encontrado' });
};
