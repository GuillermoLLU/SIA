// La barra lateral, sus reglas (sin DOM): qué icono ve cada persona. Las
// vistas las decide la instancia (platform.users.views; el Chat, siempre);
// Laboratorio, Administración y Enlaces exigen además que la base las abra con
// la clave de poder de quien ha iniciado sesión (perms).

export const viewsOf = (user) => (user?.views || []);
export const canView = (user, view) => viewsOf(user).includes(view);

// Lo que depende de la base (los iconos y la pestaña Administración): perms = { lab, admin, links, owner… } |
// null (sin base, o sin clave que la abra); access = lo que respondió el
// bridge (null sin base).
export const baseNav = (user, access) => {
  const perms = access?.perms || null;
  return {
    lab: canView(user, 'lab') && !!perms?.lab,
    admin: canView(user, 'admin') && !!perms?.admin,
    links: canView(user, 'links') && !!access,
  };
};

// Los paneles (Issues, Backlog, Equipo soporte, Métricas): una vista cada uno, sin
// base. Equipo soporte es un solo icono para sus dos caras (métricas y
// gestión de personas): sale si se tiene cualquiera de las dos.
export const panelNav = (user, name) => (name === 'work' ? canView(user, 'work') || canView(user, 'people') : canView(user, name));

// El icono de Equipo soporte abre las métricas del equipo o, si solo se gestiona, la gestión de personas.
export const teamView = (user) => (canView(user, 'work') ? 'work' : 'users');
