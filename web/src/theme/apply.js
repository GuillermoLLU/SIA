// Aplicar un tema: las variables CSS de la interfaz, el tema de las
// terminales y una copia en localStorage con la que las pantallas de arranque
// (candado, inicio de sesión) salen ya con sus colores, antes de
// que exista la app.
import { themeById, toggledTheme, modeOf } from './themes.js';
import { renderThemePicker } from './theme-picker.js';

const THEME_KEY = 'sia-theme';
const UI_KEY = 'sia-theme-ui';

// Las variables CSS de la interfaz a partir de los colores de un tema.
export const uiVars = (ui) => ({
  '--bg': ui.bg, '--surface': ui.surface, '--border': ui.border, '--text': ui.text, '--text-low': ui.textLow, '--accent': ui.accent, '--scrollbar': ui.scrollbar,
});
const paintVars = (root, ui) => { for (const [k, v] of Object.entries(uiVars(ui))) if (v) root.style.setProperty(k, v); };

// Una pantalla que sale al arrancar lo hace antes de aplicar el tema: se
// adelantan sus colores (la copia que dejó apply) para que no aparezca con los
// de primer pintado.
export const paintCachedTheme = () => {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (ui) paintVars(document.documentElement, ui);
  } catch { /* sin copia: colores por defecto */ }
};

// El tema en marcha: aplicarlo, el selector (⚙️ → Apariencia) y el interruptor
// claro/oscuro. onTerm(term) recibe el tema de las terminales.
export const createThemeController = ({ toggleEl, pickerEl, onTerm }) => {
  const root = document.documentElement;
  let currentId = themeById(localStorage.getItem(THEME_KEY)).id;
  const picker = renderThemePicker(pickerEl, { onPick: (id) => apply(id) });
  // el último tema elegido de cada modo: a él salta el interruptor
  const prefs = () => ({ light: localStorage.getItem('sia-theme-light'), dark: localStorage.getItem('sia-theme-dark') });
  const apply = (id) => {
    const t = themeById(id);
    currentId = t.id;
    localStorage.setItem(`sia-theme-${modeOf(t)}`, t.id);
    paintVars(root, t.ui);
    onTerm(t.term); // el tema solo cambia colores; la fuente es siempre la misma
    localStorage.setItem(THEME_KEY, t.id);
    localStorage.setItem(UI_KEY, JSON.stringify(t.ui));
    toggleEl.querySelector('.sw').setAttribute('aria-checked', String(!!t.dark));
    picker.mark(t.id);
  };
  toggleEl.addEventListener('click', () => apply(toggledTheme(currentId, prefs()).id));
  apply(currentId);
  return { apply, current: () => themeById(currentId) };
};
