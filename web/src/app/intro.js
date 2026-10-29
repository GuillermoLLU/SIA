// El arranque de la app, por fases: primero el saludo de la portada del Chat,
// solo, en el centro; después aparece el campo de la pregunta; y por último
// entra la barra lateral deslizándose desde la izquierda. Se hace con clases
// en <body>: `booting` desde que carga la página, `asking` cuando toca el
// campo y `ready` cuando toca la barra (y se quita `booting`). Si al cargar ya
// hay un chat vivo (vuelve la terminal), o el bridge no contesta, no hay
// portada que esperar y la barra entra al momento. Y si quien arranca lleva
// el ratón a la zona de la barra, no se le hace esperar: entra ya, con su
// animación, y el campo aparece con ella.
export const HERO_STEPS = [[750, 'asking'], [1500, 'ready']]; // ms desde que pinta el saludo
export const EDGE_PX = 56; // el ancho de la barra lateral (.sidebar)

// el ratón está donde estaría la barra
export const wantsSidebar = (x, edge = EDGE_PX) => x >= 0 && x < edge;

// Saltarse las fases que falten: todo a la vez. → true si había algo que adelantar.
export const hurry = (body = document.body) => {
  if (!body.classList.contains('booting')) return false;
  body.classList.add('asking', 'ready');
  body.classList.remove('booting');
  return true;
};

export const startIntro = (body = document.body, doc = document) => {
  body.classList.add('booting');
  const onMove = (e) => { if (wantsSidebar(e.clientX)) { hurry(body); doc.removeEventListener('mousemove', onMove); } };
  doc.addEventListener('mousemove', onMove);
};

// first: qué pinta primero el Chat ('hero' o 'chat') → [ms, clase] en orden
export const revealPlan = (first) => (first === 'hero' ? HERO_STEPS : [[0, 'ready']]);

// Cada paso llega a su hora; si el ratón ya adelantó la barra (hurry), no queda nada que hacer.
export const reveal = (first, body = document.body) => {
  if (!body.classList.contains('booting')) return; // ya revelado
  for (const [ms, cls] of revealPlan(first)) {
    setTimeout(() => { body.classList.add(cls); if (cls === 'ready') body.classList.remove('booting'); }, ms);
  }
};
