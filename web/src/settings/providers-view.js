// Configuración → Proveedores IA: la cuenta de Copilot con la que corren los
// chats (server/providers/). Su estado y lo gastado, iniciar sesión por código
// de dispositivo (el código se copia, se pega en github.com/login/device y
// SIA lo detecta solo) y cerrarla. Es aparte de la clave de GitHub de
// Conexiones, que es para los repositorios.
//
// deps: api · settings (onPane: al entrar en la sección se relee) · toast · dialogs
import { copilotCard, usageText } from './providers.js';

const POLL_MS = 2000; // cada cuánto se mira si el login ha terminado

export const mountProviders = ({ api, settings, toast, dialogs }) => {
  const $ = (id) => document.getElementById(id);
  const status = $('copilot-auth-status'), badge = $('copilot-auth-badge'), usage = $('copilot-auth-usage');
  const loginBtn = $('copilot-login'), logoutBtn = $('copilot-logout');
  const flow = $('copilot-login-flow'), code = $('copilot-login-code'), url = $('copilot-login-url'), cancelBtn = $('copilot-login-cancel');
  const say = (text, cls = '') => { status.textContent = text; status.className = `conn-sub${cls ? ` ${cls}` : ''}`; };
  let poll = 0;

  const refresh = async () => {
    try {
      const st = await api('/providers/copilot');
      const card = copilotCard(st);
      say(card.text, card.cls);
      badge.textContent = card.badge;
      badge.className = `conn-badge${card.badgeCls ? ` ${card.badgeCls}` : ''}`;
      loginBtn.textContent = card.button;
      logoutBtn.hidden = !card.loggedIn;
      usage.hidden = !st.usage;
      if (st.usage) {
        usage.querySelector('.conn-bar').style.setProperty('--used', `${st.usage.usedPercent}%`);
        usage.querySelector('.conn-bar').classList.toggle('high', st.usage.usedPercent >= 90);
        usage.querySelector('span').textContent = usageText(st.usage);
      }
    } catch { say('No se pudo comprobar (bridge sin arrancar).', 'bad'); badge.textContent = 'Sin comprobar'; badge.className = 'conn-badge'; }
  };
  const stopLogin = () => { clearInterval(poll); poll = 0; flow.hidden = true; loginBtn.disabled = false; };
  // mientras la persona autoriza en GitHub, se mira si ya está
  const watchLogin = () => {
    clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const p = await api('/providers/copilot/login');
        if (p.running) return;
        stopLogin();
        if (p.ok) toast('Sesión iniciada en Copilot'); else if (p.error && p.error !== 'Cancelado.') say(p.error, 'bad');
        refresh();
      } catch { /* se vuelve a mirar */ }
    }, POLL_MS);
  };
  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    say('Pidiendo el código a GitHub…');
    try {
      const p = await api('/providers/copilot/login', { method: 'POST' });
      if (!p.running || !p.code) { say(p.error || 'No se pudo arrancar el login.', 'bad'); loginBtn.disabled = false; if (p.running) api('/providers/copilot/cancel', { method: 'POST' }).catch(() => {}); return; }
      code.textContent = p.code;
      url.href = p.url || 'https://github.com/login/device';
      flow.hidden = false;
      say('Mete el código en GitHub para terminar.');
      watchLogin();
    } catch (err) { say(err.message, 'bad'); loginBtn.disabled = false; }
  });
  $('copilot-login-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.textContent); toast('Código copiado', 1200); } catch { toast.error('No se pudo copiar'); }
  });
  cancelBtn.addEventListener('click', async () => {
    try { await api('/providers/copilot/cancel', { method: 'POST' }); } catch { /* ya no corría */ }
    stopLogin();
    refresh();
  });
  logoutBtn.addEventListener('click', async () => {
    if (!(await dialogs.confirm('Cerrar la sesión de Copilot', '<p class="dlg-lead">Los chats de Copilot no podrán seguir hasta que vuelvas a entrar.</p>', 'Cerrar sesión'))) return;
    logoutBtn.disabled = true;
    try { const r = await api('/providers/copilot/logout', { method: 'POST' }); if (!r.ok) say(r.error || 'No se pudo cerrar la sesión.', 'bad'); }
    catch (err) { say(err.message, 'bad'); }
    logoutBtn.disabled = false;
    refresh();
  });

  settings.onPane((name) => { if (name === 'proveedores') { stopLogin(); refresh(); } });
  return { refresh };
};
