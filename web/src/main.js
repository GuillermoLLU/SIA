import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import QRCode from 'qrcode';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import logoUrl from './logo.png';
import { inviteDecode } from './access/invite.js';
import { accessMarkup, wireAccess } from './access/access-view.js';
import { installAutoLock } from './mobile/auto-lock.js';
import { createAuthSession } from './auth/session.js';
import { ensureLogin } from './auth/login-view.js';
import { wireLogout } from './auth/logout-button.js';
import { themeById, toggledTheme } from './theme/themes.js';
import { createUsersApi } from './users/users-api.js';
import { mountUsersView } from './users/users-view.js';
import { createKnowledgeApi } from './knowledge/knowledge-api.js';
import { openBasesDialog, openGrantsDialog } from './knowledge/assign-dialogs.js';
import { renderAssignedView } from './knowledge/assigned-view.js';

// Favicon de la pestaña (la S).
{
  const fav = document.createElement('link');
  fav.rel = 'icon';
  fav.href = logoUrl;
  document.head.appendChild(fav);
}

/* ── Descubrimiento del bridge ────────────────────────────────────
   La app Electron pasa los puertos por query (?ws=&api=). En navegador
   (dev) se sondean los pares candidatos hasta dar con un SIA vivo. */
const PORT_PAIRS = [[57413, 57414], [58527, 58528], [59641, 59642]];
let WS_URL;
let API_BASE;
let LAN_TOKEN = null; // llave de sesión cuando se accede desde el móvil (red local)

/* ── Pantallas completas con PIN ──────────────────────────────────
   Emparejar un móvil y desbloquear (la pantalla del ordenador o la sesión de un
   móvil) comparten aspecto y pieza: la S del logo y unas casillas. No hay
   botón: al escribir el último dígito se comprueba solo. */
const LOCK_PIN_LEN = 4;   // PIN de bloqueo
const PAIR_PIN_LEN = 6;   // PIN de emparejamiento (el que enseña el ordenador junto al QR)
const LOGO_HTML = `<div class="lock-logo" role="img" aria-label="SIA" style="--logo: url('${logoUrl}')"></div>`;

// Una pantalla que sale al arrancar lo hace antes de aplicar el tema: se
// adelantan sus colores (los guardó applyTheme) para que no aparezca con los de
// primer pintado.
const paintCachedTheme = () => {
  try {
    const ui = JSON.parse(localStorage.getItem('sia-theme-ui') || 'null');
    const vars = ui && { '--bg': ui.bg, '--surface': ui.surface, '--border': ui.border, '--text': ui.text, '--text-low': ui.textLow, '--accent': ui.accent };
    for (const [k, v] of Object.entries(vars || {})) if (v) document.documentElement.style.setProperty(k, v);
  } catch { /* sin copia: colores por defecto */ }
};

// Móvil: el tema es el del ordenador. El bridge lo da en el ping (id + colores);
// se guarda como si fuera el elegido aquí y se pinta ya, para que también las
// pantallas de emparejar y de bloqueo salgan con él.
const adoptTheme = (theme) => {
  if (!theme?.id || !theme.ui) return;
  localStorage.setItem('sia-theme', theme.id);
  localStorage.setItem('sia-theme-ui', JSON.stringify(theme.ui));
  paintCachedTheme();
};

/* Casillas de PIN. El campo real es un input invisible encima, que es el que
   recibe el teclado; las casillas solo pintan cuántos dígitos hay. Al llenar la
   última se apaga y llama a onFull(valor); quien lo use responde con ok(),
   fail() (sacudida y a empezar) u hold()/release() (apagado mientras dure un freno).
   En el móvil no se usa el teclado del sistema, que al abrirse empuja la
   pantalla y descoloca el logo: el PIN se marca en un teclado numérico propio
   (`keys`, que quien lo use coloca bajo las casillas), con el tema de la app. El
   campo se queda de solo lectura y nunca recibe el foco. */
const BACKSPACE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/></svg>';
const pinPad = (len, onFull, label = 'PIN') => {
  const touch = document.body.classList.contains('phone');
  const el = document.createElement('div');
  el.className = `lock-pin${len > 4 ? ' long' : ''}${touch ? ' touch' : ''}`;
  el.innerHTML = `<input type="password" inputmode="${touch ? 'none' : 'numeric'}" autocomplete="off" maxlength="${len}" aria-label="${label}"${touch ? ' readonly tabindex="-1"' : ''} />${'<span class="cell"></span>'.repeat(len)}`;
  const key = el.firstElementChild;
  let busy = false;
  let keys = null;
  // las casillas pintan cuántos dígitos hay; la activa es la siguiente por escribir
  const paint = () => {
    const n = key.value.length;
    el.querySelectorAll('.cell').forEach((c, i) => {
      c.classList.toggle('filled', i < n);
      c.classList.toggle('active', i === n && !busy);
    });
    el.classList.toggle('off', key.disabled && !el.classList.contains('ok'));
    keys?.classList.toggle('off', key.disabled);
  };
  const changed = () => {
    key.value = key.value.replace(/\D/g, '').slice(0, len);
    el.classList.remove('bad'); // el rojo del fallo se va al volver a escribir
    paint();
    if (key.value.length === len && !busy) { busy = true; key.disabled = true; paint(); onFull(key.value); }
  };
  key.addEventListener('input', changed);
  const focus = () => { if (!touch) key.focus(); };
  if (touch) {
    // una tecla del teclado propio: un dígito o «del» (borrar el último)
    const press = (k) => {
      if (busy || key.disabled) return;
      key.value = k === 'del' ? key.value.slice(0, -1) : key.value + k;
      changed();
    };
    keys = document.createElement('div');
    keys.className = 'lock-keys';
    keys.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
      .map((k) => (k === '' ? '<span></span>'
        : `<button type="button" data-k="${k}"${k === 'del' ? ` class="del" aria-label="Borrar">${BACKSPACE_ICON}` : `>${k}`}</button>`)).join('');
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
    // la tecla pulsada se marca a mano: `:active` en táctil no es de fiar (Safari
    // no lo aplica y en otros se queda pegado tras soltar)
    const lift = () => keys.querySelector('.pressed')?.classList.remove('pressed');
    keys.addEventListener('pointerdown', (e) => { lift(); e.target.closest('button')?.classList.add('pressed'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) keys.addEventListener(ev, lift);
    // con un teclado físico (tableta, portátil entrando en remoto) también se puede teclear
    const typed = (e) => {
      if (!el.isConnected) return window.removeEventListener('keydown', typed, true);
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    };
    window.addEventListener('keydown', typed, true);
  }
  paint();
  return {
    el, key, keys, focus,
    ok: () => { el.classList.add('ok'); paint(); },
    fail: () => {
      el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); // reinicia la sacudida
      key.value = ''; busy = false; key.disabled = false; paint(); focus();
    },
    hold: () => { key.value = ''; busy = true; key.disabled = true; paint(); },
    release: () => { busy = false; key.disabled = false; paint(); focus(); },
  };
};

// pantalla completa del móvil sin emparejar / error fatal
const lanScreen = (html) => {
  paintCachedTheme();
  let el = document.getElementById('lan-gate');
  if (!el) { el = document.createElement('div'); el.id = 'lan-gate'; el.className = 'lock-gate'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lock-card">${LOGO_HTML}${html}</div>`;
  return el;
};
const lanFatal = async (msg) => { lanScreen(`<p class="lock-caption">${msg}</p>`); await new Promise(() => {}); };
// Emparejar este dispositivo: pedir el PIN que muestra el ordenador. Sin
// pairToken (PWA instalada abierta a mano, sin pasar por el QR) también vale:
// el bridge acepta solo-PIN mientras el emparejamiento esté activo.
const lanPair = (pairToken) => new Promise((resolve) => {
  const el = lanScreen(`<p class="lock-caption">${pairToken
    ? 'Introduce el PIN que ves en el ordenador'
    : 'En el ordenador: Configuración → Móvil → Generar QR. Después introduce aquí el PIN.'}</p>
    <div data-slot="pad"></div>
    <div class="lock-msg" id="lan-msg"></div>`);
  const msg = el.querySelector('#lan-msg');
  const pad = pinPad(PAIR_PIN_LEN, async (code) => {
    msg.textContent = '';
    try {
      const r = await fetch(`${API_BASE}/lan/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pairToken, pin: code }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = data.error || 'No se pudo conectar.'; pad.fail(); return; }
      localStorage.setItem('sia-lan-token', data.sessionToken);
      localStorage.setItem('sia-lan-mode', data.mode || 'lan'); // 'public' activa el candado automático
      history.replaceState(null, '', location.pathname); // limpiar el ?p=… de la URL
      pad.ok();
      setTimeout(() => { el.remove(); resolve(data.sessionToken); }, 260);
    } catch { msg.textContent = 'Sin conexión con SIA.'; pad.fail(); }
  }, 'PIN de emparejamiento');
  pad.key.id = 'lan-pin';
  el.querySelector('[data-slot="pad"]').replaceWith(pad.el);
  if (pad.keys) msg.after(pad.keys);
  el.addEventListener('mousedown', (e) => { if (e.target !== pad.key) { e.preventDefault(); pad.focus(); } });
  pad.focus();
});

/* Bloqueo de pantalla del escritorio (el candado de la barra lateral): una
   puerta a pantalla completa hasta dar el PIN. El PIN lo comprueba el bridge,
   que mientras tanto no responde a nada más desde esta máquina; aquí solo se
   tapa la ventana y se deja la app de debajo inerte (ni clics ni teclas llegan
   al terminal). Los chats siguen corriendo: viven en el bridge.
   La puerta es mínima a propósito: la S del logo y las cuatro casillas del
   PIN, sin textos ni pistas. Si acierta se va; si falla, las casillas se
   sacuden y se vacían. La promesa se resuelve al desbloquear; llamarla dos
   veces da la misma. */
let lockGatePromise = null;
// La puerta cuando el bridge dice «bloqueado» (423 en la API, cierre 4423 en un
// socket). Es siempre la misma, con el mismo PIN: en el escritorio desbloquea la
// pantalla; en un móvil emparejado (red local o túnel), su sesión.
const lockedGate = () => lockGate({ remote: !!LAN_TOKEN });
// El ordenador ha cerrado este dispositivo (o apagado el acceso): la llave ya
// no vale. Se olvida y se recarga, que lleva a la pantalla de emparejar.
const lanRevoked = () => { localStorage.removeItem('sia-lan-token'); location.reload(); };
// remote: la puerta bloquea la sesión de un MÓVIL emparejado (red local o
// túnel público): mismo PIN, pero se comprueba contra /lan/unlock con su llave
// de sesión y, al acertar, se recarga la página, que es como el móvil recupera
// sus chats (al bloquear, el bridge le cierra los sockets).
const lockGate = ({ remote = false } = {}) => {
  if (lockGatePromise) return lockGatePromise;
  lockGatePromise = new Promise((resolve) => {
    const appEl = document.querySelector('.app');
    // lo primero, tapar: la ventana no enseña nada mientras se monta la puerta
    document.body.classList.add('locked');
    if (appEl) appEl.inert = true;
    const el = document.createElement('div');
    el.id = 'lock-gate';
    el.className = 'lock-gate';
    el.innerHTML = `<div class="lock-card">${LOGO_HTML}<div data-slot="pad"></div><div class="lock-wait" id="lock-wait"></div></div>`;
    document.body.appendChild(el);
    const wait = el.querySelector('#lock-wait');
    let waitTimer = 0;

    const leave = () => {
      clearInterval(waitTimer);
      window.removeEventListener('keydown', trap, true);
      el.remove();
      document.body.classList.remove('locked');
      if (appEl) appEl.inert = false;
      lockGatePromise = null;
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
    const pad = pinPad(LOCK_PIN_LEN, async (pin) => {
      try {
        const r = await fetch(`${API_BASE}${remote ? '/lan/unlock' : '/lock/off'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(remote ? { 'X-SIA-LAN': LAN_TOKEN } : {}) }, body: JSON.stringify({ key: pin }) });
        const data = await r.json().catch(() => ({}));
        if (remote && r.status === 410) { // demasiados fallos: sesión revocada, a emparejar de nuevo
          localStorage.removeItem('sia-lan-token');
          location.reload();
          return;
        }
        if (r.ok) { // acierto: las casillas en verde un instante y la puerta se va
          pad.ok();
          if (remote) { setTimeout(() => location.reload(), 320); return; }
          setTimeout(() => el.classList.add('leaving'), 220);
          setTimeout(leave, 440);
          return;
        }
        if (r.status === 429 && data.wait) return waitFor(data.wait);
        pad.fail(); // fallo: solo la sacudida, sin decir nada
      } catch { pad.fail(); }
    });
    pad.el.id = 'lock-pin'; pad.key.id = 'lock-key';
    el.querySelector('[data-slot="pad"]').replaceWith(pad.el);
    if (pad.keys) wait.after(pad.keys);

    // Ninguna tecla sale de la puerta: las de fuera se cortan antes de llegar a
    // nada (captura en window) y las de dentro no suben a los atajos globales.
    const trap = (e) => { if (!el.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); pad.focus(); } };
    window.addEventListener('keydown', trap, true);
    el.addEventListener('keydown', (e) => e.stopPropagation());
    // el foco, siempre en el PIN. Si el toque cae en el propio campo (cubre las
    // casillas) se deja al navegador: en el móvil es lo que abre el teclado.
    el.addEventListener('mousedown', (e) => { if (e.target !== pad.key) { e.preventDefault(); pad.focus(); } });
    pad.focus();
  });
  return lockGatePromise;
};

// Sesión de usuario (web/src/auth/): se abre al arrancar en el escritorio; el
// móvil entra por su emparejamiento y se queda sin ella.
let AUTH = null; // { session, user }

{
  const q = new URLSearchParams(location.search);
  const isPhone = location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname);
  if (q.get('ws') && q.get('api')) { // app de escritorio (Electron) o dev con puertos explícitos
    WS_URL = `ws://localhost:${q.get('ws')}`;
    API_BASE = `http://localhost:${q.get('api')}/api`;
  } else if (isPhone) { // MÓVIL: la web la sirve el propio bridge en la red local
    document.body.classList.add('phone'); // vista reducida: solo pestañas + terminal
    document.documentElement.classList.add('phone'); // html también: bloquea el scroll de página
    API_BASE = `${location.origin}/api`;
    LAN_TOKEN = localStorage.getItem('sia-lan-token') || null;
    // el tema del ordenador, antes de enseñar nada (el ping responde sin llave
    // mientras el acceso está abierto)
    try { adoptTheme((await (await fetch(`${API_BASE}/ping`, { signal: AbortSignal.timeout(1500) })).json()).theme); } catch { /* sin bridge: el que hubiera */ }
    const pairTok = q.get('p');
    if (pairTok) LAN_TOKEN = await lanPair(pairTok); // QR nuevo → (re)emparejar
    else if (!LAN_TOKEN) LAN_TOKEN = await lanPair(null); // PWA abierta a mano → PIN
    const lanPing = async () => {
      const ping = await (await fetch(`${API_BASE}/ping`, { headers: { 'X-SIA-LAN': LAN_TOKEN } })).json();
      adoptTheme(ping.theme);
      // candado echado: no se pasa de aquí sin el PIN
      if (ping.locked) { paintCachedTheme(); await lockGate({ remote: true }); }
      if (!ping.ws) throw new Error('token inválido'); // 403: el token ya no vale
      if (ping.mode) localStorage.setItem('sia-lan-mode', ping.mode);
      // el WS viaja por el MISMO origen que la web (ruta /ws): un solo puerto
      // en la LAN y la única forma de pasar por el túnel público (wss en 443)
      WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?t=${encodeURIComponent(LAN_TOKEN)}`;
    };
    try { await lanPing(); }
    catch { // token caducado (p. ej. SIA se reinició): re-emparejar con PIN
      localStorage.removeItem('sia-lan-token');
      LAN_TOKEN = await lanPair(null);
      try { await lanPing(); }
      catch { await lanFatal('No se pudo conectar con SIA. ¿Sigue activo el acceso en el ordenador?'); }
    }
  } else { // dev en navegador (localhost): descubrir el par del bridge
    // Se pregunta a todos los pares y se prefiere el bridge de DESARROLLO (el de
    // node dev.mjs). Con una app SIA instalada y abierta, el primer par es el
    // suyo: quedarse con «el primero que responde» enganchaba la web de dev a un
    // bridge de otra versión, y lo nuevo parecía no funcionar.
    const found = (await Promise.all(PORT_PAIRS.map(async ([w, a]) => {
      try {
        const p = await (await fetch(`http://localhost:${a}/api/ping`, { signal: AbortSignal.timeout(900) })).json();
        return p.sia ? { w, a, dev: p.dev === true } : null;
      } catch { return null; }
    }))).filter(Boolean);
    const pick = found.find((f) => f.dev) || found[0];
    if (pick) { WS_URL = `ws://localhost:${pick.w}`; API_BASE = `http://localhost:${pick.a}/api`; }
    if (!WS_URL) { // sin bridge a la vista: usar el primer par (reintentos al abrir chats)
      WS_URL = `ws://localhost:${PORT_PAIRS[0][0]}`;
      API_BASE = `http://localhost:${PORT_PAIRS[0][1]}/api`;
    }
  }
  // Escritorio: si la pantalla se quedó bloqueada (ventana recargada, app
  // cerrada y reabierta), la puerta va ANTES de conectar nada: con el candado
  // echado el bridge tampoco acepta sockets nuevos de esta máquina.
  if (!isPhone) {
    try {
      const st = await (await fetch(`${API_BASE}/lock`, { signal: AbortSignal.timeout(1500) })).json();
      if (st.locked) { paintCachedTheme(); await lockGate(); }
    } catch { /* bridge sin arrancar o anterior al candado: sin puerta */ }
  }
  // y después, quién eres (el móvil no: entra emparejado con el ordenador)
  if (!isPhone) {
    const session = createAuthSession(API_BASE);
    AUTH = { session, user: await ensureLogin(session, { logoHtml: LOGO_HTML, paintTheme: paintCachedTheme }) };
  }
}

// Candado automático en el móvil (solo acceso público): web/src/mobile/auto-lock.js
if (LAN_TOKEN && localStorage.getItem('sia-lan-mode') === 'public') {
  installAutoLock({ lockUrl: `${API_BASE}/lan/lock?t=${encodeURIComponent(LAN_TOKEN)}`, gate: () => lockGate({ remote: true }) });
}

/* ── Aviso de actualización ───────────────────────────────────────
   Pregunta al bridge (que compara con Supabase) si hay versión nueva y,
   si la hay, muestra un banner con enlace a la descarga. No instala solo:
   la instalación silenciosa en Mac requiere firma de Apple (pendiente). */
{
  const banner = document.getElementById('update-banner');
  const text = document.getElementById('update-text');
  const dl = document.getElementById('update-download');
  const close = document.getElementById('update-close');
  const checkUpdate = async () => {
    if (LAN_TOKEN) return; // en el móvil la versión es la del ordenador: no avisamos aquí
    let info;
    try { info = await (await fetch(`${API_BASE}/version`, { signal: AbortSignal.timeout(4000) })).json(); }
    catch { return; }
    if (!info.updateAvailable || localStorage.getItem('sia-skip-version') === info.latest) return;
    text.textContent = `Nueva versión disponible (v${info.latest}). Tienes la v${info.current}.`;
    dl.onclick = () => window.open(info.url, '_blank');
    close.onclick = () => { localStorage.setItem('sia-skip-version', info.latest); banner.hidden = true; };
    banner.hidden = false;
  };
  // DESACTIVADO por ahora: la descarga apunta al repo privado de GitHub y no
  // todo el equipo tiene acceso, así que el aviso frustra más que ayuda. Las
  // versiones se reparten a mano. checkUpdate queda definida a propósito:
  // para reactivar el aviso basta descomentar estas dos líneas.
  // checkUpdate();
  // setInterval(checkUpdate, 6 * 60 * 60 * 1000);
}

// Temas: web/src/theme/themes.js
let currentThemeId = themeById(localStorage.getItem('sia-theme')).id;
const currentTheme = () => themeById(currentThemeId);

const IS_MAC = /Mac|iP(hone|ad)/i.test(navigator.platform || navigator.userAgent || '');
const IS_PHONE = document.body.classList.contains('phone'); // acceso desde el móvil (lo fija el arranque)

const TERM_OPTS = {
  cursorBlink: true,
  fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.3,
};

/* Icons for the launcher buttons (by launcher id). */
const LAUNCHER_ICONS = {
  shell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  claude: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 6l14 12M19 6L5 18"/></svg>',
  copilot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="10" rx="4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M12 8V5"/></svg>',
  codex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 3v18M4.2 7.5 19.8 16.5M19.8 7.5 4.2 16.5"/></svg>',
};

/* ── DOM refs ─────────────────────────────────────────────────── */
const root = document.documentElement;
const tabsEl = document.getElementById('tabs');
const addBtn = document.getElementById('tab-add');
const stackEl = document.getElementById('term-stack');
const themeToggle = document.getElementById('theme-toggle');
const themeSwitch = themeToggle.querySelector('.sw');
const editor = document.getElementById('tab-editor');
const nameInput = document.getElementById('tab-name-input');
const colorsEl = document.getElementById('tab-colors');

const TAB_COLORS = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#89b4fa', '#cba6f7', '#f5c2e7'];

/* ── Sessions ─────────────────────────────────────────────────── */
const sessions = new Map();
let counter = 0;
let activeId = null;

const setSessionStatus = (s, status) => {
  s.status = status;
  s.dot.className = `tab-dot ${status === 'ok' ? 'ok' : status === 'off' ? 'off' : ''}`;
};

const sendResize = (s) => {
  if (s.launched && s.ws?.readyState === WebSocket.OPEN) {
    s.ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
  }
};

// Chrome del chat (pestañas, "+", Skills): oculto hasta que exista un chat de
// verdad — en el arranque solo se ve el selector, invitando a abrir el primero.
const updateChrome = () => {
  const launchedAny = [...sessions.values()].some((s) => s.launched || s.passive);
  tabsEl.hidden = !(launchedAny || sessions.size > 1);
};

// ¿Está el usuario escribiendo en un campo (renombrar pestaña, ajustes, PIN…)?
// Entonces la terminal NO debe robarle el foco. Cubre la carrera del doble
// clic (los click→setActive→rAF aterrizan después de abrir el editor) y los
// setActive de fondo que dispara la reconciliación multidispositivo.
const typingElsewhere = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT'
    || (el.tagName === 'TEXTAREA' && !el.classList.contains('xterm-helper-textarea')));
};

const setActive = (id) => {
  activeId = id;
  for (const s of sessions.values()) {
    const on = s.id === id;
    s.pane.hidden = !on;
    s.tab.classList.toggle('active', on);
  }
  const s = sessions.get(id);
  renderAssets();
  if (s && s.launched) {
    requestAnimationFrame(() => { s.fit.fit(); sendResize(s); if (!typingElsewhere()) s.term.focus(); });
  }
};

/* Launcher chooser: paso 1 (motor) y, si aplica, paso 2 (modo de conocimiento). */
const KNOWLEDGE_MODES = [
  {
    id: 'auto', label: 'Conocimiento autónomo',
    desc: 'Busca solo en la base del equipo cuando no sepa algo del proyecto.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/></svg>',
  },
  {
    id: 'demand', label: 'Conocimiento bajo demanda',
    desc: 'Solo busca cuando tú lances la skill «Buscar en conocimiento».',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  },
];

let accessProjects = []; // proyectos a los que dan acceso tus tokens en la base principal (del bridge)
let knownBases = [];     // bases configuradas [{id, name}] (del bridge)
const BASE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/></svg>';
const SOURCE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>';

const renderChooser = (s, launchers) => {
  s.launchers = launchers;
  renderEngineStep(s);
};

const renderEngineStep = (s) => {
  s.chooser.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'launcher-title';
  title.textContent = '¿Cómo abrimos este chat?';
  const grid = document.createElement('div');
  grid.className = 'launcher-grid';

  s.launchers.forEach((l) => {
    const btn = document.createElement('button');
    btn.className = 'launcher-btn';
    btn.disabled = !l.available;
    btn.innerHTML = `<span class="launcher-ico">${LAUNCHER_ICONS[l.id] || ''}</span><span class="launcher-name">${l.label}</span>${l.available ? '' : '<span class="launcher-na">no instalado</span>'}`;
    if (l.available) {
      btn.addEventListener('click', () => (l.modes ? renderKnowledgeStep(s, l) : launchSession(s, l)));
    }
    grid.appendChild(btn);
  });

  s.chooser.append(title, grid);
};

const renderKnowledgeStep = async (s, launcher) => {
  // refrescar fuentes desde el bridge (recoge proyectos creados al vuelo)
  try { accessProjects = await api('/access/projects'); } catch { /* deja lo último conocido */ }
  s.chooser.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'launcher-title';
  title.textContent = `¿Cómo usamos el conocimiento del equipo en este ${launcher.label}?`;
  const grid = document.createElement('div');
  grid.className = 'launcher-grid';

  KNOWLEDGE_MODES.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'launcher-btn wide';
    btn.innerHTML = `<span class="launcher-ico">${m.icon}</span><span class="launcher-name">${m.label}</span><span class="launcher-desc">${m.desc}</span>`;
    // con varias bases, elegir contra cuál; si no, directo a las fuentes de la principal
    btn.addEventListener('click', () => (knownBases.length > 1
      ? renderBaseStep(s, launcher, m.id)
      : proceedSources(s, launcher, m.id, knownBases[0]?.id || null, accessProjects)));
    grid.appendChild(btn);
  });

  const back = document.createElement('button');
  back.className = 'launcher-back';
  back.textContent = '← elegir otro motor';
  back.addEventListener('click', () => renderEngineStep(s));

  s.chooser.append(title, grid, back);
};

// si la base da acceso a >1 proyecto, pasar por el selector de fuentes; si no, lanzar
const proceedSources = (s, launcher, mode, baseId, projects) => (projects.length > 1
  ? renderSourcesStep(s, launcher, mode, baseId, projects)
  : launchSession(s, launcher, mode, projects.map((p) => p.id), baseId));

// Paso 3 (solo con varias bases): ¿contra qué base trabaja este chat? Cada
// chat ataca una sola base; la principal va primero y preseleccionada.
const renderBaseStep = (s, launcher, mode) => {
  s.chooser.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'launcher-title';
  title.textContent = '¿Contra qué base de conocimiento?';
  const grid = document.createElement('div');
  grid.className = 'launcher-grid';
  knownBases.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = 'launcher-btn wide';
    btn.innerHTML = `<span class="launcher-ico">${BASE_ICON}</span><span class="launcher-name">${esc(b.name)}</span><span class="launcher-desc">conocimiento y skills de esta base</span>`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      let projects = [];
      try { projects = await api(`/access/projects?base=${encodeURIComponent(b.id)}`); } catch {}
      proceedSources(s, launcher, mode, b.id, projects);
    });
    grid.appendChild(btn);
  });
  const back = document.createElement('button');
  back.className = 'launcher-back';
  back.textContent = '← volver';
  back.addEventListener('click', () => renderKnowledgeStep(s, launcher));
  s.chooser.append(title, grid, back);
};

// Paso 4 (solo si hay acceso a varios proyectos): elegir las fuentes del chat.
const renderSourcesStep = (s, launcher, mode, baseId, projects) => {
  s.chooser.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'launcher-title';
  title.textContent = '¿Qué fuentes de conocimiento en este chat?';
  const grid = document.createElement('div');
  grid.className = 'launcher-grid';

  const selected = new Set(projects.map((p) => p.id)); // por defecto, todas
  const paint = (btn, on) => {
    btn.classList.toggle('selected', on);
    btn.querySelector('.src-state').textContent = on ? '✓ incluida' : 'excluida — clic para añadir';
  };
  projects.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'launcher-btn wide source-btn selected';
    btn.innerHTML = `<span class="launcher-ico">${SOURCE_ICON}</span><span class="launcher-name">${p.name}</span><span class="launcher-desc src-state">✓ incluida</span>`;
    btn.addEventListener('click', () => {
      if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id);
      paint(btn, selected.has(p.id));
      go.disabled = selected.size === 0;
    });
    grid.appendChild(btn);
  });

  const go = document.createElement('button');
  go.className = 'lab-btn primary';
  go.textContent = 'Abrir chat';
  go.addEventListener('click', () => launchSession(s, launcher, mode, [...selected], baseId));

  const back = document.createElement('button');
  back.className = 'launcher-back';
  back.textContent = '← volver';
  back.addEventListener('click', () => (knownBases.length > 1 ? renderBaseStep(s, launcher, mode) : renderKnowledgeStep(s, launcher)));

  s.chooser.append(title, grid, go, back);
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
const enableTouchScroll = (s) => {
  const vp = s.termHost.querySelector('.xterm-viewport');
  const core = s.term._core?.viewport;
  if (!vp || typeof core?.syncScrollArea !== 'function') return;
  const realSync = core.syncScrollArea.bind(core);
  let touching = false, gliding = false, settleT = 0;
  core.syncScrollArea = (immediate) => { if (!touching && !gliding) realSync(immediate); };
  const settle = () => {
    clearTimeout(settleT);
    settleT = setTimeout(() => { if (touching) return; gliding = false; realSync(); }, 150);
  };
  const end = () => { touching = false; settle(); };
  s.termHost.addEventListener('touchstart', (e) => {
    touching = true; gliding = true; clearTimeout(settleT);
    e.stopPropagation(); // que xterm no arranque su propio arrastre
  }, { capture: true, passive: true });
  s.termHost.addEventListener('touchmove', (e) => e.stopPropagation(), { capture: true, passive: true });
  s.termHost.addEventListener('touchend', end, { capture: true, passive: true });
  s.termHost.addEventListener('touchcancel', end, { capture: true, passive: true });
  vp.addEventListener('scroll', () => { if (gliding) settle(); }, { passive: true }); // inercia en curso
};

/* Montar la terminal de una sesión (común a lanzar nueva y re-enganchar). */
const materialize = (s) => {
  s.launched = true;
  s.chooser.hidden = true;
  s.termHost.hidden = false;

  const term = new Terminal({ ...TERM_OPTS, theme: currentTheme().term });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(s.termHost);
  s.term = term;
  s.fit = fit;
  if (IS_PHONE) {
    // pintar por GPU: con scroll nativo se repinta la pantalla en cada frame y
    // el renderizador DOM (cientos de nodos por frame) no da abasto en un móvil
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose()); // sin contexto → vuelve el DOM
      term.loadAddon(gl);
    } catch { /* sin WebGL: renderizador DOM de serie */ }
    enableTouchScroll(s);
  }

  // Copy/paste en Windows/Linux: ahí xterm manda Ctrl+C como ^C (SIGINT) y
  // Ctrl+V como ^V, así que el copy/paste nativo no funciona. Lo cableamos a
  // mano. En Mac (⌘C/⌘V) el navegador ya lo gestiona bien → no lo tocamos.
  if (!IS_MAC) {
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
      // (que provocaría doble pegado sobre pasteFromClipboard).
      if (key === 'v') { e.preventDefault(); pasteFromClipboard(s); return false; }
      return true;
    });
  }

  term.onData((data) => {
    if (s.ws?.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify({ type: 'input', data }));
  });

  setSessionStatus(s, 'ok');
  updateChrome();

  // Reajuste robusto: en cuanto el panel tiene su tamaño real (el layout flex
  // asienta, cambia la fuente del tema, o se muestra la pestaña), refit. Evita
  // tener que redimensionar la ventana a mano para que ocupe todo.
  const refit = () => { if (!s.pane.hidden && s.term) { try { s.fit.fit(); sendResize(s); } catch {} } };
  s.ro = new ResizeObserver(refit);
  s.ro.observe(s.termHost);
  document.fonts?.ready.then(refit); // la fuente del tema puede cambiar la métrica de celda
  requestAnimationFrame(() => { refit(); if (!typingElsewhere()) term.focus(); });
};

/* Sincronizar nombre/color de la pestaña con el bridge (persisten entre recargas). */
const sendMeta = (s) => {
  if (s.launched && s.ws?.readyState === WebSocket.OPEN) {
    s.ws.send(JSON.stringify({ type: 'meta', label: s.label, color: s.color }));
  }
};

/* Actually open the chosen launcher: create the terminal + start the pty. */
const launchSession = (s, launcher, knowledge = null, projects = null, base = null) => {
  if (s.launched) return;
  s.launcher = launcher.id;
  s.base = base;

  // name the tab after the launcher (user can still rename)
  if (!s.renamed) {
    s.label = launcher.label;
    s.tab.querySelector('.tab-label').textContent = launcher.label;
  }

  materialize(s);
  // medir el terminal ANTES de lanzar y mandar el tamaño en el start, para que
  // el PTY nazca con el ancho real (si no, el CLI dibuja a 80 columnas y queda
  // estrecho hasta el primer resize). Doble rAF: deja asentar el layout.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { s.fit.fit(); } catch {}
    s.ws.send(JSON.stringify({
      type: 'start', launcher: launcher.id, knowledge, projects, base,
      cols: s.term.cols, rows: s.term.rows,
    }));
  }));
};

let bootstrapped = false; // tras el primer 'launchers' restauramos sesiones vivas

const createSession = (opts) => {
  const attach = opts?.attach || null; // sesión viva del bridge a re-enganchar
  // passive: el chat existe en el bridge pero lo tiene OTRO dispositivo; se
  // muestra la pestaña con un botón para traer los chats aquí (no se roba).
  const passive = !!opts?.passive;
  const id = ++counter;
  const label = attach?.label || `Chat ${id}`;

  // pane = chooser + terminal host
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.hidden = true;
  const chooser = document.createElement('div');
  chooser.className = 'launcher';
  const termHost = document.createElement('div');
  termHost.className = 'term-host';
  termHost.hidden = true;
  pane.append(chooser, termHost);
  stackEl.appendChild(pane);

  const s = {
    id, label, pane, chooser, termHost,
    base: opts?.attach?.base || null, // base de conocimiento del chat (para la paleta)
    term: null, fit: null, ws: null, passive,
    tab: null, dot: null, status: 'idle',
    launched: false, renamed: !!attach?.label, launcher: attach?.launcher || null,
    color: attach?.color || null, remoteId: attach?.id || null,
    assets: (attach?.assets || []).map(toAsset),
    assetsOpen: true,
  };

  // build tab
  const tab = document.createElement('button');
  tab.className = 'tab';
  const dot = document.createElement('span');
  dot.className = 'tab-dot';
  const name = document.createElement('span');
  name.className = 'tab-label';
  name.textContent = label;
  const close = document.createElement('button');
  close.className = 'tab-close';
  close.textContent = '×';
  close.title = 'Cerrar';
  tab.append(dot, name, close);
  tabsEl.insertBefore(tab, addBtn);
  s.tab = tab;
  s.dot = dot;

  tab.addEventListener('click', () => setActive(id));
  tab.addEventListener('dblclick', (e) => { e.stopPropagation(); openTabEditor(s); });
  close.addEventListener('click', (e) => { e.stopPropagation(); closeSession(id); });

  // drag to reorder
  tab.draggable = true;
  tab.addEventListener('dragstart', (e) => {
    draggedTab = tab; tab.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
  });
  tab.addEventListener('dragend', () => { tab.classList.remove('dragging'); draggedTab = null; });

  sessions.set(id, s);
  if (passive) showHandoff(s);
  else connectSession(s, attach);
  setActive(id);
  updateChrome();
};

/* Abre el socket de una sesión y cablea el protocolo. Se usa al crear la
   pestaña y también al reclamar un chat que tenía otro dispositivo. */
const connectSession = (s, attach) => {
  const ws = new WebSocket(WS_URL);
  s.ws = ws;

  // re-enganche: montar la terminal en cuanto abra el socket y pedir attach
  ws.onopen = () => {
    if (attach) {
      applyTabColor(s);
      materialize(s);
      ws.send(JSON.stringify({ type: 'attach', sessionId: attach.id }));
      flushPendingAssets(s); // adjuntos subidos mientras el socket estaba caído
    }
  };

  // protocolo: TODOS los mensajes del bridge son JSON
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    switch (m.type) {
      case 'launchers':
        skillsByBase = m.skillsByBase || {};
        accessProjects = m.accessProjects || [];
        knownBases = m.bases || [];
        if (!s.launched && !attach) renderChooser(s, m.list);
        if (!bootstrapped) {
          bootstrapped = true;
          if (m.sessions?.length) restoreSessions(m.sessions, s.id);
        }
        break;
      case 'started':
        s.remoteId = m.sessionId;
        if (s.renamed || s.color) sendMeta(s); // sincroniza nombre/color previos
        // ya sabemos qué chat es el nuestro: re-reconciliar quita cualquier
        // pestaña fantasma de la carrera broadcast-vs-started y trae las
        // pasivas legítimas que se hubieran pospuesto en esa ventana
        if (lastSessionsList) reconcileSessions(lastSessionsList);
        break;
      case 'history':
      case 'data':
        if (s.term) s.term.write(m.data);
        break;
      case 'exit':
        s.dead = true; // el PTY murió de verdad: no hay nada que recuperar
        setSessionStatus(s, 'off');
        break;
      case 'gone': // la sesión ya no existe en el bridge
        closeSession(s.id);
        break;
      case 'error':
        if (s.launched) dlgAlert('Error de sesión', esc(m.message));
        else s.chooser.insertAdjacentHTML('beforeend', `<div class="launcher-err">${m.message}</div>`);
        break;
    }
  };
  // 4409 = otro dispositivo tomó los chats (handoff): la pestaña pasa a modo
  // pasivo con botón de recuperarlos. Cualquier otro cierre NO significa que el
  // chat haya muerto —el PTY vive en el bridge—: suspender el Mac, bloquear la
  // pantalla o perder la red tumban el socket mientras el proceso sigue vivo.
  // Se marca el enlace como perdido y la reconciliación decide qué hacer con él.
  ws.onclose = (e) => {
    if (s.ws !== ws) return; // socket ya sustituido por un re-enganche: no pisarlo
    if (e.code === 4423) { lockedGate(); return; } // el bridge echó el candado
    if (e.code === 4403 && LAN_TOKEN) { lanRevoked(); return; } // el ordenador cerró este dispositivo
    if (e.code === 4409) { setPassive(s); return; }
    if (!sessions.has(s.id) || !s.launched) return; // pestaña ya cerrada aquí
    s.ws = null;
    setSessionStatus(s, 'off');
    if (s.dead) return; // el PTY ya había salido: es una muerte real
    // Sin reconciliar aquí a propósito: la lista que tenemos es de ANTES del
    // cierre y aún nos da como enganchados. El bridge emite una nueva al
    // detectar el cierre (y al reconectar el socket de control), y es esa la
    // que decide si el chat vuelve solo o hay que ofrecer el botón.
    s.linkLost = true;
  };
  ws.onerror = () => { if (s.ws === ws && s.launched && !s.passive) setSessionStatus(s, 'off'); };
};

/* Recargaste con chats vivos: re-crear sus pestañas y quitar el selector
   inicial. Solo nos enganchamos a los chats LIBRES; los que ya tiene otro
   dispositivo aparecen en modo pasivo con el botón de traerlos aquí. */
const restoreSessions = (list, bootstrapId) => {
  for (const r of list) createSession({ attach: r, passive: !!r.attached });
  closeSession(bootstrapId);
};

/* ── Multidispositivo: modo pasivo y sincronización de la lista ──────
   Una pestaña pasiva es un chat vivo en el bridge que tiene OTRO dispositivo
   (o quedó libre al cerrarse aquel). No se roba: muestra un botón que trae
   TODOS los chats a este dispositivo (aquí solo se usa uno a la vez). */
const showHandoff = (s) => {
  s.chooser.hidden = true;
  s.termHost.hidden = true;
  if (!s.handoffEl) {
    s.handoffEl = document.createElement('div');
    s.handoffEl.className = 'handoff';
    s.handoffEl.innerHTML = `
      <p>Este chat está abierto en otro dispositivo.</p>
      <button class="lab-btn primary">Usar los chats en este dispositivo</button>`;
    s.handoffEl.querySelector('button').addEventListener('click', claimAllHere);
    s.pane.appendChild(s.handoffEl);
  }
  s.handoffEl.hidden = false;
  setSessionStatus(s, 'idle'); // punto neutro: ni vivo ni muerto
};

/* Otro dispositivo tomó este chat: desmontar la terminal local y quedar en
   pasivo, listo para recuperarlo con el botón. */
const setPassive = (s) => {
  s.passive = true;
  s.launched = false;
  s.linkLost = false;
  teardownTerm(s);
  s.ws = null;
  showHandoff(s);
  updateChrome();
};

/* Desmontar la terminal local sin tocar el chat del bridge. Al re-engancharse
   llega el scrollback entero en el 'history', así que no se pierde nada. */
const teardownTerm = (s) => {
  if (s.ro) { try { s.ro.disconnect(); } catch {} s.ro = null; }
  if (s.term) { try { s.term.dispose(); } catch {} s.term = null; }
};

/* Volver a engancharse a un chat que sigue vivo en el bridge (perdimos el
   socket, o lo tenía otro dispositivo y lo reclamamos aquí). */
const reattach = (s) => {
  s.passive = false;
  s.linkLost = false;
  if (s.handoffEl) s.handoffEl.hidden = true;
  teardownTerm(s); // fuera la terminal vieja: 'history' la repinta entera
  s.termHost.hidden = false;
  connectSession(s, { id: s.remoteId });
};

/* Traer TODOS los chats a este dispositivo (el que los tenía pasa a pasivo).
   Cubre tanto las pestañas pasivas como las que perdieron el enlace. */
const claimAllHere = () => {
  for (const s of sessions.values()) {
    if (!s.remoteId || !(s.passive || s.linkLost)) continue;
    reattach(s);
  }
  updateChrome();
};

/* Quitar una pestaña sin matar nada en el bridge (el chat murió o dejó de
   existir): limpieza solo local. */
const removeTab = (id) => {
  const s = sessions.get(id);
  if (!s) return;
  try { s.ws?.close(); } catch {}
  if (s.ro) { try { s.ro.disconnect(); } catch {} }
  if (s.term) { try { s.term.dispose(); } catch {} }
  s.pane.remove();
  s.tab.remove();
  sessions.delete(id);
  if (activeId === id) {
    const next = [...sessions.keys()].pop() || null;
    if (next) setActive(next);
    else { activeId = null; createSession(); }
  }
  updateChrome();
};

// Adjuntos de un chat tal como los da el bridge → con su URL y si es imagen.
const toAsset = (a) => ({ ...a, url: `${API_BASE}/uploads/${encodeURIComponent(a.name)}`, isImage: isImageName(a.name) });
// Suma a un chat los adjuntos que el bridge conoce y aquí faltan (los subió otro
// dispositivo). Nunca quita: un adjunto no se borra. Devuelve si añadió alguno.
const mergeAssets = (s, list) => {
  let added = false;
  for (const a of list || []) {
    if (s.assets.some((x) => x.name === a.name)) continue;
    s.assets.push(toAsset(a));
    added = true;
  }
  return added;
};

/* El bridge reemite la lista de chats en cada cambio (nuevo chat, muerte,
   rename, handoff…) por el socket de control. Reconciliar pestañas:
   idempotente, y sin tocar las sesiones activas de ESTE dispositivo (su ciclo
   de vida lo llevan sus propios mensajes exit/gone). */
let lastSessionsList = null; // última lista procesada (para re-reconciliar)
const reconcileSessions = (list) => {
  if (!bootstrapped) return; // el arranque lo gestiona restoreSessions
  lastSessionsList = list;
  const remote = new Map(list.map((r) => [r.id, r]));
  for (const s of [...sessions.values()]) {
    if (!s.remoteId) continue; // selector inicial: no representa un chat
    const r = remote.get(s.remoteId);
    remote.delete(s.remoteId);
    if (!r) { // ya no existe en el bridge
      if (s.passive) removeTab(s.id);       // murió en otro lado
      else if (s.linkLost) { s.linkLost = false; s.dead = true; } // muerte real
      continue;
    }
    // adjuntos subidos desde otro dispositivo (una foto desde el móvil): salen
    // aquí al momento, en el clip de la barra y en el panel
    if (mergeAssets(s, r.assets) && s.id === activeId) { renderAssets(); refitActive(); }
    // Perdimos el socket (suspensión, red, cierre de sesión) pero el chat sigue
    // vivo: si nadie lo tiene, volver a engancharlo solo; si lo tiene otro
    // dispositivo, dejar la pestaña pasiva con el botón de traerlo aquí.
    if (s.linkLost) { if (r.attached) setPassive(s); else reattach(s); continue; }
    if (s.passive) { // reflejar rename/color hechos en el otro dispositivo
      if (r.label && r.label !== s.label) { s.label = r.label; s.tab.querySelector('.tab-label').textContent = r.label; }
      if ((r.color || null) !== s.color) { s.color = r.color || null; applyTabColor(s); }
    }
  }
  // Un chat lanzado AQUÍ cuyo `started` aún no llegó (viaja por otro socket que
  // el broadcast): no crear pasivas hasta resolverlo, o el propio chat recién
  // creado aparecería como pestaña fantasma. Al llegar su `started` se
  // re-reconcilia y cualquier chat remoto real aparece igualmente.
  if ([...sessions.values()].some((s) => s.launched && !s.remoteId && !s.passive)) return;
  // chats nuevos abiertos en otro dispositivo → pestaña pasiva aquí, sin
  // robar el foco de lo que se esté haciendo en ESTE dispositivo
  const keep = activeId;
  for (const r of remote.values()) createSession({ attach: r, passive: true });
  if (keep && sessions.has(keep)) setActive(keep);
};

/* Socket de control: siempre conectado (aunque todos los chats estén en otro
   dispositivo) para recibir la lista sincronizada; reintenta si se cae.
   También lleva la X de las pestañas pasivas (kill por sessionId). */
let controlWS = null;
const connectControl = () => {
  controlWS = new WebSocket(WS_URL);
  controlWS.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    // 'launchers' es el saludo del bridge y trae la lista viva: reconciliar
    // también con él es lo que recupera los chats al reconectar (tras dormir el
    // Mac nadie más emite un broadcast, así que sin esto nada se cura).
    if (m.type === 'sessions' || m.type === 'launchers') reconcileSessions(m.sessions || []);
    // el ordenador cambió de tema: el móvil lo sigue al momento
    if (m.type === 'theme' && LAN_TOKEN && m.theme?.id) applyTheme(m.theme.id);
  };
  controlWS.onclose = (e) => {
    if (e.target !== controlWS) return; // socket ya sustituido: no duplicar
    if (e.code === 4423) { lockedGate(); return; } // candado: nada de reintentar
    if (e.code === 4403 && LAN_TOKEN) { lanRevoked(); return; } // sesión cerrada desde el ordenador
    setTimeout(connectControl, 3000);
  };
};
connectControl();

/* Al despertar el Mac (o volver a la ventana) el socket de control puede haber
   quedado medio abierto: no da error, pero tampoco llega nada, así que nadie
   avisaría de que los chats siguen vivos. Se rehace sin esperar, y su saludo
   trae la lista con la que se recuperan las pestañas. */
let lastRevive = 0;
const reviveControl = () => {
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastRevive < 10_000) return; // el foco va y viene: no rehacerlo a cada clic
  lastRevive = now;
  const old = controlWS;
  controlWS = null;
  if (old) { old.onclose = null; try { old.close(); } catch {} }
  connectControl();
};
window.addEventListener('online', reviveControl);
window.addEventListener('focus', reviveControl);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reviveControl(); });

const closeSession = (id) => {
  const s = sessions.get(id);
  if (!s) return;
  // cerrar pestaña = matar la sesión del bridge (recargar NO pasa por aquí)
  if (s.launched && s.ws?.readyState === WebSocket.OPEN) {
    try { s.ws.send(JSON.stringify({ type: 'kill' })); } catch {}
  } else if (s.remoteId && controlWS?.readyState === WebSocket.OPEN) {
    // pestaña pasiva o sin socket: matarla igualmente (la X es la X)
    try { controlWS.send(JSON.stringify({ type: 'kill', sessionId: s.remoteId })); } catch {}
  }
  try { s.ws?.close(); } catch {}
  if (s.ro) { try { s.ro.disconnect(); } catch {} }
  if (s.term) { try { s.term.dispose(); } catch {} }
  s.pane.remove();
  s.tab.remove();
  sessions.delete(id);
  if (activeId === id) {
    const next = [...sessions.keys()].pop() || null;
    if (next) setActive(next);
    else { activeId = null; createSession(); } // sin chats → de vuelta al selector
  }
  updateChrome();
};

addBtn.addEventListener('click', createSession);

/* ── Adjuntos (pegar / arrastrar cualquier fichero) ───────────── */
const isImageName = (n) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(n || '');
const assetsBtn = document.getElementById('assets-btn');
const assetsPanel = document.getElementById('assets-panel');
const assetsList = document.getElementById('assets-list');
const assetsClose = document.getElementById('assets-close');

const refitActive = () => {
  const s = activeId ? sessions.get(activeId) : null;
  if (s && s.launched) requestAnimationFrame(() => { s.fit.fit(); sendResize(s); });
};

const renderAssets = () => {
  const s = activeId ? sessions.get(activeId) : null;
  const assets = s?.assets || [];
  assetsBtn.hidden = !assets.length;
  if (assets.length) assetsBtn.querySelector('.count').textContent = assets.length;
  const open = !!(s && s.assetsOpen && assets.length);
  assetsPanel.hidden = !open;
  if (!open) return;
  assetsList.innerHTML = '';
  assets.forEach((a) => {
    const ext = (a.name.split('.').pop() || 'file').toUpperCase().slice(0, 5);
    const item = document.createElement('div');
    item.className = 'asset-item';
    item.innerHTML = `
      ${a.isImage
        ? `<img src="${a.url}" alt="${esc(a.name)}" title="Ver grande" />`
        : `<div class="asset-file" title="Abrir"><span class="ext">${esc(ext)}</span></div>`}
      <div class="asset-meta">
        <span class="name" title="${esc(a.name)}">${esc(a.name)}</span>
        <button class="asset-insert" title="Insertar la ruta de nuevo en el chat">↩</button>
      </div>`;
    const preview = item.querySelector('img, .asset-file');
    preview.addEventListener('click', () => {
      if (a.isImage) {
        openDialog({ title: a.name, bodyHTML: `<img src="${a.url}" style="max-width:100%" />`, alertOnly: true, okLabel: 'Cerrar' });
      } else {
        window.open(a.url, '_blank');
      }
    });
    item.querySelector('.asset-insert').addEventListener('click', () => {
      const sess = activeId ? sessions.get(activeId) : null;
      if (sess?.launched && sess.ws?.readyState === WebSocket.OPEN) { sess.ws.send(JSON.stringify({ type: 'input', data: `${a.absPath} ` })); sess.term.focus(); }
    });
    assetsList.appendChild(item);
  });
};

assetsBtn.addEventListener('click', () => {
  const s = activeId ? sessions.get(activeId) : null;
  if (!s) return;
  s.assetsOpen = !s.assetsOpen;
  renderAssets();
  refitActive();
});
assetsClose.addEventListener('click', () => {
  const s = activeId ? sessions.get(activeId) : null;
  if (!s) return;
  s.assetsOpen = false;
  renderAssets();
  refitActive();
});

// Un adjunto subido entra en el chat: se registra en el bridge (persiste con la
// sesión, recargas incluidas) y su ruta va al prompt del CLI sin Enter, para
// que el usuario escriba su pregunta alrededor.
const announceAsset = (s, asset) => {
  s.ws.send(JSON.stringify({ type: 'asset', asset: { name: asset.name, absPath: asset.absPath } }));
  s.ws.send(JSON.stringify({ type: 'input', data: `${asset.absPath} ` }));
};
const flushPendingAssets = (s) => {
  if (!s.pendingAssets?.length || s.ws?.readyState !== WebSocket.OPEN) return;
  for (const a of s.pendingAssets) announceAsset(s, a);
  s.pendingAssets = [];
};
const uploadAsset = async (s, file) => {
  try {
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('no se pudo leer el fichero'));
      r.readAsDataURL(file);
    });
    const out = await api('/upload', { method: 'POST', body: JSON.stringify({ name: file.name || 'adjunto', data }) });
    const asset = { name: out.name, absPath: out.absPath, url: `${API_BASE}/uploads/${encodeURIComponent(out.name)}`, isImage: isImageName(out.name) };
    s.assets.push(asset);
    if (!IS_PHONE) s.assetsOpen = true; // en el móvil no hay panel de adjuntos: se comería media pantalla
    // la subida es asíncrona: el socket puede haberse caído por el camino (en
    // el móvil, la cámara lo tumba a veces). Si no está, el adjunto espera en
    // cola y entra en cuanto el socket vuelva (flushPendingAssets).
    if (s.ws?.readyState === WebSocket.OPEN) announceAsset(s, asset);
    else (s.pendingAssets ||= []).push(asset);
    renderAssets();
    refitActive();
    s.term.focus();
  } catch (err) {
    dlgAlert('No se pudo adjuntar el fichero', esc(err.message));
  }
};

// Pega en la sesión desde el portapapeles: imagen → se adjunta; texto → se
// escribe en la terminal. Lo usa el handler de teclado en Windows/Linux, donde
// xterm intercepta Ctrl+V como ^V y el evento de pegado nativo no llega.
const pasteFromClipboard = async (s) => {
  if (!s || !s.launched || !s.term) return;
  try {
    if (navigator.clipboard?.read) {
      for (const item of await navigator.clipboard.read()) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          uploadAsset(s, new File([blob], `pegado.${imgType.split('/')[1] || 'png'}`, { type: imgType }));
          return;
        }
      }
    }
    const text = await navigator.clipboard?.readText();
    if (text) s.term.paste(text);
  } catch { /* portapapeles vacío o sin permiso */ }
};

// pegar desde el portapapeles (⌘V: imágenes copiadas o ficheros del Finder)
document.addEventListener('paste', (e) => {
  if (viewChat.hidden) return;
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return; // texto: lo gestiona xterm con normalidad
  const s = activeId ? sessions.get(activeId) : null;
  if (!s || !s.launched) return;
  e.preventDefault();
  files.forEach((f) => uploadAsset(s, f));
});

// arrastrar ficheros (de cualquier tipo) encima de la terminal
stackEl.addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
});
stackEl.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  const s = activeId ? sessions.get(activeId) : null;
  if (!s || !s.launched) { dlgAlert('Sin chat activo', 'Lanza un chat antes de adjuntar ficheros.'); return; }
  files.forEach((f) => uploadAsset(s, f));
});

// Arranque: directo al selector del primer chat (sin chrome de pestañas).
createSession();

/* ── Drag to reorder tabs ─────────────────────────────────────── */
let draggedTab = null;
const dragAfter = (x) => {
  const els = [...tabsEl.querySelectorAll('.tab:not(.dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el };
  }
  return closest.el;
};
tabsEl.addEventListener('dragover', (e) => {
  if (!draggedTab) return;
  e.preventDefault();
  const after = dragAfter(e.clientX);
  if (after) tabsEl.insertBefore(draggedTab, after);
  else tabsEl.insertBefore(draggedTab, addBtn);
});

/* ── Tab editor (rename + color) ──────────────────────────────── */
let editing = null;

const applyTabColor = (s) => {
  if (s.color) { s.tab.classList.add('colored'); s.tab.style.setProperty('--tab-color', s.color); }
  else { s.tab.classList.remove('colored'); s.tab.style.removeProperty('--tab-color'); }
};

const buildColors = () => {
  const none = document.createElement('span');
  none.className = 'swatch none'; none.dataset.color = ''; none.title = 'Sin color';
  colorsEl.appendChild(none);
  TAB_COLORS.forEach((c) => {
    const sw = document.createElement('span');
    sw.className = 'swatch'; sw.style.background = c; sw.dataset.color = c;
    colorsEl.appendChild(sw);
  });
  colorsEl.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw || !editing) return;
    editing.color = sw.dataset.color || null;
    applyTabColor(editing);
    markActiveColor(editing.color);
    sendMeta(editing);
  });
};
const markActiveColor = (color) => {
  colorsEl.querySelectorAll('.swatch').forEach((sw) =>
    sw.classList.toggle('active', (sw.dataset.color || '') === (color || '')));
};
buildColors();

const openTabEditor = (s) => {
  editing = s;
  const r = s.tab.getBoundingClientRect();
  editor.style.left = `${Math.round(r.left)}px`;
  editor.style.top = `${Math.round(r.bottom + 6)}px`;
  nameInput.value = s.label;
  markActiveColor(s.color);
  editor.hidden = false;
  nameInput.focus();
  nameInput.select();
};
const closeTabEditor = () => { editor.hidden = true; editing = null; };

nameInput.addEventListener('input', () => {
  if (!editing) return;
  const v = nameInput.value.trim() || `Chat ${editing.id}`;
  editing.label = v;
  editing.renamed = true;
  editing.tab.querySelector('.tab-label').textContent = v;
  sendMeta(editing);
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') closeTabEditor();
});
// mousedown (not click): only the press origin matters, so selecting text in
// the input and releasing outside won't close the editor.
document.addEventListener('mousedown', (e) => {
  if (!editor.hidden && !editor.contains(e.target) && !e.target.closest('.tab')) closeTabEditor();
});

/* ── Skills command palette (⌘K) ──────────────────────────────── */
// catálogo de skills por base; la paleta enseña las de la base del chat activo
let skillsByBase = {};
const currentSkills = () => {
  const s = activeId ? sessions.get(activeId) : null;
  const base = s?.base || knownBases[0]?.id || null;
  return (base && skillsByBase[base]) || [];
};
const skillsBtn = document.getElementById('skills-btn');
const palette = document.getElementById('skills-palette');
const paletteInput = document.getElementById('palette-input');
const paletteList = document.getElementById('palette-list');

let paletteItems = []; // filtered skills currently shown
let paletteIndex = 0;

// diacritics/case-insensitive matching ("nutricion" finds "Nutrición")
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const applySkill = (sk) => {
  const active = activeId ? sessions.get(activeId) : null;
  if (!active || !active.launched || active.ws?.readyState !== WebSocket.OPEN) return;
  // One short line typed into the CLI: both Claude and Copilot read the
  // skill file themselves (per CLAUDE.md/AGENTS.md instructions).
  const order = `Ejecuta la skill ${sk.id}: lee skills/${sk.id}/SKILL.md y sigue sus instrucciones estrictamente.`;
  // texto y Enter por separado: si van juntos, el TUI lo trata como "pegado" y
  // el Enter cuenta como salto de línea en vez de enviar (igual que applyFinder).
  active.ws.send(JSON.stringify({ type: 'input', data: order }));
  setTimeout(() => active.ws.send(JSON.stringify({ type: 'input', data: '\r' })), 120);
  closePalette();
  active.term.focus();
};

// "No sé cuál": lanza skill-finder con la descripción del usuario y lo ENVÍA
// solo (sin tener que pulsar Enter en el terminal).
const applyFinder = (desc) => {
  const active = activeId ? sessions.get(activeId) : null;
  if (!active || !active.launched || !desc.trim() || active.ws?.readyState !== WebSocket.OPEN) return;
  const order = `Ejecuta la skill skill-finder: lee skills/skill-finder/SKILL.md y sigue sus instrucciones. El usuario busca esta funcionalidad: "${desc.trim().replace(/"/g, "'")}".`;
  // texto y Enter por separado: si van juntos, el TUI lo trata como "pegado" y
  // el Enter cuenta como salto de línea en vez de enviar.
  active.ws.send(JSON.stringify({ type: 'input', data: order }));
  setTimeout(() => active.ws.send(JSON.stringify({ type: 'input', data: '\r' })), 120);
  closePalette();
  active.term.focus();
};

const renderPalette = () => {
  const q = fold(paletteInput.value.trim());
  paletteItems = q
    ? currentSkills().filter((sk) => fold(`${sk.label} ${sk.description} ${sk.id} ${sk.category}`).includes(q))
    : currentSkills();
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));

  paletteList.innerHTML = '';
  const active = activeId ? sessions.get(activeId) : null;
  if (!active || !active.launched) {
    paletteList.innerHTML = '<li class="palette-empty">Abre un chat primero para poder aplicar una skill.</li>';
    return;
  }
  if (!currentSkills().length) {
    paletteList.innerHTML = '<li class="palette-empty">No hay skills en workspace/skills/</li>';
    return;
  }
  if (!paletteItems.length) {
    paletteList.innerHTML = `<li class="palette-empty">Sin resultados para «${paletteInput.value.trim()}»</li>`;
    return;
  }
  paletteItems.forEach((sk, i) => {
    const li = document.createElement('li');
    if (i === paletteIndex) li.classList.add('selected');
    li.innerHTML = `
      <span class="palette-row">
        <span class="skill-name">${sk.label}</span>
        ${sk.category ? `<span class="skill-cat">${sk.category}</span>` : ''}
      </span>
      <span class="skill-desc">${sk.description}</span>`;
    li.addEventListener('click', () => applySkill(sk));
    li.addEventListener('mousemove', () => {
      if (paletteIndex !== i) { paletteIndex = i; renderPalette(); }
    });
    paletteList.appendChild(li);
  });
  paletteList.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
};

const paletteFinder = document.getElementById('palette-finder');
const openPalette = () => {
  paletteIndex = 0;
  paletteInput.value = '';
  paletteFinder.value = '';
  renderPalette();
  palette.hidden = false;
  // en móvil no enfocamos: abriría el teclado. Solo sale si tocas el buscador.
  if (!document.body.classList.contains('phone')) paletteInput.focus();
};
const closePalette = () => { palette.hidden = true; };

paletteFinder.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyFinder(paletteFinder.value); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});

skillsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  palette.hidden ? openPalette() : closePalette();
});
// móvil: adjuntar, skills y el candado van en la barra de pestañas, a la derecha. Como
// botones flotantes tapaban la esquina inferior derecha de la terminal, justo
// donde Claude pinta la caja de entrada.
if (IS_PHONE) {
  tabsEl.querySelector('.tabs-spacer').after(
    document.getElementById('attach-fab'), document.getElementById('skills-fab'), document.getElementById('lock-fab'),
  );
}
// botón de skills (móvil)
document.getElementById('skills-fab').addEventListener('click', (e) => {
  e.stopPropagation();
  palette.hidden ? openPalette() : closePalette();
});
// botón de adjuntar (móvil): pregunta de dónde sale la imagen —hacer una foto o
// elegirla de la galería— y la sube al chat activo por la misma tubería que
// pegar/arrastrar en escritorio. Son dos campos distintos porque el selector
// del sistema no siempre ofrece la cámara; con `capture` se abre directamente.
const attachInput = document.getElementById('attach-input');
const cameraInput = document.getElementById('camera-input');
const attachSheet = document.getElementById('attach-sheet');
document.getElementById('attach-fab').addEventListener('click', () => {
  const s = activeId ? sessions.get(activeId) : null;
  if (!s || !s.launched) { dlgAlert('Sin chat activo', 'Lanza un chat antes de adjuntar imágenes.'); return; }
  document.activeElement?.blur(); // fuera el teclado: las opciones salen abajo
  attachSheet.hidden = false;
});
attachSheet.addEventListener('click', (e) => { if (e.target === attachSheet) attachSheet.hidden = true; });
document.getElementById('attach-camera').addEventListener('click', () => { attachSheet.hidden = true; cameraInput.click(); });
document.getElementById('attach-gallery').addEventListener('click', () => { attachSheet.hidden = true; attachInput.click(); });
for (const input of [attachInput, cameraInput]) {
  input.addEventListener('change', () => {
    const s = activeId ? sessions.get(activeId) : null;
    const files = [...input.files];
    input.value = ''; // permitir volver a elegir la misma foto
    if (!s || !s.launched || !files.length) return;
    // sin panel de adjuntos, este aviso es la señal de que la subida está en marcha
    toast(files.length > 1 ? `Subiendo ${files.length} imágenes…` : 'Subiendo imagen…', 2500);
    files.forEach((f) => uploadAsset(s, f));
  });
}
palette.addEventListener('mousedown', (e) => {
  if (e.target === palette) closePalette(); // click on the backdrop
});
paletteInput.addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (paletteItems[paletteIndex]) applySkill(paletteItems[paletteIndex]); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
// ⌘K / Ctrl+K from anywhere — capture phase so it wins over the terminal.
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    e.stopPropagation();
    palette.hidden ? openPalette() : closePalette();
  }
}, true);

/* ── Theme application + picker ───────────────────────────────── */
const applyTheme = (id) => {
  const t = themeById(id);
  currentThemeId = t.id;
  root.style.setProperty('--bg', t.ui.bg);
  root.style.setProperty('--surface', t.ui.surface);
  root.style.setProperty('--border', t.ui.border);
  root.style.setProperty('--text', t.ui.text);
  root.style.setProperty('--text-low', t.ui.textLow);
  root.style.setProperty('--accent', t.ui.accent);
  root.style.setProperty('--scrollbar', t.ui.scrollbar);
  // el tema solo cambia colores; la fuente es siempre la misma
  for (const s of sessions.values()) if (s.term) s.term.options.theme = t.term;
  localStorage.setItem('sia-theme', t.id);
  // copia de los colores para pintar la pantalla de bloqueo al arrancar, que sale
  // antes de que exista la lista de temas
  localStorage.setItem('sia-theme-ui', JSON.stringify(t.ui));
  // El tema del ordenador es también el de los móviles emparejados: se le deja
  // al bridge, que se lo da a ellos. (Con fetch: `api` aún no existe al arrancar.)
  if (!LAN_TOKEN && API_BASE) {
    fetch(`${API_BASE}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: { id: t.id, ui: t.ui } }) }).catch(() => {});
  }
  themeSwitch.setAttribute('aria-checked', String(!!t.dark));
};

themeToggle.addEventListener('click', () => applyTheme(toggledTheme(currentThemeId).id));

applyTheme(currentThemeId);

/* ── Resize: refit the active session ─────────────────────────── */
window.addEventListener('resize', () => {
  const s = activeId ? sessions.get(activeId) : null;
  if (s && s.launched) { s.fit.fit(); sendResize(s); }
});

/* ── Móvil: la app mide lo VISIBLE, no el layout ──────────────────
   Al abrir el teclado, iOS no dispara 'resize' (el layout no cambia): solo
   cambia visualViewport, y Safari desplaza la página para enseñar el foco.
   Fijamos la altura del body a lo visible (--vv-h), deshacemos ese
   desplazamiento y llevamos la terminal al final para que el prompt quede
   justo encima del teclado. El refit lo hace el ResizeObserver del host. */
if (IS_PHONE && window.visualViewport) {
  const vv = window.visualViewport;
  let raf = 0, lastH = 0;
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.round(vv.height);
      const changed = h !== lastH; lastH = h;
      root.style.setProperty('--vv-h', `${h}px`);
      if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
      const s = activeId ? sessions.get(activeId) : null;
      // solo al cambiar la altura (teclado): un evento suelto no debe mover el historial
      if (changed && s && s.launched) { try { s.fit.fit(); sendResize(s); s.term.scrollToBottom(); } catch {} }
    });
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

/* ════════════════════════════════════════════════════════════════
   Vistas (Chat / Laboratorio), Configuración y Laboratorio
   ════════════════════════════════════════════════════════════════ */
const navChat = document.getElementById('nav-chat');
const navLab = document.getElementById('nav-lab');
const viewChat = document.getElementById('view-chat');
const viewLab = document.getElementById('view-lab');

// Base sobre la que actúan las vistas de gestión (Laboratorio, Administración,
// Enlaces) y la pestaña Claves: viaja al bridge en X-SIA-Base. La clave de
// poder ya no viaja: el bridge usa la guardada para esa base.
let viewBase = null;
const api = async (path, opts = {}) => {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(viewBase ? { 'X-SIA-Base': viewBase } : {}), ...(LAN_TOKEN ? { 'X-SIA-LAN': LAN_TOKEN } : {}), ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 423 && (LAN_TOKEN || data.locked)) lockedGate(); // el bridge echó el candado
    const err = new Error(data.error || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
};

const navAdmin = document.getElementById('nav-admin');
const viewAdmin = document.getElementById('view-admin');
const navLinks = document.getElementById('nav-links');
const viewLinks = document.getElementById('view-links');
const navUsers = document.getElementById('nav-users');
const viewUsers = document.getElementById('view-users');
const linksGrid = document.getElementById('links-grid');
const linksFilters = document.getElementById('links-filters');

/* Vistas con base: Laboratorio (lab), Administración (admin) y
   Enlaces (cualquier base). Si solo una base la abre, se entra directo; si
   varias, se elige (como al crear un chat) y queda una barra «Base: X ·
   cambiar» arriba. Si la base elegida sigue valiendo, no se vuelve a preguntar. */
const VIEW_ALLOWS = {
  lab: (b) => !!b.perms?.lab,
  admin: (b) => !!b.perms?.admin,
  links: () => true,
  keys: (b) => !!b.perms?.owner,
};
const basesFor = (view) => basesPerms.filter(VIEW_ALLOWS[view]);
const viewBasePick = document.getElementById('view-base-pick');
const basePickBody = document.getElementById('base-pick-body');
const VIEW_TITLES = { lab: 'Laboratorio', admin: 'Administración', links: 'Enlaces rápidos' };
// Con más de una base configurada, entrar en una vista pide SIEMPRE la base
// (como al crear un chat); las que no la abren salen deshabilitadas.
const renderBasePick = (view) => {
  basePickBody.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'launcher-title';
  title.textContent = `${VIEW_TITLES[view]}: ¿de qué base de conocimiento?`;
  const grid = document.createElement('div');
  grid.className = 'launcher-grid';
  for (const b of basesPerms) {
    const ok = VIEW_ALLOWS[view](b);
    const btn = document.createElement('button');
    btn.className = 'launcher-btn wide';
    btn.disabled = !ok;
    btn.innerHTML = `<span class="launcher-ico">${BASE_ICON}</span><span class="launcher-name">${esc(b.name)}</span><span class="launcher-desc">${ok ? (b.perms ? `clave «${esc(b.perms.name)}»` : '') : 'sin acceso con tu clave'}</span>`;
    if (ok) btn.addEventListener('click', () => { viewBase = b.id; showView(view); });
    grid.appendChild(btn);
  }
  basePickBody.append(title, grid);
  viewChat.hidden = true; viewLab.hidden = true; viewAdmin.hidden = true; viewLinks.hidden = true; viewUsers.hidden = true;
  viewBasePick.hidden = false;
  navChat.classList.remove('active');
  navLab.classList.toggle('active', view === 'lab');
  navAdmin.classList.toggle('active', view === 'admin');
  navLinks.classList.toggle('active', view === 'links');
  navUsers.classList.remove('active');
};
// Dentro de una vista, con varias bases, el título recuerda la base en uso
// («Laboratorio de skills · Soporte»). Para cambiar de base se vuelve a pulsar
// el icono de la vista, que pregunta otra vez.
const VIEW_TITLE_EL = { lab: () => viewLab.querySelector('h2'), links: () => viewLinks.querySelector('h2'), admin: () => viewAdmin.querySelector('.admin-rail-head') };
const paintViewTitle = (view) => {
  const el = VIEW_TITLE_EL[view]?.();
  if (!el) return;
  if (!el.dataset.base) el.dataset.base = el.textContent;
  const b = basesPerms.find((x) => x.id === viewBase);
  el.textContent = basesPerms.length > 1 && b ? `${el.dataset.base} · ${b.name}` : el.dataset.base;
};
const enterView = (name) => {
  if (name === 'chat') return showView('chat');
  const cands = basesFor(name);
  if (!cands.length) return showView('chat');
  // una sola base en total: directo; varias: elegir siempre al entrar
  if (basesPerms.length === 1) { viewBase = cands[0].id; return showView(name); }
  renderBasePick(name);
};
const showView = (name) => {
  viewBasePick.hidden = true;
  viewChat.hidden = name !== 'chat';
  viewLab.hidden = name !== 'lab';
  viewAdmin.hidden = name !== 'admin';
  viewLinks.hidden = name !== 'links';
  viewUsers.hidden = name !== 'users';
  if (VIEW_TITLE_EL[name]) paintViewTitle(name);
  navChat.classList.toggle('active', name === 'chat');
  navLab.classList.toggle('active', name === 'lab');
  navAdmin.classList.toggle('active', name === 'admin');
  navLinks.classList.toggle('active', name === 'links');
  navUsers.classList.toggle('active', name === 'users');
  if (name === 'lab') labRefresh();
  if (name === 'admin') adminRefresh();
  if (name === 'links') linksRefresh();
  if (name === 'users') usersView.refresh();
  if (name === 'chat') {
    const s = activeId ? sessions.get(activeId) : null;
    if (s && s.launched) requestAnimationFrame(() => { s.fit.fit(); sendResize(s); s.term.focus(); });
  }
};
navChat.addEventListener('click', () => showView('chat'));
navLab.addEventListener('click', () => enterView('lab'));
navAdmin.addEventListener('click', () => enterView('admin'));

/* ── Diálogos propios (nada de alert/prompt/confirm nativos) ──── */
const dlgOverlay = document.getElementById('dialog-overlay');
const dlgTitle = document.getElementById('dialog-title');
const dlgBody = document.getElementById('dialog-body');
const dlgActions = document.getElementById('dialog-actions');

const openDialog = ({ title, bodyHTML = '', input = null, okLabel = 'Aceptar', cancelLabel = 'Cancelar', alertOnly = false, centered = false }) =>
  new Promise((resolve) => {
    dlgTitle.textContent = title;
    dlgBody.innerHTML = bodyHTML;
    dlgOverlay.classList.toggle('centered', centered); // centrado en vertical (por defecto cuelga de arriba)
    let inputEl = null;
    if (input) {
      inputEl = document.createElement('input');
      inputEl.className = 'settings-input';
      inputEl.placeholder = input.placeholder || '';
      inputEl.value = input.value || '';
      inputEl.spellcheck = false;
      dlgBody.appendChild(inputEl);
    }
    const close = (val) => {
      dlgOverlay.hidden = true;
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(input ? null : false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(input ? inputEl.value.trim() : true); }
    };
    dlgActions.innerHTML = '';
    if (!alertOnly) {
      const cancel = document.createElement('button');
      cancel.className = 'lab-btn';
      cancel.textContent = cancelLabel;
      cancel.addEventListener('click', () => close(input ? null : false));
      dlgActions.appendChild(cancel);
    }
    const ok = document.createElement('button');
    ok.className = 'lab-btn primary';
    ok.textContent = okLabel;
    ok.addEventListener('click', () => close(input ? inputEl.value.trim() : true));
    dlgActions.appendChild(ok);
    document.addEventListener('keydown', onKey, true);
    dlgOverlay.hidden = false;
    (inputEl || ok).focus();
  });

const dlgPrompt = (title, placeholder, bodyHTML = '') => openDialog({ title, bodyHTML, input: { placeholder } });
const dlgConfirm = (title, bodyHTML = '', okLabel = 'Confirmar') => openDialog({ title, bodyHTML, okLabel });
const dlgAlert = (title, bodyHTML = '') => openDialog({ title, bodyHTML, alertOnly: true, okLabel: 'Entendido' });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Configuración (modal): power user ────────────────────────── */
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const settingsVersion = document.getElementById('settings-version');

/* Permisos POR BASE: basesPerms = [{ id, name, hasTokens, perms }],
   donde perms es lo que abre en esa base la clave de poder guardada para
   ella ({ name, owner, lab, admin, links } o null). Un icono de vista
   aparece si alguna base la abre; la pestaña Claves, si eres owner en alguna. */
let basesPerms = [];
const permsOfBase = (id) => basesPerms.find((b) => b.id === id)?.perms || null;
const curPerms = () => permsOfBase(viewBase);
// Relee qué abre cada base con la clave de poder guardada y ajusta la barra
// lateral. `quiet` es la revisión automática (al volver el foco y cada poco):
// solo repinta la vista abierta si los permisos han cambiado de verdad, y un
// fallo pasajero (sin red, pantalla bloqueada) no toca nada.
const refreshAdmin = async ({ quiet = false } = {}) => {
  const before = JSON.stringify(basesPerms);
  try {
    const { bases } = await api('/admin/check');
    basesPerms = bases || [];
    const changed = JSON.stringify(basesPerms) !== before;
    if (viewBase && !basesPerms.some((b) => b.id === viewBase)) viewBase = null;
    navLab.hidden = !basesFor('lab').length;
    navAdmin.hidden = !basesFor('admin').length;
    navLinks.hidden = !basesFor('links').length;
    if (navLab.hidden && !viewLab.hidden) showView('chat');
    if (navAdmin.hidden && !viewAdmin.hidden) showView('chat');
    if (navLinks.hidden && !viewLinks.hidden) showView('chat');
    // la vista abierta depende de los permisos en su base (añadir enlaces,
    // catálogo completo del Laboratorio…): se repinta si han cambiado
    if (!quiet || changed) {
      if (!viewLinks.hidden) linksRefresh();
      if (quiet && !viewLab.hidden) labRefresh({ background: true });
      if (quiet && !viewAdmin.hidden) adminRefresh();
    }
    return { bases: basesPerms };
  } catch (err) {
    // en la revisión automática, solo «sin base» (503) es un cambio real; lo
    // demás es pasajero y no debe esconder iconos que estaban bien
    if (quiet && err.status !== 503) return null;
    // sin ninguna base (o bridge caído) no hay vista que abrir: fuera los tres
    // iconos. Enlaces se quedaba a la vista y pulsarlo no hacía nada.
    basesPerms = [];
    navLab.hidden = true;
    navAdmin.hidden = true;
    navLinks.hidden = true;
    if (!viewLab.hidden || !viewAdmin.hidden || !viewLinks.hidden) showView('chat');
    return null;
  }
};

// Algo de Configuración ha cambiado lo que abre o ve este equipo (claves de
// poder, tokens, bases): permisos, iconos de la barra, cajas de bases y la
// vista abierta se ponen al día sin cerrar y abrir Configuración.
const settingsChanged = async () => {
  await refreshAdmin();
  if (!settingsModal.hidden) { renderMenu(); renderGrid(); }
  if (!viewLab.hidden) labRefresh({ background: true });
  if (!viewAdmin.hidden) adminRefresh();
};

/* Los permisos pueden cambiar sin que este SIA se entere: el owner edita una
   clave de poder (misma clave, otras vistas) o la borra. Se vuelven a
   comprobar al recuperar el foco la ventana y cada dos minutos, para que un
   icono nuevo aparezca —o uno retirado desaparezca— sin reiniciar la app.
   En el móvil no aplica (no hay barra lateral) y con la pantalla bloqueada
   tampoco (el bridge no responde). */
const PERMS_RECHECK_MS = 2 * 60_000;
let permsCheckedAt = 0;
const recheckPerms = () => {
  if (document.body.classList.contains('phone') || document.body.classList.contains('locked')) return;
  if (Date.now() - permsCheckedAt < 10_000) return; // foco y visibilidad suelen llegar juntos
  permsCheckedAt = Date.now();
  refreshAdmin({ quiet: true });
};
window.addEventListener('focus', recheckPerms);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheckPerms(); });
setInterval(recheckPerms, PERMS_RECHECK_MS);

const jiraUrlInput = document.getElementById('jira-url-input');
const jiraTokenInput = document.getElementById('jira-token-input');
const jiraSave = document.getElementById('jira-save');
const jiraStatus = document.getElementById('jira-status');

settingsBtn.addEventListener('click', async () => {
  jiraStatus.textContent = '';
  jiraStatus.className = 'settings-status';
  settingsModal.hidden = false;
  try {
    const cfg = await api('/config');
    if (cfg.version) settingsVersion.textContent = `SIA v${cfg.version}`;
    await basesLoad();
    jiraUrlInput.value = cfg.jira?.baseUrl || '';
    jiraTokenInput.value = cfg.jira?.token || '';
    ghKeys = Array.isArray(cfg.github?.keys) ? cfg.github.keys : [];
    ghActiveId = cfg.github?.activeId || null;
    ghNameInput.value = ''; ghTokenInput.value = '';
    ghStatus.textContent = ''; ghStatus.className = 'settings-status';
    renderGhKeys();
  } catch { /* bridge caído: campos vacíos */ }
});

/* ── Acceso desde el móvil (QR + PIN) — solo en el escritorio ────
   La pestaña Móvil es UNA vista que cambia de estado, siempre centrada y sin
   modales:
     idle     botón «Generar QR»
     choose   dos tarjetas: red local o público (túnel de Cloudflare)
     loading  el túnel se está abriendo (fases del bridge)
     qr       QR + PIN de emparejamiento, con su cuenta atrás
     on       acceso abierto y algún dispositivo conectado
     error    no se pudo abrir
   Quien manda es el estado del bridge (/lan/status, consultado cada segundo
   mientras Configuración está abierta); «choose» es el único estado que es
   solo de la interfaz. */
{
  const mob = document.getElementById('mob');
  const tab = document.querySelector('#settings-tabs [data-pane="movil"]');
  if (LAN_TOKEN) {
    tab.hidden = true; // estamos en el móvil: esta pestaña no aplica
  } else {
    const $ = (id) => document.getElementById(id);
    const canvas = $('mob-canvas');
    const PHASES = ['preparing', 'download', 'starting'];
    const PHASE_TEXT = {
      preparing: 'Preparando el acceso público',
      download: 'Descargando cloudflared',
      starting: 'Abriendo el túnel',
    };
    let poll = null;
    let choosing = false;     // el usuario está en las tarjetas: el sondeo no le saca de ahí
    let paintedQr = null;     // URL del QR ya pintado, para no repintarlo cada segundo
    let wasPairing = false;   // había un QR a la vista: si desaparece sin dispositivos, caducó

    const show = (view) => { for (const v of mob.querySelectorAll('.mob-view')) v.hidden = v.dataset.view !== view; };
    const devicesMsg = (st) => (st.devices
      ? `${st.devices} dispositivo${st.devices === 1 ? '' : 's'} conectado${st.devices === 1 ? '' : 's'}`
      : 'Acceso abierto, sin dispositivos') + (st.mode === 'public' ? ' · público' : '');
    const ago = (ts) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.floor(s / 60)} min` : `hace ${Math.floor(s / 3600)} h`; };
    const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

    // Dispositivos conectados, cada uno con su botón de cerrar. Solo se repinta
    // cuando cambia algo (el estado llega cada segundo y no debe parpadear).
    const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
    let devSig = null;
    const paintDevices = (st) => {
      const list = st.list || [];
      const sig = JSON.stringify(list.map((d) => [d.id, d.name, d.mode, d.locked, d.online, d.online ? 0 : Math.floor((Date.now() - d.lastSeen) / 60000)]));
      if (sig === devSig) return;
      devSig = sig;
      for (const ul of [$('mob-devices'), $('mob-devices-qr')]) {
        ul.innerHTML = '';
        ul.hidden = !list.length;
        for (const d of list) {
          const li = document.createElement('li');
          const state = d.locked ? 'bloqueado' : d.online ? 'en línea' : `sin conexión · visto ${ago(d.lastSeen)}`;
          li.innerHTML = `<span class="d-ico${d.online && !d.locked ? ' on' : ''}">${PHONE_ICON}</span>
            <span class="d-main"><span class="d-name">${esc(d.name)}</span><span class="d-sub">${d.mode === 'public' ? 'Público' : 'Red local'} · ${esc(state)}</span></span>
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

    // pinta lo que diga el bridge
    const render = async (st) => {
      paintDevices(st);
      if (st.publicPhase) { // túnel en marcha
        choosing = false;
        $('mob-load-title').textContent = PHASE_TEXT[st.publicPhase] || PHASE_TEXT.preparing;
        const at = PHASES.indexOf(st.publicPhase);
        for (const li of $('mob-steps').children) {
          const i = PHASES.indexOf(li.dataset.step);
          li.classList.toggle('done', i < at);
          li.classList.toggle('active', i === at);
        }
        return show('loading');
      }
      if (st.publicError && !st.pendingPairing && st.devices === 0) { // arranque fallido
        $('mob-error-text').textContent = st.publicError;
        return show('error');
      }
      if (st.pendingPairing && st.qrUrl) { // hay QR que escanear
        choosing = false; wasPairing = true;
        if (paintedQr !== st.qrUrl) {
          await QRCode.toCanvas(canvas, st.qrUrl, { width: 220, margin: 1 });
          paintedQr = st.qrUrl;
          $('mob-pin').innerHTML = String(st.pin).split('').map((d) => `<span>${esc(d)}</span>`).join('');
        }
        const left = st.pairExpiresAt ? ` · caduca en ${mmss(st.pairExpiresAt - Date.now())}` : '';
        $('mob-qr-note').textContent = `${st.mode === 'public' ? 'Escanéalo desde cualquier red' : 'Escanéalo en la misma WiFi'} y teclea el PIN${left}`;
        return show('qr');
      }
      paintedQr = null;
      if (choosing) return; // sin nada abierto y eligiendo modo: se queda en las tarjetas
      if (st.active) { // acceso abierto, QR ya usado
        wasPairing = false;
        $('mob-on-title').textContent = devicesMsg(st);
        return show('on');
      }
      $('mob-idle-note').textContent = wasPairing ? 'El QR caducó sin usarse.' : '';
      wasPairing = false;
      show('idle');
    };
    const refresh = async () => { try { await render(await api('/lan/status')); } catch { /* bridge caído: se queda como estaba */ } };
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };
    const startPoll = () => { stopPoll(); poll = setInterval(refresh, 1000); };

    const enable = async (mode) => {
      choosing = false;
      try { await render(await api('/lan/enable', { method: 'POST', body: JSON.stringify({ mode }) })); }
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
        if (!(await api('/lock')).hasKey) {
          const pin = await askNewLockPin({ okLabel: 'Guardar y abrir', why: 'El acceso público se bloquea solo al dejar de usar el móvil y pide este PIN para seguir; es el mismo del bloqueo de pantalla.' });
          if (!pin) return;
          await api('/lock/key', { method: 'PUT', body: JSON.stringify({ key: pin }) });
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
      try { mode = (await api('/lan/status')).mode === 'public' ? 'public' : 'lan'; } catch {}
      enable(mode);
    });
    $('mob-retry').addEventListener('click', async () => { await disable(); choosing = true; show('choose'); });

    // mientras Configuración está abierta se sigue el estado del bridge
    settingsBtn.addEventListener('click', () => { choosing = false; paintedQr = null; refresh(); startPoll(); });
    settingsClose.addEventListener('click', stopPoll);
    settingsModal.addEventListener('mousedown', (e) => { if (e.target === settingsModal) stopPoll(); });
  }
}

/* ── Acceso al conocimiento (tokens de grupo) ─────────────────── */
/* ── Claves de GitHub (varias guardadas, una activa) ───────────────
   La activa es la que se inyecta como GH_TOKEN a los chats NUEVOS: sirve
   para saltar de entorno (trabajo ↔ personal) sin repegar el token. */
const ghList = document.getElementById('gh-list');
const ghNameInput = document.getElementById('gh-name-input');
const ghTokenInput = document.getElementById('gh-token-input');
const ghSave = document.getElementById('gh-save');
const ghStatus = document.getElementById('gh-status');
let ghKeys = [];        // [{ id, name, token }]
let ghActiveId = null;  // la marcada, o null = ninguna

const ghSay = (text, ok = true) => {
  ghStatus.textContent = text;
  ghStatus.className = `settings-status ${ok ? 'ok' : 'bad'}`;
};
// El token nunca se muestra entero: basta con reconocerlo de un vistazo.
const ghMask = (t) => (t.length > 12 ? `${t.slice(0, 7)}…${t.slice(-4)}` : '••••');
const APPLIES = 'aplica a los chats que abras a partir de ahora';

const saveGhKeys = async (msg) => {
  try {
    await api('/config', { method: 'PUT', body: JSON.stringify({ github: { keys: ghKeys, activeId: ghActiveId } }) });
    ghSay(msg);
  } catch (err) {
    ghSay(`no se pudo guardar: ${err.message}`, false);
  }
  renderGhKeys();
};

const renderGhKeys = () => {
  ghList.innerHTML = '';
  if (!ghKeys.length) {
    ghList.innerHTML = '<li class="token-empty">Sin claves — los chats nuevos no llevarán token de GitHub.</li>';
    return;
  }
  ghKeys.forEach((k) => {
    const active = k.id === ghActiveId;
    const li = document.createElement('li');
    if (active) li.className = 'active';
    li.innerHTML = `<button class="pick" title="${active ? 'Desactivar' : 'Activar'}" aria-pressed="${active}">`
      + `<span class="dot"></span><span class="name">${esc(k.name)}</span></button>`
      + `<span class="tok gh-tok">${esc(ghMask(k.token))}</span>`
      + '<button class="rm" title="Quitar">×</button>';
    li.querySelector('.pick').addEventListener('click', () => {
      ghActiveId = active ? null : k.id;
      saveGhKeys(active ? `sin clave activa — ${APPLIES}` : `activa: ${k.name} — ${APPLIES}`);
    });
    li.querySelector('.rm').addEventListener('click', () => {
      ghKeys = ghKeys.filter((x) => x.id !== k.id);
      if (active) ghActiveId = null;
      saveGhKeys(active ? `quitada: ${k.name} — no queda ninguna activa` : `quitada: ${k.name}`);
    });
    ghList.appendChild(li);
  });
};

ghSave.addEventListener('click', () => {
  const token = ghTokenInput.value.trim();
  if (!token) { ghSay('pega el token', false); return; }
  if (ghKeys.some((k) => k.token === token)) { ghSay('esa clave ya está guardada', false); return; }
  const name = ghNameInput.value.trim() || `Clave ${ghKeys.length + 1}`;
  const id = `gh${Date.now().toString(36)}`;
  ghKeys.push({ id, name, token });
  const first = !ghActiveId; // la primera que guardas entra ya activa
  if (first) ghActiveId = id;
  ghNameInput.value = ''; ghTokenInput.value = '';
  saveGhKeys(`añadida: ${name}${first ? ` (activa) — ${APPLIES}` : ''}`);
});

jiraSave.addEventListener('click', async () => {
  try {
    await api('/config', {
      method: 'PUT',
      body: JSON.stringify({ jira: { baseUrl: jiraUrlInput.value.trim().replace(/\/+$/, ''), token: jiraTokenInput.value.trim() } }),
    });
    jiraStatus.textContent = 'guardado ✓ — aplica a los chats que abras a partir de ahora';
    jiraStatus.className = 'settings-status ok';
  } catch (err) {
    jiraStatus.textContent = `no se pudo guardar: ${err.message}`;
    jiraStatus.className = 'settings-status bad';
  }
});
/* pestañas internas de Configuración: un panel visible a la vez; la elegida
   se recuerda mientras dure la página */
{
  const tabs = [...document.querySelectorAll('#settings-tabs .settings-tab')];
  const panes = [...document.querySelectorAll('#settings-modal .settings-pane')];
  const showPane = (name) => {
    for (const t of tabs) t.classList.toggle('active', t.dataset.pane === name);
    for (const p of panes) p.hidden = p.dataset.pane !== name;
  };
  for (const t of tabs) t.addEventListener('click', () => showPane(t.dataset.pane));
}

// Al cerrar Configuración, Enlaces se vuelve a cargar si está a la vista: lo que
// enseña depende de los tokens de acceso, que se acaban de poder cambiar.
// La pestaña Conocimiento vuelve a la rejilla de bases: la próxima vez se
// navega desde el principio (los avisos que abren una subvista concreta
// fijan la suya justo antes de abrir, así que no les afecta).
const closeSettings = () => {
  settingsModal.hidden = true;
  if (!viewLinks.hidden) linksRefresh();
  knowView = 'grid'; selectedBase = null; editingBase = null;
};
settingsClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('mousedown', (e) => { if (e.target === settingsModal) closeSettings(); });

// Cerrar sesión (barra lateral): web/src/auth/logout-button.js
wireLogout(document.getElementById('logout-btn'), { ...AUTH, confirm: dlgConfirm });

// Usuarios (barra lateral, solo administradores): web/src/users/
const usersView = AUTH?.user.role === 'admin'
  ? (() => {
    const knowledgeApi = createKnowledgeApi(API_BASE, AUTH.session);
    return mountUsersView(viewUsers, {
      api: createUsersApi(API_BASE, AUTH.session), me: AUTH.user, dialog: openDialog, confirm: dlgConfirm, alert: dlgAlert,
      onBases: () => openBasesDialog({ api: knowledgeApi, dialog: openDialog }),
      onKnowledge: (user) => openGrantsDialog(user, { api: knowledgeApi, dialog: openDialog }),
    });
  })()
  : null;
navUsers.hidden = !usersView;
navUsers.addEventListener('click', () => showView('users'));

/* ── Bloqueo de pantalla ──────────────────────────────────────────
   El candado de la barra lateral tapa la ventana hasta dar el PIN; la primera
   vez, antes de bloquear, pide elegirlo. El PIN se cambia en Configuración →
   Credenciales. Lo guarda y lo comprueba el bridge. */
const lockBtn = document.getElementById('lock-btn');
const lockCurInput = document.getElementById('lock-current');
const lockNewInput = document.getElementById('lock-new');
const lockNew2Input = document.getElementById('lock-new2');
const lockSaveBtn = document.getElementById('lock-save');
const lockStatus = document.getElementById('lock-status');
const LOCK_PIN_RE = /^\d{4}$/;
const lockPinProblem = (a, b) => (!LOCK_PIN_RE.test(a) ? 'El PIN son 4 dígitos.' : a !== b ? 'Los dos PIN no coinciden.' : '');
const digitsOnly = (input) => input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, LOCK_PIN_LEN); });

// Diálogo de la primera vez: elegir el PIN (dos veces) y saber dónde se cambia.
const askNewLockPin = async ({ remote = false, okLabel = 'Guardar y bloquear', why = 'Es el que pedirá SIA para volver a mostrar la pantalla.' } = {}) => {
  let error = '';
  for (;;) {
    const done = openDialog({
      title: 'Elige tu PIN de bloqueo',
      okLabel,
      centered: true,
      bodyHTML: `<p>Aún no tienes PIN. ${esc(why)}</p>
        <input class="settings-input" id="lock-dlg-1" type="password" inputmode="numeric" maxlength="4" placeholder="PIN (4 dígitos)" autocomplete="new-password" />
        <input class="settings-input" id="lock-dlg-2" type="password" inputmode="numeric" maxlength="4" placeholder="repite el PIN" autocomplete="new-password" />
        <p class="dialog-note">Podrás cambiarlo ${remote ? 'en el ordenador: ' : 'en '}Configuración → Credenciales → Bloqueo de pantalla.</p>
        ${error ? `<div class="link-form-err">${esc(error)}</div>` : ''}`,
    });
    const a = document.getElementById('lock-dlg-1'), b = document.getElementById('lock-dlg-2');
    digitsOnly(a); digitsOnly(b);
    a.focus();
    if (!await done) return null;
    error = lockPinProblem(a.value, b.value);
    if (!error) return a.value;
  }
};

lockBtn.addEventListener('click', async () => {
  let st;
  try { st = await api('/lock'); } catch (err) {
    // nunca en silencio: un bridge anterior al candado responde 404
    dlgAlert('No se puede bloquear', err.status === 404
      ? 'El SIA al que está conectada esta ventana es de una versión anterior y no tiene bloqueo de pantalla.'
      : esc(err.message));
    return;
  }
  try {
    if (!st.hasKey) {
      const pin = await askNewLockPin();
      if (!pin) return;
      await api('/lock/key', { method: 'PUT', body: JSON.stringify({ key: pin }) });
    }
    await api('/lock/on', { method: 'POST' });
  } catch (err) { dlgAlert('No se pudo bloquear', esc(err.message)); return; }
  await lockGate();
  // de vuelta: permisos y vista al día, y el foco al chat activo
  refreshAdmin();
  if (!viewLinks.hidden) linksRefresh();
  const s = activeId ? sessions.get(activeId) : null;
  if (s?.term && !viewChat.hidden) s.term.focus();
});

// Candado del MÓVIL (en su barra de pestañas): bloquea esta sesión del
// teléfono, sin tocar el ordenador. Se desbloquea con el mismo PIN del candado
// del escritorio, en red local y por túnel; si aún no hay PIN, se elige aquí
// antes de bloquear.
document.getElementById('lock-fab').addEventListener('click', async () => {
  try {
    if (!(await api('/ping')).pin) {
      const pin = await askNewLockPin({ remote: true });
      if (!pin) return;
      await api('/lan/pin', { method: 'PUT', body: JSON.stringify({ key: pin }) });
    }
    await api('/lan/lock', { method: 'POST' });
  } catch (err) { dlgAlert('No se pudo bloquear', esc(err.message)); return; }
  lockedGate();
});

// Configuración → Credenciales → Bloqueo de pantalla: poner o cambiar el PIN
for (const i of [lockCurInput, lockNewInput, lockNew2Input]) digitsOnly(i);
const lockSectionRefresh = async () => {
  lockCurInput.value = ''; lockNewInput.value = ''; lockNew2Input.value = '';
  dbSetStatus(lockStatus, '');
  try {
    const st = await api('/lock');
    lockCurInput.hidden = !st.hasKey; // cambiarlo exige el actual
    lockNewInput.placeholder = st.hasKey ? 'PIN nuevo (4 dígitos)' : 'PIN (4 dígitos)';
    lockSaveBtn.textContent = st.hasKey ? 'Cambiar PIN' : 'Guardar';
  } catch { /* bridge caído: se queda como estaba */ }
};
settingsBtn.addEventListener('click', lockSectionRefresh);
const lockSavePin = async () => {
  const problem = lockPinProblem(lockNewInput.value, lockNew2Input.value);
  if (problem) return dbSetStatus(lockStatus, problem, 'bad');
  try {
    await api('/lock/key', { method: 'PUT', body: JSON.stringify({ key: lockNewInput.value, current: lockCurInput.value }) });
    await lockSectionRefresh();
    toast('PIN de bloqueo guardado');
  } catch (err) { dbSetStatus(lockStatus, err.message, 'bad'); }
};
lockSaveBtn.addEventListener('click', lockSavePin);
for (const i of [lockCurInput, lockNewInput, lockNew2Input]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') lockSavePin(); });
/* ── Base de conocimiento (Supabase del usuario) ──────────────────
   Probar → diagnóstico de la conexión escrita (sin guardarla). Si la base
   está lista, Guardar. Si le faltan tablas o dueño, se abre el asistente:
   SQL para pegar en Supabase + Verificar, que genera las claves de poder
   y deja al que la monta como superadmin de su base. */
const dbUrlInput = document.getElementById('db-url-input');
const dbKeyInput = document.getElementById('db-key-input');
const dbConnect = document.getElementById('db-connect');
const dbStatus = document.getElementById('db-status');
const dbWizard = document.getElementById('db-wizard');
const dbWizardBadge = document.getElementById('db-wizard-badge');
const dbWizardTitle = document.getElementById('db-wizard-title');
const dbWizardText = document.getElementById('db-wizard-text');
const dbWizardBack = document.getElementById('db-wizard-back');
const wzCopy = document.getElementById('wz-copy');
const wzRun = document.getElementById('wz-run');
const wzVerify = document.getElementById('wz-verify');
const dbSqlLink = document.getElementById('db-sql-link');
const dbSqlCopy = document.getElementById('db-sql-copy');
const dbSetup = document.getElementById('db-setup');
const dbWizardStatus = document.getElementById('db-wizard-status');
let dbSqlText = ''; // el SQL del esquema, cargado del bridge al abrir el asistente
const dbForm = document.getElementById('db-form');
const dbBack = document.getElementById('db-back');
const dbNameInput = document.getElementById('db-name-input');
const dbTitle = document.getElementById('db-title');
const basesGrid = document.getElementById('bases-grid');
const baseMenu = document.getElementById('base-menu');
const baseConfig = document.getElementById('base-config');
const baseAccess = document.getElementById('base-access');
const baseKeys = document.getElementById('base-keys');
const dbCrumbs = document.getElementById('db-crumbs');
const ICON_CONFIG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/></svg>';
const ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.9 12.1 21 2M15 8l3 3M18 5l3 3"/></svg>';
const knowPane = document.querySelector('#settings-modal .settings-pane[data-pane="conocimiento"]');
// Quien no administra ve aquí su conocimiento en solo lectura y nada más
// (web/src/knowledge/assigned-view.js): ni añadir bases ni invitaciones.
const knowReadOnly = () => AUTH?.user.role !== 'admin';
const assignedPane = document.createElement('div');
assignedPane.hidden = true;
knowPane.appendChild(assignedPane);

/* Varias bases de conocimiento. Sin ninguna: solo el formulario de conexión,
   centrado, para que lo primero sea vincular una. Con bases: una tarjeta por
   base (nombre, URL, quitar, clave de poder) con sus tokens de
   acceso debajo, y «Añadir base», que abre el mismo formulario. La principal
   manda en skills, Laboratorio, Administración y claves, y es la base por
   defecto de un chat. */
let bases = [];
let selectedBase = null;
// Vistas de la pestaña Conocimiento: 'grid' (cajas de bases) | 'form' (alta)
// | 'menu' (tres cajas de una base) | 'config' | 'access' | 'keys'
let knowView = 'grid';
let editingBase = null; // id de la base cuya conexión se está cambiando en el formulario
const curBase = () => bases.find((b) => b.id === selectedBase) || null;
// Abrir Configuración directamente en una subvista de una base ('access': sus
// tokens de acceso · 'config': conexión y clave de poder), para los avisos que
// antes mandaban a buscarla a mano. Al abrir, basesLoad() repinta respetando
// knowView y selectedBase; sin base conocida cae en la rejilla de bases.
const openBaseSettings = (baseId, view = 'access') => {
  if (baseId) { selectedBase = baseId; knowView = view; }
  document.querySelector('#settings-tabs [data-pane="conocimiento"]').click();
  settingsBtn.click();
};
const knowShow = (view) => {
  if (knowReadOnly()) return;
  knowView = view;
  basesGrid.hidden = view !== 'grid';
  dbForm.hidden = view !== 'form';
  baseMenu.hidden = view !== 'menu';
  baseConfig.hidden = view !== 'config';
  baseAccess.hidden = view !== 'access';
  baseKeys.hidden = view !== 'keys';
  const b = curBase();
  dbBack.hidden = !bases.length; // sin bases no hay a dónde volver
  dbTitle.hidden = bases.length > 0; // el título solo en la primera conexión
  // migas de pan: Bases › <base> › <subvista>; cada tramo anterior es un enlace
  const SUB = { config: 'Configuración', access: 'Conocimiento', keys: 'Claves' };
  const crumbs = [];
  if (bases.length && view !== 'grid') {
    crumbs.push({ label: 'Bases', go: () => knowShow('grid') });
    if (view === 'form' && !editingBase) {
      // Bases › Nueva base › Con invitación / Base propia: «Nueva base» vuelve a elegir
      const mode = dbForm.dataset.mode;
      if (mode === 'invite' || mode === 'own') {
        crumbs.push({ label: 'Nueva base', go: () => { dbWizardClose(); dbSetStatus(dbStatus, ''); dbFormMode('choose'); } });
        crumbs.push({ label: mode === 'invite' ? 'Con invitación' : 'Base propia' });
      } else crumbs.push({ label: 'Nueva base' });
    }
    if (b && (view !== 'form' || editingBase)) {
      crumbs.push({ label: b.name, go: view === 'menu' ? null : () => knowShow('menu') });
      if (view === 'form') { crumbs.push({ label: 'Configuración', go: () => { dbWizardClose(); knowShow('config'); } }); crumbs.push({ label: 'Conexión' }); }
      else if (SUB[view]) crumbs.push({ label: SUB[view] });
    }
  }
  dbCrumbs.hidden = !crumbs.length;
  dbCrumbs.innerHTML = '';
  crumbs.forEach((c, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '›'; dbCrumbs.appendChild(sep); }
    const el = document.createElement(c.go ? 'button' : 'span');
    el.textContent = c.label;
    if (c.go) { el.type = 'button'; el.addEventListener('click', c.go); } else el.className = 'here';
    dbCrumbs.appendChild(el);
  });
  // en Conocimiento, «Generar invitación» va a la derecha de las migas (el
  // nodo se mueve con sus eventos; la vista lo esconde mientras hay invitación)
  const inviteOpen = baseAccess.querySelector('.invite-open');
  if (view === 'access' && inviteOpen) dbCrumbs.appendChild(inviteOpen);
  if (view === 'keys') keysRefresh();
};
const dbFormShow = (show) => knowShow(show ? 'form' : (bases.length ? 'grid' : 'form'));
/* El formulario de alta tiene tres modos: 'choose' (dos cajas: con invitación
   o base propia), 'invite' (solo el campo de pegar) y 'own' (nombre, proyecto
   y clave; también para cambiar la conexión de una base). */
const dbChoose = document.getElementById('db-choose');
const dbFormMode = (mode) => {
  dbForm.dataset.mode = mode;
  dbChoose.hidden = mode !== 'choose';
  for (const el of dbForm.querySelectorAll('[data-mode]')) el.hidden = el.dataset.mode !== mode;
  dbBack.hidden = mode === 'choose'; // en elegir no hay Cancelar: las migas (o la ×) ya sacan de ahí
  document.getElementById('db-own-title').textContent = editingBase ? 'Conexión' : 'Base propia';
  if (knowView === 'form') knowShow('form'); // las migas enseñan el modo elegido
};
document.getElementById('db-opt-invite').addEventListener('click', () => { dbFormMode('invite'); dbInviteInput.focus(); });
document.getElementById('db-opt-own').addEventListener('click', () => { dbFormMode('own'); dbNameInput.focus(); });
const renderGrid = () => {
  basesGrid.innerHTML = '';
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'base-box add'; add.title = 'Añadir base';
  add.innerHTML = '<span class="plus">+</span><span>Añadir base</span>';
  add.addEventListener('click', () => {
    editingBase = null; pendingInviteTokens = [];
    dbWizardClose();
    dbNameInput.value = ''; dbUrlInput.value = ''; dbKeyInput.value = ''; dbInviteInput.value = '';
    dbSetStatus(dbStatus, '');
    knowShow('form');
    dbFormMode('choose');
  });
  basesGrid.appendChild(add);
  for (const b of bases) {
    const box = document.createElement('div');
    const warn = baseWarning(b);
    box.className = `base-box${b.enabled === false || warn ? ' disabled' : ''}`; box.dataset.id = b.id; box.tabIndex = 0; box.setAttribute('role', 'button');
    // las que asigna la plataforma no se quitan ni se desactivan desde aquí
    box.innerHTML = `
      ${b.managed ? '' : `<span class="b-actions">
        <button type="button" class="icon-btn" data-act="toggle" title="${b.enabled === false ? 'Activar esta base' : 'Desactivar temporalmente'}" aria-label="${b.enabled === false ? 'Activar' : 'Desactivar'}">${ICON_POWER}</button>
        <button type="button" class="icon-btn danger" data-act="remove" title="Quitar esta base" aria-label="Quitar esta base">${TRASH_ICON}</button>
      </span>`}
      <span class="b-ico">${BASE_ICON}</span><span class="b-name">${esc(b.name)}</span>${b.enabled === false ? '<span class="b-meta">desactivada</span>' : warn ? `<span class="b-meta">${esc(warn)}</span>` : b.managed ? '<span class="b-meta">de la plataforma</span>' : ''}`;
    const enter = () => { selectedBase = b.id; renderBaseViews(); dbWizardClose(); dbSetStatus(dbStatus, ''); knowShow('menu'); };
    box.addEventListener('click', (e) => { if (!e.target.closest('.b-actions')) enter(); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('.b-actions')) enter(); });
    box.querySelector('[data-act="toggle"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api(`/bases/${encodeURIComponent(b.id)}`, { method: 'PUT', body: JSON.stringify({ enabled: b.enabled === false }) });
        toast(b.enabled === false ? `Base «${b.name}» activada` : `Base «${b.name}» desactivada`);
        await basesLoad();
        await refreshAdmin();
      } catch (err) { dbSetStatus(dbStatus, err.message, 'bad'); }
    });
    box.querySelector('[data-act="remove"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      removeBase(b);
    });
    basesGrid.appendChild(box);
  }
};
// Una base que no se puede usar aún: sin clave publishable (venía conectada
// con la secret, que SIA ya no admite) o con el esquema anterior (hay que
// volver a ejecutar el SQL). Texto corto para las cajas; null si está bien.
const baseWarning = (b) => {
  if (!b.key) return 'falta la clave publishable';
  if (basesPerms.find((x) => x.id === b.id)?.needsSchema) return 'falta actualizar la base';
  return null;
};
// menú de una base: Configuración, Conocimiento y (solo owner) Claves
const renderMenu = () => {
  baseMenu.innerHTML = '';
  const b = curBase();
  if (!b) return;
  const p = permsOfBase(b.id);
  const items = [
    { view: 'config', ico: ICON_CONFIG, name: 'Configuración', meta: baseWarning(b) || (p ? `clave «${p.name}»` : 'sin clave de poder') },
    { view: 'access', ico: SOURCE_ICON, name: 'Conocimiento', meta: `${b.tokens.length} token${b.tokens.length === 1 ? '' : 's'} de acceso` },
    ...(p?.owner ? [{ view: 'keys', ico: ICON_KEY, name: 'Claves', meta: 'claves de poder de esta base' }] : []),
  ];
  for (const it of items) {
    const box = document.createElement('button');
    box.type = 'button'; box.className = 'base-box'; box.dataset.view = it.view;
    box.innerHTML = `<span class="b-ico">${it.ico}</span><span class="b-name">${it.name}</span><span class="b-meta">${esc(it.meta)}</span>`;
    box.addEventListener('click', () => knowShow(it.view));
    baseMenu.appendChild(box);
  }
};
const removeBase = async (b) => {
  if (!(await dlgConfirm('Quitar base', `Se quita <strong>${esc(b.name)}</strong> de este equipo (la base y su contenido no se tocan). Los chats abiertos siguen como están.`, 'Quitar'))) return;
  try {
    await api(`/bases/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
    toast(`Base «${b.name}» quitada`);
    knowView = 'grid';
    await basesLoad();
    await refreshAdmin();
  } catch (e) { dbSetStatus(dbStatus, e.message, 'bad'); }
};
const renderBaseViews = () => {
  renderMenu();
  baseConfig.innerHTML = ''; baseAccess.innerHTML = '';
  const b = curBase();
  if (!b) return;
  baseConfig.appendChild(baseCard(b, 'config'));
  baseAccess.appendChild(baseCard(b, 'access'));
};
const basesRender = () => {
  if (knowReadOnly()) {
    for (const c of knowPane.children) c.hidden = c !== assignedPane;
    return renderAssignedView(assignedPane, bases);
  }
  knowPane.classList.toggle('centered', !bases.length);
  if (!bases.some((b) => b.id === selectedBase)) selectedBase = null;
  renderGrid();
  renderBaseViews();
  if (!bases.length) { knowShow('form'); dbFormMode('choose'); }
  else if (['menu', 'config', 'access', 'keys'].includes(knowView) && selectedBase) knowShow(knowView);
  else knowShow('grid');
};
const basesLoad = async () => {
  try { bases = await api('/bases'); } catch { bases = []; }
  knownBases = bases.filter((b) => b.enabled !== false && b.key).map((b) => ({ id: b.id, name: b.name }));
  if (knowView === 'form') knowView = 'grid';
  dbNameInput.value = ''; dbUrlInput.value = ''; dbKeyInput.value = '';
  dbWizardClose();
  dbSetStatus(dbStatus, '');
  basesRender();
};
const baseCard = (b, part = 'config') => {
  const view = document.createElement('div');
  view.className = 'base-view';
  if (part === 'access') {
    // grupos y invitaciones: web/src/access/
    const p = permsOfBase(b.id);
    view.innerHTML = accessMarkup(p);
    wireAccess(view, b, p, {
      api, esc, toast, setStatus: dbSetStatus, copyWithFeedback, COPY_ICON,
      onTokensChanged: async (tokens) => {
        const r = await api(`/bases/${encodeURIComponent(b.id)}`, { method: 'PUT', body: JSON.stringify({ tokens }) });
        b.tokens = r.tokens;
        settingsChanged(); // otros grupos = otras skills, otros enlaces, otros proyectos
        return r.tokens;
      },
    });
    return view;
  }
  const warn = baseWarning(b);
  const notice = !warn ? '' : !b.key
    ? `<div class="keys-schema"><strong>Falta la clave publishable</strong>
         <p class="settings-hint">SIA ya no usa la clave secret: ponla en «Cambiar conexión».</p></div>`
    : `<div class="keys-schema"><strong>Falta actualizar la base</strong>
         <p class="settings-hint">Su dueño tiene que volver a ejecutar el SQL: «Cambiar conexión» → Conectar.</p></div>`;
  view.innerHTML = `
    ${notice}
    <div class="field">
      <label class="field-label">Proyecto de Supabase</label>
      <div class="base-conn">
        <code title="${esc(b.url)}">${esc(b.url)}</code>
        ${b.managed ? '<span class="settings-hint">la asigna la plataforma</span>' : '<button class="lab-btn" data-act="edit-conn">Cambiar conexión</button>'}
      </div>
    </div>
    <div class="divider"></div>
    <div class="field base-power">
      <label class="field-label">Clave de poder</label>
      <div class="settings-row">
        <input class="settings-input" type="password" placeholder="clave de poder…" autocomplete="off" value="${esc(b.powerKey || '')}" />
        <button class="lab-btn primary" data-act="save-power">Guardar</button>
      </div>
      <div class="settings-status" data-power-status></div>
      ${b.managed ? '' : '<div class="settings-row" style="margin-top:10px"><button type="button" class="lab-btn" data-act="renew-owner">Renovar clave de dueño</button></div>'}
    </div>`;
  // el dueño ha perdido su clave (o la base la cambió): vuelve a pasar por el
  // asistente, que da un SQL con clave nueva y la guarda al verificar
  view.querySelector('[data-act="renew-owner"]')?.addEventListener('click', () => {
    editingBase = b.id;
    dbNameInput.value = b.name; dbUrlInput.value = b.url; dbKeyInput.value = b.key || '';
    knowShow('form'); dbFormMode('own');
    dbWizardOpen({ missing: [], needsSchema: false, hasOwner: true, renew: true });
  });
  // cambiar conexión: el formulario de alta, relleno, en modo edición
  view.querySelector('[data-act="edit-conn"]')?.addEventListener('click', () => {
    editingBase = b.id;
    dbWizardClose();
    dbNameInput.value = b.name; dbUrlInput.value = b.url; dbKeyInput.value = b.key || '';
    dbSetStatus(dbStatus, '');
    knowShow('form'); dbFormMode('own');
    dbUrlInput.focus();
  });
  // clave de poder de esta base
  const powerInput = view.querySelector('.base-power input');
  const powerStatus = view.querySelector('[data-power-status]');
  const paintPower = () => {
    const p = permsOfBase(b.id);
    if (!b.powerKey) return dbSetStatus(powerStatus, '');
    dbSetStatus(powerStatus, p ? `clave «${p.name}» ✓ — abre: ${permsSummary(p)}` : 'esta clave no abre nada en esta base', p ? 'ok' : 'bad');
  };
  paintPower();
  view.querySelector('[data-act="save-power"]').addEventListener('click', async () => {
    try {
      const r = await api(`/bases/${encodeURIComponent(b.id)}`, { method: 'PUT', body: JSON.stringify({ powerKey: powerInput.value.trim() }) });
      b.powerKey = r.powerKey;
      await refreshAdmin();
      paintPower();
      renderMenu(); renderGrid(); // la caja «Claves» del menú depende de la clave
    } catch (e) { dbSetStatus(powerStatus, e.message, 'bad'); }
  });
  powerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') view.querySelector('[data-act="save-power"]').click(); });
  return view;
};
/* botones "?" de los campos de conexión: abren una captura de Supabase
   señalando dónde está cada dato */
{
  const helpModal = document.getElementById('help-modal');
  const helpTitle = document.getElementById('help-title');
  const helpText = document.getElementById('help-text');
  const helpImgs = [...helpModal.querySelectorAll('.help-img')];
  const HELP = {
    'project-id': {
      title: '¿Dónde está el Project ID?',
      text: 'En Supabase, entra en tu proyecto → Project Settings (⚙️ abajo a la izquierda) → General. Copia el valor de «Project ID» y pégalo tal cual: SIA monta la URL.',
    },
    'publishable-key': {
      title: '¿Dónde está la clave publishable?',
      text: 'En Supabase, Project Settings → API Keys → «Publishable key» (la de arriba, empieza por sb_publishable_). Es la clave pensada para repartirse: por sí sola no abre nada, la base solo enseña lo que permiten tus tokens. La secret (abajo) no la pidas ni la pegues: SIA la rechaza.',
    },
  };
  for (const btn of document.querySelectorAll('.help-btn[data-help]')) {
    btn.addEventListener('click', () => {
      const h = HELP[btn.dataset.help];
      helpTitle.textContent = h.title;
      helpText.textContent = h.text;
      for (const img of helpImgs) img.hidden = img.dataset.help !== btn.dataset.help;
      helpModal.hidden = false;
    });
  }
  const close = () => { helpModal.hidden = true; };
  document.getElementById('help-close').addEventListener('click', close);
  helpModal.addEventListener('mousedown', (e) => { if (e.target === helpModal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !helpModal.hidden) close(); });
}

dbBack.addEventListener('click', () => {
  // descarta lo escrito: a la configuración de la base si se editaba; si no,
  // a elegir cómo (y desde ahí, a las cajas)
  dbWizardClose();
  dbSetStatus(dbStatus, '');
  if (!editingBase && dbForm.dataset.mode !== 'choose') { dbFormMode('choose'); return; }
  const back = editingBase ? 'config' : 'grid';
  editingBase = null;
  knowShow(back);
});

// aviso temporal abajo a la derecha (éxitos breves)
const toastEl = document.getElementById('toast');
let toastTimer = null;
const toast = (text, ms = 3500) => {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
};
const dbSetStatus = (el, text, cls = '') => { el.textContent = text; el.className = `settings-status${cls ? ` ${cls}` : ''}`; };
// Vale el ID del proyecto pelado, la URL del proyecto o la del dashboard:
// se normaliza a https://<ref>.supabase.co (el bridge hace lo mismo)
const dbUrlFrom = (raw) => {
  const v = raw.trim().replace(/\/+$/, '');
  if (/^[a-z0-9]{15,}$/i.test(v)) return `https://${v.toLowerCase()}.supabase.co`;
  const dash = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  return v;
};
const dbConn = () => ({ url: dbUrlFrom(dbUrlInput.value), key: dbKeyInput.value.trim() });
// ref del proyecto (xxxx en https://xxxx.supabase.co) → enlace directo al SQL Editor
const dbProjectRef = (url) => (url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i) || [])[1];
// lista para usarse: esquema blindado completo y con dueño
const dbReady = (d) => !d.needsSchema && d.hasOwner;

/* Asistente de montaje: ocupa el sitio de los campos. Paso 1 copiar el SQL,
   paso 2 ejecutarlo en Supabase, paso 3 verificar. Los pasos se van
   destapando: el 2 y el 3 aparecen al copiar. El SQL lleva una clave de
   dueño nueva (la genera el bridge al pedirlo), por eso siempre se empieza
   por copiarlo: al verificar, esa clave queda guardada como tuya. Sirve
   igual para una base nueva, para una del esquema anterior (hay que
   actualizarla: lo que tiene no se toca) y para recuperar la clave de dueño. */
const wzSet = (li, state) => { li.dataset.state = state; li.classList.remove('keep'); };
let dbOwnerKey = ''; // la clave de dueño que va dentro del SQL copiado
const dbWizardOpen = (d) => {
  dbForm.classList.add('wizard-open');
  dbWizard.hidden = false;
  dbSetup.disabled = false;
  dbSetStatus(dbStatus, '');
  dbSetStatus(dbWizardStatus, '');
  const ref = dbProjectRef(dbConn().url);
  dbSqlLink.href = ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard';
  dbWizardBadge.className = 'wizard-badge';
  if (d.missing.includes('projects')) {
    dbWizardBadge.textContent = 'Falta la estructura';
    dbWizardTitle.textContent = 'Tu proyecto responde, pero aún no tiene las tablas de SIA';
    dbWizardText.textContent = 'Se montan en tres pasos. Supabase no permite crear tablas desde una app, por eso el SQL se ejecuta a mano en su editor.';
  } else if (d.needsSchema) {
    dbWizardBadge.textContent = 'Falta actualizar la base';
    dbWizardTitle.textContent = 'Esta base se montó con un esquema anterior';
    dbWizardText.textContent = 'El SQL nuevo cierra las tablas con políticas de acceso (la clave publishable sola ya no ve nada) y genera tu clave de dueño. El conocimiento, las skills y los grupos no se tocan. Solo puede ejecutarlo quien entra en el proyecto de Supabase.';
  } else if (d.renew) {
    dbWizardBadge.textContent = 'Renovar la clave de dueño';
    dbWizardTitle.textContent = 'Vuelve a ejecutar el SQL: lleva una clave de dueño nueva';
    dbWizardText.textContent = 'La clave anterior deja de valer. El contenido de la base y las demás claves de poder se conservan. Solo puede hacerlo quien entra en el proyecto de Supabase.';
  } else {
    dbWizardBadge.textContent = 'Falta el dueño';
    dbWizardTitle.textContent = 'Las tablas ya están, pero la base no tiene dueño';
    dbWizardText.textContent = 'Vuelve a ejecutar el SQL: lleva tu clave de dueño y no toca lo que ya hay.';
  }
  wzSet(wzCopy, 'active'); wzSet(wzRun, 'pending'); wzSet(wzVerify, 'pending');
  // SQL fresco cada vez: cada copia lleva su propia clave de dueño
  dbSqlText = ''; dbOwnerKey = '';
  dbSqlCopy.disabled = true;
  api('/db/schema').then((r) => { dbSqlText = r.sql; dbOwnerKey = r.ownerKey || ''; dbSqlCopy.disabled = false; })
    .catch(() => dbSetStatus(dbWizardStatus, 'no se pudo cargar el SQL del bridge', 'bad'));
};
const dbWizardClose = () => {
  dbForm.classList.remove('wizard-open');
  dbWizard.hidden = true;
};

// Se ha conectado (o montado) una base: la app deja de estar "solo terminal"
const dbConnected = async () => {
  localStorage.removeItem('sia-lab-cache'); // otra base, otro catálogo
  await refreshAdmin();
  basesRender(); // las tarjetas se pintaron antes de saber qué abre la clave: repintar con los permisos
};

dbConnect.addEventListener('click', async () => {
  const conn = dbConn();
  if (conn.url) dbUrlInput.value = conn.url;
  if (!conn.url || !conn.key) return dbSetStatus(dbStatus, 'faltan el ID (o URL) del proyecto y la clave', 'bad');
  dbSetStatus(dbStatus, 'conectando…');
  dbConnect.disabled = true; dbWizardClose();
  try {
    const d = await api('/db/test', { method: 'POST', body: JSON.stringify(conn) });
    if (!d.reachable) return dbSetStatus(dbStatus, 'no se llega a ese proyecto: pega su Project ID o su URL (https://xxxx.supabase.co)', 'bad');
    if (!d.authOk) return dbSetStatus(dbStatus, 'la clave no vale para ese proyecto: usa la clave publishable (Project Settings → API Keys, sb_publishable_…)', 'bad');
    if (!dbReady(d)) return dbWizardOpen(d); // faltan tablas, políticas o dueño: montar / actualizar
    if (editingBase) {
      // base ya vinculada: se cambia su conexión (y su nombre)
      await api(`/bases/${encodeURIComponent(editingBase)}`, { method: 'PUT', body: JSON.stringify({ ...conn, name: dbNameInput.value.trim() }) });
      selectedBase = editingBase; editingBase = null; knowView = 'config';
      await basesLoad();
      toast('Conexión actualizada');
      await dbConnected();
      return;
    }
    // base lista: entra en la lista de bases (con el token de la invitación, si venía de una)
    const nb = await api('/bases', { method: 'POST', body: JSON.stringify({ ...conn, name: dbNameInput.value.trim() }) });
    await applyInviteToken(nb.id);
    selectedBase = nb.id; knowView = 'menu';
    await basesLoad();
    toast('Base de datos vinculada con éxito');
    await dbConnected();
  } catch (err) { dbSetStatus(dbStatus, `no se pudo conectar: ${err.message}`, 'bad'); }
  finally { dbConnect.disabled = false; }
});

/* ── Pegar una invitación (web/src/access/invite.js) ──
   Si la base es nueva se rellenan los campos y, al conectar, los tokens
   quedan puestos; si ya la tenía, se le añaden los grupos que falten. */
const dbInviteInput = document.getElementById('db-invite-input');
let pendingInviteTokens = []; // tokens que llegan con la invitación pegada: se ponen al conectar
const applyInviteToken = async (baseId) => {
  if (!pendingInviteTokens.length || !baseId) return;
  try { await api(`/bases/${encodeURIComponent(baseId)}`, { method: 'PUT', body: JSON.stringify({ tokens: pendingInviteTokens }) }); }
  catch (e) { toast(`Base vinculada, pero los grupos de la invitación no se pudieron guardar: ${e.message}`, 6000); }
  pendingInviteTokens = [];
};
dbInviteInput.addEventListener('input', async () => {
  const inv = inviteDecode(dbInviteInput.value);
  if (!inv) { if (dbInviteInput.value.trim()) dbSetStatus(dbStatus, 'eso no es una invitación de SIA', 'bad'); return; }
  dbInviteInput.value = '';
  // la base ya está conectada: la invitación solo trae grupos → se añaden
  // los que falten y se enseña su Conocimiento
  const already = bases.find((b) => dbUrlFrom(b.url) === dbUrlFrom(inv.url));
  if (already) {
    try {
      const missing = inv.tokens.filter((t) => !already.tokens.includes(t));
      if (missing.length) {
        await api(`/bases/${encodeURIComponent(already.id)}`, { method: 'PUT', body: JSON.stringify({ tokens: [...already.tokens, ...missing] }) });
        toast(`${missing.length === 1 ? 'Grupo añadido' : `${missing.length} grupos añadidos`} a «${already.name}» — aplica a los chats que abras a partir de ahora`, 4000);
      } else toast(`Ya tenías acceso a esos grupos en «${already.name}»`);
      selectedBase = already.id; knowView = 'access'; editingBase = null;
      await basesLoad();
      await refreshAdmin();
    } catch (e) { dbSetStatus(dbStatus, e.message, 'bad'); }
    return;
  }
  dbNameInput.value = inv.name; dbUrlInput.value = inv.url; dbKeyInput.value = inv.key;
  pendingInviteTokens = inv.tokens;
  dbConnect.click(); // con la invitación no hay nada más que escribir
});

dbSqlCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(dbSqlText);
    dbSqlCopy.textContent = 'Copiado ✓';
    setTimeout(() => {
      dbSqlCopy.textContent = 'Copiar SQL';
      wzSet(wzCopy, 'done'); wzSet(wzRun, 'active'); wzSet(wzVerify, 'active');
    }, 700);
  } catch { dbSetStatus(dbWizardStatus, 'no se pudo copiar al portapapeles', 'bad'); }
});

// abrir el SQL Editor da el paso 2 por hecho, pero deja el enlace por si cierran la pestaña
dbSqlLink.addEventListener('click', () => {
  if (wzRun.dataset.state === 'pending') return;
  wzSet(wzRun, 'done');
  wzRun.classList.add('keep');
});

// Volver: a los campos sin tocar nada
dbWizardBack.addEventListener('click', dbWizardClose);

dbSetup.addEventListener('click', async () => {
  dbSetStatus(dbWizardStatus, 'verificando…');
  dbSetup.disabled = true;
  try {
    const r = await api('/db/setup', { method: 'POST', body: JSON.stringify({ ...dbConn(), name: dbNameInput.value.trim(), ownerKey: dbOwnerKey }) });
    // si la base confirma que la clave que iba en el SQL es la del dueño, el
    // bridge ya la ha guardado como clave de poder de esta base
    if (r.base?.id) { await applyInviteToken(editingBase ? '' : r.base.id); selectedBase = r.base.id; knowView = editingBase ? 'config' : 'menu'; editingBase = null; }
    await basesLoad();
    toast(r.owned ? 'Base lista: eres su dueño' : 'Base de datos vinculada con éxito');
    await dbConnected();
  } catch (err) {
    dbSetStatus(dbWizardStatus, err.message || 'no se pudo verificar', 'bad');
  } finally { dbSetup.disabled = false; }
});

// La clave de poder vivía en localStorage (una sola). Ahora va por base: la
// que hubiera pasa a la base principal si esta no tiene ninguna, una vez.
(async () => {
  const legacy = localStorage.getItem('sia-admin-key');
  if (!legacy) return;
  try {
    const list = await api('/bases');
    const first = list[0];
    if (first && !first.powerKey) await api(`/bases/${encodeURIComponent(first.id)}`, { method: 'PUT', body: JSON.stringify({ powerKey: legacy }) });
    localStorage.removeItem('sia-admin-key');
    refreshAdmin();
  } catch { /* sin bridge: se reintenta en la próxima carga */ }
})();
refreshAdmin();

/* ── Laboratorio de skills ────────────────────────────────────── */
const labCatalog = document.getElementById('lab-catalog');
const labCards = document.getElementById('lab-cards');
const labWork = document.getElementById('lab-work');
const labBack = document.getElementById('lab-back');
const labSkillId = document.getElementById('lab-skill-id');
const labState = document.getElementById('lab-state');
const labSave = document.getElementById('lab-save');
const labPublish = document.getElementById('lab-publish');
const labDelete = document.getElementById('lab-delete');
const labFileTabs = document.getElementById('lab-file-tabs');
const labTextarea = document.getElementById('lab-textarea');

// current = la skill abierta en el editor (copia de trabajo en memoria)
let cur = null; // { id, files: Map(path → content), active, dirty, isDraft }

const SKILL_TEMPLATE = (id) => `---
name: ${id}
description: "Describe cuándo debe activarse esta skill y qué hace."
commandLabel: "Nombre visible en la paleta"
commandDescription: "Descripción corta para la paleta"
category: data
version: 1.0.0
enabled: true
---

# ${id}

Instrucciones para el agente…

## Proceso

1. …
2. …

## Reglas

- Nunca persistas nada sin confirmación explícita del usuario.
`;

const setLabState = (text, dirty = false) => {
  labState.textContent = text;
  labState.className = `lab-state ${dirty ? 'dirty' : ''}`;
};

const showCatalog = () => { labWork.hidden = true; labCatalog.hidden = false; labRefresh(); };
const showEditor = () => { labCatalog.hidden = true; labWork.hidden = false; };

// tags: [{ text, cls }] — van en su propia fila, alineados a la derecha
const card = ({ title, tags = [], desc, meta, onClick }) => {
  const el = document.createElement('div');
  el.className = 'lab-card';
  // title: una etiqueta larga se recorta con «…» dentro de la card; entera, al pasar el ratón
  const tagsHtml = tags.map((t) => `<span class="badge ${t.cls || ''}" title="${esc(t.text)}">${esc(t.text)}</span>`).join('');
  el.innerHTML = `
    <div class="lab-card-title">${esc(title)}</div>
    <div class="lab-card-tags">${tagsHtml}</div>
    <div class="lab-card-desc">${esc(desc || '')}</div>
    <div class="lab-card-meta">${esc(meta || '')}</div>`;
  el.addEventListener('click', onClick);
  return el;
};

const labStatusEl = document.getElementById('lab-status');
const labRefreshBtn = document.getElementById('lab-refresh');
const labScopeSel = document.getElementById('lab-scope');
const labStatus = (text) => { labStatusEl.textContent = text; };

let groups = []; // [{token, name}] — grupos para el selector de visibilidad
// Nombre de un grupo por su token. Si no se conoce (no tienes token de ese
// grupo, o el grupo ya no existe) NUNCA se devuelve el token: es una credencial.
const groupName = (token, known = null) => groups.find((g) => g.token === token)?.name || known || 'otro grupo';

// rellena el <select> de Visibilidad: Común (solo superadmin) + grupos
const fillScopeSelect = (scope) => {
  labScopeSel.innerHTML = '';
  const common = document.createElement('option');
  common.value = ''; common.textContent = 'Común (todos)';
  common.disabled = !curPerms()?.owner; // las comunes son cosa del owner
  labScopeSel.appendChild(common);
  for (const g of groups) {
    const o = document.createElement('option');
    o.value = g.token; o.textContent = g.name;
    labScopeSel.appendChild(o);
  }
  labScopeSel.value = scope || '';
  // si el admin no puede poner Común y no hay valor válido, coge el primer grupo
  if (labScopeSel.value === '' && !curPerms()?.owner && groups.length) labScopeSel.value = groups[0].token;
};

/* Estado vacío de una vista (sin skills, sin enlaces): icono, una frase y,
   debajo, la card de crear — la misma «+» que después encabeza la rejilla, para
   que crear lo primero y crear lo siguiente sea el mismo gesto. `action` es
   opcional: quien no puede crear solo ve el mensaje. */
const EMPTY_ICONS = {
  skills: '<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v6.5L4.8 17a3 3 0 0 0 2.6 4.5h9.2a3 3 0 0 0 2.6-4.5L14 8.5V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></svg>',
  links: '<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};
const emptyState = (icon, text, action = null) => {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = `${EMPTY_ICONS[icon] || ''}<p>${esc(text)}</p>`;
  if (action) box.appendChild(action);
  return box;
};

const renderLabCards = (skills, drafts) => {
  labCards.innerHTML = '';

  // card de crear: la primera de la rejilla, o sola bajo el mensaje si no hay nada
  const newCard = document.createElement('div');
  newCard.className = 'lab-card new';
  newCard.innerHTML = '<span class="plus">+</span><span>Nueva skill</span>';
  newCard.addEventListener('click', newSkill);
  if (!skills.length && !drafts.length) {
    labCards.appendChild(emptyState('skills', 'No tienes aún ninguna skill definida.', newCard));
    return;
  }
  labCards.appendChild(newCard);

  for (const id of drafts) {
    labCards.appendChild(card({
      title: id, tags: [{ text: 'borrador', cls: 'draft' }],
      desc: 'Trabajo en curso, aún sin publicar.', meta: id,
      onClick: () => openDraft(id),
    }));
  }
  for (const sk of skills) {
    const tags = [];
    if (!sk.enabled) tags.push({ text: 'off', cls: 'off' });
    if (sk.category) tags.push({ text: sk.category });
    // scopeName lo resuelve el bridge; null = el grupo de esa skill ya no existe
    tags.push({ text: sk.scope ? groupName(sk.scope, sk.scopeName === null ? 'grupo eliminado' : sk.scopeName) : 'Común', cls: 'scope' });
    labCards.appendChild(card({
      title: sk.label, tags,
      desc: sk.description, meta: `${sk.id} · v${sk.version}`,
      onClick: () => openPublished(sk.id),
    }));
  }
};

// La clave de power user dejó de valer (o nunca la hubo): estado explicativo.
// Sin permisos no tiene sentido el botón de actualizar.
const renderLabLocked = () => {
  labRefreshBtn.hidden = true;
  labCards.innerHTML = `
    <div class="lab-locked">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <h3>Necesitas una clave de poder</h3>
      <p>
        El Laboratorio permite crear, editar y publicar skills para todo el
        equipo, por eso está restringido. Si no tienes una clave de esta base,
        pídesela a su owner.
      </p>
      <button class="lab-btn primary" id="lab-locked-cfg">Poner la clave</button>
    </div>`;
  // directo a la clave de poder de la base de la vista
  document.getElementById('lab-locked-cfg').addEventListener('click', () => openBaseSettings(viewBase, 'config'));
};

// stale-while-revalidate: pinta al instante la última copia conocida y
// refresca desde Supa por debajo.
const labRefresh = async ({ background = false } = {}) => {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('sia-lab-cache') || 'null'); } catch {}
  if (cached && !background) renderLabCards(cached.skills || [], cached.drafts || []);
  labStatus('actualizando skills…');
  try {
    const [skills, drafts, grps] = await Promise.all([api('/skills'), api('/drafts'), api('/groups')]);
    groups = grps || [];
    labRefreshBtn.hidden = false;
    renderLabCards(skills, drafts);
    localStorage.setItem('sia-lab-cache', JSON.stringify({ skills, drafts }));
    labStatus('');
  } catch (err) {
    labStatus('');
    if (err.status === 401) { renderLabLocked(); return; }
    if (cached) labStatus('sin conexión — mostrando la última copia');
    else labCards.innerHTML = `<div class="lab-card-desc">Error cargando el catálogo: ${esc(err.message)}</div>`;
  }
};

// Actualizar a mano: re-sincroniza el bridge desde Supa (paleta ⌘K incluida)
// y repinta el catálogo — por si un compañero acaba de publicar algo.
labRefreshBtn.addEventListener('click', async () => {
  labRefreshBtn.disabled = true;
  labRefreshBtn.classList.add('loading');
  labStatus('actualizando skills…');
  try {
    const out = await api('/skills/refresh', { method: 'POST' });
    if (out.skills && out.base) skillsByBase[out.base] = out.skills; // la paleta, al día sin reabrir chats
    await labRefresh({ background: true });
    labStatus('catálogo actualizado ✓');
    setTimeout(() => { if (labStatusEl.textContent === 'catálogo actualizado ✓') labStatus(''); }, 2500);
  } catch (err) {
    labStatus('');
    if (err.status === 401) renderLabLocked();
    else labStatus(`error: ${err.message}`);
  } finally {
    labRefreshBtn.disabled = false;
    labRefreshBtn.classList.remove('loading');
  }
});

const openFiles = (id, files, { isDraft, scope = null }) => {
  cur = { id, files: new Map(files.map((f) => [f.path, f.content])), active: 'SKILL.md', dirty: false, isDraft, scope };
  if (!cur.files.has('SKILL.md')) cur.active = files[0]?.path;
  labSkillId.textContent = id;
  fillScopeSelect(scope);
  // solo el owner edita/publica/borra una skill COMÚN ya publicada
  cur.readOnly = !isDraft && !scope && !curPerms()?.owner;
  labScopeSel.disabled = cur.readOnly;
  labPublish.disabled = cur.readOnly;
  labDelete.disabled = cur.readOnly;
  labTextarea.readOnly = cur.readOnly;
  setLabState(cur.readOnly ? 'común · solo lectura (requiere superadmin)' : (isDraft ? 'borrador' : 'publicada'));
  showEditor();
  renderFileTabs();
  labTextarea.value = cur.files.get(cur.active) ?? '';
};

const openDraft = async (id) => {
  try { const d = await api(`/drafts/${id}`); openFiles(id, d.files, { isDraft: true }); }
  catch (err) { dlgAlert('No se pudo abrir el borrador', esc(err.message)); }
};
const openPublished = async (id) => {
  try { const d = await api(`/skills/${encodeURIComponent(id)}`); openFiles(id, d.files, { isDraft: false, scope: d.scope || null }); }
  catch (err) { dlgAlert('No se pudo abrir la skill', esc(err.message)); }
};

labBack.addEventListener('click', async () => {
  if (cur?.dirty) {
    const out = await dlgConfirm('Cambios sin guardar', 'Si vuelves al catálogo perderás los cambios no guardados. ¿Salir igualmente?', 'Salir sin guardar');
    if (!out) return;
  }
  cur = null;
  showCatalog();
});

const renderFileTabs = () => {
  labFileTabs.innerHTML = '';
  for (const p of [...cur.files.keys()].sort()) {
    const b = document.createElement('button');
    b.className = `lab-file-tab ${p === cur.active ? 'active' : ''}`;
    b.innerHTML = `<span>${p}</span>${p !== 'SKILL.md' ? '<span class="rm" title="Eliminar fichero">×</span>' : ''}`;
    b.addEventListener('click', async (e) => {
      if (e.target.classList.contains('rm')) {
        const out = await dlgConfirm('Eliminar fichero', `Se eliminará <code>${esc(p)}</code> de la skill (al publicar desaparecerá también del catálogo).`, 'Eliminar');
        if (!out) return;
        cur.files.delete(p);
        if (cur.active === p) { cur.active = 'SKILL.md'; labTextarea.value = cur.files.get('SKILL.md') ?? ''; }
        cur.dirty = true; setLabState('cambios sin guardar', true); renderFileTabs();
        return;
      }
      cur.files.set(cur.active, labTextarea.value);
      cur.active = p;
      labTextarea.value = cur.files.get(p) ?? '';
      renderFileTabs();
    });
    labFileTabs.appendChild(b);
  }
  const add = document.createElement('button');
  add.className = 'lab-file-tab';
  add.textContent = '+ fichero';
  add.addEventListener('click', async () => {
    const p = await dlgPrompt('Nuevo fichero', 'phases/01-captura.md', 'Ruta relativa dentro de la skill:');
    if (!p) return;
    const clean = p.replace(/^\/+/, '');
    if (cur.files.has(clean)) { dlgAlert('Ya existe', `La skill ya tiene un fichero <code>${esc(clean)}</code>.`); return; }
    cur.files.set(cur.active, labTextarea.value);
    cur.files.set(clean, `# ${clean}\n\n`);
    cur.active = clean;
    labTextarea.value = cur.files.get(clean);
    cur.dirty = true; setLabState('cambios sin guardar', true);
    renderFileTabs();
  });
  labFileTabs.appendChild(add);
};

labTextarea.addEventListener('input', () => {
  if (!cur) return;
  cur.files.set(cur.active, labTextarea.value);
  if (!cur.dirty) { cur.dirty = true; setLabState('cambios sin guardar', true); }
});

const newSkill = async () => {
  const id = await dlgPrompt('Nueva skill', 'knowledge-faq', 'Identificador en kebab-case (será la carpeta y el nombre técnico):');
  if (!id) return;
  const clean = id.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(clean)) {
    dlgAlert('Identificador inválido', 'Usa solo letras, números y guiones (p. ej. <code>knowledge-faq</code>).');
    return;
  }
  openFiles(clean, [{ path: 'SKILL.md', content: SKILL_TEMPLATE(clean) }], { isDraft: true });
  cur.dirty = true;
  setLabState('borrador nuevo (sin guardar)', true);
};

const curFiles = () => {
  cur.files.set(cur.active, labTextarea.value);
  return [...cur.files.entries()].map(([path, content]) => ({ path, content }));
};

labDelete.addEventListener('click', async () => {
  if (!cur) return;
  try {
    if (cur.isDraft) {
      const out = await dlgConfirm(
        'Eliminar borrador',
        `Se eliminará el borrador <code>${esc(cur.id)}</code>. Es solo local: no afecta al catálogo publicado del equipo.`,
        'Eliminar',
      );
      if (!out) return;
      await api(`/drafts/${cur.id}`, { method: 'DELETE' });
    } else {
      const out = await dlgConfirm(
        'Eliminar skill publicada',
        `<strong>${esc(cur.id)}</strong> desaparecerá del catálogo de <strong>todo el equipo</strong> (paleta incluida) y se borrará de la base central. Esta acción es irreversible.`,
        'Eliminar para todos',
      );
      if (!out) return;
      await api(`/skills/${encodeURIComponent(cur.id)}`, { method: 'DELETE' });
    }
    cur = null;
    showCatalog();
  } catch (err) { dlgAlert('No se pudo eliminar', esc(err.message)); }
});

labSave.addEventListener('click', async () => {
  if (!cur) return;
  try {
    await api(`/drafts/${cur.id}`, { method: 'PUT', body: JSON.stringify({ files: curFiles() }) });
    cur.dirty = false; cur.isDraft = true;
    setLabState('borrador guardado');
  } catch (err) { dlgAlert('No se pudo guardar', esc(err.message)); }
});

labPublish.addEventListener('click', async () => {
  if (!cur || cur.readOnly) return;
  const scope = labScopeSel.value || null;
  const files = curFiles();
  const resume = files.map((f) => ` • ${f.path} (${f.content.length} chars)`).join('\n');
  const visib = scope ? `grupo «${groupName(scope)}»` : 'COMÚN (todo el equipo)';
  const out = await dlgConfirm(
    `Publicar «${cur.id}»`,
    `Visibilidad: <strong>${esc(visib)}</strong>. Llegará a quien corresponda en su siguiente chat.<pre>${esc(resume)}</pre>`,
    'Publicar',
  );
  if (!out) return;
  try {
    await api('/skills/publish', { method: 'POST', body: JSON.stringify({ id: cur.id, files, scope }) });
    if (cur.isDraft) await api(`/drafts/${cur.id}`, { method: 'DELETE' }).catch(() => {});
    cur.dirty = false; cur.isDraft = false; cur.scope = scope;
    setLabState('publicada ✓');
  } catch (err) { dlgAlert('No se pudo publicar', esc(err.message)); }
});

/* ════════════════════════════════════════════════════════════════
   Panel de administración (solo superadmin): grupos, proyectos, accesos
   ════════════════════════════════════════════════════════════════ */
const adminRailList = document.getElementById('admin-rail-list');
const adminMain = document.getElementById('admin-main');
const adminGroupSearch = document.getElementById('admin-group-search');

let adminData = { groups: [], projects: [] };
let adminSel = { view: 'group', group: null, project: null }; // group token / project id

const labFlash = (el, text) => { const prev = el.textContent; el.textContent = text; setTimeout(() => { el.textContent = prev; }, 1000); };
const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
// Copia al portapapeles con respuesta visible: el botón pasa a un check verde
// («Copiado») un momento; si el portapapeles no está disponible, lo intenta
// con un campo temporal y, si tampoco, avisa en rojo.
const copyWithFeedback = async (btn, text) => {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch { ok = false; }
  }
  const prev = btn.innerHTML;
  btn.classList.add(ok ? 'copied' : 'copy-failed');
  btn.innerHTML = ok ? CHECK_ICON : '✕';
  btn.title = ok ? 'Copiado' : 'No se pudo copiar';
  setTimeout(() => { btn.classList.remove('copied', 'copy-failed'); btn.innerHTML = prev; btn.title = 'Copiar'; }, 1600);
  return ok;
};
const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const projectsOfGroup = (token) => { const g = adminData.groups.find((x) => x.token === token); return g ? adminData.projects.filter((p) => g.projectIds.includes(p.id)) : []; };
const adminGroupName = (token) => adminData.groups.find((g) => g.token === token)?.name || token;

const adminRefresh = async () => {
  try {
    adminData = await api('/admin/data');
    // selección por defecto
    if (adminSel.view === 'group' && !adminData.groups.some((g) => g.token === adminSel.group)) adminSel.group = adminData.groups[0]?.token || null;
    if (adminSel.view === 'project' && !adminData.projects.some((p) => p.id === adminSel.project)) adminSel = { view: 'group', group: adminSel.group, project: null };
    renderRail(); renderMain();
  } catch (err) { adminMain.innerHTML = `<div class="admin-empty"><span class="big">Error</span><span>${esc(err.message)}</span></div>`; }
};

const renderRail = () => {
  const q = fold(adminGroupSearch.value.trim());
  adminRailList.innerHTML = '';
  for (const g of adminData.groups.filter((g) => !q || fold(g.name).includes(q) || projectsOfGroup(g.token).some((p) => fold(p.name).includes(q)))) {
    const li = document.createElement('li');
    if (adminSel.group === g.token) li.classList.add('active');
    li.innerHTML = `<span>${esc(g.name)}</span><span class="rl-meta tnum">${g.projectIds.length}</span>`;
    li.addEventListener('click', () => { adminSel = { view: 'group', group: g.token, project: null }; renderRail(); renderMain(); });
    adminRailList.appendChild(li);
  }
};

const renderMain = () => {
  if (adminSel.view === 'project') return renderProjectView();
  return renderGroupView();
};

/* ── Vista de un grupo: rejilla de proyectos ── */
const renderGroupView = () => {
  const g = adminData.groups.find((x) => x.token === adminSel.group);
  if (!g) { adminMain.innerHTML = '<div class="admin-empty"><span class="big">No hay grupos</span><span>Crea uno desde la barra de la izquierda.</span></div>'; return; }
  const projs = projectsOfGroup(g.token);
  adminMain.innerHTML = `
    <div class="admin-main-head"><h1>${esc(g.name)}</h1><span class="spacer"></span>
      <button class="admin-ghost danger" id="del-group">Eliminar grupo</button>
      <button class="admin-primary" id="new-project">+ Nuevo proyecto</button></div>
    <div class="admin-main-sub"><span class="tnum">${projs.length} ${projs.length === 1 ? 'proyecto' : 'proyectos'}</span></div>
    <div class="admin-grid" id="proj-grid"></div>`;

  const grid = adminMain.querySelector('#proj-grid');
  // la card de crear va la primera, como en bases, skills y enlaces
  const add = document.createElement('div');
  add.className = 'admin-card new';
  add.innerHTML = '<span class="plus">+</span><span>Nuevo proyecto</span>';
  add.addEventListener('click', () => newProject(g));
  grid.appendChild(add);
  for (const p of projs) {
    const entries = p.contexts.reduce((n, c) => n + c.entries, 0);
    const shared = p.grantedTokens.filter((t) => t !== g.token).map(adminGroupName);
    const card = document.createElement('div');
    card.className = 'admin-card';
    const others = adminData.groups.filter((og) => og.token !== g.token);
    card.innerHTML = `
      <span class="ac-actions">
        ${others.length ? `<button type="button" class="icon-btn" data-act="move" title="Mover a otro grupo" aria-label="Mover a otro grupo">${MOVE_ICON}</button>` : ''}
        <button type="button" class="icon-btn danger" data-act="remove" title="Eliminar proyecto" aria-label="Eliminar proyecto">${TRASH_ICON}</button>
      </span>
      <div class="ac-title">${esc(p.name)}</div>
      <div class="ac-pills">${shared.map((n) => `<span class="ac-pill">+ ${esc(n)}</span>`).join('')}</div>
      <div class="ac-meta tnum">${entries} ${entries === 1 ? 'entrada' : 'entradas'}</div>`;
    card.addEventListener('click', (e) => { if (e.target.closest('.ac-actions')) return; adminSel = { view: 'project', group: g.token, project: p.id }; renderMain(); });
    card.querySelector('[data-act="move"]')?.addEventListener('click', (e) => { e.stopPropagation(); moveProjectDialog(p, g); });
    card.querySelector('[data-act="remove"]').addEventListener('click', (e) => { e.stopPropagation(); deleteProject(p, g.token); });
    grid.appendChild(card);
  }

  adminMain.querySelector('#new-project').addEventListener('click', () => newProject(g));
  adminMain.querySelector('#del-group').addEventListener('click', async () => {
    // se van con él sus skills y los proyectos que SOLO él usa; los compartidos se quedan
    const only = projs.filter((p) => p.grantedTokens.every((t) => t === g.token));
    const shared = projs.length - only.length;
    const entries = only.reduce((n, p) => n + p.contexts.reduce((m, c) => m + c.entries, 0), 0);
    const what = [
      only.length ? `${only.length} ${only.length === 1 ? 'proyecto' : 'proyectos'} con ${entries} ${entries === 1 ? 'entrada' : 'entradas'}` : null,
      'sus skills',
    ].filter(Boolean).join(' y ');
    if (!await dlgConfirm('Eliminar grupo', `Se eliminará <strong>${esc(g.name)}</strong> con ${what}.${shared ? ` ${shared} ${shared === 1 ? 'proyecto compartido con otros grupos se queda' : 'proyectos compartidos con otros grupos se quedan'}.` : ''} Irreversible.`, 'Eliminar')) return;
    try { await api(`/admin/groups/${encodeURIComponent(g.token)}`, { method: 'DELETE' }); adminSel.group = null; adminRefresh(); } catch (e) { dlgAlert('No se pudo eliminar', esc(e.message)); }
  });
};

// mover = dar acceso al grupo destino y quitárselo al actual; el proyecto
// conserva lo compartido con otros grupos
const moveProject = async (p, from, to) => {
  const dest = adminData.groups.find((x) => x.token === to);
  try {
    await api('/admin/grants', { method: 'POST', body: JSON.stringify({ token: to, project_id: p.id }) });
    await api('/admin/grants', { method: 'DELETE', body: JSON.stringify({ token: from, project_id: p.id }) });
    toast(`«${p.name}» movido a ${dest?.name || 'otro grupo'}`);
    adminRefresh();
  } catch (err) { dlgAlert('No se pudo mover', esc(err.message)); }
};
/* Diálogo «Mover a otro grupo»: una fila por grupo (nombre y cuántos proyectos
   tiene), el actual marcado y sin elegir, el destino se marca con un punto;
   «Mover» se enciende al elegir. */
const moveProjectDialog = async (p, g) => {
  const others = adminData.groups.filter((og) => og.token !== g.token);
  if (!others.length) return;
  let picked = null;
  const body = `<p class="dlg-lead">A qué grupo pasa <strong>${esc(p.name)}</strong>. Lo que comparte con otros grupos no cambia.</p>
    <ul class="token-list move-list">
      <li class="current"><span class="pick"><span class="dot"></span><span class="name">${esc(g.name)}</span></span><span class="gh-tok">actual</span></li>
      ${others.map((og) => `<li data-to="${esc(og.token)}"><button type="button" class="pick"><span class="dot"></span><span class="name">${esc(og.name)}</span></button><span class="gh-tok tnum">${og.projectIds.length} ${og.projectIds.length === 1 ? 'proyecto' : 'proyectos'}</span></li>`).join('')}
    </ul>`;
  const done = openDialog({ title: 'Mover a otro grupo', bodyHTML: body, okLabel: 'Mover', centered: true });
  const ok = dlgActions.querySelector('.lab-btn.primary');
  ok.disabled = true;
  for (const li of dlgBody.querySelectorAll('.move-list li[data-to]')) {
    li.querySelector('.pick').addEventListener('click', () => {
      for (const x of dlgBody.querySelectorAll('.move-list li')) x.classList.remove('active');
      li.classList.add('active');
      picked = li.dataset.to;
      ok.disabled = false;
    });
  }
  if (!(await done) || !picked) return;
  await moveProject(p, g.token, picked);
};
const deleteProject = async (p, groupToken) => {
  const entries = p.contexts.reduce((n, c) => n + c.entries, 0);
  if (!await dlgConfirm('Eliminar proyecto', `Se eliminará <strong>${esc(p.name)}</strong> y sus ${entries} entrada(s). Irreversible.`, 'Eliminar')) return;
  try { await api(`/admin/projects/${p.id}`, { method: 'DELETE' }); adminSel = { view: 'group', group: groupToken, project: null }; adminRefresh(); } catch (e) { dlgAlert('No se pudo eliminar', esc(e.message)); }
};
const newProject = async (g) => {
  const name = await dlgPrompt('Nuevo proyecto', 'Patronaje', `Crear un proyecto en «${esc(g.name)}»:`);
  if (!name) return;
  try {
    const r = await api('/admin/projects', { method: 'POST', body: JSON.stringify({ name }) });
    if (r.project?.id) await api('/admin/grants', { method: 'POST', body: JSON.stringify({ token: g.token, project_id: r.project.id }) });
    adminRefresh();
  } catch (e) { dlgAlert('No se pudo crear', esc(e.message)); }
};

/* ── Vista de un proyecto: contextos + compartir ── */
const renderProjectView = () => {
  const p = adminData.projects.find((x) => x.id === adminSel.project);
  const g = adminData.groups.find((x) => x.token === adminSel.group);
  if (!p) { adminSel.view = 'group'; return renderMain(); }
  const entries = p.contexts.reduce((n, c) => n + c.entries, 0);
  adminMain.innerHTML = `
    <div class="admin-breadcrumb"><button id="bc-group">${esc(g ? g.name : 'Grupos')}</button><span>/</span><span>${esc(p.name)}</span></div>
    <div class="admin-main-head"><h1>${esc(p.name)}</h1></div>
    <div class="admin-main-sub"><span class="tnum">${entries} ${entries === 1 ? 'entrada' : 'entradas'}</span></div>
    <div class="admin-block"><h3>Compartir con otros grupos</h3><div class="access-chips" id="share"></div></div>
    <div class="admin-block"><h3>Entradas de conocimiento</h3><div class="entry-list" id="entry-list"><div class="entry-empty">Cargando…</div></div></div>`;

  adminMain.querySelector('#bc-group').addEventListener('click', () => { adminSel = { view: 'group', group: adminSel.group, project: null }; renderRail(); renderMain(); });

  // entradas (asíncrono)
  loadEntries(p.id);

  const share = adminMain.querySelector('#share');
  for (const og of adminData.groups) {
    const on = p.grantedTokens.includes(og.token);
    const isHome = og.token === adminSel.group;
    const chip = document.createElement('button');
    chip.className = `access-chip ${on ? 'on' : ''}`;
    chip.textContent = og.name + (isHome ? ' (grupo)' : '');
    chip.disabled = isHome;
    if (isHome) chip.style.opacity = '0.7';
    if (!isHome) chip.addEventListener('click', async () => {
      try { await api('/admin/grants', { method: chip.classList.contains('on') ? 'DELETE' : 'POST', body: JSON.stringify({ token: og.token, project_id: p.id }) }); adminRefresh(); }
      catch (e) { dlgAlert('No se pudo cambiar', esc(e.message)); }
    });
    share.appendChild(chip);
  }
};

// cargar y pintar las entradas de un proyecto (capa de contextos oculta)
const loadEntries = async (projectId) => {
  const list = adminMain.querySelector('#entry-list');
  if (!list) return;
  let entries;
  try { entries = await api(`/admin/entries?project=${projectId}`); }
  catch (e) { list.innerHTML = `<div class="entry-empty">Error: ${esc(e.message)}</div>`; return; }
  if (adminSel.project !== projectId || !adminMain.contains(list)) return; // cambió de vista
  list.innerHTML = '';
  if (!entries.length) { list.innerHTML = '<div class="entry-empty">Aún no hay entradas. Se nutren desde el chat con la skill «Nutrir conocimiento».</div>'; return; }
  entries.forEach((en, i) => {
    const item = document.createElement('div');
    item.className = 'entry-item';
    item.innerHTML = `<div class="entry-head"><span class="entry-num tnum">${i + 1}</span><div class="entry-text clamp">${esc(en.content)}</div><button class="admin-icon-btn entry-del" title="Eliminar entrada">✕</button></div>`;
    const text = item.querySelector('.entry-text');
    item.querySelector('.entry-head').addEventListener('click', (e) => { if (!e.target.closest('.entry-del')) text.classList.toggle('clamp'); });
    item.querySelector('.entry-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await dlgConfirm('Eliminar entrada', `Se eliminará esta entrada del conocimiento:<pre>${esc(en.content.slice(0, 200))}${en.content.length > 200 ? '…' : ''}</pre>`, 'Eliminar')) return;
      try { await api(`/admin/entries/${en.id}`, { method: 'DELETE' }); loadEntries(projectId); adminRefresh(); } catch (err) { dlgAlert('No se pudo eliminar', esc(err.message)); }
    });
    list.appendChild(item);
  });
};

adminGroupSearch.addEventListener('input', renderRail);
document.getElementById('admin-new-group').addEventListener('click', async () => {
  const name = await dlgPrompt('Nuevo grupo', 'Marketing', 'Nombre del grupo (sección):');
  if (!name) return;
  try { const r = await api('/admin/groups', { method: 'POST', body: JSON.stringify({ name }) }); adminSel = { view: 'group', group: r.token, project: null }; adminRefresh(); toast(`Grupo «${r.name}» creado`); }
  catch (e) { dlgAlert('No se pudo crear', esc(e.message)); }
});

/* ══ Enlaces rápidos ═══════════════════════════════════════════════
   Accesos del equipo agrupados por conocimiento. Verlos puede cualquiera
   (acotado a los proyectos que dan sus tokens); crearlos, editarlos y
   borrarlos exige rol admin — el mismo gate que publicar skills.
   La card ENTERA es el enlace: al pulsarla se abre en el navegador del
   sistema. Las notas tienen su propio icono para no robarle ese gesto. */

let linksAll = [];        // enlaces devueltos por el bridge
let linksProjects = [];   // proyectos accesibles con el token del usuario
let linksFilter = null;   // id de proyecto, o null = todos

const projectName = (id) => linksProjects.find((p) => p.id === id)?.name || 'Sin conocimiento';

/* Markdown mínimo y seguro: se escapa TODO primero y solo después se
   reconocen unos pocos patrones. Nada de innerHTML con texto del usuario. */
const miniMarkdown = (src) => esc(String(src || ''))
  .replace(/^### (.*)$/gm, '<h4>$1</h4>')
  .replace(/^## (.*)$/gm, '<h3>$1</h3>')
  .replace(/^# (.*)$/gm, '<h3>$1</h3>')
  .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
  .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
  .replace(/\n{2,}/g, '</p><p>')
  .replace(/\n/g, '<br>');

const renderLinks = () => {
  const canEdit = !!curPerms()?.links;
  // card de crear (solo con permiso de editar enlaces): como en las skills, la
  // primera de la rejilla, o sola bajo el mensaje si aún no hay ningún enlace
  const newCard = () => {
    const b = document.createElement('button');
    b.className = 'link-card new';
    b.innerHTML = '<span class="plus">+</span><span>Nuevo enlace</span>';
    b.addEventListener('click', () => openLinkEditor());
    return b;
  };

  // Filtros: solo los conocimientos que TIENEN enlaces. Listar los que están
  // vacíos llena la barra de chips a cero que no llevan a ninguna parte; para
  // dar de alta en uno vacío ya está el desplegable del formulario.
  linksFilters.innerHTML = '';
  const withLinks = linksProjects
    .map((p) => ({ ...p, n: linksAll.filter((l) => l.project_id === p.id).length }))
    .filter((p) => p.n > 0);
  if (withLinks.length > 1) {
    const mk = (label, value, count) => {
      const b = document.createElement('button');
      b.className = `links-chip${linksFilter === value ? ' active' : ''}`;
      b.innerHTML = `${esc(label)}<span class="links-chip-n">${count}</span>`;
      b.addEventListener('click', () => { linksFilter = value; renderLinks(); });
      linksFilters.appendChild(b);
    };
    mk('Todos', null, linksAll.length);
    for (const p of withLinks) mk(p.name, p.id, p.n);
  }
  // si el conocimiento filtrado se ha quedado sin enlaces, volver a "Todos"
  if (linksFilter !== null && !withLinks.some((p) => p.id === linksFilter)) linksFilter = null;

  const list = linksFilter === null ? linksAll : linksAll.filter((l) => l.project_id === linksFilter);
  linksGrid.innerHTML = '';

  if (!linksProjects.length) {
    // sin tokens de acceso en esta base: en vez de explicar dónde se ponen,
    // un botón que abre Configuración justo ahí
    const go = document.createElement('button');
    go.className = 'lab-btn primary';
    go.textContent = 'Configurar acceso';
    go.addEventListener('click', () => openBaseSettings(viewBase, 'access'));
    linksGrid.appendChild(emptyState('links', 'No tienes acceso a ningún conocimiento en esta base.', go));
    return;
  }
  if (!list.length) {
    linksGrid.appendChild(emptyState('links', 'No tienes aún ningún enlace definido.', canEdit ? newCard() : null));
    return;
  }

  if (canEdit) linksGrid.appendChild(newCard());
  for (const l of list) {
    const card = document.createElement('button');
    card.className = 'link-card';
    card.title = l.url;

    // título arriba, imagen grande debajo. La URL no se pinta: no aporta y
    // chocaba con la etiqueta del conocimiento — para verla está el title.
    const img = l.image
      ? `<img class="link-card-img" src="${esc(l.image)}" alt="" />`
      : `<span class="link-card-img placeholder">${esc((l.title || '?').trim().charAt(0).toUpperCase())}</span>`;

    card.innerHTML = `
      <span class="link-card-title">${esc(l.title)}</span>
      ${img}
      <span class="link-card-tag">${esc(projectName(l.project_id))}</span>`;

    // pulsar la card = abrir el enlace (setWindowOpenHandler lo desvía al navegador)
    card.addEventListener('click', () => window.open(l.url, '_blank', 'noopener'));

    const actions = document.createElement('span');
    actions.className = 'link-card-actions';

    if (l.notes && l.notes.trim()) {
      const notesBtn = document.createElement('span');
      notesBtn.className = 'link-card-act';
      notesBtn.title = 'Ver notas';
      notesBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
      notesBtn.addEventListener('click', (e) => { e.stopPropagation(); openLinkNotes(l); });
      actions.appendChild(notesBtn);
    }
    if (canEdit) {
      const editBtn = document.createElement('span');
      editBtn.className = 'link-card-act';
      editBtn.title = 'Editar';
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); openLinkEditor(l); });
      actions.appendChild(editBtn);
    }
    if (actions.childElementCount) card.appendChild(actions);

    linksGrid.appendChild(card);
  }
};

const linksRefresh = async () => {
  try {
    [linksProjects, linksAll] = await Promise.all([api('/access/projects'), api('/links')]);
    if (linksFilter !== null && !linksProjects.some((p) => p.id === linksFilter)) linksFilter = null;
    renderLinks();
  } catch (e) {
    linksGrid.innerHTML = `<p class="links-empty">No se pudieron cargar los enlaces: ${esc(e.message)}</p>`;
  }
};

/* ── Notas ── */
const notesModal = document.getElementById('link-notes-modal');
const notesTitle = document.getElementById('link-notes-title');
const notesBody = document.getElementById('link-notes-body');
const openLinkNotes = (l) => {
  notesTitle.textContent = l.title;
  notesBody.innerHTML = `<p>${miniMarkdown(l.notes)}</p>`;
  notesModal.hidden = false;
};
document.getElementById('link-notes-close').addEventListener('click', () => { notesModal.hidden = true; });
notesModal.addEventListener('click', (e) => { if (e.target === notesModal) notesModal.hidden = true; });

/* ── Alta / edición (solo admin) ── */
const editModal = document.getElementById('link-edit-modal');
const fProject = document.getElementById('link-f-project');
const fTitle = document.getElementById('link-f-title');
const fUrl = document.getElementById('link-f-url');
const fNotes = document.getElementById('link-f-notes');
const fImageInput = document.getElementById('link-f-image');
const fImagePrev = document.getElementById('link-f-image-prev');
const fImageInfo = document.getElementById('link-f-image-info');
const fImageClear = document.getElementById('link-f-image-clear');
const fErr = document.getElementById('link-f-err');
const fDelete = document.getElementById('link-f-delete');
let linkEditing = null;      // enlace en edición, o null si es alta
let linkEditImage = null; // data URI pendiente de guardar

const paintImagePrev = () => {
  fImagePrev.innerHTML = linkEditImage ? `<img src="${esc(linkEditImage)}" alt="" />` : '';
  fImageClear.hidden = !linkEditImage;
  if (!linkEditImage) { fImageInfo.textContent = ''; return; }
  // el data URI es base64: los bytes reales son ~3/4 de su longitud
  const kb = Math.round((linkEditImage.length * 0.75) / 1024);
  fImageInfo.textContent = `${kb} KB`;
};

const openLinkEditor = (l = null) => {
  linkEditing = l;
  linkEditImage = l?.image || null;
  document.getElementById('link-edit-title').textContent = l ? 'Editar enlace' : 'Nuevo enlace';
  fProject.innerHTML = linksProjects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  fProject.value = String(l?.project_id ?? (linksFilter ?? linksProjects[0]?.id ?? ''));
  fTitle.value = l?.title || '';
  fUrl.value = l?.url || '';
  fNotes.value = l?.notes || '';
  fErr.hidden = true;
  fDelete.hidden = !l;
  paintImagePrev();
  editModal.hidden = false;
  setTimeout(() => fTitle.focus(), 30);
};

/* La imagen se redimensiona AQUÍ, antes de guardarla. Motivo: viaja dentro del
   listado, así que una foto de 5 MB se descargaría entera cada vez que alguien
   abre el panel — y la card la pinta a 38 px. Escalando a 256 px el usuario
   puede elegir el fichero que quiera sin toparse nunca con un límite. */
const LINK_IMAGE_SIDE = 256;

const shrinkImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('no se pudo leer el fichero'));
  reader.onload = () => {
    const raw = String(reader.result);
    const img = new Image();
    // si algo falla (SVG sin dimensiones, formato raro) se guarda tal cual y
    // que decida el servidor: mejor eso que dejar al usuario sin imagen
    img.onerror = () => resolve(raw);
    img.onload = () => {
      try {
        const scale = Math.min(1, LINK_IMAGE_SIDE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // webp mantiene transparencia y pesa poco; si no está disponible el
        // navegador devuelve png, que también vale
        const out = canvas.toDataURL('image/webp', 0.85);
        resolve(out.length < raw.length ? out : raw);
      } catch { resolve(raw); }
    };
    img.src = raw;
  };
  reader.readAsDataURL(file);
});

document.getElementById('link-f-image-pick').addEventListener('click', () => fImageInput.click());
fImageClear.addEventListener('click', () => { linkEditImage = null; fImageInput.value = ''; paintImagePrev(); });
fImageInput.addEventListener('change', async () => {
  const file = fImageInput.files?.[0];
  if (!file) return;
  fImageInfo.textContent = 'ajustando…';
  try {
    linkEditImage = await shrinkImage(file);
    paintImagePrev();
  } catch (e) {
    fImageInfo.textContent = e.message;
  }
});

const closeEditor = () => { editModal.hidden = true; linkEditing = null; linkEditImage = null; fImageInput.value = ''; };
document.getElementById('link-edit-close').addEventListener('click', closeEditor);
document.getElementById('link-f-cancel').addEventListener('click', closeEditor);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditor(); });

document.getElementById('link-f-save').addEventListener('click', async () => {
  const payload = {
    project_id: Number(fProject.value),
    title: fTitle.value.trim(),
    url: fUrl.value.trim(),
    image: linkEditImage,
    notes: fNotes.value.trim() || null,
  };
  try {
    if (linkEditing) await api(`/links/${linkEditing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/links', { method: 'POST', body: JSON.stringify(payload) });
    closeEditor();
    linksRefresh();
  } catch (e) {
    fErr.textContent = e.message;
    fErr.hidden = false;
  }
});

fDelete.addEventListener('click', async () => {
  if (!linkEditing) return;
  const ok = await dlgConfirm('Eliminar enlace', `Se eliminará <strong>${esc(linkEditing.title)}</strong> para todo el equipo. No se puede deshacer.`, 'Eliminar');
  if (!ok) return;
  try { await api(`/links/${linkEditing.id}`, { method: 'DELETE' }); closeEditor(); linksRefresh(); }
  catch (e) { fErr.textContent = e.message; fErr.hidden = false; }
});

// Actualizar a mano, como en el Laboratorio: por si un compañero acaba de
// añadir un enlace o te han dado acceso a otro conocimiento.
const linksRefreshBtn = document.getElementById('links-refresh');
linksRefreshBtn.addEventListener('click', async () => {
  linksRefreshBtn.disabled = true;
  linksRefreshBtn.classList.add('loading');
  try { await linksRefresh(); }
  finally { linksRefreshBtn.disabled = false; linksRefreshBtn.classList.remove('loading'); }
});
navLinks.addEventListener('click', () => enterView('links'));

/* ══ Claves de poder (⚙️ → Claves; solo el owner) ═══════════════════
   Una línea por clave: nombre, vistas que abre, la clave tapada, copiar,
   editar (nombre y vistas) y borrar. La del owner lleva etiqueta y ni se
   edita ni se borra (cambia solo volviendo a ejecutar el SQL desde el
   asistente). Crear = nombre + selector de vistas. */
const PERM_DEFS = [
  { id: 'lab', label: 'Laboratorio' },
  { id: 'admin', label: 'Administración' },
  { id: 'links', label: 'Editar enlaces' },
  { id: 'invite', label: 'Invitar' }, // compartir los grupos a los que uno tiene token
];
const permsSummary = (p) => p.owner ? 'todo (owner)' : (PERM_DEFS.filter((d) => p[d.id]).map((d) => d.label).join(', ') || 'nada');
const MOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/><path d="M3 7v10a2 2 0 0 0 2 2h6"/><path d="M14 16h7"/><path d="m18 13 3 3-3 3"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

const keysList = document.getElementById('keys-list');
const keysStatus = document.getElementById('keys-status');
const keysNewName = document.getElementById('keys-new-name');
const keysNewPerms = document.getElementById('keys-new-perms');
const keysNewCreate = document.getElementById('keys-new-create');
const keysNewStatus = document.getElementById('keys-new-status');

// selector de vistas: pastillas que se marcan y desmarcan
for (const d of PERM_DEFS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pill'; b.dataset.perm = d.id; b.textContent = d.label;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'));
  keysNewPerms.appendChild(b);
}
const pickedPerms = () => Object.fromEntries([...keysNewPerms.querySelectorAll('.pill')].map((b) => [b.dataset.perm, b.getAttribute('aria-pressed') === 'true']));
const resetPicked = () => { for (const b of keysNewPerms.querySelectorAll('.pill')) b.setAttribute('aria-pressed', 'false'); };

const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

/* Editar una clave: nombre y vistas que abre, SIN cambiar la clave en sí, así
   quien ya la tiene no necesita una nueva. Va detrás de un lápiz y de un
   Guardar explícito, para no dar ni quitar poderes con un clic suelto. La fila
   se convierte en el formulario; solo una a la vez. La del owner no se edita. */
let keyEditCancel = null; // cierra la edición abierta, si la hay
const keyEditor = (k, li) => {
  keyEditCancel?.();
  li.classList.add('editing');
  li.innerHTML = `
    <div class="key-main">
      <input class="settings-input key-edit-name" type="text" maxlength="60" placeholder="Nombre de la clave" autocomplete="off" />
      <div class="pill-select key-edit-perms" role="group" aria-label="Vistas que abre"></div>
      <div class="settings-status" data-role="status"></div>
    </div>
    <div class="key-edit-actions">
      <button class="lab-btn" data-act="cancel">Cancelar</button>
      <button class="lab-btn primary" data-act="save">Guardar</button>
    </div>`;
  const nameInput = li.querySelector('.key-edit-name');
  const permsBox = li.querySelector('.key-edit-perms');
  const status = li.querySelector('[data-role="status"]'); // por atributo: dbSetStatus reescribe las clases
  const save = li.querySelector('[data-act="save"]');
  nameInput.value = k.name;
  for (const d of PERM_DEFS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.dataset.perm = d.id; b.textContent = d.label;
    b.setAttribute('aria-pressed', k.perms[d.id] ? 'true' : 'false');
    b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'));
    permsBox.appendChild(b);
  }
  const cancel = () => { keyEditCancel = null; li.replaceWith(keyItem(k)); };
  keyEditCancel = cancel;
  const submit = async () => {
    const name = nameInput.value.trim();
    const perms = Object.fromEntries([...permsBox.querySelectorAll('.pill')].map((b) => [b.dataset.perm, b.getAttribute('aria-pressed') === 'true']));
    if (!name) return dbSetStatus(status, 'ponle un nombre a la clave', 'bad');
    if (!Object.values(perms).some(Boolean)) return dbSetStatus(status, 'elige al menos una vista', 'bad');
    const same = name === k.name && PERM_DEFS.every((d) => !!perms[d.id] === !!k.perms[d.id]);
    if (same) return cancel();
    save.disabled = true;
    try {
      await api(`/keys/${encodeURIComponent(k.key)}`, { method: 'PUT', body: JSON.stringify({ name, perms }), headers: { 'X-SIA-Base': keysBase } });
      keyEditCancel = null;
      toast(`Clave «${name}» actualizada`);
      keysRefresh(); settingsChanged();
    } catch (e) { dbSetStatus(status, e.message, 'bad'); save.disabled = false; }
  };
  save.addEventListener('click', submit);
  li.querySelector('[data-act="cancel"]').addEventListener('click', cancel);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
  });
  nameInput.focus(); nameInput.select();
};

const keyItem = (k) => {
  const li = document.createElement('li');
  li.className = 'key-item';
  const pills = k.owner
    ? '<span class="pill">Todas las vistas</span>'
    : PERM_DEFS.filter((d) => k.perms[d.id]).map((d) => `<span class="pill">${d.label}</span>`).join('') || '<span class="pill">Sin vistas</span>';
  li.innerHTML = `
    <div class="key-main">
      <div class="key-title">${esc(k.name)}${k.owner ? '<span class="key-badge">OWNER</span>' : ''}</div>
      <div class="key-perms">${pills}</div>
    </div>
    <code class="key-secret">••••••••••••</code>
    <div class="key-actions">
      <button class="icon-btn" data-act="copy" title="Copiar clave" aria-label="Copiar clave">${COPY_ICON}</button>
      ${k.owner ? '' : `<button class="icon-btn" data-act="edit" title="Editar nombre y vistas" aria-label="Editar clave">${EDIT_ICON}</button>
      <button class="icon-btn danger" data-act="del" title="Borrar clave" aria-label="Borrar clave">${TRASH_ICON}</button>`}
    </div>`;
  const copy = li.querySelector('[data-act="copy"]');
  copy.addEventListener('click', async () => { if (await copyWithFeedback(copy, k.key)) toast(`Clave «${k.name}» copiada`, 1800); else dbSetStatus(keysStatus, 'no se pudo copiar: selecciona la clave y cópiala a mano', 'bad'); });
  li.querySelector('[data-act="edit"]')?.addEventListener('click', () => keyEditor(k, li));
  li.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    if (!(await dlgConfirm('Borrar clave', `Quien tenga la clave <strong>${esc(k.name)}</strong> dejará de abrir sus vistas al momento.`, 'Borrar'))) return;
    try { await api(`/keys/${encodeURIComponent(k.key)}`, { method: 'DELETE', headers: { 'X-SIA-Base': keysBase } }); toast(`Clave «${k.name}» borrada`); keysRefresh(); settingsChanged(); }
    catch (e) { dbSetStatus(keysStatus, e.message, 'bad'); }
  });
  return li;
};

// las claves se gestionan dentro de la base elegida en Conocimiento (solo owner)
let keysBase = null;
const keysRefresh = async () => {
  dbSetStatus(keysStatus, '');
  keysBase = selectedBase;
  if (!keysBase || !permsOfBase(keysBase)?.owner) { keysList.innerHTML = ''; return; }
  try {
    const { keys } = await api('/keys', { headers: { 'X-SIA-Base': keysBase } });
    keyEditCancel = null;
    keysList.innerHTML = '';
    for (const k of keys) keysList.appendChild(keyItem(k));
  } catch (e) { dbSetStatus(keysStatus, e.message, 'bad'); }
};
keysNewCreate.addEventListener('click', async () => {
  const name = keysNewName.value.trim();
  const perms = pickedPerms();
  if (!name) return dbSetStatus(keysNewStatus, 'ponle un nombre a la clave', 'bad');
  if (!Object.values(perms).some(Boolean)) return dbSetStatus(keysNewStatus, 'elige al menos una vista', 'bad');
  keysNewCreate.disabled = true;
  try {
    await api('/keys', { method: 'POST', body: JSON.stringify({ name, perms }), headers: { 'X-SIA-Base': keysBase } });
    keysNewName.value = ''; resetPicked();
    dbSetStatus(keysNewStatus, '');
    toast(`Clave «${name}» creada`);
    keysRefresh(); settingsChanged();
  } catch (e) { dbSetStatus(keysNewStatus, e.message, 'bad'); }
  finally { keysNewCreate.disabled = false; }
});
keysNewName.addEventListener('keydown', (e) => { if (e.key === 'Enter') keysNewCreate.click(); });
