// Configuración → Móvil (solo en el escritorio): abrir el acceso desde el
// móvil (QR + PIN, en red local o por túnel público), ver los dispositivos
// conectados y cerrarlos. Pinta lo que diga el bridge (/lan/status, consultado
// cada segundo mientras Configuración está abierta); las reglas, en access.js.
import QRCode from 'qrcode';
import { esc, svg } from '../ui/html.js';
import { askNewLockPin } from '../lock/controls.js';
import { accessView, deviceState, devicesSignature } from './access.js';

const PHONE_ICON = svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>', { width: 1.6 });

export const mountAccessPanel = ({ api, toast, dialogs, settings }) => {
  const $ = (id) => document.getElementById(id);
  const mob = $('mob');
  const canvas = $('mob-canvas');
  let poll = null;
  let choosing = false;     // el usuario está en las tarjetas: el sondeo no le saca de ahí
  let paintedQr = null;     // URL del QR ya pintado, para no repintarlo cada segundo
  let wasPairing = false;   // había un QR a la vista: si desaparece sin dispositivos, caducó
  let devSig = null;

  const show = (view) => { for (const v of mob.querySelectorAll('.mob-view')) v.hidden = v.dataset.view !== view; };

  // Dispositivos conectados, cada uno con su botón de cerrar. Solo se repinta cuando cambia algo.
  const paintDevices = (st) => {
    const list = st.list || [];
    const sig = devicesSignature(list, Date.now());
    if (sig === devSig) return;
    devSig = sig;
    for (const ul of [$('mob-devices'), $('mob-devices-qr')]) {
      ul.innerHTML = '';
      ul.hidden = !list.length;
      for (const d of list) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="d-ico${d.online && !d.locked ? ' on' : ''}">${PHONE_ICON}</span>
          <span class="d-main"><span class="d-name">${esc(d.name)}</span><span class="d-sub">${d.mode === 'public' ? 'Público' : 'Red local'} · ${esc(deviceState(d, Date.now()))}</span></span>
          <button class="mob-link danger" title="Cerrar la sesión de este dispositivo">Cerrar</button>`;
        li.querySelector('button').addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          try { const next = await api(`/lan/devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); toast(`«${d.name}» desconectado`); await render(next); }
          catch (err) { toast(err.message); refresh(); }
        });
        ul.appendChild(li);
      }
    }
  };

  const render = async (st) => {
    paintDevices(st);
    const v = accessView(st, { choosing, wasPairing });
    if (v.view === 'loading') {
      choosing = false;
      $('mob-load-title').textContent = v.title;
      for (const li of $('mob-steps').children) {
        const step = v.steps.find((s) => s.step === li.dataset.step);
        li.classList.toggle('done', !!step?.done);
        li.classList.toggle('active', !!step?.active);
      }
    } else if (v.view === 'error') {
      $('mob-error-text').textContent = v.text;
    } else if (v.view === 'qr') {
      choosing = false; wasPairing = true;
      if (paintedQr !== v.qrUrl) {
        await QRCode.toCanvas(canvas, v.qrUrl, { width: 220, margin: 1 });
        paintedQr = v.qrUrl;
        $('mob-pin').innerHTML = v.pin.split('').map((d) => `<span>${esc(d)}</span>`).join('');
      }
      $('mob-qr-note').textContent = v.note;
    } else {
      paintedQr = null;
      if (v.view === 'choose') return; // sin nada abierto y eligiendo modo: se queda en las tarjetas
      if (v.view === 'on') { wasPairing = false; $('mob-on-title').textContent = v.title; }
      else { $('mob-idle-note').textContent = v.note; wasPairing = false; }
    }
    show(v.view);
  };
  const refresh = async () => { try { await render(await api('/lan/status')); } catch { /* bridge caído: se queda como estaba */ } };
  const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };
  const startPoll = () => { stopPoll(); poll = setInterval(refresh, 1000); };

  const enable = async (mode) => {
    choosing = false;
    try { await render(await api('/lan/enable', { method: 'POST', body: { mode } })); }
    catch (e) { $('mob-error-text').textContent = e.message; show('error'); }
  };
  const disable = async () => {
    choosing = false; wasPairing = false; paintedQr = null;
    await api('/lan/disable', { method: 'POST' }).catch(() => {});
    await refresh();
  };

  $('mob-start').addEventListener('click', async () => {
    choosing = true;
    $('mob-idle-note').textContent = '';
    try { $('mob-cf-note').hidden = (await api('/lan/status')).cloudflared; } catch { $('mob-cf-note').hidden = true; }
    show('choose');
  });
  $('mob-back').addEventListener('click', () => { choosing = false; refresh(); });
  $('mob-opt-local').addEventListener('click', () => enable('lan'));
  // El móvil por túnel se bloquea solo y se desbloquea con el PIN de bloqueo
  // (el mismo de la pantalla del ordenador). Si aún no hay PIN, se elige ahora,
  // antes de abrir nada a internet.
  $('mob-opt-public').addEventListener('click', async () => {
    try {
      const st = await api('/lock');
      if (!st.hasKey) {
        const pin = await askNewLockPin(dialogs, { len: st.len, okLabel: 'Guardar y abrir', why: 'El acceso público se bloquea solo al dejar de usar el móvil y pide este PIN para seguir; es el mismo del bloqueo de pantalla.' });
        if (!pin) return;
        await api('/lock/key', { method: 'PUT', body: { key: pin } });
      }
    } catch (e) { $('mob-error-text').textContent = e.message; return show('error'); }
    enable('public');
  });
  $('mob-cancel').addEventListener('click', disable);
  $('mob-off-qr').addEventListener('click', disable);
  $('mob-off').addEventListener('click', disable);
  // otro QR para emparejar un dispositivo más, sin echar a los que ya están
  $('mob-more').addEventListener('click', async () => {
    let mode = 'lan';
    try { mode = (await api('/lan/status')).mode === 'public' ? 'public' : 'lan'; } catch { /* sin estado: red local */ }
    enable(mode);
  });
  $('mob-retry').addEventListener('click', async () => { await disable(); choosing = true; show('choose'); });

  // mientras Configuración está abierta se sigue el estado del bridge
  settings.onOpen(() => { choosing = false; paintedQr = null; refresh(); startPoll(); });
  settings.onClose(stopPoll);
};
