// Bloqueo de pantalla del escritorio: el candado de la barra lateral, o arrastrar la
// inicial en la de arriba, tapa la ventana hasta dar el PIN; la primera vez, antes de
// bloquear, pide elegirlo. El PIN se cambia en Configuración → Seguridad. Lo guarda y
// lo comprueba el bridge.
import { esc } from '../ui/html.js';
import { setStatus } from '../ui/dom.js';
import { digitsOnly } from './pin-pad.js';
import { LOCK_PIN_LEN, pinProblem } from './pin.js';

// Diálogo de la primera vez: elegir el PIN (dos veces) y saber dónde se cambia.
const askNewLockPin = async (dialogs, len) => {
  let error = '';
  for (;;) {
    const done = dialogs.open({
      title: 'Elige tu PIN de bloqueo',
      okLabel: 'Guardar y bloquear',
      centered: true,
      bodyHTML: `<p>Aún no tienes PIN. Es el que pedirá SIA para volver a mostrar la pantalla.</p>
        <input class="settings-input" id="lock-dlg-1" type="password" inputmode="numeric" maxlength="${len}" placeholder="PIN (${len} dígitos)" autocomplete="new-password" />
        <input class="settings-input" id="lock-dlg-2" type="password" inputmode="numeric" maxlength="${len}" placeholder="repite el PIN" autocomplete="new-password" />
        <p class="dialog-note">Podrás cambiarlo en Configuración → Seguridad.</p>
        ${error ? `<div class="link-form-err">${esc(error)}</div>` : ''}`,
    });
    const a = document.getElementById('lock-dlg-1'), b = document.getElementById('lock-dlg-2');
    digitsOnly(a, len); digitsOnly(b, len);
    a.focus();
    if (!await done) return null;
    error = pinProblem(a.value, b.value, len);
    if (!error) return a.value;
  }
};

// El candado de la barra y la sección de Configuración → Seguridad (poner o
// cambiar el PIN). settings.onOpen: para releer
// el estado al abrir Configuración · onUnlocked(): qué hacer al volver.
export const mountLockControls = ({ api, dialogs, toast, gate, settings, onUnlocked }) => {
  const $ = (id) => document.getElementById(id);
  const lockBtn = $('lock-btn');
  const cur = $('lock-current'), fresh = $('lock-new'), again = $('lock-new2');
  const saveBtn = $('lock-save'), status = $('lock-status');
  let len = LOCK_PIN_LEN;

  lockBtn.addEventListener('click', async () => {
    let st;
    try { st = await api('/lock'); } catch (err) {
      // nunca en silencio: un bridge anterior al candado responde 404
      dialogs.alert('No se puede bloquear', err.status === 404
        ? 'El SIA al que está conectada esta ventana es de una versión anterior y no tiene bloqueo de pantalla.'
        : esc(err.message));
      return;
    }
    len = st.len || LOCK_PIN_LEN;
    try {
      if (!st.hasKey) {
        const pin = await askNewLockPin(dialogs, len);
        if (!pin) return;
        await api('/lock/key', { method: 'PUT', body: { key: pin } });
      }
      await api('/lock/on', { method: 'POST' });
    } catch (err) { dialogs.alert('No se pudo bloquear', esc(err.message)); return; }
    await gate.open({ len });
    onUnlocked();
  });

  for (const i of [cur, fresh, again]) digitsOnly(i, len);
  const refresh = async () => {
    cur.value = ''; fresh.value = ''; again.value = '';
    setStatus(status, '');
    try {
      const st = await api('/lock');
      len = st.len || LOCK_PIN_LEN;
      cur.hidden = !st.hasKey; // cambiarlo exige el actual
      fresh.placeholder = st.hasKey ? `PIN nuevo (${len} dígitos)` : `PIN (${len} dígitos)`;
      saveBtn.textContent = st.hasKey ? 'Cambiar PIN' : 'Guardar';
    } catch { /* bridge caído: se queda como estaba */ }
  };
  settings.onOpen(refresh);
  const save = async () => {
    const problem = pinProblem(fresh.value, again.value, len);
    if (problem) return setStatus(status, problem, 'bad');
    try {
      await api('/lock/key', { method: 'PUT', body: { key: fresh.value, current: cur.value } });
      await refresh();
      toast('PIN de bloqueo guardado');
    } catch (err) { setStatus(status, err.message, 'bad'); }
  };
  saveBtn.addEventListener('click', save);
  for (const i of [cur, fresh, again]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
};
