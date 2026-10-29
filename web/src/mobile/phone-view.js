// Lo que cambia en la web cuando se usa desde el móvil: los botones de
// adjuntar, skills y candado en la barra del chat (como flotantes tapaban
// la esquina inferior derecha de la terminal, justo donde Claude pinta la
// caja de entrada), la hoja de «de dónde sale la imagen», el candado de esta
// sesión del teléfono y la altura de la app medida por lo VISIBLE.
import { esc } from '../ui/html.js';
import { askNewLockPin } from '../lock/controls.js';

// chat: la vista del Chat (active(), upload(), refitActive()) · palette.toggle()
// · gate.fromBridge(): la puerta del candado
export const mountPhoneView = ({ api, dialogs, toast, chat, palette, gate }) => {
  const $ = (id) => document.getElementById(id);
  $('chat-bar').querySelector('.chat-bar-spacer').after($('attach-fab'), $('skills-fab'), $('lock-fab'));

  $('skills-fab').addEventListener('click', (e) => { e.stopPropagation(); palette.toggle(); });

  // Adjuntar: pregunta de dónde sale la imagen —hacer una foto o elegirla de la
  // galería— y la sube al chat activo por la misma tubería que pegar/arrastrar
  // en escritorio. Son dos campos distintos porque el selector del sistema no
  // siempre ofrece la cámara; con `capture` se abre directamente.
  const attachInput = $('attach-input');
  const cameraInput = $('camera-input');
  const attachSheet = $('attach-sheet');
  $('attach-fab').addEventListener('click', () => {
    const s = chat.active();
    if (!s || !s.launched) { dialogs.alert('Sin chat activo', 'Lanza un chat antes de adjuntar imágenes.'); return; }
    document.activeElement?.blur(); // fuera el teclado: las opciones salen abajo
    attachSheet.hidden = false;
  });
  attachSheet.addEventListener('click', (e) => { if (e.target === attachSheet) attachSheet.hidden = true; });
  $('attach-camera').addEventListener('click', () => { attachSheet.hidden = true; cameraInput.click(); });
  $('attach-gallery').addEventListener('click', () => { attachSheet.hidden = true; attachInput.click(); });
  for (const input of [attachInput, cameraInput]) {
    input.addEventListener('change', () => {
      const s = chat.active();
      const files = [...input.files];
      input.value = ''; // permitir volver a elegir la misma foto
      if (!s || !s.launched || !files.length) return;
      // sin panel de adjuntos, este aviso es la señal de que la subida está en marcha
      toast(files.length > 1 ? `Subiendo ${files.length} imágenes…` : 'Subiendo imagen…', 2500);
      files.forEach((f) => chat.upload(s, f));
    });
  }

  // Candado del MÓVIL: bloquea esta sesión del teléfono, sin tocar el
  // ordenador. Se desbloquea con el mismo PIN del candado del escritorio, en
  // red local y por túnel; si aún no hay PIN, se elige aquí antes de bloquear.
  $('lock-fab').addEventListener('click', async () => {
    try {
      const ping = await api('/ping');
      if (!ping.pin) {
        const pin = await askNewLockPin(dialogs, { remote: true, len: ping.len });
        if (!pin) return;
        await api('/lan/pin', { method: 'PUT', body: { key: pin } });
      }
      await api('/lan/lock', { method: 'POST' });
    } catch (err) { dialogs.alert('No se pudo bloquear', esc(err.message)); return; }
    gate.fromBridge();
  });

  /* La app mide lo VISIBLE, no el layout. Al abrir el teclado, iOS no dispara
     'resize' (el layout no cambia): solo cambia visualViewport, y Safari
     desplaza la página para enseñar el foco. Fijamos la altura del body a lo
     visible (--vv-h), deshacemos ese desplazamiento y llevamos la terminal al
     final para que el prompt quede justo encima del teclado. El refit lo hace
     el ResizeObserver del host. */
  const vv = window.visualViewport;
  if (!vv) return;
  let raf = 0, lastH = 0;
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.round(vv.height);
      const changed = h !== lastH; lastH = h;
      document.documentElement.style.setProperty('--vv-h', `${h}px`);
      if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
      // solo al cambiar la altura (teclado): un evento suelto no debe mover el historial
      if (changed) chat.refitActive({ toBottom: true });
    });
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
};
