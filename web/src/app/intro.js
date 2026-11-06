// El arranque de la app, por fases: primero el saludo de la portada del Chat,
// solo, en el centro; después aparece el campo de la pregunta; y por último
// entra la barra lateral deslizándose desde la izquierda. Se hace con clases
// en <body>: `booting` desde que carga la página, `asking` cuando toca el
// campo y `ready` cuando toca la barra (y se quita `booting`). Si al cargar ya
// hay un chat vivo (vuelve la terminal), o el bridge no contesta, no hay
// portada que esperar y la barra entra al momento. Si se abre en la mesa de
// trabajo, entra primero la barra, sin esperar a los datos, y después la mesa
// (revealDesk). Y si quien arranca lleva el ratón a la zona de la barra, no se
// le hace esperar: entra ya, con su animación, y el campo aparece con ella.
export const HERO_STEPS = [[750, 'asking'], [1500, 'ready']]; // ms desde que pinta el saludo
const NAV_FIRST_MS = 450; // lo que la barra le saca a la mesa: su caja ya ha llegado y aún asoma su contenido
export const EDGE_PX = 72; // donde está la barra lateral (.sidebar): su ancho y su margen, con holgura

// el ratón está donde estaría la barra
export const wantsSidebar = (x, edge = EDGE_PX) => x >= 0 && x < edge;

// Saltarse las fases que falten: todo a la vez. → true si había algo que adelantar.
export const hurry = (body = document.body) => {
  if (!body.classList.contains('booting')) return false;
  body.classList.add('asking', 'ready');
  body.classList.remove('booting');
  return true;
};

// Se escucha el ratón solo mientras dura el arranque: en cuanto termina (por el
// ratón o por sus fases), el oyente se quita.
export const startIntro = (body = document.body, doc = document) => {
  body.classList.add('booting');
  const onMove = (e) => {
    if (wantsSidebar(e.clientX)) hurry(body);
    if (!body.classList.contains('booting')) doc.removeEventListener('mousemove', onMove);
  };
  doc.addEventListener('mousemove', onMove);
};

// first: qué se pinta primero ('hero' o 'chat') → [ms, clase] en orden
export const revealPlan = (first) => (first === 'hero' ? HERO_STEPS : [[0, 'ready']]);

// Cada paso llega a su hora; si el ratón ya adelantó la barra (hurry), no queda nada que hacer.
export const reveal = (first, body = document.body) => {
  if (!body.classList.contains('booting')) return; // ya revelado
  for (const [ms, cls] of revealPlan(first)) {
    setTimeout(() => { body.classList.add(cls); if (cls === 'ready') body.classList.remove('booting'); }, ms);
  }
};

// La mesa: la barra entra ya; mientras dura `nav-first`, la cascada de la mesa espera en su inicio.
export const revealDesk = (body = document.body) => {
  hurry(body);
  body.classList.add('nav-first');
  setTimeout(() => body.classList.remove('nav-first'), NAV_FIRST_MS);
};
