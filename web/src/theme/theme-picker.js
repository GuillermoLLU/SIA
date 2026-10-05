// Configuración → Apariencia: los temas en dos bloques (claros y oscuros),
// cada uno con una miniatura de la app en sus colores. Pulsar uno lo aplica
// (onPick); mark(id) señala el que está puesto. Solo DOM.
import { THEMES } from './themes.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Miniatura: barra lateral, una tarjeta con dos líneas de texto y un botón de acento.
const preview = ({ ui }) => `
  <span class="tp" style="background:${ui.bg};border-color:${ui.border}">
    <span class="tp-side" style="background:${ui.surface};border-color:${ui.border}"></span>
    <span class="tp-card" style="background:${ui.surface};border-color:${ui.border}">
      <span class="tp-line" style="background:${ui.text}"></span>
      <span class="tp-line short" style="background:${ui.textLow}"></span>
      <span class="tp-btn" style="background:${ui.accent}"></span>
    </span>
  </span>`;

export const renderThemePicker = (root, { onPick }) => {
  const block = (title, list) => `<section class="settings-section"><h3>${title}</h3><div class="theme-grid">${list.map((t) => `
    <button type="button" class="theme-card" data-theme="${esc(t.id)}" aria-pressed="false">${preview(t)}<span class="tc-name">${esc(t.label)}</span></button>`).join('')}</div></section>`;
  root.innerHTML = block('Claros', THEMES.filter((t) => !t.dark)) + block('Oscuros', THEMES.filter((t) => t.dark));
  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-theme]');
    if (card) onPick(card.dataset.theme);
  });
  return {
    mark: (id) => root.querySelectorAll('[data-theme]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.theme === id))),
  };
};
