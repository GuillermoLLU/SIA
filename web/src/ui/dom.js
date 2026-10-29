// Piezas de DOM que comparten varias vistas.

// Aviso temporal abajo a la derecha: toast(texto) para los éxitos breves y
// toast.error(texto) para lo que ha fallado, en rojo para que no se confunda.
export const createToast = (el) => {
  let timer = null;
  const show = (text, ms, error) => {
    el.textContent = text;
    el.classList.toggle('error', error);
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { el.hidden = true; }, ms);
  };
  const toast = (text, ms = 3500) => show(text, ms, false);
  toast.error = (text, ms = 5000) => show(text, ms, true);
  return toast;
};

// Línea de estado bajo un formulario de Configuración: texto y, si lo hay, su color (ok / bad).
export const setStatus = (el, text, cls = '') => { el.textContent = text; el.className = `settings-status${cls ? ` ${cls}` : ''}`; };

/* Estado vacío de una vista (sin skills, sin enlaces): icono, una frase y,
   debajo, la card de crear — la misma «+» que después encabeza la rejilla, para
   que crear lo primero y crear lo siguiente sea el mismo gesto. `action` es
   opcional: quien no puede crear solo ve el mensaje. */
export const emptyState = (iconSvg, text, action = null) => {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = iconSvg;
  box.appendChild(Object.assign(document.createElement('p'), { textContent: text }));
  if (action) box.appendChild(action);
  return box;
};
