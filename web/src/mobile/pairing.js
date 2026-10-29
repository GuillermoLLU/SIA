// Arranque desde el móvil: la web la sirve el propio bridge (red local o túnel
// público) y el teléfono entra emparejado con el ordenador, sin sesión de
// usuario. Emparejar es dar el PIN que muestra el ordenador; después, cada
// arranque comprueba la llave con el ping y, si el candado está echado, pasa
// antes por la puerta.
import { pinPad } from '../lock/pin-pad.js';
import { paintCachedTheme, adoptTheme } from '../theme/apply.js';

const PAIR_PIN_LEN = 6; // el PIN de emparejamiento, el que enseña el ordenador junto al QR
const TOKEN_KEY = 'sia-lan-token';
const MODE_KEY = 'sia-lan-mode'; // 'public' activa el candado automático

// pantalla completa del móvil sin emparejar / error fatal
const screen = (logoHtml, html) => {
  paintCachedTheme();
  let el = document.getElementById('lan-gate');
  if (!el) { el = document.createElement('div'); el.id = 'lan-gate'; el.className = 'lock-gate'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lock-card">${logoHtml}${html}</div>`;
  return el;
};
const fatal = async (logoHtml, msg) => { screen(logoHtml, `<p class="lock-caption">${msg}</p>`); await new Promise(() => {}); };

// Emparejar este dispositivo: pedir el PIN que muestra el ordenador. Sin
// pairToken (PWA instalada abierta a mano, sin pasar por el QR) también vale:
// el bridge acepta solo-PIN mientras el emparejamiento esté activo.
const pair = (api, logoHtml, pairToken) => new Promise((resolve) => {
  const el = screen(logoHtml, `<p class="lock-caption">${pairToken
    ? 'Introduce el PIN que ves en el ordenador'
    : 'En el ordenador: Configuración → Móvil → Generar QR. Después introduce aquí el PIN.'}</p>
    <div data-slot="pad"></div>
    <div class="lock-msg" id="lan-msg"></div>`);
  const msg = el.querySelector('#lan-msg');
  const pad = pinPad(PAIR_PIN_LEN, async (code) => {
    msg.textContent = '';
    try {
      const data = await api('/lan/pair', { method: 'POST', body: { token: pairToken, pin: code } });
      localStorage.setItem(TOKEN_KEY, data.sessionToken);
      localStorage.setItem(MODE_KEY, data.mode || 'lan');
      history.replaceState(null, '', location.pathname); // limpiar el ?p=… de la URL
      pad.ok();
      setTimeout(() => { el.remove(); resolve(data.sessionToken); }, 260);
    } catch (e) { msg.textContent = e.status ? (e.data?.error || 'No se pudo conectar.') : 'Sin conexión con SIA.'; pad.fail(); }
  }, 'PIN de emparejamiento');
  pad.key.id = 'lan-pin';
  el.querySelector('[data-slot="pad"]').replaceWith(pad.el);
  if (pad.keys) msg.after(pad.keys);
  el.addEventListener('mousedown', (e) => { if (e.target !== pad.key) { e.preventDefault(); pad.focus(); } });
  pad.focus();
});

// api: el cliente del bridge; sus cabeceras llevan la llave que haya en
// ctx.lanToken (este arranque la va poniendo) · pairToken: el ?p= del QR ·
// gate(): la puerta del PIN de bloqueo. → { lanToken, wsUrl }
export const bootPhone = async ({ api, ctx, pairToken, logoHtml, gate }) => {
  document.body.classList.add('phone'); // vista reducida: solo el chat
  document.documentElement.classList.add('phone'); // html también: bloquea el scroll de página
  ctx.lanToken = localStorage.getItem(TOKEN_KEY) || null;
  // el tema del ordenador, antes de enseñar nada (el ping responde sin llave
  // mientras el acceso está abierto)
  try { adoptTheme((await api('/ping', { timeoutMs: 1500 })).theme); } catch { /* sin bridge: el que hubiera */ }
  if (pairToken) ctx.lanToken = await pair(api, logoHtml, pairToken); // QR nuevo → (re)emparejar
  else if (!ctx.lanToken) ctx.lanToken = await pair(api, logoHtml, null); // PWA abierta a mano → PIN
  let wsUrl = null;
  const ping = async () => {
    const p = await api('/ping');
    adoptTheme(p.theme);
    // candado echado: no se pasa de aquí sin el PIN
    if (p.locked) { paintCachedTheme(); await gate({ remote: true, len: p.len }); }
    if (!p.ws) throw new Error('token inválido'); // 403: el token ya no vale
    if (p.mode) localStorage.setItem(MODE_KEY, p.mode);
    // el WS viaja por el MISMO origen que la web (ruta /ws): un solo puerto
    // en la LAN y la única forma de pasar por el túnel público (wss en 443)
    wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?t=${encodeURIComponent(ctx.lanToken)}`;
  };
  try { await ping(); }
  catch { // token caducado (p. ej. SIA se reinició): re-emparejar con PIN
    localStorage.removeItem(TOKEN_KEY);
    ctx.lanToken = await pair(api, logoHtml, null);
    try { await ping(); }
    catch { await fatal(logoHtml, 'No se pudo conectar con SIA. ¿Sigue activo el acceso en el ordenador?'); }
  }
  return { lanToken: ctx.lanToken, wsUrl, publicMode: localStorage.getItem(MODE_KEY) === 'public' };
};

// El ordenador ha cerrado este dispositivo (o apagado el acceso): la llave ya
// no vale. Se olvida y se recarga, que lleva a la pantalla de emparejar.
export const lanRevoked = () => { localStorage.removeItem(TOKEN_KEY); location.reload(); };
