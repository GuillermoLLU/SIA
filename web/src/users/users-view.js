// Vista «Usuarios» (solo administradores): las personas de la instancia con
// alta, edición (nombre, rol, activo, contraseña) y baja. Solo DOM; los datos
// van por users-api.js y las reglas las pone la base (nadie cambia su propio
// rol ni se desactiva, política de contraseñas…). Alta y edición usan el
// diálogo genérico de la app (`dialog`).
import './users.css';

const ROLE_LABELS = { admin: 'Administrador', agent: 'Agente' };
const PASSWORD_HINT = '12 o más, con minúsculas, mayúsculas, números y algún símbolo';

const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `user`: el que se edita (null en un alta). `self`: es uno mismo (sin rol ni activo).
const formMarkup = (user, draft, self) => `<div class="user-form">
  <label class="field"><span class="field-label">Nombre</span>
    <input class="settings-input" name="name" maxlength="80" autocomplete="off" spellcheck="false" value="${esc(draft?.name || '')}" />
  </label>
  <label class="field"><span class="field-label">Email${user ? ' <span>(no se cambia)</span>' : ''}</span>
    <input class="settings-input" name="email" type="email" autocomplete="off" spellcheck="false" value="${esc(draft?.email || '')}"${user ? ' readonly' : ''} />
  </label>
  <div class="field"><span class="field-label">Rol${self ? ' <span>(el tuyo no lo puedes cambiar)</span>' : ''}</span>
    <div class="pill-select" role="radiogroup">${Object.entries(ROLE_LABELS).map(([id, label]) =>
      `<button type="button" class="pill" data-role="${id}" aria-pressed="${(draft?.role || 'agent') === id}"${self ? ' disabled' : ''}>${label}</button>`).join('')}</div>
  </div>
  ${user && !self ? `<div class="field user-active"><span class="field-label">Activo <span>(si no, no puede entrar)</span></span>
    <button type="button" class="sw" role="switch" aria-checked="${draft.active !== false}" aria-label="Activo"><span class="knob"></span></button>
  </div>` : ''}
  <label class="field"><span class="field-label">Contraseña <span>(${user ? 'en blanco, se queda la actual; si no, ' : ''}${PASSWORD_HINT})</span></span>
    <input class="settings-input" name="password" type="password" autocomplete="new-password" />
  </label>
</div>`;

const rowMarkup = (u, me) => `<li class="user-row${u.active ? '' : ' inactive'}" data-id="${esc(u.id)}">
  <span class="user-avatar" aria-hidden="true">${esc(u.name.trim()[0] || '?').toUpperCase()}</span>
  <span class="user-who">
    <span class="user-name">${esc(u.name)}${u.id === me.id ? ' <span class="user-tag">tú</span>' : ''}${u.active ? '' : ' <span class="user-tag">inactivo</span>'}</span>
    <span class="user-email">${esc(u.email)}</span>
  </span>
  <span class="user-role ${u.role}">${ROLE_LABELS[u.role]}</span>
  <span class="user-actions">
    <button type="button" class="icon-btn" data-act="edit" title="Editar" aria-label="Editar">${EDIT_ICON}</button>
    <button type="button" class="icon-btn danger" data-act="remove" title="Borrar" aria-label="Borrar"${u.id === me.id ? ' disabled' : ''}>${TRASH_ICON}</button>
  </span>
</li>`;

export const mountUsersView = (root, { api, me, dialog, confirm, alert }) => {
  root.innerHTML = `<header class="users-head">
      <div class="users-title"><h2>Usuarios</h2><p class="users-sub">Quién puede entrar en SIA, con qué rol y si está activo.</p></div>
      <button type="button" class="lab-btn primary" data-act="new">Nuevo usuario</button>
    </header>
    <ul class="users-list"></ul>`;
  const list = root.querySelector('.users-list');
  let byId = new Map();

  const refresh = async () => {
    try {
      const users = await api.list();
      byId = new Map(users.map((u) => [u.id, u]));
      list.innerHTML = users.map((u) => rowMarkup(u, me)).join('');
    } catch (e) { list.innerHTML = `<li class="users-empty">No se pudo cargar: ${esc(e.message)}</li>`; }
  };

  // Alta o edición en el diálogo; si la base o la función rechazan los datos,
  // se avisa y se vuelve al formulario con lo escrito (sin la contraseña).
  const edit = async (user = null, draft = user) => {
    const self = user?.id === me.id;
    const open = dialog({ title: user ? `Editar «${user.name}»` : 'Nuevo usuario', bodyHTML: formMarkup(user, draft, self), okLabel: user ? 'Guardar' : 'Crear', centered: true });
    const form = document.querySelector('.user-form');
    form.querySelector('[name=name]').focus();
    form.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-role]');
      if (pill && !pill.disabled) form.querySelectorAll('[data-role]').forEach((p) => p.setAttribute('aria-pressed', String(p === pill)));
      const sw = e.target.closest('.sw');
      if (sw) sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
    });
    if (!await open) return;
    const value = (n) => form.querySelector(`[name=${n}]`).value;
    const data = {
      name: value('name').trim(),
      email: value('email').trim(),
      role: form.querySelector('[data-role][aria-pressed="true"]').dataset.role,
      active: form.querySelector('.user-active .sw')?.getAttribute('aria-checked') !== 'false',
      password: value('password'),
    };
    try {
      if (!user) await api.create({ email: data.email, name: data.name, role: data.role, password: data.password });
      else {
        // solo lo que cambia
        const patch = {};
        if (data.name !== user.name) patch.name = data.name;
        if (!self && data.role !== user.role) patch.role = data.role;
        if (!self && data.active !== user.active) patch.active = data.active;
        if (data.password) patch.password = data.password;
        if (Object.keys(patch).length) await api.update(user.id, patch);
      }
      refresh();
    } catch (e) {
      await alert(user ? 'No se pudo guardar' : 'No se pudo crear', `<p class="dlg-lead">${esc(e.message)}</p>`);
      edit(user, { ...draft, ...data, password: '' });
    }
  };

  const remove = async (user) => {
    if (!await confirm('Borrar usuario', `<p class="dlg-lead">Se borra <strong>${esc(user.name)}</strong> (${esc(user.email)}) y deja de poder entrar. Si solo quieres cortarle el acceso un tiempo, desactívalo.</p>`, 'Borrar')) return;
    try { await api.remove(user.id); refresh(); }
    catch (e) { alert('No se pudo borrar', `<p class="dlg-lead">${esc(e.message)}</p>`); }
  };

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'new') return edit();
    const user = byId.get(btn.closest('.user-row').dataset.id);
    if (btn.dataset.act === 'edit') edit(user);
    if (btn.dataset.act === 'remove') remove(user);
  });

  return { refresh };
};
