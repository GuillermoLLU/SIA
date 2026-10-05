// Modales apilables de la vista Personas: uno se abre encima de otro (el de
// una base sobre el de alta) y cerrar quita el de arriba. Escape y un clic
// fuera también cierran el de arriba.

const root = () => {
  let el = document.getElementById('people-modals');
  if (!el) { el = document.createElement('div'); el.id = 'people-modals'; document.body.appendChild(el); }
  return el;
};
const topModal = () => root().lastElementChild;

export const closeModal = () => topModal()?.remove();

// → el elemento del modal (para rellenarlo y cablearlo).
export const openModal = ({ title, lead = '', icon = '', body = '', foot = '', wide = false }) => {
  const scrim = document.createElement('div');
  scrim.className = 'pp-scrim';
  scrim.innerHTML = `<div class="pp-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <div class="pp-mh">${icon ? `<span class="pp-mh-ico">${icon}</span>` : ''}<div><h3></h3><p></p></div></div>
    <div class="pp-mb">${body}</div><div class="pp-mf">${foot}</div></div>`;
  scrim.querySelector('h3').textContent = title;
  const p = scrim.querySelector('.pp-mh p');
  if (lead) p.textContent = lead; else p.remove();
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) closeModal(); });
  root().appendChild(scrim);
  scrim.querySelector('input, [aria-checked], button')?.focus();
  return scrim.querySelector('.pp-modal');
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && topModal()) { e.stopPropagation(); closeModal(); }
}, true);
