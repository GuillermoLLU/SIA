// Configuración (el modal): sus secciones, la versión y las conexiones
// (Jira, GitHub y el usuario de Snowflake de las Métricas). Lo demás (el PIN, los enlaces) se
// cuelgan de onOpen/onClose para releer su estado cuando se abre o se cierra.
import { esc } from '../ui/html.js';
import { setStatus, prefersReducedMotion } from '../ui/dom.js';
import { jiraConfig, ghMask, addGithubKey, removeGithubKey, toggleGithubKey } from './credentials.js';

export const mountSettings = ({ api }) => {
  const $ = (id) => document.getElementById(id);
  const modal = $('settings-modal'), btn = $('settings-btn'), closeBtn = $('settings-close'), version = $('settings-version');
  const opens = [], closes = [];

  /* Al abrir, una caja por sección; pulsar una enseña solo esa, con la flecha para volver */
  const home = $('settings-home'), title = $('settings-title'), back = $('settings-back');
  const boxes = [...home.querySelectorAll('.settings-box')];
  const panes = [...modal.querySelectorAll('.settings-pane')];
  const boxOf = (name) => boxes.find((b) => b.dataset.pane === name);
  const layout = modal.querySelector('.settings-layout');
  let current = null; // la sección abierta
  let side = null;    // el título de la columna de la derecha cuando ocupa todo el ancho
  const paintHead = () => {
    back.hidden = !current && !side;
    const text = side || (current ? boxOf(current).textContent : 'Configuración');
    if (title.textContent === text) return;
    title.textContent = text;
    if (!prefersReducedMotion()) {
      title.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 400, easing: 'ease' });
    }
  };
  const showPane = (name) => {
    current = name;
    home.hidden = !!name;
    for (const p of panes) p.hidden = p.dataset.pane !== name;
    paintHead();
  };
  const showSide = (text) => {
    side = text;
    layout.classList.toggle('side-open', !!text);
    paintHead();
  };
  for (const b of boxes) b.addEventListener('click', () => showPane(b.dataset.pane));
  back.addEventListener('click', () => (side ? showSide(null) : showPane(null)));

  // Jira
  const jiraUrl = $('jira-url-input'), jiraToken = $('jira-token-input'), jiraStatus = $('jira-status');
  $('jira-save').addEventListener('click', async () => {
    try {
      await api('/config', { method: 'PUT', body: { jira: jiraConfig(jiraUrl.value, jiraToken.value) } });
      setStatus(jiraStatus, 'guardado ✓ — aplica a los chats que abras a partir de ahora', 'ok');
    } catch (err) { setStatus(jiraStatus, `no se pudo guardar: ${err.message}`, 'bad'); }
  });

  // Snowflake: solo quién consulta (se entra por SSO). El rol y el warehouse están fijados en la configuración: aquí no se tocan.
  const sfUser = $('sf-user-input'), sfStatus = $('sf-status');
  $('sf-save').addEventListener('click', async () => {
    try {
      await api('/config', { method: 'PUT', body: { snowflake: { user: sfUser.value } } });
      setStatus(sfStatus, 'guardado ✓ — se usa en la próxima actualización de Métricas', 'ok');
    } catch (err) { setStatus(sfStatus, `no se pudo guardar: ${err.message}`, 'bad'); }
  });

  // GitHub: varias claves, una activa
  const ghList = $('gh-list'), ghName = $('gh-name-input'), ghToken = $('gh-token-input'), ghStatus = $('gh-status');
  let gh = { keys: [], activeId: null };
  const saveGh = async (next) => {
    gh = { keys: next.keys, activeId: next.activeId };
    try {
      await api('/config', { method: 'PUT', body: { github: gh } });
      setStatus(ghStatus, next.message, 'ok');
    } catch (err) { setStatus(ghStatus, `no se pudo guardar: ${err.message}`, 'bad'); }
    renderGh();
  };
  const renderGh = () => {
    ghList.innerHTML = '';
    if (!gh.keys.length) { ghList.innerHTML = '<li class="token-empty">Sin claves guardadas.</li>'; return; }
    for (const k of gh.keys) {
      const active = k.id === gh.activeId;
      const li = document.createElement('li');
      if (active) li.className = 'active';
      li.innerHTML = `<button class="pick" title="${active ? 'Desactivar' : 'Activar'}" aria-pressed="${active}">`
        + `<span class="dot"></span><span class="name">${esc(k.name)}</span></button>`
        + `<span class="tok gh-tok">${esc(ghMask(k.token))}</span>`
        + '<button class="rm" title="Quitar">×</button>';
      li.querySelector('.pick').addEventListener('click', () => saveGh(toggleGithubKey(gh, k.id)));
      li.querySelector('.rm').addEventListener('click', () => saveGh(removeGithubKey(gh, k.id)));
      ghList.appendChild(li);
    }
  };
  $('gh-save').addEventListener('click', () => {
    const next = addGithubKey(gh, { name: ghName.value, token: ghToken.value, id: `gh${Date.now().toString(36)}` });
    if (next.error) { setStatus(ghStatus, next.error, 'bad'); return; }
    ghName.value = ''; ghToken.value = '';
    saveGh(next);
  });

  const open = async () => {
    setStatus(jiraStatus, '');
    setStatus(sfStatus, '');
    setStatus(ghStatus, '');
    showSide(null);
    showPane(null);
    modal.hidden = false;
    for (const fn of opens) fn();
    try {
      const cfg = await api('/config');
      if (cfg.version) version.textContent = `SIA v${cfg.version}`;
      jiraUrl.value = cfg.jira?.baseUrl || '';
      jiraToken.value = cfg.jira?.token || '';
      sfUser.value = cfg.snowflake?.user || '';
      gh = { keys: Array.isArray(cfg.github?.keys) ? cfg.github.keys : [], activeId: cfg.github?.activeId || null };
      ghName.value = ''; ghToken.value = '';
      renderGh();
    } catch { /* bridge caído: campos vacíos */ }
  };
  const close = () => { modal.hidden = true; for (const fn of closes) fn(); };
  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });

  return {
    onOpen: (fn) => opens.push(fn),
    onClose: (fn) => closes.push(fn),
    showSide,
    // enseñar o quitar una caja; si se quita estando en su sección, se vuelve a las cajas
    showBox: (pane, on) => {
      boxOf(pane).hidden = !on;
      if (!on && panes.find((p) => p.dataset.pane === pane).hidden === false) showPane(null);
    },
  };
};
