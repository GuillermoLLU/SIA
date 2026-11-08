// «Equipo» (Configuración; vista people, para quien la tiene). Dos niveles: la lista del equipo,
// solo para leer (buscador y filtro; pulsar a alguien entra en su ficha), y la ficha de una
// persona, que ocupa la caja: rol, regla de priorización y acceso, sus vistas y su conocimiento
// se editan en borrador y se guardan de una vez («Guardar cambios»); una contraseña nueva y
// borrar van aparte. El alta es la misma pantalla vacía. Los roles, en su pantalla con un panel al
// lado. Una vista o una regla sueltas dejan a la persona personalizada (sin rol). Solo DOM: los
// datos van por users-api.js y knowledge-api.js y las reglas las pone la base.
import './people.css';
import { strongPassword } from './password.js';
import { VIEWS } from './views.js';
import { viewsText, initials, knOf, filterChips, listRows, validFilter, roleName as roleNameOf, ruleOf, toggled, personDraft, draftWithRole, draftWithView, draftWithRule, personPatch, hasChanges } from './people.js';
import { esc, svg, TRASH_ICON } from '../ui/html.js';
import { prefersReducedMotion } from '../ui/dom.js';
import { pickerHtml, pickClick } from '../ui/picker.js';
import { ago } from '../ui/time.js';

// Iconos de rol: los de serie, uno común para los creados y el de personalizado.
const ROLE_ICON = {
  admin: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>', { width: 1.7 }),
  agent: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/>', { width: 1.7 }),
  role: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', { width: 1.7 }),
  custom: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', { width: 1.7 }),
};
const roleIcon = (r) => ROLE_ICON[r?.builtin] || (r ? ROLE_ICON.role : ROLE_ICON.custom);
const DB_ICON = svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', { width: 1.6 });
const copyText = async (text, input, toast) => {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); }
  catch { input?.select(); toast('Selecciónalo y cópialo con ⌘C'); }
};
// La contraseña con sus botones (una nueva y en el alta)
const passwordField = (value, attr) => `<div class="pp-pw"><input class="settings-input" ${attr} value="${esc(value)}" aria-label="Contraseña" spellcheck="false" /><button type="button" class="lab-btn" data-pw-copy>Copiar</button><button type="button" class="lab-btn" data-pw-regen title="Generar otra" aria-label="Generar otra">↻</button></div>`;
// Las cajas de vistas (la ficha y el editor de roles): las que se tienen, encendidas; attr, el data-* de cada caja
const viewBoxes = (views, attr, disabled = false) => VIEWS.map((v) => { const on = views.includes(v.id); return `<button type="button" class="pp-box ${on ? 'on' : 'off'}" ${attr}="${v.id}" aria-pressed="${on}"${disabled ? ' disabled' : ''}><span class="b-ico">${v.icon}</span><span class="b-name">${v.label}</span></button>`; }).join('');
// Vive en Configuración → Equipo. onMetrics: si la persona también ve Equipo soporte, «Métricas equipo» abre sus métricas.
// onScreen({ back, parent } | null): se ha entrado en una pantalla dentro de la caja (una ficha,
// el alta, los roles): cómo se vuelve y de dónde; null al estar en la lista.
export const mountPeopleView = (root, { usersApi, knowledgeApi, me, toast, dialogs, onMetrics, onScreen }) => {
  let people = [], kbase = null, roles = [], rules = [], filter = 'all', query = '';
  let selected = null;   // la persona de la ficha
  let edit = null;       // su borrador: rol, vistas, regla, acceso y proyectos (se guarda de una vez)
  let foot = null;       // la confirmación de borrar, desplegada: { kind: 'delete' }
  let draft = null;      // el alta: como el borrador de una ficha, con nombre, email y contraseña inicial
  let created = null;    // la persona recién dada de alta: { id, email, pw, warning }, para copiar sus datos en su ficha

  root.innerHTML = `
    <div class="pp-tools">
      <input class="settings-input" data-q placeholder="Buscar por nombre o email" aria-label="Buscar persona" />
      <span class="pp-filter" data-chips></span>
      <span class="pp-tools-right">
        <button class="pp-switch-view" data-act="roles">Roles</button>
        ${onMetrics ? '<button class="pp-switch-view" data-metrics>Métricas equipo</button>' : ''}
        <button class="lab-btn primary" data-act="new">+ Nueva persona</button>
      </span>
    </div>
    <div class="pp-body" data-body>
      <div class="pp-list" data-list></div>
      <section class="pp-screen pp-person" data-person-screen hidden></section>
      <section class="pp-screen" data-roles-screen hidden></section>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const personEl = $('[data-person-screen]'), rolesEl = $('[data-roles-screen]');

  const load = async () => {
    try { [people, kbase, roles, rules] = await Promise.all([usersApi.list(), knowledgeApi.base(), usersApi.roles(), usersApi.rules()]); }
    catch (e) { $('[data-list]').innerHTML = `<div class="pp-empty">No se pudo cargar: ${esc(e.message)}</div>`; return; }
    filter = validFilter(filter, roles);
    renderChips();
    renderList();
    if (screen === 'person') { if (personById(selected)) paintPerson(); else leavePerson(); }
    else if (screen === 'new') paintNew();
    else if (screen === 'roles') paintRoles();
  };
  const groupName = (id) => kbase?.groups?.find((g) => g.id === id)?.name;
  const personById = (id) => people.find((p) => p.id === id);
  const roleById = (id) => roles.find((r) => r.id === id) || null;
  const roleName = (p) => roleNameOf(roles, p);
  const ruleLabel = (x) => ruleOf(rules, x)?.label || 'Regla básica';
  const ruleOptions = () => [{ options: rules.map((r) => ({ value: r.id, label: r.label })) }];
  const roleOptions = () => [{ options: roles.map((r) => ({ value: r.id, label: r.name })) }];

  /* ── qué ocupa la caja: la lista, una ficha, el alta o los roles ── */
  let screen = 'list';
  const showScreen = (name, sub = null) => {
    screen = name;
    root.classList.toggle('open', name !== 'list');
    personEl.hidden = name !== 'person' && name !== 'new';
    rolesEl.hidden = name !== 'roles';
    if (name !== 'roles') closeRoleEditor();
    onScreen?.(sub);
  };

  /* ── la lista: solo para leer; pulsar a alguien entra en su ficha ── */
  const renderChips = () => {
    $('[data-chips]').innerHTML = pickerHtml({ id: 'pp-filter', name: 'filter', value: filter, inline: true, groups: [{ options: filterChips(roles).map(([value, label]) => ({ value, label })) }] });
  };
  const knTags = (p) => {
    const names = knOf(p).map(groupName).filter(Boolean);
    return names.length ? names.map((n) => `<span class="pp-tag">${esc(n)}</span>`).join('') : '<span class="pp-tag none">Sin conocimiento</span>';
  };
  const renderList = () => {
    const rows = listRows(people, filter, query);
    $('[data-list]').innerHTML = `<div class="pp-row hd"><span></span><span>Persona</span><span>Rol</span><span>Prioridad</span><span>Conocimiento</span><span>Acceso</span></div>`
      + (rows.length ? rows.map((p) => `<button type="button" class="pp-row${p.active ? '' : ' off'}" data-id="${esc(p.id)}">
        <span class="pp-av">${esc(initials(p.name))}</span>
        <span class="pp-who"><b>${esc(p.name)}${p.id === me.id ? ' (tú)' : ''}</b><span>${esc(p.email)}</span></span>
        <span class="pp-cell${p.role_id ? '' : ' low'}">${esc(roleName(p))}</span>
        <span class="pp-cell">${esc(ruleLabel(p))}</span>
        <span class="pp-kn">${knTags(p)}</span>
        <span class="pp-state ${p.active ? 'on' : 'off'}">${p.active ? 'Puede entrar' : 'Sin acceso'}</span>
      </button>`).join('') : '<div class="pp-empty">Nadie coincide con la búsqueda.</div>');
  };

  /* ── la ficha de una persona ── */
  const openPerson = (id) => { selected = id; foot = null; edit = personDraft(personById(id)); showScreen('person', { back: closePerson, parent: 'Equipo' }); paintPerson(); };
  const leavePerson = () => { selected = null; foot = null; edit = null; created = null; showScreen('list'); renderList(); };
  const patchNow = () => personPatch(personById(selected), edit, rules);
  // Volver con cambios sin guardar: se pregunta
  const closePerson = async () => {
    if (selected && edit && (hasChanges(patchNow()) || edit.pw) && !(await dialogs.confirm('Cambios sin guardar', '<p class="dlg-lead">Si vuelves al equipo se pierden los cambios de esta persona.</p>', 'Descartar cambios'))) return;
    leavePerson();
  };
  // Los proyectos de la base, como cajas con el icono de base de datos (encendidas las que ve)
  const knowledgeBlock = (sel, attr, disabled = false) => {
    const groups = kbase?.groups || [];
    if (!kbase) return '<div class="pp-callout">La instancia aún no tiene base de conocimiento.</div>';
    if (!kbase.groups) return `<div class="pp-callout">${esc(kbase.groupsError || 'La base aún no tiene su clave de poder, así que SIA no puede leer sus proyectos.')}</div>`;
    if (!groups.length) return `<div class="pp-callout">«${esc(kbase.name)}» aún no tiene proyectos: créalos en Administración.</div>`;
    return `<div class="pp-kbs">${groups.map((g) => { const on = sel.includes(g.id); return `<button type="button" class="pp-kb${on ? ' on' : ''}" ${attr}="${esc(g.id)}" aria-pressed="${on}"${disabled ? ' disabled' : ''} title="${on ? 'Lo ve · quitar' : 'No lo ve · dar'}">${DB_ICON}<span>${esc(g.name)}</span></button>`; }).join('')}</div>`;
  };
  // Lo desplegado bajo los botones: la confirmación de borrar
  const footHtml = () => (foot?.kind !== 'delete' ? '' : `<div class="pp-foot-open" title="No se puede deshacer: para cortarle el acceso sin borrarla, desactívala">
        <input class="settings-input" data-foot-confirm placeholder="Escribe su email para borrarla" autocomplete="off" spellcheck="false" />
        <div class="pp-foot-acts"><span class="pp-msg" data-foot-msg></span><button class="lab-btn" data-foot-cancel>Cancelar</button><button class="lab-btn pp-danger-solid" data-foot-ok>Borrar persona</button></div></div>`);
  // La ficha: a la izquierda, una pieza con quién es, su cuenta y las acciones; a la derecha, sus
  // vistas (interruptores) y su conocimiento (bases), cada uno con su cabecera.
  const paintPerson = () => {
    const p = personById(selected), self = p.id === me.id, d = edit, dirty = hasChanges(patchNow()) || !!d.pw;
    personEl.innerHTML = `
      <div class="pp-cols">
        <aside class="pp-profile">
          <div class="pp-id">
            <span class="pp-av${d.active ? '' : ' off'}">${esc(initials(p.name))}</span>
            <h3>${esc(p.name)}${self ? ' (tú)' : ''}</h3>
            <p>${esc(p.email)}</p>
            <p class="pp-id-seen">Último acceso ${ago(p.last_sign_in_at)}</p>
          </div>
          <dl class="pp-props">
            <div><dt>Rol</dt><dd>${pickerHtml({ id: 'pp-role', name: 'role', value: d.role_id || '', placeholder: 'Personalizado', disabled: self, groups: roleOptions() })}</dd></div>
            <div><dt>Prioridad</dt><dd>${pickerHtml({ id: 'pp-rule', name: 'rule', value: ruleOf(rules, d)?.id || '', placeholder: 'Regla básica', disabled: self || !rules.length, groups: ruleOptions() })}</dd></div>
            <div><dt>Acceso</dt><dd><div class="pp-access"><span>${d.active ? 'Puede entrar' : 'Sin acceso'}</span><button type="button" class="sw" role="switch" aria-checked="${d.active}" data-access aria-label="${d.active ? 'Desactivar acceso' : 'Reactivar acceso'}"${self ? ' disabled' : ''}><span class="knob"></span></button></div></dd></div>
          </dl>
          ${created?.id === p.id ? `<div class="pp-newpw" title="Pásaselos por un canal seguro"><span class="pp-k">Datos de acceso</span>
            <div class="pp-pw"><input class="settings-input" data-copy="email" value="${esc(created.email)}" readonly /><button type="button" class="lab-btn" data-copy-of="email">Copiar</button></div>
            <div class="pp-pw"><input class="settings-input" data-copy="pw" value="${esc(created.pw)}" readonly /><button type="button" class="lab-btn" data-copy-of="pw">Copiar</button></div>
            <button type="button" class="pp-act" data-copy-both>Copiar los dos</button>${created.warning ? `<p class="pp-msg">${esc(created.warning)}</p>` : ''}</div>` : ''}
          ${d.pw ? `<div class="pp-newpw" title="Sustituye a la actual y cierra sus sesiones; al entrar se le pedirá cambiarla"><span class="pp-k">Contraseña nueva</span>${passwordField(d.pw, 'data-edit-pw')}</div>` : ''}
          ${self ? '' : `<div class="pp-profile-acts">
            <button type="button" class="pp-act${d.pw ? ' on' : ''}" data-new-pw>Contraseña nueva</button>
            <button type="button" class="pp-act danger${foot?.kind === 'delete' ? ' on' : ''}" data-foot="delete">Borrar persona</button>
          </div>${footHtml()}`}
        </aside>
        <div class="pp-perms">
          <div class="pp-perms-body">
            <section class="pp-sec"><h4 class="pp-sec-h">Vistas</h4><div class="pp-views">${viewBoxes(d.views, 'data-view', self)}</div></section>
            <section class="pp-sec"><h4 class="pp-sec-h">Conocimiento</h4>${knowledgeBlock(d.kn, 'data-g', self)}</section>
          </div>
          ${self ? '' : `<div class="pp-save${dirty ? ' dirty' : ''}"><span class="pp-msg" data-save-msg></span><button type="button" class="lab-btn" data-discard${dirty ? '' : ' disabled'}>Descartar</button><button type="button" class="lab-btn primary" data-save${dirty ? '' : ' disabled'}>Guardar cambios</button></div>`}
        </div>
      </div>`;
    if (foot) personEl.querySelector('[data-foot-confirm]')?.focus();
  };
  // Guardar el borrador de una vez: la cuenta, las vistas y la contraseña nueva, y luego los proyectos
  const savePerson = async (btn) => {
    const p = personById(selected), patch = patchNow(), msg = personEl.querySelector('[data-save-msg]');
    btn.disabled = true;
    try {
      let warning = null;
      const user = { ...(patch.user || {}), ...(edit.pw ? { password: edit.pw } : {}) };
      if (Object.keys(user).length) warning = (await usersApi.update(p.id, user))?.warning || null;
      if (patch.projects) await knowledgeApi.setProjects(p.id, patch.projects);
      toast(warning || `Cambios de ${p.name} guardados`);
      await load();
      edit = personDraft(personById(selected));
      paintPerson();
    } catch (e) { msg.textContent = e.message; btn.disabled = false; }
  };

  /* ── el alta: la ficha misma, vacía; «Dar de alta» en vez de guardar. Al crearla se abre su
     ficha con sus datos de acceso para copiar. ── */
  const openNew = () => {
    const agent = roles.find((r) => r.builtin === 'agent') || roles[0];
    const empty = { role_id: null, views: ['chat', 'links'], rule_id: null, active: true, kn: [] };
    draft = { ...(agent ? draftWithRole(empty, agent) : empty), name: '', email: '', pw: strongPassword() };
    showScreen('new', { back: closeNew, parent: 'Equipo' });
    paintNew();
  };
  const closeNew = () => { draft = null; showScreen('list'); renderList(); };
  const paintNew = () => {
    const d = draft;
    personEl.innerHTML = `
      <div class="pp-cols">
        <aside class="pp-profile">
          <div class="pp-id">
            <span class="pp-av" data-new-av>${esc(initials(d.name))}</span>
            <input class="pp-id-input pp-id-name" data-new="name" value="${esc(d.name)}" placeholder="Nombre y apellidos" aria-label="Nombre" autocomplete="off" />
            <input class="pp-id-input" data-new="email" type="email" value="${esc(d.email)}" placeholder="nombre@empresa.com" aria-label="Email" autocomplete="off" spellcheck="false" />
          </div>
          <dl class="pp-props">
            <div><dt>Rol</dt><dd>${pickerHtml({ id: 'pp-new-role', name: 'new-role', value: d.role_id || '', placeholder: 'Personalizado', groups: roleOptions() })}</dd></div>
            <div><dt>Prioridad</dt><dd>${pickerHtml({ id: 'pp-new-rule', name: 'new-rule', value: ruleOf(rules, d)?.id || '', placeholder: 'Regla básica', disabled: !rules.length, groups: ruleOptions() })}</dd></div>
          </dl>
          <div class="pp-newpw" title="Se le pedirá cambiarla al entrar por primera vez"><span class="pp-k">Contraseña inicial</span>${passwordField(d.pw, 'data-new="pw"')}</div>
        </aside>
        <div class="pp-perms">
          <div class="pp-perms-body">
            <section class="pp-sec"><h4 class="pp-sec-h">Vistas</h4><div class="pp-views">${viewBoxes(d.views, 'data-new-view')}</div></section>
            <section class="pp-sec"><h4 class="pp-sec-h">Conocimiento</h4>${knowledgeBlock(d.kn, 'data-new-g')}</section>
          </div>
          <div class="pp-save dirty"><span class="pp-msg" data-new-msg></span><button type="button" class="lab-btn" data-new-cancel>Cancelar</button><button type="button" class="lab-btn primary" data-new-ok>Dar de alta</button></div>
        </div>
      </div>`;
    if (!d.name) personEl.querySelector('[data-new="name"]').focus();
  };
  // Dar de alta con su rol y sus proyectos; si sus vistas o su regla no son las de un rol, se le
  // ponen después (queda personalizada). Luego, su ficha con los datos de acceso.
  const createPerson = async (msg, ok) => {
    const d = draft;
    ok.disabled = true;
    try {
      const r = await usersApi.create({ email: d.email.trim(), name: d.name.trim(), role: d.role_id || null, password: d.pw, projects: d.kn });
      let warning = r.warning || null;
      if (!d.role_id) warning = (await usersApi.update(r.user.id, { views: d.views, rule: ruleOf(rules, d)?.id }))?.warning || warning;
      created = { id: r.user.id, email: r.user.email, pw: d.pw, warning };
      draft = null;
      await load();
      openPerson(r.user.id);
      toast(`${r.user.name} ya puede entrar`);
    } catch (e) { msg.textContent = e.message; ok.disabled = false; }
  };

  // Guardar algo y volver a pintar con lo que dice la base (con su aviso, si trae).
  const save = async (fn, okText, msgEl) => {
    try { const r = await fn(); toast(r?.warning || okText); await load(); return true; }
    catch (e) { if (msgEl) msgEl.textContent = e.message; else toast(e.message); return false; }
  };

  /* ── roles: una pantalla con la lista; un rol, en un panel al lado ── */
  // Un panel lateral (.pp-drawer): entra abriéndose por la derecha y, al cerrar, se recoge igual;
  // lo de dentro va en .pp-drawer-in, de ancho fijo, para que no se reajuste mientras se mueve.
  const openDrawer = (host, html) => {
    const el = document.createElement('aside');
    el.className = 'pp-drawer';
    el.innerHTML = `<div class="pp-drawer-in">${html}</div>`;
    host.append(el);
    if (prefersReducedMotion()) el.classList.add('in');
    else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    return el;
  };
  const dropDrawer = (el) => {
    if (!el) return;
    if (prefersReducedMotion() || !el.classList.contains('in')) return el.remove();
    el.classList.remove('in');
    el.classList.add('out');
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);   // por si no llega el evento
  };
  const closeRoleEditor = () => { dropDrawer(rolesEl.querySelector('.pp-drawer:not(.out)')); };
  let confirmDel = null;   // el rol cuya fila pregunta si se borra
  let roleRule = null;     // la regla elegida en el panel del rol
  const openRoles = () => { confirmDel = null; showScreen('roles', { back: closeRoles, parent: 'Equipo' }); paintRoles(); };
  const closeRoles = () => { showScreen('list'); renderList(); };
  const paintRoles = () => {
    rolesEl.innerHTML = `<div class="pp-rs-main"><div class="pp-rs-head"><div><h3>Roles</h3><p>Un rol es un conjunto de vistas y una regla de priorización. Cambiarlo cambia a todas las personas que lo tienen.</p></div>
        <button class="lab-btn primary" data-new-role>+ Nuevo rol</button></div>
      <div class="pp-rolelist">${roles.map((r) => `<div class="pp-rl">
        <span class="r-ico">${roleIcon(r)}</span>
        <span class="pp-rl-main"><b>${esc(r.name)}</b><span>${viewsText(r.views)}</span></span>
        <span class="pp-rl-rule">${esc(ruleLabel(r))}</span>
        <span class="pp-rl-n">${Number(r.people)} ${Number(r.people) === 1 ? 'persona' : 'personas'}</span>
        ${r.builtin === 'admin' ? '<span class="pp-rl-fixed">Todas las vistas, fijo</span>'
          : confirmDel === r.id ? `<span class="pp-rl-ask">${Number(r.people) ? `${Number(r.people) === 1 ? 'La persona que lo tiene se queda' : `Las ${Number(r.people)} personas que lo tienen se quedan`} con sus vistas y su regla, como personalizadas.` : 'Nadie lo tiene.'}</span><button class="lab-btn" data-del-no>Cancelar</button><button class="lab-btn pp-danger-solid" data-del-yes="${esc(r.id)}">Borrar rol</button>`
          : `<button class="lab-btn" data-edit="${esc(r.id)}">Editar</button>${r.builtin ? '<span class="pp-rl-gap"></span>' : `<button class="icon-btn danger" data-del="${esc(r.id)}" title="Borrar rol" aria-label="Borrar rol">${TRASH_ICON}</button>`}`}
      </div>`).join('')}</div></div>`;
  };
  // Crear o editar un rol: nombre, regla y vistas, en un panel al lado de la lista de roles.
  const openRoleEditor = (r) => {
    let views = [...(r?.views || ['chat', 'links'])];
    const n = Number(r?.people || 0);
    roleRule = ruleOf(rules, r || {})?.id || null;
    closeRoleEditor();
    // El nombre hace de título: se escribe ahí mismo.
    const drawer = openDrawer(rolesEl, `<div class="pp-rs-head pp-drawer-head"><input class="settings-input pp-rname" data-rname maxlength="40" placeholder="Nombre del rol" aria-label="Nombre del rol" value="${esc(r?.name || '')}" autocomplete="off" />
        <button class="pp-x" data-role-cancel aria-label="Cerrar">×</button></div>
      <div class="pp-rs-body">
        ${r && n ? `<p class="pp-drawer-note">Se aplica a ${n === 1 ? 'la persona que lo tiene' : `las ${n} personas que lo tienen`}.</p>` : ''}
        <div class="pp-field"><span>Prioriza con</span>${pickerHtml({ id: 'pp-role-rule', name: 'role-rule', value: roleRule || '', placeholder: 'Regla básica', disabled: !rules.length, groups: ruleOptions() })}</div>
        <div class="pp-views" data-rviews></div>
      </div>
      <div class="pp-rs-foot"><span class="pp-msg" data-msg></span><button class="lab-btn" data-role-cancel>Cancelar</button><button class="lab-btn primary" data-role-save>${r ? 'Guardar' : 'Crear rol'}</button></div>`);
    const paint = () => { drawer.querySelector('[data-rviews]').innerHTML = viewBoxes(views, 'data-v'); };
    paint();
    drawer.querySelector('[data-rviews]').addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v) { views = toggled(views, v); paint(); }
    });
    drawer.querySelector('[data-rname]').focus();
    for (const b of drawer.querySelectorAll('[data-role-cancel]')) b.addEventListener('click', closeRoleEditor);
    const saveBtn = drawer.querySelector('[data-role-save]');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        const res = await usersApi.saveRole(r?.id, { name: drawer.querySelector('[data-rname]').value.trim(), views, rule: roleRule });
        toast(res?.warning || (r ? 'Rol guardado' : 'Rol creado'));
        await load(); openRoles();
      } catch (e) { drawer.querySelector('[data-msg]').textContent = e.message; saveBtn.disabled = false; }
    });
  };
  rolesEl.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-new-role]')) return openRoleEditor(null);
    const edit = t.closest('[data-edit]')?.dataset.edit;
    if (edit) return openRoleEditor(roleById(edit));
    const del = t.closest('[data-del]')?.dataset.del;
    if (del) { confirmDel = del; return paintRoles(); }
    if (t.closest('[data-del-no]')) { confirmDel = null; return paintRoles(); }
    const yes = t.closest('[data-del-yes]')?.dataset.delYes;
    if (yes) {
      try { await usersApi.removeRole(yes); toast('Rol borrado'); confirmDel = null; await load(); paintRoles(); }
      catch (err) { toast(err.message); }
    }
  });

  /* ── interacción: la lista y la ficha ── */
  root.addEventListener('click', async (e) => {
    if (pickClick(root, e.target)) return;
    const t = e.target;
    if (t.closest('[data-metrics]')) return onMetrics();
    if (t.closest('[data-act="new"]')) return openNew();
    if (t.closest('[data-act="roles"]')) return openRoles();
    const row = t.closest('.pp-row:not(.hd)');
    if (row) return openPerson(row.dataset.id);
    if (!personEl.contains(t)) return;
    const pwInput = personEl.querySelector('[data-edit-pw], [data-new="pw"]');
    if (t.closest('[data-pw-copy]')) return copyText(pwInput.value, pwInput, toast);
    if (t.closest('[data-pw-regen]')) { pwInput.value = strongPassword(); if (screen === 'new') draft.pw = pwInput.value; else edit = { ...edit, pw: pwInput.value }; return; }
    // el alta
    if (screen === 'new') {
      const v = t.closest('[data-new-view]')?.dataset.newView;
      if (v) { draft = { ...draft, ...draftWithView(draft, v) }; return paintNew(); }
      const g = t.closest('[data-new-g]')?.dataset.newG;
      if (g) { draft.kn = toggled(draft.kn, g); return paintNew(); }
      if (t.closest('[data-new-cancel]')) return closeNew();
      if (t.closest('[data-new-ok]')) return createPerson(personEl.querySelector('[data-new-msg]'), t.closest('[data-new-ok]'));
      return;
    }
    // los datos de acceso de quien se acaba de dar de alta
    const of = t.closest('[data-copy-of]')?.dataset.copyOf;
    if (of) { const i = personEl.querySelector(`[data-copy="${of}"]`); return copyText(i.value, i, toast); }
    if (t.closest('[data-copy-both]')) return copyText(`Email: ${created.email}\nContraseña: ${created.pw}`, null, toast);
    // la ficha
    const p = personById(selected);
    if (!p) return;
    const view = t.closest('[data-view]');
    if (view) { edit = draftWithView(edit, view.dataset.view); return paintPerson(); }
    const g = t.closest('[data-g]')?.dataset.g;
    if (g) { edit = { ...edit, kn: toggled(edit.kn, g) }; return paintPerson(); }
    if (t.closest('[data-access]')) { edit = { ...edit, active: !edit.active }; return paintPerson(); }
    if (t.closest('[data-new-pw]')) { edit = { ...edit, pw: edit.pw ? null : strongPassword() }; return paintPerson(); }
    if (t.closest('[data-discard]')) { edit = personDraft(p); return paintPerson(); }
    if (t.closest('[data-save]')) return savePerson(t.closest('[data-save]'));
    if (t.closest('[data-foot="delete"]')) { foot = foot ? null : { kind: 'delete' }; return paintPerson(); }
    if (t.closest('[data-foot-cancel]')) { foot = null; return paintPerson(); }
    if (t.closest('[data-foot-ok]')) {
      const msg = personEl.querySelector('[data-foot-msg]'), ok = t.closest('[data-foot-ok]');
      if (personEl.querySelector('[data-foot-confirm]').value.trim().toLowerCase() !== p.email) { msg.textContent = 'El email no coincide.'; return; }
      ok.disabled = true;
      if (await save(() => usersApi.remove(p.id), 'Persona borrada', msg)) leavePerson();
      if (ok.isConnected) ok.disabled = false;
    }
  });
  $('[data-q]').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
  root.addEventListener('input', (e) => {
    const { name, value } = e.target;
    if (name === 'filter') { filter = value; return renderList(); }
    if (name === 'role-rule') { roleRule = value || null; return; }
    if ('editPw' in e.target.dataset) { edit = { ...edit, pw: e.target.value }; personEl.querySelector('[data-save]').disabled = false; personEl.querySelector('[data-discard]').disabled = false; personEl.querySelector('.pp-save').classList.add('dirty'); return; }
    if (e.target.dataset.new) { draft[e.target.dataset.new] = value; if (e.target.dataset.new === 'name') personEl.querySelector('[data-new-av]').textContent = initials(value); return; }
    if (name === 'new-role' && roleById(value)) { draft = { ...draft, ...draftWithRole(draft, roleById(value)) }; return paintNew(); }
    if (name === 'new-rule') { draft = { ...draft, ...draftWithRule(draft, value) }; return paintNew(); }
    // el rol y la regla, desde los selectores de la ficha
    if (!edit) return;
    if (name === 'role' && value !== (edit.role_id || '') && roleById(value)) { edit = draftWithRole(edit, roleById(value)); paintPerson(); }
    if (name === 'rule' && value !== (ruleOf(rules, edit)?.id || '')) { edit = draftWithRule(edit, value); paintPerson(); }
  });

  return { refresh: load };
};
