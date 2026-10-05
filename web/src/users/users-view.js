// Vista «Usuarios» (solo administradores): la lista de usuarios de la
// herramienta con alta, edición y baja. Solo DOM; los datos van por
// users-api.js y las reglas (nombre único, último admin…) las pone el bridge.
// Alta y edición usan el diálogo genérico de la app (`dialog`).
import './users.css';

const ROLE_LABELS = { admin: 'Administrador', agent: 'Agente' };

const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formMarkup = (user) => `<div class="user-form">
  <label class="field"><span class="field-label">Nombre</span>
    <input class="settings-input" name="name" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(user?.name || '')}" />
  </label>
  <div class="field"><span class="field-label">Rol</span>
    <div class="pill-select" role="radiogroup">${Object.entries(ROLE_LABELS).map(([id, label]) =>
      `<button type="button" class="pill" data-role="${id}" aria-pressed="${(user?.role || 'agent') === id}">${label}</button>`).join('')}</div>
  </div>
  <label class="field"><span class="field-label">Contraseña${user ? ' <span>(en blanco, se queda la actual)</span>' : ''}</span>
    <input class="settings-input" name="password" type="password" autocomplete="new-password" />
  </label>
</div>`;

const rowMarkup = (u, me) => `<li class="user-row" data-id="${esc(u.id)}">
  <span class="user-avatar" aria-hidden="true">${esc(u.name.trim()[0] || '?').toUpperCase()}</span>
  <span class="user-name">${esc(u.name)}${u.id === me.id ? ' <span class="user-me">tú</span>' : ''}</span>
  <span class="user-role ${u.role}">${ROLE_LABELS[u.role]}</span>
  <span class="user-actions">
    <button type="button" class="icon-btn" data-act="edit" title="Editar" aria-label="Editar">${EDIT_ICON}</button>
    <button type="button" class="icon-btn danger" data-act="remove" title="Borrar" aria-label="Borrar"${u.id === me.id ? ' disabled' : ''}>${TRASH_ICON}</button>
  </span>
</li>`;

export const mountUsersView = (root, { api, me, dialog, confirm, alert }) => {
  root.innerHTML = `<header class="users-head">
      <div class="users-title"><h2>Usuarios</h2><p class="users-sub">Quién puede entrar en SIA y con qué rol.</p></div>
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

  // Alta o edición en el diálogo; si el bridge rechaza los datos, se avisa y
  // se vuelve al formulario con lo escrito.
  const edit = async (user = null, draft = user) => {
    const open = dialog({ title: user ? `Editar «${user.name}»` : 'Nuevo usuario', bodyHTML: formMarkup(draft), okLabel: user ? 'Guardar' : 'Crear', centered: true });
    const form = document.querySelector('.user-form');
    form.querySelector('[name=name]').focus();
    form.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-role]');
      if (pill) form.querySelectorAll('[data-role]').forEach((p) => p.setAttribute('aria-pressed', String(p === pill)));
    });
    if (!await open) return;
    const data = {
      name: form.querySelector('[name=name]').value.trim(),
      role: form.querySelector('[aria-pressed="true"]').dataset.role,
      password: form.querySelector('[name=password]').value,
    };
    if (user && !data.password) delete data.password;
    try {
      await (user ? api.update(user.id, data) : api.create(data));
      refresh();
    } catch (e) {
      await alert(user ? 'No se pudo guardar' : 'No se pudo crear', `<p class="dlg-lead">${esc(e.message)}</p>`);
      edit(user, { ...draft, ...data });
    }
  };

  const remove = async (user) => {
    if (!await confirm('Borrar usuario', `<p class="dlg-lead">Se borra <strong>${esc(user.name)}</strong> y se cierran sus sesiones abiertas.</p>`, 'Borrar')) return;
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
