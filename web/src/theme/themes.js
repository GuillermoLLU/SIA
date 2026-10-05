// Temas de SIA: claros y oscuros. Cada tema pinta la interfaz (ui → variables
// CSS) y el terminal (term → colores de xterm); solo cambian colores, nunca la
// tipografía. El interruptor Claro/Oscuro salta al tema preferido del otro
// modo (el último que se eligió de ese modo).

const term = (bg, fg, cursor, sel, ansi) => ({
  background: bg, foreground: fg, cursor, selectionBackground: sel,
  black: ansi[0], red: ansi[1], green: ansi[2], yellow: ansi[3],
  blue: ansi[4], magenta: ansi[5], cyan: ansi[6], white: ansi[7],
  brightBlack: ansi[8], brightRed: ansi[1], brightGreen: ansi[2],
  brightYellow: ansi[3], brightBlue: ansi[4], brightMagenta: ansi[5],
  brightCyan: ansi[6], brightWhite: ansi[7],
});

export const THEMES = [
  // ── Claros ──
  {
    // el de SIA: blanco roto, texto casi negro y un azul sobrio de acento
    id: 'light', label: 'SIA Claro',
    ui: { bg: '#f5f6f8', surface: '#ffffff', border: '#e1e4e8', text: '#1f2328', textLow: '#656d76', accent: '#2563eb', scrollbar: '#d0d5db' },
    term: term('#ffffff', '#1f2328', '#2563eb', '#dbe6fd',
      ['#1f2328', '#cf222e', '#1a7f37', '#9a6700', '#2563eb', '#8250df', '#1b7c83', '#d0d7de', '#656d76']),
  },
  {
    // gris claro, negro y nada más: la estética corporativa de Inditex
    id: 'inditex', label: 'Inditex',
    ui: { bg: '#f2f2f2', surface: '#ffffff', border: '#dcdcdc', text: '#111111', textLow: '#6f6f6f', accent: '#111111', scrollbar: '#c8c8c8' },
    term: term('#f2f2f2', '#111111', '#111111', '#d6d6d6',
      ['#111111', '#c62828', '#2e7d32', '#a65f00', '#1a56b0', '#6a1b9a', '#00838f', '#e6e6e6', '#6f6f6f']),
  },
  {
    id: 'github-light', label: 'GitHub Light',
    ui: { bg: '#ffffff', surface: '#f6f8fa', border: '#d0d7de', text: '#24292f', textLow: '#57606a', accent: '#0969da', scrollbar: '#d0d7de' },
    term: term('#ffffff', '#24292f', '#0969da', '#b6e3ff',
      ['#24292f', '#cf222e', '#116329', '#633c01', '#0969da', '#8250df', '#1b7c83', '#6e7781', '#57606a']),
  },
  {
    id: 'rose-pine-dawn', label: 'Rosé Pine Dawn',
    ui: { bg: '#faf4ed', surface: '#fffaf3', border: '#f2e9e1', text: '#575279', textLow: '#9893a5', accent: '#907aa9', scrollbar: '#dfdad9' },
    term: term('#faf4ed', '#575279', '#907aa9', '#dfdad9',
      ['#f2e9e1', '#b4637a', '#286983', '#ea9d34', '#56949f', '#907aa9', '#d7827e', '#575279', '#9893a5']),
  },
  {
    id: 'solarized-light', label: 'Solarized Light',
    ui: { bg: '#fdf6e3', surface: '#eee8d5', border: '#ddd6c1', text: '#586e75', textLow: '#93a1a1', accent: '#268bd2', scrollbar: '#ddd6c1' },
    term: term('#fdf6e3', '#586e75', '#268bd2', '#eee8d5',
      ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#93a1a1']),
  },
  {
    id: 'latte', label: 'Catppuccin Latte',
    ui: { bg: '#eff1f5', surface: '#e6e9ef', border: '#ccd0da', text: '#4c4f69', textLow: '#8c8fa1', accent: '#1e66f5', scrollbar: '#bcc0cc' },
    term: term('#eff1f5', '#4c4f69', '#1e66f5', '#bcc0cc',
      ['#5c5f77', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#acb0be', '#6c6f85']),
  },
  // ── Oscuros ──
  {
    // el de SIA: gris carbón (no negro puro), texto suave y el azul del claro
    // aclarado para que se lea sobre fondo oscuro
    id: 'dark', label: 'SIA Oscuro', dark: true,
    ui: { bg: '#16181d', surface: '#1d2026', border: '#2c3038', text: '#e3e6eb', textLow: '#8b929c', accent: '#6ea8fe', scrollbar: '#3a3f48' },
    term: term('#16181d', '#e3e6eb', '#6ea8fe', '#2b3a55',
      ['#2c3038', '#f47c7c', '#7ed491', '#f0c674', '#6ea8fe', '#c79bf2', '#6fd3dd', '#e3e6eb', '#8b929c']),
  },
  {
    id: 'nord', label: 'Nord', dark: true,
    ui: { bg: '#2e3440', surface: '#272c36', border: '#3b4252', text: '#d8dee9', textLow: '#7b88a1', accent: '#88c0d0', scrollbar: '#434c5e' },
    term: term('#2e3440', '#d8dee9', '#88c0d0', '#434c5e',
      ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a']),
  },
  {
    id: 'one-dark', label: 'One Dark', dark: true,
    ui: { bg: '#282c34', surface: '#21252b', border: '#3b4048', text: '#abb2bf', textLow: '#5c6370', accent: '#61afef', scrollbar: '#3e4451' },
    term: term('#282c34', '#abb2bf', '#61afef', '#3e4451',
      ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370']),
  },
  {
    id: 'dracula', label: 'Dracula', dark: true,
    ui: { bg: '#282a36', surface: '#21222c', border: '#44475a', text: '#f8f8f2', textLow: '#6272a4', accent: '#bd93f9', scrollbar: '#44475a' },
    term: term('#282a36', '#f8f8f2', '#f8f8f2', '#44475a',
      ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4']),
  },
  {
    id: 'tokyo', label: 'Tokyo Night', dark: true,
    ui: { bg: '#1a1b26', surface: '#16161e', border: '#2a2e42', text: '#c0caf5', textLow: '#565f89', accent: '#7aa2f7', scrollbar: '#2a2e42' },
    term: term('#1a1b26', '#c0caf5', '#7aa2f7', '#283457',
      ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868']),
  },
  {
    id: 'mocha', label: 'Catppuccin Mocha', dark: true,
    ui: { bg: '#1e1e2e', surface: '#181825', border: '#313244', text: '#cdd6f4', textLow: '#9399b2', accent: '#89b4fa', scrollbar: '#45475a' },
    term: term('#1e1e2e', '#cdd6f4', '#89b4fa', '#414458',
      ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de', '#585b70']),
  },
  {
    id: 'rose-pine', label: 'Rosé Pine', dark: true,
    ui: { bg: '#191724', surface: '#1f1d2e', border: '#26233a', text: '#e0def4', textLow: '#6e6a86', accent: '#c4a7e7', scrollbar: '#403d52' },
    term: term('#191724', '#e0def4', '#c4a7e7', '#403d52',
      ['#26233a', '#eb6f92', '#31748f', '#f6c177', '#9ccfd8', '#c4a7e7', '#ebbcba', '#e0def4', '#6e6a86']),
  },
  {
    id: 'gruvbox', label: 'Gruvbox', dark: true,
    ui: { bg: '#282828', surface: '#1d2021', border: '#3c3836', text: '#ebdbb2', textLow: '#928374', accent: '#fabd2f', scrollbar: '#504945' },
    term: term('#282828', '#ebdbb2', '#fabd2f', '#504945',
      ['#282828', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2', '#928374']),
  },
  {
    id: 'monokai', label: 'Monokai', dark: true,
    ui: { bg: '#272822', surface: '#1e1f1a', border: '#3e3d32', text: '#f8f8f2', textLow: '#90918b', accent: '#a6e22e', scrollbar: '#49483e' },
    term: term('#272822', '#f8f8f2', '#f8f8f2', '#49483e',
      ['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2', '#75715e']),
  },
  {
    id: 'synthwave', label: "Synthwave '84", dark: true,
    ui: { bg: '#241b2f', surface: '#1e1727', border: '#3d2e52', text: '#f2e9ff', textLow: '#9d8bb8', accent: '#ff7edb', scrollbar: '#3d2e52' },
    term: term('#241b2f', '#f2e9ff', '#ff7edb', '#463465',
      ['#1e1727', '#fe4450', '#72f1b8', '#fede5d', '#03edf9', '#ff7edb', '#03edf9', '#f2e9ff', '#9d8bb8']),
  },
];

const DEFAULT = { light: THEMES.find((t) => t.id === 'light'), dark: THEMES.find((t) => t.id === 'dark') };

// El tema de un id; uno desconocido (p. ej. de una versión anterior) da SIA Claro.
export const themeById = (id) => THEMES.find((t) => t.id === id) || DEFAULT.light;

export const modeOf = (theme) => (theme.dark ? 'dark' : 'light');

// Lo que hace el interruptor: el preferido del otro modo (prefs = { light, dark },
// ids del último elegido de cada modo), o el de SIA si no hay o no encaja.
export const toggledTheme = (id, prefs = {}) => {
  const other = themeById(id).dark ? 'light' : 'dark';
  const pref = THEMES.find((t) => t.id === prefs[other] && modeOf(t) === other);
  return pref || DEFAULT[other];
};
