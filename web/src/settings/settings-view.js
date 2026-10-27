// Configuración (el modal): sus pestañas, la versión y las credenciales
// (Jira, GitHub y el usuario de Snowflake de las Métricas). Las demás secciones (Móvil, Apariencia, Bloqueo) se
// cuelgan de onOpen/onClose para releer su estado cuando se abre o se cierra.
import { esc } from '../ui/html.js';
import { setStatus } from '../ui/dom.js';
import { jiraConfig, ghMask, addGithubKey, removeGithubKey, toggleGithubKey } from './credentials.js';

export const mountSettings = ({ api }) => {
  const $ = (id) => document.getElementById(id);
  const modal = $('settings-modal'), btn = $('settings-btn'), closeBtn = $('settings-close'), version = $('settings-version');
  const opens = [], closes = [];

  /* pestañas internas: un panel visible a la vez; la elegida se recuerda
     mientras dure la página */
  const tabs = [...document.querySelectorAll('#settings-tabs .settings-tab')];
  const panes = [...document.querySelectorAll('#settings-modal .settings-pane')];
  const showPane = (name) => {
    for (const t of tabs) t.classList.toggle('active', t.dataset.pane === name);
    for (const p of panes) p.hidden = p.dataset.pane !== name;
  };
  for (const t of tabs) t.addEventListener('click', () => showPane(t.dataset.pane));

  // Jira
  const jiraUrl = $('jira-url-input'), jiraToken = $('jira-token-input'), jiraStatus = $('jira-status');
  $('jira-save').addEventListener('click', async () => {
    try {
      await api('/config', { method: 'PUT', body: { jira: jiraConfig(jiraUrl.value, jiraToken.value) } });
      setStatus(jiraStatus, 'guardado ✓ — aplica a los chats que abras a partir de ahora', 'ok');
    } catch (err) { setStatus(jiraStatus, `no se pudo guardar: ${err.message}`, 'bad'); }
  });

  // Snowflake: solo quién consulta (se entra por SSO); el bridge pone el rol y el warehouse de soporte si van vacíos
  const sfUser = $('sf-user-input'), sfRole = $('sf-role-input'), sfWarehouse = $('sf-warehouse-input'), sfStatus = $('sf-status');
  $('sf-save').addEventListener('click', async () => {
    try {
      await api('/config', { method: 'PUT', body: { snowflake: { user: sfUser.value, role: sfRole.value, warehouse: sfWarehouse.value } } });
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
    if (!gh.keys.length) { ghList.innerHTML = '<li class="token-empty">Sin claves — los chats nuevos no llevarán token de GitHub.</li>'; return; }
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
    modal.hidden = false;
    for (const fn of opens) fn();
    try {
      const cfg = await api('/config');
      if (cfg.version) version.textContent = `SIA v${cfg.version}`;
      jiraUrl.value = cfg.jira?.baseUrl || '';
      jiraToken.value = cfg.jira?.token || '';
      sfUser.value = cfg.snowflake?.user || '';
      sfRole.value = cfg.snowflake?.role || '';
      sfWarehouse.value = cfg.snowflake?.warehouse || '';
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
    hideTab: (pane) => { document.querySelector(`#settings-tabs [data-pane="${pane}"]`).hidden = true; },
  };
};
