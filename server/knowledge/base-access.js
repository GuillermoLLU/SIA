// Lo que el conocimiento de la instancia necesita leer y escribir en la base
// de conocimiento con la clave del dueño: los grupos de acceso (uno por
// proyecto) y las claves de poder de las personas (power_keys). Viaja una
// clave de poder, así que va con el fetch de Node, con TLS verificado.
// `createClient`: el de supabase-js; `newId`: para las claves nuevas.
import { siaHeaders } from '../shared/credentials.js';
import { permsFromRow } from '../shared/perms.js';

export const createBaseAccess = ({ createClient, fetch, newId }) => {
  const db = ({ url, key, powerKey }) => createClient(url, key, { global: { fetch, headers: siaHeaders([], powerKey) }, auth: { persistSession: false } });

  // Antes de leer los grupos, la base dice qué abre esa clave (sia_status):
  // tiene que abrir la Administración. Si no, no da error, solo una lista vacía.
  const readGroups = async (conn) => {
    const c = db(conn);
    const { data: status, error: e1 } = await c.rpc('sia_status');
    if (e1 || !permsFromRow(status?.me)?.admin) throw new Error('esa clave de poder no abre la Administración de la base');
    const { data, error } = await c.from('access_groups').select('token, name').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  };

  // Solo el dueño gestiona claves, así que la de la instancia tiene que ser la suya.
  const keys = (conn) => db(conn).from('power_keys');
  const ok = (error) => { if (error) throw new Error(`La base no deja gestionar claves de poder (${error.message}): la instancia tiene que tener la clave del dueño.`); };
  const baseKeys = {
    async list(c) { const { data, error } = await keys(c).select('key, name').eq('owner', false); ok(error); return data; },
    async create(c, { name, perms }) { const key = newId(); const { error } = await keys(c).insert({ key, name, owner: false, perms }); ok(error); return key; },
    async update(c, key, { name, perms }) { const { data, error } = await keys(c).update({ name, perms }).eq('key', key).select('key'); ok(error); return data.length > 0; },
    async remove(c, key) { const { error } = await keys(c).delete().eq('key', key); ok(error); },
  };

  return { readGroups, baseKeys };
};
