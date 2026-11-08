// Configuración (el modal): sus secciones, la versión y las conexiones
// (Jira, GitHub y el usuario de Snowflake de las Métricas). Lo demás (el PIN, los enlaces) se
// cuelga de onOpen para releer su estado al abrirse, y de onPane al entrar en una sección.
import { esc } from '../ui/html.js';
import { setStatus, prefersReducedMotion } from '../ui/dom.js';
import { jiraConfig, ghMask, addGithubKey, removeGithubKey, toggleGithubKey } from './credentials.js';
import { headOf } from './head.js';

export const mountSettings = ({ api }) => {
  const $ = (id) => document.getElementById(id);
  const modal = $('settings-modal'), btn = $('settings-btn'), closeBtn = $('settings-close'), version = $('settings-version');
  const opens = [];

  /* Al abrir, una caja por sección; pulsar una enseña solo esa, con la flecha para volver */
  const home = $('settings-home'), title = $('settings-title'), back = $('settings-back');
  const boxes = [...home.querySelectorAll('.settings-box')];
  const panes = [...modal.querySelectorAll('.settings-pane')];
  const boxOf = (name) => boxes.find((b) => b.dataset.pane === name);
  const layout = modal.querySelector('.settings-layout');
  let current = null; // la sección abierta
  let side = false;   // el formulario de un enlace, a todo el ancho de la columna de la derecha
  let fullBack = null, fullParent = null;   // la pantalla a todo el ancho: cómo se vuelve y de dónde
  // El título es adónde lleva la flecha (head.js)
  const paintHead = () => {
    const head = headOf({ section: current, sectionName: current ? boxOf(current).textContent : '', side, full: fullBack ? { parent: fullParent } : null });
    back.hidden = !head.back;
    const text = head.title;
    if (title.textContent === text) return;
    title.textContent = text;
    if (!prefersReducedMotion()) {
      title.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 400, easing: 'ease' });
    }
  };
  const paneOpens = [];
  // Una sección que necesita todo el ancho (Equipo): sin la columna de enlaces. back: lo que hace
  // entonces la flecha (cerrar la ficha, salir de los roles) en vez de ir a las cajas; parent: el
  // nombre de donde se viene, que enseña la cabecera junto a la flecha.
  const setFull = (on, back = null, parent = null) => { layout.classList.toggle('full', !!on); fullBack = on ? back : null; fullParent = parent; paintHead(); };

  const showPane = (name) => {
    current = name;
    setFull(false);
    home.hidden = !!name;
    for (const p of panes) p.hidden = p.dataset.pane !== name;
    paintHead();
    if (name) for (const fn of paneOpens) fn(name);
  };
  const showSide = (on) => {
    side = !!on;
    layout.classList.toggle('side-open', side);
    paintHead();
  };
  for (const b of boxes) b.addEventListener('click', () => showPane(b.dataset.pane));
  back.addEventListener('click', () => (side ? showSide(false) : fullBack ? fullBack() : showPane(null)));

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

  // pane: abrir ya en una sección (Skills, al volver del editor)
  const open = async (pane = null) => {
    setStatus(jiraStatus, '');
    setStatus(sfStatus, '');
    setStatus(ghStatus, '');
    showSide(false);
    showPane(pane);
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
  const close = () => { modal.hidden = true; };
  btn.addEventListener('click', () => open());
  closeBtn.addEventListener('click', close);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });

  return {
    onOpen: (fn) => opens.push(fn),
    onPane: (fn) => paneOpens.push(fn),   // fn(name) al entrar en una sección
    setFull,
    open,
    close,
    showSide,
    // enseñar o quitar una caja; si se quita estando en su sección, se vuelve a las cajas
    showBox: (pane, on) => {
      boxOf(pane).hidden = !on;
      if (!on && panes.find((p) => p.dataset.pane === pane).hidden === false) showPane(null);
    },
  };
};
