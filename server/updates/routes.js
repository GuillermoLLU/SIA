// GET /api/version → { current, latest, url, notes, updateAvailable }
// `db`: el cliente de la base de conocimiento (app_version; sin tabla o sin
// red, sin aviso).
import { versionInfo } from './updates.js';

export const updatesRoutes = (current, { json }) => async (req, res, db) => {
  if (req.method !== 'GET') return json(res, 404, { error: 'no encontrado' });
  let latest = null;
  try {
    const { data } = await db.from('app_version').select('version, url, notes').eq('id', 1).single();
    if (data) latest = data;
  } catch { /* sin aviso */ }
  return json(res, 200, versionInfo(current, latest));
};
