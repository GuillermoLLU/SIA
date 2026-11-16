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

// Métricas, un solo icono con dos caras: «Equipo» abre las métricas del equipo; «Servicio», las del
// servicio. Con las dos, el icono lleva a un selector con una caja por cara (app/hub.js); con una,
// directamente a ella. La gestión de personas (people) no es una cara: es la caja Equipo de
// Configuración.
const HUB = [
  { name: 'work', label: 'Equipo' },
  { name: 'metrics', label: 'Servicio' },
];
export const hubBoxes = (user) => HUB.filter((h) => canView(user, h.name));
export const inHub = (view) => view === 'hub' || HUB.some((h) => h.name === view);
export const hubTarget = (user) => { const boxes = hubBoxes(user); return boxes.length === 1 ? boxes[0].name : 'hub'; };

// A dónde lleva el dock, en su orden: la mesa, el Backlog y cada cara de Métricas por separado
// (con las dos, el selector hace falta para cambiar de una a otra).
export const destinations = (user) => [
  ...['issues', 'backlog'].filter((v) => canView(user, v)),
  ...hubBoxes(user).map((h) => h.name),
];
// Con un solo destino no hay dock: la vista y, arriba, el Chat.
export const showsDock = (user) => destinations(user).length > 1;
// Sus iconos: { key (el botón), icon (de users/views.js), view (a dónde lleva) }, solo los que tiene
export const dockItems = (user) => [
  { key: 'issues', icon: 'issues', view: 'issues', on: canView(user, 'issues') },
  { key: 'backlog', icon: 'backlog', view: 'backlog', on: canView(user, 'backlog') },
  { key: 'hub', icon: 'metrics', view: hubTarget(user), on: hubBoxes(user).length > 0 },
].filter((d) => d.on).map(({ on, ...d }) => d);
// El icono del dock que se marca en cada vista: el de Métricas, con su selector y sus dos caras
export const dockOf = (view) => (inHub(view) ? 'hub' : view);

// La barra de arriba es de todos. Quien solo tiene la mesa (con el Chat y los enlaces, que están
// en Configuración) la lleva flotando sobre la vista; los demás, con la app empezando debajo
// (body.brand-nav, style.css).
export const usesTopbar = (user) => canView(user, 'issues') && viewsOf(user).every((v) => ['issues', 'chat', 'links'].includes(v));

// La vista con la que se abre la app: la primera de las que lleva el dock (el Chat es auxiliar, va
// arriba); de Métricas, directamente la única cara que se tenga, o su selector si tiene las dos.
// Sin ninguna, el Chat; sin Chat tampoco, Métricas con el aviso de que no tiene vistas.
export const firstView = (user) => {
  const [first] = destinations(user);
  if (!first) return canView(user, 'chat') ? 'chat' : 'hub';
  return inHub(first) ? hubTarget(user) : first;
};

// El nombre de la sección en la que se está, en el centro de la barra de arriba.
const VIEW_TITLES = { chat: 'Chat', issues: 'Mesa de trabajo', hub: 'Métricas', work: 'Métricas del equipo', metrics: 'Métricas del servicio', backlog: 'Backlog', lab: 'Skills' };
export const viewTitle = (view) => VIEW_TITLES[view] || '';

// El Chat va por encima de todo: arriba, en lugar del botón de la IA, el de volver a la vista de la
// que se vino. Al pasar de `from` a `to`, a cuál se vuelve: al entrar al Chat desde otra vista, esa;
// el editor de skills no es un destino (su catálogo está en Configuración), así que al volver de él
// se queda la de antes.
export const nextBackTo = (prev, from, to) => (to === 'chat' && from && from !== 'chat' && from !== 'lab' ? from : prev);
// El icono de una vista (users/views.js); el selector de Métricas lleva el de Métricas.
export const iconOf = (view) => (view === 'hub' ? 'metrics' : view);
