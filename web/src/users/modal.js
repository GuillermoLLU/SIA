// Modales apilables de la vista Personas: uno se abre encima de otro (el de
// una base sobre el de alta) y cerrar quita el de arriba. Escape (la pila de
// ui/dialog.js) y un clic fuera también cierran el de arriba.
import { onEscape } from '../ui/dialog.js';

const root = () => {
  let el = document.getElementById('people-modals');
  if (!el) { el = document.createElement('div'); el.id = 'people-modals'; document.body.appendChild(el); }
  return el;
};
const topModal = () => root().lastElementChild;

export const closeModal = () => { const top = topModal(); if (top) { top.offEscape(); top.remove(); } };

// → el elemento del modal (para rellenarlo y cablearlo).
export const openModal = ({ title, lead = '', body = '', foot = '', wide = false }) => {
  const scrim = document.createElement('div');
  scrim.className = 'pp-scrim';
  scrim.innerHTML = `<div class="pp-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <div class="pp-mh"><div><h3></h3><p></p></div></div>
    <div class="pp-mb">${body}</div><div class="pp-mf">${foot}</div></div>`;
  scrim.querySelector('h3').textContent = title;
  const p = scrim.querySelector('.pp-mh p');
  if (lead) p.textContent = lead; else p.remove();
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) closeModal(); });
  scrim.offEscape = onEscape(closeModal);
  root().appendChild(scrim);
  scrim.querySelector('input, [aria-checked], button')?.focus();
  return scrim.querySelector('.pp-modal');
};
