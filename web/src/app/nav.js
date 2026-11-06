// La navegación, sus reglas (sin DOM): qué icono ve cada persona, si lleva la barra de arriba
// en vez de la lateral y con qué vista se abre. Las vistas las decide la instancia
// (platform.users.views; el Chat, siempre); Laboratorio, Administración y Enlaces exigen además
// que la base las abra con la clave de poder de quien ha iniciado sesión (perms).

export const viewsOf = (user) => (user?.views || []);
export const canView = (user, view) => viewsOf(user).includes(view);

// Lo que depende de la base (el icono del Laboratorio, la caja Administración y la columna de
// enlaces, con editar si la clave lo permite): perms = { lab, admin, links, owner… } |
// null (sin base, o sin clave que la abra); access = lo que respondió el
// bridge (null sin base).
export const baseNav = (user, access) => {
  const perms = access?.perms || null;
  return {
    lab: canView(user, 'lab') && !!perms?.lab,
    admin: canView(user, 'admin') && !!perms?.admin,
    links: canView(user, 'links') && !!access,
    linksEdit: canView(user, 'links') && !!perms?.links,
  };
};

// Los paneles (Issues, Backlog, Equipo soporte, Métricas): una vista cada uno, sin
// base. Equipo soporte es un solo icono para sus dos caras (métricas y
// gestión de personas): sale si se tiene cualquiera de las dos.
export const panelNav = (user, name) => (name === 'work' ? canView(user, 'work') || canView(user, 'people') : canView(user, name));

// Quien solo tiene la mesa, el Chat (que es de todos) y los enlaces (que están en Configuración)
// no lleva barra lateral, sino la de arriba.
export const usesTopbar = (user) => canView(user, 'issues') && viewsOf(user).every((v) => ['issues', 'chat', 'links'].includes(v));

// Las vistas que entran con el cruce (ui/crossfade.js): la mesa y el Chat, entre las que se va y se viene.
export const crossesTo = (view) => view === 'chat' || view === 'issues';

// La vista con la que se abre la app: la mesa de trabajo para quien la tiene; si no, el Chat.
export const firstView = (user) => (canView(user, 'issues') ? 'issues' : 'chat');

// El icono de Equipo soporte abre las métricas del equipo o, si solo se gestiona, la gestión de personas.
export const teamView = (user) => (canView(user, 'work') ? 'work' : 'users');
