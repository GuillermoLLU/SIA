// Equipo → Roles: la lista de roles (sus vistas, su regla y cuánta gente lo tiene) y, al crear o
// editar uno, un panel al lado con su nombre como título, la regla con la que prioriza y sus
// vistas. Borrar pide confirmación en su fila: quien lo tenía se queda con sus vistas y su regla,
// como personalizado. Solo DOM: los datos van por users-api.js y las reglas las pone la base.
//   host: su pantalla · state() → { roles, rules } al día · reload(): volver a pedirlo todo
import { viewsText, ruleOf, toggled } from './people.js';
import { viewBoxes, ruleOptions } from './parts.js';
import { esc, svg, TRASH_ICON } from '../ui/html.js';
import { prefersReducedMotion } from '../ui/dom.js';
import { pickerHtml } from '../ui/picker.js';

// Iconos de rol: los de serie, uno común para los creados y el de personalizado.
const ROLE_ICON = {
  admin: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>', { width: 1.7 }),
  agent: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/>', { width: 1.7 }),
  role: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', { width: 1.7 }),
  custom: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', { width: 1.7 }),
};
const roleIcon = (r) => ROLE_ICON[r?.builtin] || (r ? ROLE_ICON.role : ROLE_ICON.custom);

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

export const mountRolesView = (host, { usersApi, toast, state, reload }) => {
  const roleById = (id) => state().roles.find((r) => r.id === id) || null;
  const ruleLabel = (x) => ruleOf(state().rules, x)?.label || 'Regla básica';
  const closeEditor = () => { dropDrawer(host.querySelector('.pp-drawer:not(.out)')); };
  let confirmDel = null;   // el rol cuya fila pregunta si se borra
  let roleRule = null;     // la regla elegida en el panel del rol
  const paint = () => {
    host.innerHTML = `<div class="pp-rs-main"><div class="pp-rs-head"><div><h3>Roles</h3><p>Un rol es un conjunto de vistas y una regla de priorización. Cambiarlo cambia a todas las personas que lo tienen.</p></div>
        <button class="lab-btn primary" data-new-role>+ Nuevo rol</button></div>
      <div class="pp-rolelist">${state().roles.map((r) => `<div class="pp-rl">
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
  const openEditor = (r) => {
    let views = [...(r?.views || ['chat', 'links'])];
    const n = Number(r?.people || 0);
    roleRule = ruleOf(state().rules, r || {})?.id || null;
    closeEditor();
    // El nombre hace de título: se escribe ahí mismo.
    const drawer = openDrawer(host, `<div class="pp-rs-head pp-drawer-head"><input class="settings-input pp-rname" data-rname maxlength="40" placeholder="Nombre del rol" aria-label="Nombre del rol" value="${esc(r?.name || '')}" autocomplete="off" />
        <button class="pp-x" data-role-cancel aria-label="Cerrar">×</button></div>
      <div class="pp-rs-body">
        ${r && n ? `<p class="pp-drawer-note">Se aplica a ${n === 1 ? 'la persona que lo tiene' : `las ${n} personas que lo tienen`}.</p>` : ''}
        <div class="pp-field"><span>Prioriza con</span>${pickerHtml({ id: 'pp-role-rule', name: 'role-rule', value: roleRule || '', placeholder: 'Regla básica', disabled: !state().rules.length, groups: ruleOptions(state().rules) })}</div>
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
    for (const b of drawer.querySelectorAll('[data-role-cancel]')) b.addEventListener('click', closeEditor);
    const saveBtn = drawer.querySelector('[data-role-save]');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        const res = await usersApi.saveRole(r?.id, { name: drawer.querySelector('[data-rname]').value.trim(), views, rule: roleRule });
        toast(res?.warning || (r ? 'Rol guardado' : 'Rol creado'));
        await reload(); open();
      } catch (e) { drawer.querySelector('[data-msg]').textContent = e.message; saveBtn.disabled = false; }
    });
  };
  host.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-new-role]')) return openEditor(null);
    const edit = t.closest('[data-edit]')?.dataset.edit;
    if (edit) return openEditor(roleById(edit));
    const del = t.closest('[data-del]')?.dataset.del;
    if (del) { confirmDel = del; return paint(); }
    if (t.closest('[data-del-no]')) { confirmDel = null; return paint(); }
    const yes = t.closest('[data-del-yes]')?.dataset.delYes;
    if (yes) {
      try { await usersApi.removeRole(yes); toast('Rol borrado'); confirmDel = null; await reload(); paint(); }
      catch (err) { toast(err.message); }
    }
  });
  host.addEventListener('input', (e) => { if (e.target.name === 'role-rule') roleRule = e.target.value || null; });

  return {
    open: () => { confirmDel = null; paint(); },   // al entrar en la pantalla
    paint,                                         // con los datos al día
    close: closeEditor,                            // al salir: el panel, fuera
  };
};
