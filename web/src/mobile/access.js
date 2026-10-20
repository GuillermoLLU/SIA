// Acceso desde el móvil, las reglas (sin DOM): qué enseña la pestaña Móvil de
// Configuración según el estado del bridge (/lan/status) y cómo se describe
// cada dispositivo.
import { ago, mmss } from '../ui/time.js';

const PHASES = ['preparing', 'download', 'starting'];
const PHASE_TEXT = {
  preparing: 'Preparando el acceso público',
  download: 'Descargando cloudflared',
  starting: 'Abriendo el túnel',
};

export const devicesMsg = (st) => (st.devices
  ? `${st.devices} dispositivo${st.devices === 1 ? '' : 's'} conectado${st.devices === 1 ? '' : 's'}`
  : 'Acceso abierto, sin dispositivos') + (st.mode === 'public' ? ' · público' : '');

export const deviceState = (d, now) => (d.locked ? 'bloqueado' : d.online ? 'en línea' : `sin conexión · visto ${ago(d.lastSeen, now)}`);

// Lo que cambia de la lista de dispositivos: solo entonces se repinta (el
// estado llega cada segundo y no debe parpadear).
export const devicesSignature = (list, now) => JSON.stringify(list.map((d) => [d.id, d.name, d.mode, d.locked, d.online, d.online ? 0 : Math.floor((now - d.lastSeen) / 60000)]));

/* La pestaña Móvil es UNA vista que cambia de estado, siempre centrada y sin
   modales:
     idle     botón «Generar QR»
     choose   dos tarjetas: red local o público (túnel de Cloudflare)
     loading  el túnel se está abriendo (fases del bridge)
     qr       QR + PIN de emparejamiento, con su cuenta atrás
     on       acceso abierto y algún dispositivo conectado
     error    no se pudo abrir
   Quien manda es el estado del bridge; «choose» es el único estado que es
   solo de la interfaz (choosing: el usuario está en las tarjetas y el sondeo
   no le saca de ahí). wasPairing: había un QR a la vista; si desaparece sin
   dispositivos, caducó. */
export const accessView = (st, { choosing, wasPairing }, now = Date.now()) => {
  if (st.publicPhase) {
    const at = PHASES.indexOf(st.publicPhase);
    return { view: 'loading', title: PHASE_TEXT[st.publicPhase] || PHASE_TEXT.preparing, steps: PHASES.map((p, i) => ({ step: p, done: i < at, active: i === at })) };
  }
  if (st.publicError && !st.pendingPairing && st.devices === 0) return { view: 'error', text: st.publicError };
  if (st.pendingPairing && st.qrUrl) {
    const left = st.pairExpiresAt ? ` · caduca en ${mmss(st.pairExpiresAt - now)}` : '';
    return { view: 'qr', qrUrl: st.qrUrl, pin: String(st.pin), note: `${st.mode === 'public' ? 'Escanéalo desde cualquier red' : 'Escanéalo en la misma WiFi'} y teclea el PIN${left}` };
  }
  if (choosing) return { view: 'choose' };
  if (st.active) return { view: 'on', title: devicesMsg(st) };
  return { view: 'idle', note: wasPairing ? 'El QR caducó sin usarse.' : '' };
};
