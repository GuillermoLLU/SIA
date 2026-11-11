// Puerta de inicio de sesión: pantalla completa antes de la app, con el aspecto
// de la del candado (el halo, el tema). Primero solo la S en el centro, que hace
// de botón: al pulsarla SIA comprueba el equipo (certificados del cliente y VPN,
// /auth/check) y en su sitio aparece el formulario o, si falta algo, el aviso
// con «Reintentar». Un clic fuera de ellos vuelve a la S.
// Solo DOM; la sesión la lleva session.js.
import './login.css';
import { esc } from '../ui/html.js';
import { pressStartedIn, prefersReducedMotion } from '../ui/dom.js';
import { netWarningHtml, shake } from '../ui/net-warning-view.js';
import { CORP_HTML } from '../app/corp.js';

// En desarrollo, con el aviso aparece «Modo Dev» en la esquina: pasar al
// formulario aunque falte algo, sin tocar la vista que ve el usuario final.
const DEV = Boolean(import.meta.env?.DEV);

const markup = (logoHtml, lastEmail) => `<div class="login-stage">
<button class="login-open" type="button" aria-label="Iniciar sesión">${logoHtml}</button>
<form class="lock-card login-card" novalidate inert>
  <h1 class="login-title">SIA</h1>
  <input class="settings-input login-input" name="email" type="email" placeholder="Email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(lastEmail)}" />
  <input class="settings-input login-input" name="password" type="password" placeholder="Contraseña" autocomplete="current-password" />
  <button class="lab-btn primary login-go" type="submit">Iniciar sesión</button>
  <div class="login-remember">
    <span>Mantener la sesión</span>
    <button type="button" class="sw" role="switch" aria-checked="true" aria-label="Mantener la sesión"><span class="knob"></span></button>
  </div>
  <div class="lock-msg" role="alert"></div>
</form>
<div class="lock-card login-card login-warn net-warn" role="alert" inert></div>
</div>${CORP_HTML}
${DEV ? `<span class="login-tip login-dev-tip" inert><button type="button" class="login-dev">Modo Dev</button><span role="tooltip">${DEV_TIP}</span></span>` : ''}`;

const DEV_TIP = 'Solo en desarrollo: pasa al inicio de sesión y al resto de SIA aunque falte esto, para seguir trabajando. Lo que dependa de la red del cliente no responderá.';

// Al entrar: el formulario se desvanece, el logotipo de Inditex sube de abajo al centro y, debajo,
// la bienvenida con el nombre. → promesa que se cumple cuando ya se ha leído, para dar paso a la app.
const WELCOME_MS = { out: 380, rise: 950, text: 450, hold: 900 };
const welcome = (el, user) => new Promise((resolve) => {
  const corp = el.querySelector('.lock-corp');
  if (!corp || prefersReducedMotion()) return resolve();
  el.classList.add('welcome');
  const r = corp.getBoundingClientRect();
  const dy = Math.round(innerHeight / 2 - 22 - (r.top + r.height / 2));
  corp.getAnimations().forEach((a) => a.finish());   // su entrada, si aún no había acabado
  corp.animate(
    [{ transform: 'translate(-50%, 0) scale(1)' }, { transform: `translate(-50%, ${dy}px) scale(1.7)` }],
    { duration: WELCOME_MS.rise, delay: WELCOME_MS.out / 2, easing: 'cubic-bezier(.65, 0, .25, 1)', fill: 'forwards' },
  );
  const text = document.createElement('p');
  text.className = 'lock-welcome';
  text.innerHTML = `Te damos la bienvenida, <b>${esc(user.name || '')}</b>`;
  el.append(text);
  text.animate(
    [{ opacity: 0, transform: 'translate(-50%, 8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translate(-50%, 0)', filter: 'blur(0)' }],
    { duration: WELCOME_MS.text, delay: WELCOME_MS.out / 2 + WELCOME_MS.rise - 150, easing: 'ease-out', fill: 'both' },
  );
  setTimeout(resolve, WELCOME_MS.out / 2 + WELCOME_MS.rise + WELCOME_MS.hold);
});

// Tapa la app hasta que el usuario entra. → promesa con el usuario.
const loginGate = (session, logoHtml) => new Promise((resolve) => {
  const appEl = document.querySelector('.app');
  document.body.classList.add('locked');
  appEl.inert = true;
  const el = document.createElement('div');
  el.className = 'lock-gate';
  el.innerHTML = markup(logoHtml, session.lastEmail());
  document.body.appendChild(el);

  const stage = el.querySelector('.login-stage');
  const opener = stage.querySelector('.login-open');
  const form = stage.querySelector('form');
  const warn = stage.querySelector('.login-warn');
  const { email, password } = form.elements;
  const remember = form.querySelector('.login-remember .sw');
  const go = form.querySelector('.login-go');
  const msg = form.querySelector('.lock-msg');
  const dev = el.querySelector('.login-dev-tip');
  let devMode = false; // «Modo Dev»: ya no se comprueba el equipo
  const fail = (text) => { msg.textContent = text; shake(form); };
  const leave = async (user) => {
    form.inert = true;   // ya dentro: ni un segundo Enter ni otro clic mientras da la bienvenida
    if (!user.must_change_password) await welcome(el, user);   // con contraseña que cambiar, antes su puerta
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      document.body.classList.remove('locked');
      appEl.inert = false;
      resolve(user);
    }, 220);
  };

  // closed (la S) · form (el formulario) · warn (el aviso de lo que falta)
  const show = (state) => {
    stage.classList.toggle('open', state === 'form');
    stage.classList.toggle('warn', state === 'warn');
    opener.inert = state !== 'closed';
    form.inert = state !== 'form';
    warn.inert = state !== 'warn';
    if (dev) { dev.classList.toggle('shown', state === 'warn' || devMode); dev.inert = state !== 'warn'; }
    if (state === 'form') return (email.value ? password : email).focus({ preventScroll: true });
    password.value = ''; msg.textContent = '';
    if (state === 'closed') opener.focus({ preventScroll: true });
  };
  const showWarn = (r) => {
    const again = stage.classList.contains('warn');
    warn.innerHTML = netWarningHtml(r);   // el aviso de toda SIA (ui/net-warning-view.js)
    show('warn');
    if (again) shake(warn); // «Reintentar» y sigue faltando
    warn.querySelector('[data-net-retry]').focus({ preventScroll: true });
  };
  // ¿Está el equipo listo? Sí: el formulario. No: el aviso.
  const check = async () => {
    if (devMode) return show('form');
    const r = await session.check().catch(() => ({ error: 'Sin conexión con SIA.' }));
    return r.ok ? show('form') : showWarn(r);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!address || !password.value) return fail('Escribe email y contraseña.');
    msg.textContent = ''; go.disabled = true;
    try {
      const r = await session.login(address, password.value, remember.getAttribute('aria-checked') === 'true');
      if (r.user) return leave(r.user);
      if (r.code && !devMode) return showWarn(r);
      password.value = ''; password.focus();
      fail(r.error);
    } catch { fail('Sin conexión con SIA.'); }
    finally { go.disabled = false; }
  });
  // «Mantener la sesión»: el interruptor de la app; el texto también lo cambia
  form.querySelector('.login-remember').addEventListener('click', () => {
    remember.setAttribute('aria-checked', String(remember.getAttribute('aria-checked') !== 'true'));
  });
  warn.addEventListener('click', async (e) => {
    const retry = e.target.closest('[data-net-retry]');
    if (!retry) return;
    retry.disabled = true; retry.textContent = 'Comprobando…';
    await check();
  });
  // La S comprueba el equipo y abre el formulario o el aviso; un clic fuera vuelve a la S,
  // salvo si se empezó a pulsar dentro (seleccionar texto y soltar fuera no lo cierra).
  opener.addEventListener('click', async () => {
    if (stage.classList.contains('checking')) return;
    stage.classList.add('checking');
    try { await check(); } finally { stage.classList.remove('checking'); }
  });
  const pressedInside = pressStartedIn(el, (t) => form.contains(t) || warn.contains(t));
  el.addEventListener('click', (e) => {
    if (e.target.closest('.login-dev')) {
      devMode = true;
      dev.classList.add('on');
      dev.querySelector('.login-dev').textContent = 'Modo Dev activo';
      return show('form');
    }
    const open = stage.classList.contains('open') || stage.classList.contains('warn');
    if (open && !pressedInside() && !form.contains(e.target) && !warn.contains(e.target) && !opener.contains(e.target)) show('closed');
  });
  opener.focus();
});

// El usuario de la sesión guardada o, si no hay, el que entre por la puerta.
// Contraseña puesta por un admin: antes de entrar, la persona elige la suya.
// La misma puerta, con dos campos y la política a la vista.
const passwordGate = (session, logoHtml) => new Promise((resolve) => {
  const appEl = document.querySelector('.app');
  document.body.classList.add('locked');
  appEl.inert = true;
  const el = document.createElement('div');
  el.className = 'lock-gate';
  el.innerHTML = `<form class="lock-card login-card login-password" novalidate>
    ${logoHtml}
    <input class="settings-input login-input" name="password" type="password" placeholder="Contraseña nueva" autocomplete="new-password" />
    <input class="settings-input login-input" name="repeat" type="password" placeholder="Repítela" autocomplete="new-password" />
    <p class="login-hint">Mínimo 6 caracteres.</p>
    <button class="lab-btn primary login-go" type="submit">Guardar y entrar</button>
    <div class="lock-msg" role="alert"></div>
  </form>${CORP_HTML}`;
  document.body.appendChild(el);
  const form = el.querySelector('form');
  const { password, repeat } = form.elements;
  const go = form.querySelector('.login-go');
  const msg = form.querySelector('.lock-msg');
  const fail = (text) => { msg.textContent = text; shake(form); };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (password.value !== repeat.value) return fail('Las dos contraseñas no coinciden.');
    go.disabled = true; msg.textContent = '';
    try {
      const r = await session.changePassword(password.value);
      if (r.error) return fail(r.error);
      el.classList.add('leaving');
      setTimeout(() => { el.remove(); document.body.classList.remove('locked'); appEl.inert = false; resolve(); }, 220);
    } catch { fail('Sin conexión con SIA.'); }
    finally { go.disabled = false; }
  });
  password.focus();
});

// El usuario de la sesión guardada o, si no hay, el que entre por la puerta; y,
// si su contraseña la puso un admin, antes la cambia.
export const ensureLogin = async (session, { logoHtml, paintTheme }) => {
  let user = null;
  try { user = await session.current(); } catch { /* sin bridge o sin certificados: la puerta igualmente; la S lo comprueba */ }
  if (!user) { paintTheme(); user = await loginGate(session, logoHtml); }
  if (user.must_change_password) {
    paintTheme();
    await passwordGate(session, logoHtml);
    user = { ...user, must_change_password: false };
  }
  return user;
};
