// La navegación, sus reglas (sin DOM): qué iconos lleva el dock de cada persona, cómo va la barra
// de arriba, con qué vista se abre la app y a cuál se vuelve desde el Chat. Las vistas las decide
// la instancia (platform.users.views; el Chat también se da o se quita); Laboratorio,
// Administración y Enlaces exigen además que la base las abra con la clave de poder de quien ha
// iniciado sesión (perms).

export const viewsOf = (user) => (user?.views || []);
export const canView = (user, view) => viewsOf(user).includes(view);

// Lo que depende de la base (el catálogo de skills, la caja Administración y la columna de
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

// A dónde lleva el dock, en su orden: la mesa, el Backlog y Métricas (Equipo soporte es una de sus
// pestañas, no una vista aparte). La gestión de personas (people) es la caja Equipo de Configuración.
const DOCK = ['issues', 'backlog', 'metrics'];
export const destinations = (user) => DOCK.filter((v) => canView(user, v));
// Con un solo destino no hay dock: la vista y, arriba, el Chat.
export const showsDock = (user) => destinations(user).length > 1;
// Sus iconos: { key (el botón), icon (de users/views.js), view (a dónde lleva) }, solo los que tiene
export const dockItems = (user) => destinations(user).map((v) => ({ key: v, icon: v, view: v }));

// La barra de arriba es de todos. Quien solo tiene la mesa (con el Chat y los enlaces, que están
// en Configuración) la lleva flotando sobre la vista; los demás, con la app empezando debajo
// (body.brand-nav, style.css).
export const usesTopbar = (user) => canView(user, 'issues') && viewsOf(user).every((v) => ['issues', 'chat', 'links'].includes(v));

// La vista con la que se abre la app: la primera de las que lleva el dock (el Chat es auxiliar, va
// arriba). Sin ninguna, el Chat; sin Chat tampoco, el aviso de que no tiene vistas (none).
export const firstView = (user) => destinations(user)[0] || (canView(user, 'chat') ? 'chat' : 'none');

// El nombre de la sección en la que se está, en el centro de la barra de arriba.
const VIEW_TITLES = { chat: 'Chat', issues: 'Mesa de trabajo', metrics: 'Métricas', backlog: 'Backlog', lab: 'Skills' };
export const viewTitle = (view) => VIEW_TITLES[view] || '';

// El Chat va por encima de todo: arriba, en lugar del botón de la IA, el de volver a la vista de la
// que se vino. Al pasar de `from` a `to`, a cuál se vuelve: al entrar al Chat desde otra vista, esa;
// el editor de skills no es un destino (su catálogo está en Configuración), así que al volver de él
// se queda la de antes.
export const nextBackTo = (prev, from, to) => (to === 'chat' && from && from !== 'chat' && from !== 'lab' ? from : prev);
