// Aplicar un tema: las variables CSS de la interfaz y una copia en
// localStorage con la que las pantallas de arranque (candado, inicio de
// sesión) salen ya con sus colores, antes de que exista la app.
import { themeById, toggledTheme } from './themes.js';

const THEME_KEY = 'sia-theme';
const UI_KEY = 'sia-theme-ui';

// Las variables CSS de la interfaz a partir de los colores de un tema.
export const uiVars = (ui) => ({
  '--bg': ui.bg, '--surface': ui.surface, '--border': ui.border, '--text': ui.text, '--text-low': ui.textLow, '--accent': ui.accent, '--scrollbar': ui.scrollbar,
  '--focus': ui.focus, '--danger': ui.danger, '--warning': ui.warning, '--success': ui.success, '--series2': ui.series2,
});
const paintVars = (root, ui) => {
  for (const [name, value] of Object.entries(uiVars(ui))) root.style.setProperty(name, value);
};

// Una pantalla que sale al arrancar lo hace antes de aplicar el tema: se
// adelantan sus colores (la copia que dejó apply) para que no aparezca con los
// de primer pintado.
export const paintCachedTheme = () => {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (ui) paintVars(document.documentElement, ui);
  } catch { /* sin copia: colores por defecto */ }
};

// El tema en marcha: aplicarlo y el botón claro/oscuro.
export const mountTheme = ({ toggleEl }) => {
  const root = document.documentElement;
  let currentId = themeById(localStorage.getItem(THEME_KEY)).id;
  const apply = (id) => {
    const t = themeById(id);
    currentId = t.id;
    paintVars(root, t.ui);
    localStorage.setItem(THEME_KEY, t.id);
    localStorage.setItem(UI_KEY, JSON.stringify(t.ui));
    const next = t.dark ? 'Modo claro' : 'Modo oscuro';
    toggleEl.title = next;
    toggleEl.setAttribute('aria-label', next);
    toggleEl.dataset.dark = String(!!t.dark);
  };
  toggleEl.addEventListener('click', () => apply(toggledTheme(currentId).id));
  apply(currentId);
};
