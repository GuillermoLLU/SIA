// Permisos de una clave de poder (dominio, sin E/S).
//
// Las claves viven EN la base (tabla power_keys) y es la base quien las
// comprueba: viajan en la cabecera x-sia-power y sia_status() dice qué
// abre la que viaja (`me`). Aquí solo se normaliza esa respuesta.
//   lab    = Laboratorio (skills de proyecto)
//   admin  = Administración (proyectos)
//   links  = editar enlaces rápidos
// Las skills comunes son cosa del dueño, no un permiso. La fila owner=true
// lo abre todo y no se edita ni se revoca desde la app.
const PERMS = ['lab', 'admin', 'links'];
const ALL_PERMS = Object.fromEntries(PERMS.map((p) => [p, true]));
export const cleanPerms = (p) => Object.fromEntries(PERMS.map((k) => [k, !!p?.[k]]));

// { name, owner, lab, admin, links } a partir de una fila de
// power_keys (o del `me` de sia_status); null si no hay fila.
export const permsFromRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  return { name: String(row.name || ''), owner: !!row.owner, ...(row.owner ? ALL_PERMS : cleanPerms(row.perms)) };
};
