// Los dos temas de SIA, los de la guía de Inditex (Sewing IOP DS). Cada uno
// pinta la interfaz (ui → variables CSS); solo cambian colores, nunca la
// tipografía.

export const THEMES = [
  {
    // Sewing IOP DS, tema claro: negro sobre blanco y gris muy claro
    id: 'light', label: 'Claro',
    ui: { bg: '#f7f7f7', surface: '#ffffff', border: '#e3e3e3', text: '#000000', textLow: '#757575', accent: '#000000', scrollbar: '#b3b3b3', focus: '#0170e9', danger: '#c93b3a', warning: '#b65321', success: '#178329', series2: '#1b5ea7' },
  },
  {
    // Basado en Sewing IOP DS, tema oscuro, pero más suave: negro carbón, bordes discretos y blanco roto
    id: 'dark', label: 'Oscuro', dark: true,
    ui: { bg: '#121212', surface: '#1b1b1b', border: '#363636', text: '#ededed', textLow: '#a3a3a3', accent: '#ededed', scrollbar: '#5e5e5e', focus: '#0084ff', danger: '#fe9693', warning: '#feb48d', success: '#9df5ab', series2: '#438fff' },
  },
];

// El tema de un id; uno desconocido (p. ej. de una versión anterior) da el claro.
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Lo que hace el botón claro/oscuro: el otro tema.
export const toggledTheme = (id) => THEMES.find((t) => !t.dark === !!themeById(id).dark);
