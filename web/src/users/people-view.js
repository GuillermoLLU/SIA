// «Equipo» (Configuración; vista people, para quien la tiene). Dos niveles: la lista del equipo,
// solo para leer (buscador y filtro; pulsar a alguien entra en su ficha), y la ficha de una
// persona, que ocupa la caja: rol, regla de priorización y acceso, sus vistas y su conocimiento
// se editan en borrador y se guardan de una vez («Guardar cambios»); una contraseña nueva y
// borrar van aparte. El alta es la misma pantalla vacía. Los roles, en su pantalla con un panel al
// lado. Una vista o una regla sueltas dejan a la persona personalizada (sin rol). Solo DOM: los
// datos van por users-api.js y knowledge-api.js y las reglas las pone la base.
import './people.css';
import { strongPassword } from './password.js';
import { initials, knOf, filterChips, listRows, validFilter, roleName as roleNameOf, ruleOf, toggled, personDraft, draftWithRole, draftWithView, draftWithRule, personPatch, hasChanges } from './people.js';
import { viewBoxes, ruleOptions as ruleOptionsOf } from './parts.js';
import { mountRolesView } from './roles-view.js';
import { esc, svg } from '../ui/html.js';
import { pickerHtml, pickClick } from '../ui/picker.js';
import { ago } from '../ui/time.js';

const DB_ICON = svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', { width: 1.6 });
const copyText = async (text, input, toast) => {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); }
  catch { input?.select(); toast('Selecciónalo y cópialo con ⌘C'); }
};
// La contraseña con sus botones (una nueva y en el alta)
const passwordField = (value, attr) => `<div class="pp-pw"><input class="settings-input" ${attr} value="${esc(value)}" aria-label="Contraseña" spellcheck="false" /><button type="button" class="lab-btn" data-pw-copy>Copiar</button><button type="button" class="lab-btn" data-pw-regen title="Generar otra" aria-label="Generar otra">↻</button></div>`;
// Vive en Configuración → Equipo. onMetrics: si la persona también ve Métricas, «Métricas equipo» abre Métricas en su pestaña Equipo soporte.
// onScreen({ back, parent } | null): se ha entrado en una pantalla dentro de la caja (una ficha,
// el alta, los roles): cómo se vuelve y de dónde; null al estar en la lista.
export const mountPeopleView = (root, { usersApi, knowledgeApi, me, toast, dialogs, onMetrics, onScreen }) => {
  let people = [], kbase = null, roles = [], rules = [], filter = 'all', query = '';
  let selected = null;   // la persona de la ficha
  let edit = null;       // su borrador: rol, vistas, regla, acceso y proyectos (se guarda de una vez)
  let askDelete = false; // la confirmación de borrar, desplegada
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
    else if (screen === 'new' && draft) paintNew();   // recién dada de alta (draft ya vacío), se abre su ficha
    else if (screen === 'roles') rolesView.paint();
  };
  const groupName = (id) => kbase?.groups?.find((g) => g.id === id)?.name;
  const personById = (id) => people.find((p) => p.id === id);
  const roleById = (id) => roles.find((r) => r.id === id) || null;
  const roleName = (p) => roleNameOf(roles, p);
  const ruleLabel = (x) => ruleOf(rules, x)?.label || 'Regla básica';
  const ruleOptions = () => ruleOptionsOf(rules);
  const roleOptions = () => [{ options: roles.map((r) => ({ value: r.id, label: r.name })) }];

  /* ── qué ocupa la caja: la lista, una ficha, el alta o los roles ── */
  let screen = 'list';
  const showScreen = (name, sub = null) => {
    screen = name;
    root.classList.toggle('open', name !== 'list');
    personEl.hidden = name !== 'person' && name !== 'new';
    rolesEl.hidden = name !== 'roles';
    if (name !== 'roles') rolesView.close();
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
  const openPerson = (id) => { selected = id; askDelete = false; edit = personDraft(personById(id)); showScreen('person', { back: closePerson, parent: 'Equipo' }); paintPerson(); };
  const leavePerson = () => { selected = null; askDelete = false; edit = null; created = null; showScreen('list'); renderList(); };
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
  const footHtml = () => (!askDelete ? '' : `<div class="pp-foot-open" title="No se puede deshacer: para cortarle el acceso sin borrarla, desactívala">
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
            <button type="button" class="pp-act danger${askDelete ? ' on' : ''}" data-foot="delete">Borrar persona</button>
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
    if (askDelete) personEl.querySelector('[data-foot-confirm]')?.focus();
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

  /* ── roles: su pantalla (roles-view.js) ── */
  const rolesView = mountRolesView(rolesEl, { usersApi, toast, state: () => ({ roles, rules }), reload: () => load() });
  const openRoles = () => { showScreen('roles', { back: closeRoles, parent: 'Equipo' }); rolesView.open(); };
  const closeRoles = () => { showScreen('list'); renderList(); };

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
    if (t.closest('[data-foot="delete"]')) { askDelete = !askDelete; return paintPerson(); }
    if (t.closest('[data-foot-cancel]')) { askDelete = false; return paintPerson(); }
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
    if ('editPw' in e.target.dataset) { edit = { ...edit, pw: e.target.value }; personEl.querySelector('[data-save]').disabled = false; personEl.querySelector('[data-discard]').disabled = false; personEl.querySelector('.pp-save').classList.add('dirty'); return; }
    if (e.target.dataset.new) { draft[e.target.dataset.new] = value; if (e.target.dataset.new === 'name') personEl.querySelector('[data-new-av]').textContent = initials(value); return; }
    if (name === 'new-role' && roleById(value)) { draft = { ...draft, ...draftWithRole(draft, roleById(value)) }; return paintNew(); }
    if (name === 'new-rule') { draft = { ...draft, ...draftWithRule(draft, value) }; return paintNew(); }
    // el rol y la regla, desde los selectores de la ficha
    if (!edit) return;
    if (name === 'role' && value !== (edit.role_id || '') && roleById(value)) { edit = draftWithRole(edit, roleById(value)); paintPerson(); }
    if (name === 'rule' && value !== (ruleOf(rules, edit)?.id || '')) { edit = draftWithRule(edit, value); paintPerson(); }
  });

  // Al entrar en Equipo se empieza siempre por la lista: una ficha, un alta o los roles que se
  // quedaron abiertos al salir de Configuración se descartan, con su borrador.
  const reset = () => { if (screen === 'list') return; selected = null; edit = null; askDelete = false; draft = null; created = null; showScreen('list'); renderList(); };

  return { refresh: load, reset };
};
