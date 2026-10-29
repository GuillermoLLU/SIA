// El arranque de la app, en dos tiempos: primero el saludo de la portada del
// Chat, solo, en el centro; después entra la barra lateral deslizándose desde
// la izquierda y aparece el campo de la pregunta. Se hace con dos clases en
// <body>: `booting` desde que carga la página y `ready` cuando toca revelar
// el resto. Si al cargar ya hay un chat vivo (vuelve la terminal), no hay
// saludo que esperar y se revela al momento.
export const GREET_MS = 750;

export const startIntro = (body = document.body) => body.classList.add('booting');

// first: qué pinta primero el Chat ('hero' o 'chat') → cuánto esperar
export const revealDelay = (first) => (first === 'hero' ? GREET_MS : 0);

export const reveal = (first, body = document.body) => {
  if (!body.classList.contains('booting')) return; // ya revelado
  setTimeout(() => { body.classList.remove('booting'); body.classList.add('ready'); }, revealDelay(first));
};
