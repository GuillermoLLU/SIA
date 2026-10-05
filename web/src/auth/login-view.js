// Puerta de inicio de sesión: pantalla completa antes de la app, con el aspecto
// de la del candado (el halo, el tema). Primero solo la S en el centro, que hace
// de botón: al pulsarla se desvanece y en su sitio aparece el formulario.
// Solo DOM; la sesión la lleva session.js.
import './login.css';

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const markup = (logoHtml, lastName) => `<div class="login-stage">
<button class="login-open" type="button" aria-label="Iniciar sesión">${logoHtml}</button>
<form class="lock-card login-card" novalidate inert>
  <input class="settings-input login-input" name="username" placeholder="Usuario" autocomplete="username" autocapitalize="off" spellcheck="false" value="${escAttr(lastName)}" />
  <input class="settings-input login-input" name="password" type="password" placeholder="Contraseña" autocomplete="current-password" />
  <button class="lab-btn primary login-go" type="submit">Iniciar sesión</button>
  <div class="login-remember">
    <span>Mantener la sesión</span>
    <button type="button" class="sw" role="switch" aria-checked="true" aria-label="Mantener la sesión"><span class="knob"></span></button>
  </div>
  <div class="lock-msg" role="alert"></div>
</form>
</div>`;

// Tapa la app hasta que el usuario entra. → promesa con el usuario.
const loginGate = (session, logoHtml) => new Promise((resolve) => {
  const appEl = document.querySelector('.app');
  document.body.classList.add('locked');
  appEl.inert = true;
  const el = document.createElement('div');
  el.className = 'lock-gate';
  el.innerHTML = markup(logoHtml, session.lastName());
  document.body.appendChild(el);

  const stage = el.querySelector('.login-stage');
  const opener = stage.querySelector('.login-open');
  const form = stage.querySelector('form');
  const { username, password } = form.elements;
  const remember = form.querySelector('.login-remember .sw');
  const go = form.querySelector('.login-go');
  const msg = form.querySelector('.lock-msg');
  const fail = (text) => {
    msg.textContent = text;
    form.classList.remove('bad'); void form.offsetWidth; form.classList.add('bad');
  };
  const leave = (user) => {
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
    const name = username.value.trim();
    if (!name || !password.value) return fail('Escribe usuario y contraseña.');
    msg.textContent = ''; go.disabled = true;
    try {
      const r = await session.login(name, password.value, remember.getAttribute('aria-checked') === 'true');
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
  opener.addEventListener('click', () => {
    stage.classList.add('open');
    opener.inert = true;
    form.inert = false;
    (username.value ? password : username).focus({ preventScroll: true });
  }, { once: true });
  opener.focus();
});

// El usuario de la sesión guardada o, si no hay, el que entre por la puerta.
export const ensureLogin = async (session, { logoHtml, paintTheme }) => {
  try {
    const user = await session.current();
    if (user) return user;
  } catch { /* sin bridge: la puerta igualmente; su formulario avisa si sigue sin respuesta */ }
  paintTheme();
  return loginGate(session, logoHtml);
};
