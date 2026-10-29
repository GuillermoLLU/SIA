// El arranque de la app, por fases: primero el saludo de la portada del Chat,
// solo, en el centro; después aparece el campo de la pregunta; y por último
// entra la barra lateral deslizándose desde la izquierda. Se hace con clases
// en <body>: `booting` desde que carga la página, `asking` cuando toca el
// campo y `ready` cuando toca la barra (y se quita `booting`). Si al cargar ya
// hay un chat vivo (vuelve la terminal), no hay portada que esperar y la barra
// entra al momento.
export const STEPS = { asking: 750, ready: 1500 }; // ms desde que pinta el saludo

export const startIntro = (body = document.body) => body.classList.add('booting');

// first: qué pinta primero el Chat ('hero' o 'chat') → [ms, clase] en orden
export const revealPlan = (first) => (first === 'hero' ? Object.entries(STEPS).map(([cls, ms]) => [ms, cls]) : [[0, 'ready']]);

export const reveal = (first, body = document.body) => {
  if (!body.classList.contains('booting')) return; // ya revelado
  for (const [ms, cls] of revealPlan(first)) {
    setTimeout(() => { body.classList.add(cls); if (cls === 'ready') body.classList.remove('booting'); }, ms);
  }
};
