// El arranque de la web: dónde está el bridge, quién eres y el cableado de las
// vistas. Cada funcionalidad vive en su carpeta (chat/, lock/, skills/, settings/,
// lab/, links/, issues/, backlog/, users/, projects/, work/, metrics/).
import './style.css';
import logoUrl from './logo.png';
import { createApi } from './ui/api.js';
import { createDialogs } from './ui/dialog.js';
import { createToast } from './ui/dom.js';
import { crossfade } from './ui/crossfade.js';
import { bridgeFromQuery, discoverBridge } from './app/discover.js';
import { canView, baseNav, firstView, usesTopbar, crossesTo, hubBoxes, inHub, viewTitle } from './app/nav.js';
import { mountTopbar } from './app/topbar.js';
import { mountDock } from './app/dock.js';
import { mountHub } from './app/hub.js';
import { createPermsWatch } from './app/perms.js';
import { startIntro, reveal, revealDesk } from './app/intro.js';
import { createAuthSession } from './auth/session.js';
import { ensureLogin } from './auth/login-view.js';
import { wireLogout } from './auth/logout-button.js';
import { paintCachedTheme, createThemeController } from './theme/apply.js';
import { createLockGate } from './lock/gate.js';
import { mountLockControls } from './lock/controls.js';
import { mountChatView } from './chat/chat-view.js';
import { mountPalette } from './skills/palette-view.js';
import { mountSettings } from './settings/settings-view.js';
import { mountLabView } from './lab/lab-view.js';
import { mountLinksDirectory } from './links/links-directory.js';
import { mountProjectsPanel } from './projects/projects-panel.js';
import { VIEWS } from './users/views.js';
import { createUsersApi } from './users/users-api.js';
import { mountPeopleView } from './users/people-view.js';
import { createKnowledgeApi } from './knowledge/knowledge-api.js';
import { mountIssuesView } from './issues/issues-view.js';
import { createIssuesApi } from './issues/issues-api.js';
import { mountIssueChat } from './issues/issue-chat.js';
import { mountBacklogView } from './backlog/backlog-view.js';
import { mountRulesView } from './backlog/rules-view.js';
import { createBacklogApi } from './backlog/backlog-api.js';
import { mountWorkView } from './work/work-view.js';
import { mountMetricsView } from './metrics/metrics-view.js';
import { createMetricsApi } from './metrics/metrics-api.js';

const $ = (id) => document.getElementById(id);
document.documentElement.classList.add('styled'); // los estilos ya están: la página puede verse (index.html)
startIntro(); // la barra lateral espera al saludo de la portada (app/intro.js)

// Favicon de la pestaña (la S) y la S de las pantallas completas.
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon', href: logoUrl }));
const LOGO_HTML = `<div class="lock-logo" role="img" aria-label="SIA" style="--logo: url('${logoUrl}')"></div>`;

/* ── Dónde está el bridge y quién eres ───────────────────────────── */
const { wsUrl: bridgeWs, apiBase } = bridgeFromQuery(new URLSearchParams(location.search)) || await discoverBridge();
let session = null; // la sesión de usuario, en cuanto se ha iniciado: la leen las cabeceras

// El cliente del bridge, con la sesión. Una sesión que ya no vale vuelve al
// inicio de sesión; un 423 es el candado del bridge.
const api = createApi(apiBase, () => (session ? session.headers() : {}), {
  onReply: (status, data) => {
    if (status === 401 && data.auth) location.reload();
    if (status === 423 && data.locked) gate.open();
  },
});
const gate = createLockGate({ api, logoHtml: LOGO_HTML });

// Si la pantalla se quedó bloqueada (ventana recargada, app cerrada y reabierta),
// la puerta va ANTES de conectar nada: con el candado echado el bridge tampoco
// acepta sockets nuevos.
try {
  const st = await api('/lock', { timeoutMs: 1500 });
  if (st.locked) { paintCachedTheme(); await gate.open({ len: st.len }); }
} catch { /* bridge sin arrancar o anterior al candado: sin puerta */ }
const authSession = createAuthSession(apiBase);
const user = await ensureLogin(authSession, { logoHtml: LOGO_HTML, paintTheme: paintCachedTheme });
session = authSession;
// URL del socket, con la sesión (?a=)
const wsUrl = () => `${bridgeWs}?a=${encodeURIComponent(session.headers()['X-SIA-Auth'])}`;

/* ── Piezas comunes y el Chat ──────────────────────────────────── */
const dialogs = createDialogs($('dialog-overlay'));
const toast = createToast($('toast'));
let chat = null;
let palette = null;
const theme = createThemeController({
  toggleEl: $('theme-toggle'),
  onTerm: (term) => chat?.setTermTheme(term),
});
chat = mountChatView({
  api, apiBase, wsUrl, dialogs, theme: theme.current, me: user.name,
  mac: /Mac/i.test(navigator.platform || navigator.userAgent || ''),
  gate: gate.open, onSkills: (list) => palette.setSkills(list),
  // la portada solo marca el arranque si es lo primero que se ve
  onFirstScreen: (first) => { if (firstView(user) === 'chat') reveal(first); },
});
palette = mountPalette({ chat });

/* ── Configuración ─────────────────────────────────────────────── */
const settings = mountSettings({ api });
wireLogout($('settings-session'), { session });
const linksDirectory = mountLinksDirectory({ api, dialogs, settings });

/* ── Vistas: la barra lateral abre una cada vez ─────────────────── */
const nav = { chat: $('nav-chat') };
const views = { chat: $('view-chat'), lab: $('view-lab'), hub: $('view-hub') };
const perms = createPermsWatch({
  api,
  onUpdate: (access, { quiet, changed }) => {
    const show = baseNav(user, access);
    settings.showBox('skills', show.lab);
    if (!show.lab && !views.lab.hidden) showView(firstView(user));
    settings.showBox('administracion', show.admin);
    linksDirectory.show(show.links, show.linksEdit);
    // el catálogo del Laboratorio depende de esos permisos: se repinta si han cambiado
    if (quiet && changed && !views.lab.hidden) lab.refresh({ background: true });
  },
  onLost: () => { // sin base (o bridge caído) no hay vista que abrir: fuera lo que depende de ella
    settings.showBox('skills', false);
    settings.showBox('administracion', false);
    linksDirectory.show(false);
    if (!views.lab.hidden) showView(firstView(user));
  },
});
// Las skills: el catálogo en Configuración → Skills; abrir una cierra el modal y el editor ocupa la
// pantalla; al volver, de nuevo el catálogo sobre la vista que había.
let beforeLab = firstView(user);
const lab = mountLabView({
  api, dialogs, perms: perms.perms, onSkills: palette.setSkills,
  onEditor: () => { if (views.lab.hidden) beforeLab = currentView; settings.close(); showView('lab'); },
  onCatalog: () => { showView(beforeLab); settings.open('skills'); },
});
settings.onPane((name) => { if (name === 'skills') lab.refresh(); });
mountProjectsPanel({ api, dialogs, toast, settings });
// Gestión del equipo (users/): la caja Equipo de Configuración; «Métricas equipo» cierra el modal y
// abre las métricas del equipo si también tiene esa vista.
settings.showBox('equipo', canView(user, 'people'));
const usersView = canView(user, 'people')
  ? mountPeopleView($('settings-people'), { usersApi: createUsersApi(api), knowledgeApi: createKnowledgeApi(api), me: user, toast, dialogs, onMetrics: canView(user, 'work') ? () => { settings.close(); showView('work'); } : undefined, onScreen: (sub) => settings.setFull(!!sub, sub?.back ?? null, sub?.parent ?? null) })   // la ficha, el alta y los roles, a todo el ancho; la lista, con los enlaces
  : null;
settings.onPane((name) => { if (name === 'equipo') usersView.refresh(); });
// Priorización (backlog/): las reglas, en Configuración para quien tiene Backlog; a todo el ancho
settings.showBox('priorizacion', canView(user, 'backlog'));
const rulesView = canView(user, 'backlog') ? mountRulesView($('settings-rules'), { api: createBacklogApi(api), dialogs, toast, onChange: () => PANELS.find((p) => p.name === 'backlog')?.ui?.show?.() }) : null;
settings.onPane((name) => { if (name === 'priorizacion') { settings.setFull(true); rulesView.refresh(); } });
// Paneles (Issues, Backlog, Equipo soporte, Métricas): una vista cada uno, sin base. Si
// el panel devuelve show(), se llama al abrirlo (Issues recarga su foto).
const PANELS = [
  { name: 'issues', mount: (el) => mountIssuesView(el, {
    api: createIssuesApi(api), me: user, toast, dialogs,
    openChat: (host, issue) => mountIssueChat(host, { issue, wsUrl, loadProjects: chat.loadProjects, makeTerminal: chat.makeTerminal }),
  }) },
  { name: 'backlog', mount: (el) => mountBacklogView(el, { api: createBacklogApi(api), dialogs, toast }) },
  // clic en una persona de Equipo soporte: se abre en Métricas frente al resto de su equipo
  { name: 'work', mount: (el) => mountWorkView(el, { api: createMetricsApi(api),
    openPerson: (person) => { PANELS.find((p) => p.name === 'metrics').ui?.focus(person); showView('metrics'); } }) },
  { name: 'metrics', mount: (el) => mountMetricsView(el, { api: createMetricsApi(api), toast }) },
].map((p) => ({ ...p, view: $(`view-${p.name}`) }));
// El dock: Issues y Métricas (Equipo, Servicio y Backlog detrás de un solo icono, app/hub.js)
const dock = { issues: $('nav-issues'), hub: $('nav-metrics') };

let topbar = null;
const onShow = { chat: () => { chat.refitActive(); chat.focusActive(); } };
let currentView = 'chat';
const showView = (name) => {
  currentView = name;
  for (const [k, v] of Object.entries(views)) v.hidden = name !== k;
  for (const [k, n] of Object.entries(nav)) n.classList.toggle('active', name === k);
  for (const p of PANELS) p.view.hidden = name !== p.name;
  dock.issues.classList.toggle('active', name === 'issues');
  dock.hub.classList.toggle('active', inHub(name));
  topbar?.show(name, viewTitle(name));
  onShow[name]?.();
  return PANELS.find((p) => p.name === name)?.ui?.show?.(); // lo que tarda en pintarse, si es un panel
};
const go = (name) => (crossesTo(name) ? crossfade(() => showView(name)) : showView(name));
for (const [k, n] of Object.entries(nav)) n.addEventListener('click', () => go(k));
for (const p of PANELS) p.ui = p.mount(p.view);
dock.issues.innerHTML = VIEWS.find((v) => v.id === 'issues').icon;
dock.issues.hidden = !canView(user, 'issues');
dock.issues.addEventListener('click', () => go('issues'));
const hub = hubBoxes(user);
dock.hub.innerHTML = VIEWS.find((v) => v.id === 'metrics').icon;
dock.hub.hidden = !hub.length;
dock.hub.addEventListener('click', () => go('hub'));
mountHub(views.hub, { boxes: hub, go });
// La barra de arriba (inicial, marca y Chat) para todo el mundo; quien tiene más vistas conserva además la lateral
topbar = mountTopbar(document.querySelector('.app'), { name: user.name, chat: nav.chat, desk: $('nav-issues'), settings: $('settings-btn'), lock: $('lock-btn'), hasChat: canView(user, 'chat') });
if (!usesTopbar(user)) { document.body.classList.add('brand-nav'); mountDock(document.querySelector('.sidebar')); }
// Se abre en la mesa de trabajo: primero la barra y después la mesa (app/intro.js).
const opening = firstView(user);
if (opening !== 'chat') revealDesk();
showView(opening);
perms.refresh();

/* ── Candado ───────────────────────────────────────────────────── */
mountLockControls({ api, dialogs, toast, gate, settings, onUnlocked: () => {
  // de vuelta: permisos al día y el foco al chat activo
  perms.refresh();
  chat.focusActive();
} });
