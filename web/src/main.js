// El arranque de la web: dónde está el bridge, quién eres (sesión en el
// escritorio; emparejamiento en el móvil) y el cableado de las vistas. Cada
// funcionalidad vive en su carpeta (chat/, lock/, mobile/, skills/, settings/,
// lab/, links/, issues/, backlog/, users/, projects/, work/, metrics/).
import './style.css';
import logoUrl from './logo.png';
import { createApi } from './ui/api.js';
import { createDialogs } from './ui/dialog.js';
import { createToast } from './ui/dom.js';
import { bridgeFromQuery, isPhoneLocation, discoverBridge } from './app/discover.js';
import { canView, baseNav, panelNav, teamView } from './app/nav.js';
import { createPermsWatch } from './app/perms.js';
import { startIntro, reveal } from './app/intro.js';
import { createAuthSession } from './auth/session.js';
import { ensureLogin } from './auth/login-view.js';
import { wireLogout } from './auth/logout-button.js';
import { paintCachedTheme, createThemeController } from './theme/apply.js';
import { createLockGate } from './lock/gate.js';
import { mountLockControls } from './lock/controls.js';
import { bootPhone, lanRevoked } from './mobile/pairing.js';
import { installAutoLock } from './mobile/auto-lock.js';
import { mountAccessPanel } from './mobile/access-panel.js';
import { mountPhoneView } from './mobile/phone-view.js';
import { mountChatView } from './chat/chat-view.js';
import { mountPalette } from './skills/palette-view.js';
import { mountSettings } from './settings/settings-view.js';
import { mountLabView } from './lab/lab-view.js';
import { mountLinksView } from './links/links-view.js';
import { mountProjectsView } from './projects/projects-view.js';
import { VIEWS } from './users/views.js';
import { createUsersApi } from './users/users-api.js';
import { mountPeopleView } from './users/people-view.js';
import { createKnowledgeApi } from './knowledge/knowledge-api.js';
import { mountIssuesView } from './issues/issues-view.js';
import { createIssuesApi } from './issues/issues-api.js';
import { mountIssueChat } from './issues/issue-chat.js';
import { mountBacklogView } from './backlog/backlog-view.js';
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

/* ── Dónde está el bridge y quién eres ─────────────────────────────
   ctx: lo que va cambiando durante el arranque y leen las cabeceras: la
   llave del móvil (lanToken) o la sesión de usuario (auth). */
const q = new URLSearchParams(location.search);
const isPhone = isPhoneLocation(location);
const ctx = { wsUrl: null, lanToken: null, auth: null };
const fromQuery = bridgeFromQuery(q);
let apiBase;
if (fromQuery) ({ wsUrl: ctx.wsUrl, apiBase } = fromQuery);
else if (isPhone) apiBase = `${location.origin}/api`;
else ({ wsUrl: ctx.wsUrl, apiBase } = await discoverBridge());

// El cliente del bridge: el móvil va con su llave, el escritorio con su
// sesión. Una sesión que ya no vale vuelve al inicio de sesión; un 423 es el
// candado del bridge.
const api = createApi(apiBase, () => ({ ...(ctx.lanToken ? { 'X-SIA-LAN': ctx.lanToken } : {}), ...(ctx.auth ? ctx.auth.session.headers() : {}) }), {
  onReply: (status, data) => {
    if (status === 401 && data.auth) location.reload();
    if (status === 423 && (ctx.lanToken || data.locked)) gate.fromBridge();
  },
});
const gate = createLockGate({ api, logoHtml: LOGO_HTML, isRemote: () => !!ctx.lanToken, onRevoked: lanRevoked });

if (isPhone) {
  const phone = await bootPhone({ api, ctx, pairToken: q.get('p'), logoHtml: LOGO_HTML, gate: gate.open });
  ctx.wsUrl = phone.wsUrl;
  // candado automático, solo en el acceso público (mobile/auto-lock.js)
  if (phone.publicMode) installAutoLock({ lockUrl: `${apiBase}/lan/lock?t=${encodeURIComponent(ctx.lanToken)}`, gate: () => gate.open({ remote: true }) });
} else {
  // Escritorio: si la pantalla se quedó bloqueada (ventana recargada, app
  // cerrada y reabierta), la puerta va ANTES de conectar nada: con el candado
  // echado el bridge tampoco acepta sockets nuevos de esta máquina.
  try {
    const st = await api('/lock', { timeoutMs: 1500 });
    if (st.locked) { paintCachedTheme(); await gate.open({ len: st.len }); }
  } catch { /* bridge sin arrancar o anterior al candado: sin puerta */ }
  // y después, quién eres (el móvil no: entra emparejado con el ordenador)
  const session = createAuthSession(apiBase);
  ctx.auth = { session, user: await ensureLogin(session, { logoHtml: LOGO_HTML, paintTheme: paintCachedTheme }) };
}
const user = ctx.auth?.user ?? null;
// URL del socket: en el escritorio, con la sesión (?a=); el móvil ya lleva su llave (?t=)
const wsUrl = () => (ctx.auth ? `${ctx.wsUrl}${ctx.wsUrl.includes('?') ? '&' : '?'}a=${encodeURIComponent(ctx.auth.session.headers()['X-SIA-Auth'])}` : ctx.wsUrl);

/* ── Piezas comunes y el Chat ──────────────────────────────────── */
const dialogs = createDialogs($('dialog-overlay'));
const toast = createToast($('toast'));
let chat = null;
let palette = null;
// El tema del ordenador es también el de los móviles emparejados: se le deja
// al bridge, que se lo da a ellos.
const theme = createThemeController({
  toggleEl: $('theme-toggle'), pickerEl: $('theme-picker'),
  onTerm: (term) => chat?.setTermTheme(term),
  pushToBridge: (t) => { if (!ctx.lanToken) api('/config', { method: 'PUT', body: { theme: { id: t.id, ui: t.ui } } }).catch(() => {}); },
});
chat = mountChatView({
  api, apiBase, wsUrl, dialogs, theme: theme.current, phone: isPhone, me: user?.name ?? null,
  mac: /Mac|iP(hone|ad)/i.test(navigator.platform || navigator.userAgent || ''),
  remote: () => !!ctx.lanToken, gate: gate.fromBridge, onRevoked: lanRevoked,
  onTheme: (id) => theme.apply(id), onSkills: (list) => palette.setSkills(list),
  onFirstScreen: reveal,
});
palette = mountPalette({ chat, phone: isPhone });

/* ── Configuración ─────────────────────────────────────────────── */
const settings = mountSettings({ api });
if (ctx.lanToken) settings.hideTab('movil'); // estamos en el móvil: esta pestaña no aplica
else mountAccessPanel({ api, toast, dialogs, settings });
wireLogout($('settings-session'), { ...ctx.auth, confirm: dialogs.confirm });

/* ── Vistas: la barra lateral abre una cada vez ─────────────────── */
const nav = { chat: $('nav-chat'), lab: $('nav-lab'), admin: $('nav-admin'), links: $('nav-links') };
const views = { chat: $('view-chat'), lab: $('view-lab'), admin: $('view-admin'), links: $('view-links'), users: $('view-users') };
const perms = createPermsWatch({
  api,
  onUpdate: (access, { quiet, changed }) => {
    const show = baseNav(user, access);
    for (const k of ['lab', 'admin', 'links']) { nav[k].hidden = !show[k]; if (!show[k] && !views[k].hidden) showView('chat'); }
    // la vista abierta depende de esos permisos (añadir enlaces, catálogo
    // completo del Laboratorio…): se repinta si han cambiado
    if (!quiet || changed) {
      if (!views.links.hidden) links.refresh();
      if (quiet && !views.lab.hidden) lab.refresh({ background: true });
      if (quiet && !views.admin.hidden) projectsView.refresh();
    }
  },
  onLost: () => { // sin base (o bridge caído) no hay vista que abrir: fuera los tres iconos
    for (const k of ['lab', 'admin', 'links']) nav[k].hidden = true;
    if (!views.lab.hidden || !views.admin.hidden || !views.links.hidden) showView('chat');
  },
});
const lab = mountLabView({ api, dialogs, perms: perms.perms, onSkills: palette.setSkills });
const links = mountLinksView({ api, dialogs, perms: perms.perms });
const projectsView = mountProjectsView(views.admin, { api, dialogs, toast });
// Gestión del equipo (users/): la otra cara de Equipo soporte (se entra por su
// icono); «Métricas equipo» vuelve a sus métricas si también tiene esa vista.
const usersView = canView(user, 'people')
  ? mountPeopleView(views.users, { usersApi: createUsersApi(api), knowledgeApi: createKnowledgeApi(api), me: user, toast, onMetrics: canView(user, 'work') ? () => showView('work') : undefined })
  : null;
// Paneles (Issues, Backlog, Equipo soporte, Métricas): una vista cada uno, sin base. Si
// el panel devuelve show(), se llama al abrirlo (Issues recarga su foto).
const PANELS = [
  { name: 'issues', mount: (el) => user && mountIssuesView(el, {
    api: createIssuesApi(api), me: user, toast, dialogs,
    openChat: (host, issue) => mountIssueChat(host, { issue, wsUrl, loadProjects: chat.loadProjects, makeTerminal: chat.makeTerminal }),
  }) },
  { name: 'backlog', mount: (el) => user && mountBacklogView(el, { api: createBacklogApi(api), dialogs, toast }) },
  { name: 'work', mount: (el) => user && mountWorkView(el, { api: createMetricsApi(api), toast,
    onManage: canView(user, 'people') ? () => showView('users') : undefined }) },
  { name: 'metrics', mount: (el) => user && mountMetricsView(el, { api: createMetricsApi(api), toast }) },
].map((p) => ({ ...p, nav: $(`nav-${p.name}`), view: $(`view-${p.name}`) }));

const onShow = { lab: () => lab.refresh(), admin: () => projectsView.show(), links: () => links.refresh(), users: () => usersView.refresh(), chat: () => { chat.refitActive(); chat.focusActive(); } };
const showView = (name) => {
  for (const [k, v] of Object.entries(views)) v.hidden = name !== k;
  for (const [k, n] of Object.entries(nav)) n.classList.toggle('active', name === k);
  // Las métricas y la gestión del equipo son las dos caras del equipo: un solo icono en la barra
  for (const p of PANELS) { p.view.hidden = name !== p.name; p.nav.classList.toggle('active', name === p.name || (p.name === 'work' && name === 'users')); }
  PANELS.find((p) => p.name === name)?.ui?.show?.();
  onShow[name]?.();
};
for (const [k, n] of Object.entries(nav)) n.addEventListener('click', () => showView(k));
for (const p of PANELS) {
  p.nav.innerHTML = VIEWS.find((v) => v.id === p.name).icon;
  p.nav.hidden = !panelNav(user, p.name);
  p.nav.addEventListener('click', () => showView(p.name === 'work' ? teamView(user) : p.name));
  p.ui = p.mount(p.view);
}
perms.refresh();

/* ── Candado ───────────────────────────────────────────────────── */
mountLockControls({ api, dialogs, toast, gate, settings, onUnlocked: () => {
  // de vuelta: permisos y vista al día, y el foco al chat activo
  perms.refresh();
  if (!views.links.hidden) links.refresh();
  chat.focusActive();
} });
if (isPhone) mountPhoneView({ api, dialogs, toast, chat, palette, gate });
