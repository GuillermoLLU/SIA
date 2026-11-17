// Una nota plegada de una sola frase (nt-short, notes-html.js) que cabe entera en
// su línea no se despliega: sin icono ni clic, que no hay nada más que ver. Si su
// frase no cabe y se corta con «…», sí. Eso solo se sabe midiendo en pantalla: se
// mira al pintar las notas y al cambiar de tamaño.
const FOLDS = { 'data-note-fold': '', role: 'button', tabindex: '0', 'aria-expanded': 'false' };

export const fitNotes = (scope) => scope?.querySelectorAll('.nt-short').forEach((box) => {
  const first = box.querySelector('.nt-first');
  if (!first?.clientWidth) return; // sin pintar (en una pestaña oculta): se mira al enseñarla
  const whole = first.scrollWidth <= first.clientWidth;
  box.classList.toggle('nt-whole', whole);
  for (const [k, v] of Object.entries(FOLDS)) { if (whole) box.removeAttribute(k); else box.setAttribute(k, v); }
});
