// Puerta de inicio de sesión: pantalla completa antes de la app, con el aspecto
// de la del candado (el halo, el tema). Primero solo la S en el centro, que hace
// de botón: al pulsarla se desvanece y en su sitio aparece el formulario; un
// clic fuera de él lo cierra y vuelve la S.
// Solo DOM; la sesión la lleva session.js.
import './login.css';
import { esc } from '../ui/html.js';
import { pressStartedIn, prefersReducedMotion } from '../ui/dom.js';
import { CORP_HTML } from '../app/corp.js';

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
</div>${CORP_HTML}`;

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
  const { email, password } = form.elements;
  const remember = form.querySelector('.login-remember .sw');
  const go = form.querySelector('.login-go');
  const msg = form.querySelector('.lock-msg');
  const fail = (text) => {
    msg.textContent = text;
    form.classList.remove('bad'); void form.offsetWidth; form.classList.add('bad');
  };
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!address || !password.value) return fail('Escribe email y contraseña.');
    msg.textContent = ''; go.disabled = true;
    try {
      const r = await session.login(address, password.value, remember.getAttribute('aria-checked') === 'true');
      if (r.user) return leave(r.user);
      password.value = ''; password.focus();
      fail(r.error);
    } catch { fail('Sin conexión con SIA.'); }
    finally { go.disabled = false; }
  });
  // «Mantener la sesión»: el interruptor de la app; el texto también lo cambia
  form.querySelector('.login-remember').addEventListener('click', () => {
    remember.setAttribute('aria-checked', String(remember.getAttribute('aria-checked') !== 'true'));
  });
  // La S abre el formulario; un clic fuera de él lo cierra y vuelve la S.
  const setOpen = (open) => {
    stage.classList.toggle('open', open);
    opener.inert = open;
    form.inert = !open;
    if (open) return (email.value ? password : email).focus({ preventScroll: true });
    password.value = ''; msg.textContent = '';
    opener.focus({ preventScroll: true });
  };
  opener.addEventListener('click', () => setOpen(true));
  const pressedInForm = pressStartedIn(el, (t) => form.contains(t));
  el.addEventListener('click', (e) => {
    if (!pressedInForm() && stage.classList.contains('open') && !form.contains(e.target) && !opener.contains(e.target)) setOpen(false);
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
  const fail = (text) => { msg.textContent = text; form.classList.remove('bad'); void form.offsetWidth; form.classList.add('bad'); };
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
  try { user = await session.current(); } catch { /* sin bridge: la puerta igualmente; su formulario avisa si sigue sin respuesta */ }
  if (!user) { paintTheme(); user = await loginGate(session, logoHtml); }
  if (user.must_change_password) {
    paintTheme();
    await passwordGate(session, logoHtml);
    user = { ...user, must_change_password: false };
  }
  return user;
};
