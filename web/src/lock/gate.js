// La puerta del candado: pantalla completa hasta dar el PIN. El PIN lo
// comprueba el bridge, que mientras tanto no responde a nada más desde esta
// máquina; aquí solo se tapa la ventana y se deja la app de debajo inerte (ni
// clics ni teclas llegan al terminal). Los chats siguen corriendo: viven en el
// bridge. La puerta es mínima a propósito: la S del logo y las casillas del
// PIN, sin textos ni pistas. Si acierta se va; si falla, las casillas se
// sacuden y se vacían. La promesa se resuelve al desbloquear; llamarla dos
// veces da la misma.
import { pinPad } from './pin-pad.js';
import { LOCK_PIN_LEN, unlockOutcome } from './pin.js';

// api: el cliente del bridge · logoHtml: la S
export const createLockGate = ({ api, logoHtml }) => {
  let pending = null;

  const open = ({ len = LOCK_PIN_LEN } = {}) => {
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const appEl = document.querySelector('.app');
      // lo primero, tapar: la ventana no enseña nada mientras se monta la puerta
      document.body.classList.add('locked');
      if (appEl) appEl.inert = true;
      const el = document.createElement('div');
      el.id = 'lock-gate';
      el.className = 'lock-gate';
      el.innerHTML = `<div class="lock-card">${logoHtml}<div data-slot="pad"></div><div class="lock-wait" id="lock-wait"></div></div>`;
      document.body.appendChild(el);
      const wait = el.querySelector('#lock-wait');
      let waitTimer = 0;

      const leave = () => {
        clearInterval(waitTimer);
        window.removeEventListener('keydown', trap, true);
        el.remove();
        document.body.classList.remove('locked');
        if (appEl) appEl.inert = false;
        pending = null;
        resolve();
      };
      // freno del bridge tras varios fallos: el PIN apagado y, como única
      // indicación, los segundos que faltan (sin ella parecería que no responde)
      const waitFor = (secs) => {
        let left = secs;
        pad.hold();
        const tick = () => {
          if (left <= 0) { clearInterval(waitTimer); wait.textContent = ''; pad.release(); return; }
          wait.textContent = String(left);
          left--;
        };
        clearInterval(waitTimer); tick(); waitTimer = setInterval(tick, 1000);
      };
      const tryPin = async (pin) => {
        try { await api('/lock/off', { method: 'POST', body: { key: pin } }); return { ok: true }; }
        catch (e) { return { ok: false, status: e.status, data: e.data }; }
      };
      const pad = pinPad(len, async (pin) => {
        const out = unlockOutcome(await tryPin(pin));
        if (out.do === 'ok') { // acierto: las casillas en verde un instante y la puerta se va
          pad.ok();
          setTimeout(() => el.classList.add('leaving'), 220);
          setTimeout(leave, 440);
          return;
        }
        if (out.do === 'wait') return waitFor(out.secs);
        pad.fail(); // fallo: solo la sacudida, sin decir nada
      });
      pad.el.id = 'lock-pin'; pad.key.id = 'lock-key';
      el.querySelector('[data-slot="pad"]').replaceWith(pad.el);

      // Ninguna tecla sale de la puerta: las de fuera se cortan antes de llegar a
      // nada (captura en window) y las de dentro no suben a los atajos globales.
      const trap = (e) => { if (!el.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); pad.focus(); } };
      window.addEventListener('keydown', trap, true);
      el.addEventListener('keydown', (e) => e.stopPropagation());
      // el foco, siempre en el PIN
      el.addEventListener('mousedown', (e) => { if (e.target !== pad.key) { e.preventDefault(); pad.focus(); } });
      pad.focus();
    });
    return pending;
  };

  return { open };
};
