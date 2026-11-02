// La terminal de un chat: xterm con las opciones y el tema de SIA, y el apaño
// que necesita (copiar y pegar con Ctrl en Windows/Linux).
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TERM_OPTS = {
  cursorBlink: true,
  fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.3,
};

export const makeTerminal = (theme) => {
  const term = new Terminal({ ...TERM_OPTS, theme });
  const fit = new FitAddon();
  term.loadAddon(fit);
  return { term, fit };
};

// Copy/paste en Windows/Linux: ahí xterm manda Ctrl+C como ^C (SIGINT) y
// Ctrl+V como ^V, así que el copy/paste nativo no funciona. Lo cableamos a
// mano. En Mac (⌘C/⌘V) el navegador ya lo gestiona bien → no se toca.
export const wireCopyPaste = (term, onPaste) => {
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || e.altKey) return true;
    const key = e.key.toLowerCase();
    // Copiar: Ctrl+C con selección (sin selección deja pasar ^C) o Ctrl+Shift+C
    if (key === 'c' && (e.shiftKey || term.hasSelection())) {
      const sel = term.getSelection();
      if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
      e.preventDefault(); // que no llegue ^C ni el copy nativo
      return false;
    }
    // Pegar: Ctrl+V / Ctrl+Shift+V. preventDefault evita el 'paste' nativo
    // (que provocaría doble pegado sobre onPaste).
    if (key === 'v') { e.preventDefault(); onPaste(); return false; }
    return true;
  });
};
