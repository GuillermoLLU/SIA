// Métricas: la pantalla con una caja por cara (Equipo, Servicio, Backlog) al pulsar su icono del dock.
import { VIEWS } from '../users/views.js';

// boxes: [{ name, label }] (nav.js hubBoxes) · go(name): abrir esa vista
export const mountHub = (el, { boxes, go }) => {
  el.innerHTML = boxes.length
    ? `<div class="hub-boxes">${boxes.map((b) => `<button type="button" class="settings-box" data-hub="${b.name}">${VIEWS.find((v) => v.id === b.name).icon}<span>${b.label}</span></button>`).join('')}</div>`
    : '<p class="hub-none">No tienes vistas asignadas. Pídelas a quien gestiona el equipo.</p>';   // sin Chat, ni mesa, ni Métricas
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-hub]'); if (b) go(b.dataset.hub); });
};
