// Los dos temas de SIA, los de la guía de Inditex (Sewing IOP DS). Cada uno pinta la
// interfaz (ui → variables CSS) y el terminal (term → colores de xterm); solo cambian
// colores, nunca la tipografía.

const term = (bg, fg, cursor, sel, ansi) => ({
  background: bg, foreground: fg, cursor, selectionBackground: sel,
  black: ansi[0], red: ansi[1], green: ansi[2], yellow: ansi[3],
  blue: ansi[4], magenta: ansi[5], cyan: ansi[6], white: ansi[7],
  brightBlack: ansi[8], brightRed: ansi[1], brightGreen: ansi[2],
  brightYellow: ansi[3], brightBlue: ansi[4], brightMagenta: ansi[5],
  brightCyan: ansi[6], brightWhite: ansi[7],
});

export const THEMES = [
  {
    // Sewing IOP DS, tema claro: negro sobre blanco y gris muy claro
    id: 'light', label: 'Claro',
    ui: { bg: '#f7f7f7', surface: '#ffffff', border: '#e3e3e3', text: '#000000', textLow: '#757575', accent: '#000000', scrollbar: '#b3b3b3', focus: '#0170e9', danger: '#c93b3a', warning: '#b65321', success: '#178329', series2: '#1b5ea7' },
    term: term('#ffffff', '#000000', '#000000', '#ededed',
      ['#000000', '#c93b3a', '#178329', '#b65321', '#1b5ea7', '#6b3daf', '#0c7878', '#e3e3e3', '#757575']),
  },
  {
    // Basado en Sewing IOP DS, tema oscuro, pero más suave: negro carbón, bordes discretos y blanco roto
    id: 'dark', label: 'Oscuro', dark: true,
    ui: { bg: '#121212', surface: '#1b1b1b', border: '#363636', text: '#ededed', textLow: '#a3a3a3', accent: '#ededed', scrollbar: '#5e5e5e', focus: '#0084ff', danger: '#fe9693', warning: '#feb48d', success: '#9df5ab', series2: '#438fff' },
    term: term('#1b1b1b', '#ededed', '#ededed', '#434343',
      ['#000000', '#fe9693', '#9df5ab', '#feb48d', '#89c1fe', '#d4bbfb', '#80e8d1', '#ffffff', '#c4c4c4']),
  },
];

// El tema de un id; uno desconocido (p. ej. de una versión anterior) da el claro.
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// Lo que hace el botón claro/oscuro: el otro tema.
export const toggledTheme = (id) => THEMES.find((t) => !t.dark === !!themeById(id).dark);
