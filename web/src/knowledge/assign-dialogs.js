// Diálogos del admin (desde la vista Usuarios): las bases de conocimiento de
// la instancia y el conocimiento (grupos de cada base) de un usuario. Usan el
// diálogo genérico de la app como marco, con su contenido vivo dentro; los
// cambios se guardan al momento, «Cerrar» solo cierra. Las reglas las pone
// la base (solo admins, claves secret rechazadas…).
import './knowledge.css';

const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// el ID del proyecto pelado o su URL → https://<ref>.supabase.co
const projectUrl = (raw) => {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  return /^[a-z]{20}$/i.test(v) ? `https://${v.toLowerCase()}.supabase.co` : v;
};

// Abre el diálogo y devuelve su contenido para cablearlo.
const frame = (dialog, title, bodyHTML) => {
  dialog({ title, bodyHTML: `<div class="kn-dialog">${bodyHTML}</div>`, alertOnly: true, okLabel: 'Cerrar', centered: true });
  return document.querySelector('.kn-dialog');
};
const say = (el, text, ok = false) => { el.textContent = text; el.classList.toggle('ok', ok); };

export const openBasesDialog = ({ api, dialog }) => {
  const root = frame(dialog, 'Bases de conocimiento', `
    <p class="dlg-lead">Las bases de conocimiento que usa esta instancia. Después, en cada usuario, se le asignan los grupos de cada base.</p>
    <ul class="kn-list" data-list></ul>
    <div class="kn-add">
      <span class="field-label">Añadir base</span>
      <input class="settings-input" name="name" placeholder="nombre (p. ej. Soporte)" maxlength="60" autocomplete="off" />
      <input class="settings-input" name="url" placeholder="ID del proyecto de Supabase o su URL" autocomplete="off" spellcheck="false" />
      <input class="settings-input" name="key" placeholder="clave publishable (sb_publishable_…)" autocomplete="off" spellcheck="false" />
      <div class="kn-row"><span class="kn-status" data-status></span><button type="button" class="lab-btn primary" data-act="add">Añadir</button></div>
    </div>`);
  const list = root.querySelector('[data-list]');
  const status = root.querySelector('[data-status]');
  const field = (n) => root.querySelector(`[name=${n}]`);

  const load = async () => {
    try {
      const bases = await api.listBases();
      list.innerHTML = bases.length ? bases.map((b) => `<li data-id="${esc(b.id)}">
          <span class="kn-main"><strong>${esc(b.name)}</strong><span>${esc(b.url)}</span></span>
          <button type="button" class="icon-btn danger" data-act="remove" title="Quitar" aria-label="Quitar">${TRASH_ICON}</button>
        </li>`).join('') : '<li class="kn-empty">Aún no hay bases.</li>';
    } catch (e) { list.innerHTML = `<li class="kn-empty">No se pudo cargar: ${esc(e.message)}</li>`; }
  };

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.act === 'add') {
        await api.addBase({ name: field('name').value.trim(), url: projectUrl(field('url').value), key: field('key').value.trim() });
        for (const n of ['name', 'url', 'key']) field(n).value = '';
        say(status, 'Base añadida ✓', true);
      }
      if (btn.dataset.act === 'remove') {
        const li = btn.closest('li');
        if (btn.dataset.armed !== '1') { // segundo clic para confirmar: se lleva lo asignado de esa base
          btn.dataset.armed = '1'; btn.title = 'Pulsa otra vez: se quitará a todos el acceso a esta base';
          say(status, 'Pulsa otra vez la papelera: se quitará a todos el acceso a esta base.');
          return;
        }
        await api.removeBase(li.dataset.id);
        say(status, 'Base quitada ✓', true);
      }
      await load();
    } catch (err) { say(status, err.message); }
    finally { btn.disabled = false; }
  });
  load();
};

export const openGrantsDialog = (user, { api, dialog }) => {
  const root = frame(dialog, `Conocimiento de «${user.name}»`, `
    <p class="dlg-lead">Los grupos de cada base que ve en sus chats. El token de un grupo lo encuentras en Configuración → la base → Conocimiento.</p>
    <ul class="kn-list" data-list></ul>
    <div class="kn-add">
      <span class="field-label">Asignar un grupo</span>
      <select class="settings-input" name="base"></select>
      <input class="settings-input" name="group" placeholder="nombre del grupo (p. ej. Soporte N1)" maxlength="80" autocomplete="off" />
      <input class="settings-input" name="token" type="password" placeholder="token del grupo" autocomplete="off" spellcheck="false" />
      <div class="kn-row"><span class="kn-status" data-status></span><button type="button" class="lab-btn primary" data-act="grant">Asignar</button></div>
    </div>`);
  const list = root.querySelector('[data-list]');
  const status = root.querySelector('[data-status]');
  const field = (n) => root.querySelector(`[name=${n}]`);

  const load = async () => {
    try {
      const [grants, bases] = await Promise.all([api.listGrants(user.id), api.listBases()]);
      list.innerHTML = grants.length ? grants.map((g) => `<li data-id="${esc(g.id)}">
          <span class="kn-main"><strong>${esc(g.group_name)}</strong><span>${esc(g.base_name)} · ${esc(g.token_hint)}</span></span>
          <button type="button" class="icon-btn danger" data-act="revoke" title="Quitar" aria-label="Quitar">${TRASH_ICON}</button>
        </li>`).join('') : '<li class="kn-empty">Sin conocimiento asignado: sus chats no verán ninguna base.</li>';
      field('base').innerHTML = bases.length
        ? bases.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')
        : '<option value="">Primero añade una base (botón «Bases de conocimiento»)</option>';
    } catch (e) { list.innerHTML = `<li class="kn-empty">No se pudo cargar: ${esc(e.message)}</li>`; }
  };

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.act === 'grant') {
        await api.grant({ user: user.id, base: field('base').value, groupName: field('group').value.trim(), token: field('token').value.trim() });
        field('group').value = ''; field('token').value = '';
        say(status, 'Grupo asignado ✓', true);
      }
      if (btn.dataset.act === 'revoke') {
        await api.revoke(btn.closest('li').dataset.id);
        say(status, 'Grupo quitado ✓', true);
      }
      await load();
    } catch (err) { say(status, err.message); }
    finally { btn.disabled = false; }
  });
  load();
};
