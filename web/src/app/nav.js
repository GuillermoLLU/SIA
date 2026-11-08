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

// Los paneles (Issues, Backlog, Equipo soporte, Métricas): una vista cada uno, sin base.
// La gestión de personas (people) no es un panel: es la caja Equipo de Configuración.
export const panelNav = (user, name) => canView(user, name);

// Quien solo tiene la mesa, el Chat (que es de todos) y los enlaces (que están en Configuración)
// no lleva barra lateral, sino la de arriba.
export const usesTopbar = (user) => canView(user, 'issues') && viewsOf(user).every((v) => ['issues', 'chat', 'links'].includes(v));


// A dónde lleva el dock, en su orden: la mesa, el Backlog y cada cara de Métricas por separado
// (con las dos, el selector hace falta para cambiar de una a otra).
export const destinations = (user) => [
  ...['issues', 'backlog'].filter((v) => canView(user, v)),
  ...hubBoxes(user).map((h) => h.name),
];
// Con un solo destino no hay dock: la vista y, arriba, el Chat.
export const showsDock = (user) => destinations(user).length > 1;

// La vista con la que se abre la app: la primera de las que lleva el dock (el Chat es auxiliar, va
// arriba); de Métricas, directamente la única cara que se tenga, o su selector si tiene las dos.
// Sin ninguna, el Chat; sin Chat tampoco, Métricas con el aviso de que no tiene vistas.
export const firstView = (user) => {
  const [first, ...rest] = destinations(user);
  if (!first) return canView(user, 'chat') ? 'chat' : 'hub';
  return inHub(first) && rest.length ? 'hub' : first;
};

// Métricas, un solo icono con dos caras: al pulsarlo, una caja por cada una que se tenga.
// «Equipo» abre las métricas del equipo; «Servicio», las del servicio. El Backlog tiene su icono.
export const HUB = [
  { name: 'work', label: 'Equipo' },
  { name: 'metrics', label: 'Servicio' },
];
export const hubBoxes = (user) => HUB.filter((h) => panelNav(user, h.name));
export const inHub = (view) => view === 'hub' || HUB.some((h) => h.name === view);

// El nombre de la sección en la que se está, en el centro de la barra de arriba.
const VIEW_TITLES = { chat: 'Chat', issues: 'Mesa de trabajo', hub: 'Métricas', work: 'Métricas del equipo', metrics: 'Métricas del servicio', backlog: 'Backlog', lab: 'Skills' };
export const viewTitle = (view) => VIEW_TITLES[view] || '';

// El Chat va por encima de todo: arriba, en lugar del botón de la IA, el de volver a la vista de la
// que se vino (con su icono). → la vista a la que se vuelve, o null si no se vino de ninguna.
export const chatBackTo = (from) => (from && from !== 'chat' ? from : null);
// El icono de una vista (users/views.js); el selector de Métricas lleva el de Métricas.
export const iconOf = (view) => (view === 'hub' ? 'metrics' : view);
