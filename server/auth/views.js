// Vistas: lo que cada persona puede ver y hacer en SIA (el Chat, siempre).
// Las decide la base de la instancia (platform.users.views); el rol solo
// pone las de partida. Aquí, qué vista exige cada ruta de la API: la web
// esconde lo que no toca y el bridge lo rechaza igual.

export const VIEWS = ['issues', 'backlog', 'work', 'metrics', 'links', 'lab', 'admin', 'people'];

export const can = (user, view) => Array.isArray(user?.views) && user.views.includes(view);

// Vistas que abren una ruta (basta con una), o null si basta la sesión.
// `parts` = la ruta partida por '/', con parts[0] = 'api'.
export const viewsForRoute = ([, area, sub], method) => {
  if (area === 'admin' && sub !== 'check') return ['admin'];
  if (area === 'links') return ['links'];
  if (area === 'issues') return ['issues'];
  if (area === 'backlog') return ['backlog'];
  // los datos de las Métricas los lee también el Panel de trabajo; cargarlos, solo desde Métricas
  if (area === 'metrics') return method === 'GET' && !sub ? ['metrics', 'work'] : ['metrics'];
  if (['drafts', 'groups'].includes(area) || (area === 'skills' && (method === 'DELETE' || sub === 'publish'))) return ['lab'];
  if (area === 'users' || area === 'knowledge') return ['people'];
  return null;
};

export const allowed = (user, parts, method) => {
  const need = viewsForRoute(parts, method);
  return !need || need.some((v) => can(user, v));
};
