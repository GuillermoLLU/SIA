// La terminal de un chat: xterm con las opciones y el tema de SIA, y los dos
// apaños que necesita (scroll táctil nativo en el móvil; copiar y pegar con
// Ctrl en Windows/Linux).
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
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

// Pintar por GPU: con scroll nativo se repinta la pantalla en cada frame y el
// renderizador DOM (cientos de nodos por frame) no da abasto en un móvil.
export const useWebgl = (term) => {
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => gl.dispose()); // sin contexto → vuelve el DOM
    term.loadAddon(gl);
  } catch { /* sin WebGL: renderizador DOM de serie */ }
};

/* Scroll táctil NATIVO (móvil). En escritorio el scroll de xterm va fino
   porque su viewport es un elemento con scroll real: la rueda lo mueve y
   xterm pinta las filas que tocan. En táctil xterm no usa ese camino: mueve
   el viewport 1:1 con el dedo (sin inercia) y, además, en CADA evento de
   scroll reajusta el scrollTop a filas enteras (Terminal.ts → syncScrollArea).
   En iOS un scrollTop programático corta la inercia nativa en seco, así que
   cualquier intento de scroll apoyado en xterm sale a trozos.

   Aquí (con el CSS que pone el viewport encima y transparente):
   - el dedo mueve el viewport con el scroll del sistema, con su inercia;
   - se silencian los touch handlers de xterm (captura + stopPropagation,
     sin preventDefault: el navegador sigue haciendo su scroll);
   - mientras dura el gesto y la inercia, syncScrollArea no reajusta nada;
     al parar (150 ms sin eventos de scroll) se ejecuta una vez y encaja
     a la fila más cercana (medio carácter como mucho).
   Un toque sin arrastre burbujea hasta xterm: foco y teclado siguen igual.
   Se apoya en un interno (_core.viewport) de xterm 5.5: si no está, no se
   toca nada y queda el comportamiento de serie. */
export const enableTouchScroll = (host, term) => {
  const vp = host.querySelector('.xterm-viewport');
  const core = term._core?.viewport;
  if (!vp || typeof core?.syncScrollArea !== 'function') return;
  const realSync = core.syncScrollArea.bind(core);
  let touching = false, gliding = false, settleT = 0;
  core.syncScrollArea = (immediate) => { if (!touching && !gliding) realSync(immediate); };
  const settle = () => {
    clearTimeout(settleT);
    settleT = setTimeout(() => { if (touching) return; gliding = false; realSync(); }, 150);
  };
  const end = () => { touching = false; settle(); };
  host.addEventListener('touchstart', (e) => {
    touching = true; gliding = true; clearTimeout(settleT);
    e.stopPropagation(); // que xterm no arranque su propio arrastre
  }, { capture: true, passive: true });
  host.addEventListener('touchmove', (e) => e.stopPropagation(), { capture: true, passive: true });
  host.addEventListener('touchend', end, { capture: true, passive: true });
  host.addEventListener('touchcancel', end, { capture: true, passive: true });
  vp.addEventListener('scroll', () => { if (gliding) settle(); }, { passive: true }); // inercia en curso
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
