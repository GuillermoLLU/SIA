// Temas corporativos de SIA: el claro (la estética de Inditex: gris claro,
// blanco y negro, nada más) y su espejo oscuro. Cada tema pinta la interfaz
// (ui → variables CSS) y el terminal (term → colores de xterm); solo cambian
// colores, nunca la tipografía.

const term = (bg, fg, sel, ansi) => ({
  background: bg, foreground: fg, cursor: fg, selectionBackground: sel,
  black: ansi[0], red: ansi[1], green: ansi[2], yellow: ansi[3],
  blue: ansi[4], magenta: ansi[5], cyan: ansi[6], white: ansi[7],
  brightBlack: ansi[8], brightRed: ansi[1], brightGreen: ansi[2],
  brightYellow: ansi[3], brightBlue: ansi[4], brightMagenta: ansi[5],
  brightCyan: ansi[6], brightWhite: ansi[7],
});

export const THEMES = [
  {
    id: 'light', label: 'Claro',
    ui: { bg: '#f2f2f2', surface: '#ffffff', border: '#dcdcdc', text: '#111111', textLow: '#6f6f6f', accent: '#111111', scrollbar: '#c8c8c8' },
    term: term('#f2f2f2', '#111111', '#d6d6d6',
      ['#111111', '#c62828', '#2e7d32', '#a65f00', '#1a56b0', '#6a1b9a', '#00838f', '#e6e6e6', '#6f6f6f']),
  },
  {
    // el claro invertido: mismos contrastes, con los colores ANSI vivos que
    // se leen sobre fondo oscuro
    id: 'dark', label: 'Oscuro',
    ui: { bg: '#0d0d0d', surface: '#000000', border: '#232323', text: '#eeeeee', textLow: '#909090', accent: '#eeeeee', scrollbar: '#373737' },
    term: term('#0d0d0d', '#eeeeee', '#292929',
      ['#2a2a2a', '#ef5350', '#66bb6a', '#ffb74d', '#64b5f6', '#ba68c8', '#4dd0e1', '#eeeeee', '#909090']),
  },
];

const DEFAULT_THEME = THEMES[0];

// El tema de un id; uno desconocido (p. ej. de una versión anterior) da el claro.
export const themeById = (id) => THEMES.find((t) => t.id === id) || DEFAULT_THEME;
