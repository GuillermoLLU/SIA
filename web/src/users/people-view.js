// Vista «Personas» (para quien la tiene). Lista con buscador y filtros y,
// al pulsar a alguien, su ficha: rol, contraseña y acceso (cada uno con su
// modal), sus vistas (cajas que se encienden y apagan: tocar una lo deja con
// vistas personalizadas) y su conocimiento: los
// proyectos de la base de la instancia que ve (la base la ve todo el mundo). Alta
// en un modal propio. La base la fija la instancia. Solo DOM: los datos van
// por users-api.js y knowledge-api.js y las reglas las pone la base.
import './people.css';
import { openModal, closeModal } from './modal.js';
import { strongPassword } from './password.js';
import { VIEWS, CHAT_ICON } from './views.js';
import { esc, TRASH_ICON } from '../ui/html.js';


// Iconos de rol: los de serie, uno común para los creados y el de personalizado.
const ROLE_ICON = {
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/></svg>',
  role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  custom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
};
const roleIcon = (r) => ROLE_ICON[r?.builtin] || (r ? ROLE_ICON.role : ROLE_ICON.custom);
// Las vistas de un rol en una frase («Chat, Enlaces rápidos y Laboratorio»).
const viewsText = (views) => {
  const names = ['Chat', ...VIEWS.filter((v) => views.includes(v.id)).map((v) => v.label)];
  return names.length === 1 ? 'Solo el Chat' : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
};

const initials = (n) => String(n).split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const ago = (ts) => {
  if (!ts) return 'nunca';
  const min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'ayer' : days < 30 ? `hace ${days} días` : new Date(ts).toLocaleDateString('es-ES');
};
// Los proyectos (ids de su token) que ve una persona.
const knOf = (p) => (p.knowledge || []).flatMap((k) => k.groups.map((g) => g.id));
const copyText = async (text, input, toast) => {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); }
  catch { input?.select(); toast('Selecciónalo y cópialo con ⌘C'); }
};
const roleCards = (roles, current) => `<div class="pp-roles" role="radiogroup" aria-label="Rol">${roles.map((r) =>
  `<button type="button" class="pp-role-card" role="radio" data-role="${esc(r.id)}" aria-checked="${current === r.id}"><span class="r-ico">${roleIcon(r)}</span><b>${esc(r.name)}</b><span>${viewsText(r.views)}</span></button>`).join('')}</div>`;
const wireRoleCards = (el) => el.addEventListener('click', (e) => {
  const c = e.target.closest('[data-role]');
  if (c) el.querySelectorAll('[data-role]').forEach((x) => x.setAttribute('aria-checked', String(x === c)));
});
const pickedRole = (el) => el.querySelector('[data-role][aria-checked="true"]')?.dataset.role || null;

// onMetrics: si la persona también ve el Panel de trabajo, «Métricas equipo» vuelve a sus métricas.
export const mountPeopleView = (root, { usersApi, knowledgeApi, me, toast, onMetrics }) => {
  let people = [], kbase = null, roles = [], filter = 'all', query = '', selected = null;

  root.innerHTML = `
    <header class="pp-head"><h2>Personas</h2>${onMetrics ? '<button class="wk-switch-view" data-metrics>Métricas equipo</button>' : ''}</header>
    <div class="pp-rule"></div>
    <div class="pp-tools">
      <input class="settings-input" data-q placeholder="Buscar por nombre o email" aria-label="Buscar persona" />
      <span class="pp-chips" data-chips></span>
      <button class="lab-btn" data-act="roles">Roles</button>
      <button class="lab-btn primary" data-act="new">+ Nueva persona</button>
    </div>
    <div class="pp-body" data-body>
      <div class="pp-list" data-list></div>
      <aside class="pp-panel" data-panel hidden></aside>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $('[data-panel]');

  const load = async () => {
    try { [people, kbase, roles] = await Promise.all([usersApi.list(), knowledgeApi.base(), usersApi.roles()]); }
    catch (e) { $('[data-list]').innerHTML = `<div class="pp-empty">No se pudo cargar: ${esc(e.message)}</div>`; return; }
    if (selected && !people.some((p) => p.id === selected)) selected = null;
    if (!['all', 'custom', 'none', 'off'].includes(filter) && !roles.some((r) => r.id === filter)) filter = 'all';
    renderChips();
    renderList();
    if (selected) renderPanel(); else panel.hidden = true;
  };
  const groupName = (id) => kbase?.groups?.find((g) => g.id === id)?.name;
  const person = () => people.find((p) => p.id === selected);

  const roleById = (id) => roles.find((r) => r.id === id) || null;
  const roleName = (p) => roleById(p.role_id)?.name || 'Personalizado';

  /* ── lista ── */
  // Filtros: todas, uno por rol, personalizadas, sin conocimiento y desactivadas.
  const renderChips = () => {
    const chips = [['all', 'Todas'], ...roles.map((r) => [r.id, r.name]), ['custom', 'Personalizado'], ['none', 'Sin conocimiento'], ['off', 'Desactivadas']];
    $('[data-chips]').innerHTML = chips.map(([f, label]) => `<button class="pp-chip${filter === f ? ' on' : ''}" data-f="${esc(f)}">${esc(label)}</button>`).join('');
  };
  const matches = (p) => filter === 'all' || (filter === 'off' ? !p.active : filter === 'none' ? !knOf(p).length : filter === 'custom' ? !p.role_id : p.role_id === filter);
  const knTags = (p) => {
    const names = knOf(p).map(groupName).filter(Boolean);
    return names.length ? names.map((n) => `<span class="pp-tag">${esc(n)}</span>`).join('') : '<span class="pp-tag none">Sin conocimiento</span>';
  };
  const renderList = () => {
    $('[data-body]').classList.toggle('open', !panel.hidden);
    const rows = people.filter((p) => matches(p) && `${p.name} ${p.email}`.toLowerCase().includes(query));
    $('[data-list]').innerHTML = `<div class="pp-row hd"><span></span><span>Persona</span><span>Rol</span><span class="pp-kn">Conocimiento</span><span>Acceso</span></div>`
      + (rows.length ? rows.map((p) => `<div class="pp-row${p.active ? '' : ' off'}${selected === p.id ? ' current' : ''}" data-id="${esc(p.id)}">
        <span class="pp-av">${esc(initials(p.name))}</span>
        <span class="pp-who"><b>${esc(p.name)}${p.id === me.id ? ' (tú)' : ''}</b><span>${esc(p.email)}</span></span>
        <span class="pp-role ${roleById(p.role_id)?.builtin || (p.role_id ? '' : 'custom')}">${esc(roleName(p))}</span>
        <span class="pp-kn">${knTags(p)}</span>
        <span class="pp-state ${p.active ? 'on' : 'off'}">${p.active ? 'Activa' : 'Desactivada'}</span>
      </div>`).join('') : '<div class="pp-empty">Nadie coincide con la búsqueda.</div>');
  };

  /* ── ficha ── */
  // Vistas: una caja por vista; pulsarla la da o la quita al momento.
  const viewsBlock = (p, self) => {
    const has = (v) => (p.views || []).includes(v);
    const n = VIEWS.filter((v) => has(v.id)).length;
    return `<div class="pp-block">
      <div class="pp-block-head"><span class="pp-k">Vistas</span>
        <span class="pp-sum">${self ? 'Las tuyas no las puedes cambiar' : n ? `Ve el Chat y ${n} de ${VIEWS.length} vistas más` : 'Solo ve el Chat'}</span></div>
      <div class="pp-views">
        <div class="pp-box on fixed"><span class="b-ico">${CHAT_ICON}</span><span class="b-name">Chat</span><span class="b-meta">Siempre</span></div>
        ${VIEWS.map((v) => `<button class="pp-box ${has(v.id) ? 'on' : 'off'}" data-view="${v.id}" aria-pressed="${has(v.id)}"${self ? ' disabled' : ''}>
          <span class="b-ico">${v.icon}</span><span class="b-name">${v.label}</span><span class="b-meta">${has(v.id) ? 'La ve' : 'No la ve'}</span></button>`).join('')}
      </div>
    </div>`;
  };
  // Conocimiento: los proyectos que ve (pulsar uno lo da o lo quita).
  const knowledgeBlock = (sel, { copyFrom = true } = {}) => {
    const b = kbase, groups = b?.groups || [];
    const head = (sum, none) => `<div class="pp-block-head"><span class="pp-k">Conocimiento</span><span class="pp-sum${none ? ' none' : ''}">${sum}</span>
      ${copyFrom && groups.length ? '<button class="pp-link" data-act="kn-copy">Igual que otra persona…</button>' : ''}</div>`;
    if (!b) return `<div class="pp-block">${head('', false)}<div class="pp-callout">La instancia aún no tiene base de conocimiento.</div></div>`;
    if (!b.groups) return `<div class="pp-block">${head('', false)}<div class="pp-callout">${esc(b.groupsError || 'La base aún no tiene su clave de poder, así que SIA no puede leer sus proyectos.')}</div></div>`;
    if (!groups.length) return `<div class="pp-block">${head('', false)}<div class="pp-callout">«${esc(b.name)}» aún no tiene proyectos: créalos en Administración.</div></div>`;
    const n = groups.filter((g) => sel.includes(g.id)).length;
    return `<div class="pp-block">${head(n ? `Ve ${n} de ${groups.length} proyectos` : 'No ve ningún proyecto', !n)}
      <div class="pp-groups">${groups.map((g) => `<button type="button" class="pp-g" data-g="${esc(g.id)}" aria-pressed="${sel.includes(g.id)}">${esc(g.name)}</button>`).join('')}</div>
    </div>`;
  };
  const renderPanel = () => {
    const p = person(), self = p.id === me.id;
    panel.hidden = false;
    panel.innerHTML = `
      <div class="pp-ph"><span class="pp-av${p.active ? '' : ' off'}">${esc(initials(p.name))}</span>
        <div><h3>${esc(p.name)}</h3><p>${esc(p.email)} · último acceso ${ago(p.last_sign_in_at)}</p>
          <span class="pp-state ${p.active ? 'on' : 'off'}">${p.active ? 'Activa · puede entrar' : 'Desactivada · no puede entrar'}</span></div>
        <div class="pp-ph-actions"><button class="pp-x" data-act="close" aria-label="Cerrar ficha">×</button>
          ${self ? '' : `<button class="icon-btn danger" data-act="delete" title="Borrar persona" aria-label="Borrar persona">${TRASH_ICON}</button>`}</div></div>
      <div class="pp-pb">
        <div class="pp-item"><span class="pp-k">Rol</span><span class="pp-v">${esc(roleName(p))}${self ? '<small>El tuyo no lo puedes cambiar.</small>' : p.role_id ? '' : '<small>Sus vistas no siguen a ningún rol.</small>'}</span>${self ? '<span></span>' : '<button class="lab-btn" data-act="role">Cambiar</button>'}</div>
        <div class="pp-item"><span class="pp-k">Contraseña</span><span class="pp-v">${p.must_change_password ? 'Pendiente de cambiar' : 'La eligió la propia persona'}<small>${p.must_change_password ? 'La puso un administrador: se le pedirá cambiarla al entrar.' : 'Si la olvida, genera una nueva.'}</small></span>${self ? '<span></span>' : '<button class="lab-btn" data-act="password">Generar nueva</button>'}</div>
        <div class="pp-item"><span class="pp-k">Acceso a SIA</span><span class="pp-v">${p.active ? 'Puede iniciar sesión' : 'No puede iniciar sesión'}<small>${self ? 'Tu propio acceso no lo puedes desactivar.' : p.active ? 'Desactívala para cortarle el acceso sin borrarla.' : 'Su rol y su conocimiento se conservan.'}</small></span>
          ${self ? '<span></span>' : `<button class="lab-btn${p.active ? ' pp-danger' : ''}" data-act="access">${p.active ? 'Desactivar acceso' : 'Reactivar acceso'}</button>`}</div>
        ${viewsBlock(p, self)}
        ${knowledgeBlock(knOf(p))}
      </div>`;
    renderList();
  };
  const openPerson = (id) => { selected = id; renderPanel(); };
  const closePerson = () => { selected = null; panel.hidden = true; renderList(); };

  // Guardar algo y volver a pintar con lo que dice la base (con su aviso, si trae).
  const save = async (fn, okText, msgEl) => {
    try { const r = await fn(); closeModal(); toast(r?.warning || okText); await load(); return true; }
    catch (e) { if (msgEl) msgEl.textContent = e.message; else toast(e.message); return false; }
  };
  const footer = (okLabel, okClass = 'primary') => `<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cancelar</button><button class="lab-btn ${okClass}" data-ok>${okLabel}</button>`;
  const wireFoot = (m, onOk) => {
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    const ok = m.querySelector('[data-ok]');
    ok.addEventListener('click', async () => { ok.disabled = true; await onOk(m.querySelector('[data-msg]')); ok.disabled = false; });
  };

  /* ── modales de la ficha ── */
  const roleModal = () => {
    const p = person();
    const m = openModal({ title: `Rol de ${p.name}`, lead: 'Se le ponen las vistas del rol, y las cambiará cuando cambie el rol.', body: roleCards(roles, p.role_id), foot: footer('Guardar'), wide: roles.length > 2 });
    wireRoleCards(m);
    wireFoot(m, (msg) => (pickedRole(m) ? save(() => usersApi.update(p.id, { role: pickedRole(m) }), 'Rol guardado', msg) : (msg.textContent = 'Elige un rol.')));
  };
  const accessModal = () => {
    const p = person();
    const m = openModal(p.active
      ? { title: `Desactivar el acceso de ${p.name}`, lead: 'No podrá iniciar sesión y se cerrarán sus sesiones abiertas. No se borra nada: puedes reactivarla cuando quieras.',
        body: '<div class="pp-callout"><b>Qué se conserva:</b> su rol y su conocimiento asignado.</div>', foot: footer('Desactivar acceso', 'pp-danger-solid') }
      : { title: `Reactivar el acceso de ${p.name}`, lead: 'Podrá volver a iniciar sesión con su contraseña, con el mismo rol y el mismo conocimiento.', foot: footer('Reactivar acceso') });
    wireFoot(m, (msg) => save(() => usersApi.update(p.id, { active: !p.active }), p.active ? 'Acceso desactivado' : 'Acceso reactivado', msg));
  };
  const passwordModal = () => {
    const p = person();
    const m = openModal({ title: `Nueva contraseña para ${p.name}`, lead: 'Sustituye a la actual y cierra sus sesiones abiertas. Pásasela por un canal seguro: al entrar se le pedirá cambiarla.',
      body: `<div class="pp-pw"><input class="settings-input" data-pw value="${esc(strongPassword())}" aria-label="Nueva contraseña" spellcheck="false" /><button class="lab-btn" data-copy>Copiar</button><button class="lab-btn" data-regen title="Generar otra" aria-label="Generar otra">↻</button></div>`,
      foot: footer('Guardar contraseña') });
    const input = m.querySelector('[data-pw]');
    m.querySelector('[data-copy]').addEventListener('click', () => copyText(input.value, input, toast));
    m.querySelector('[data-regen]').addEventListener('click', () => { input.value = strongPassword(); });
    wireFoot(m, (msg) => save(() => usersApi.update(p.id, { password: input.value }), 'Contraseña guardada', msg));
  };
  const deleteModal = () => {
    const p = person();
    const m = openModal({ title: `Borrar a ${p.name}`, lead: 'Se borra su usuario y su conocimiento asignado. No se puede deshacer. Si solo quieres cortarle el acceso, desactívala.',
      body: `<label class="pp-field" style="margin:0"><span>Escribe su email para confirmar</span><input class="settings-input" data-confirm placeholder="${esc(p.email)}" autocomplete="off" spellcheck="false" /></label>`,
      foot: footer('Borrar', 'pp-danger-solid') });
    wireFoot(m, async (msg) => {
      if (m.querySelector('[data-confirm]').value.trim().toLowerCase() !== p.email) { msg.textContent = 'El email no coincide.'; return; }
      if (await save(() => usersApi.remove(p.id), 'Persona borrada', msg)) closePerson();
    });
  };

  // Copiar el conocimiento de otra persona: elegir (como en la lista) y revisar.
  const copyModal = (who, excludeId, onApply) => {
    const m = openModal({ title: '¿De quién copias el conocimiento?', lead: `${who} verá sus mismos proyectos.`, body: '<div data-c></div>',
      foot: '<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cancelar</button>' });
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    const body = m.querySelector('[data-c]');
    const pick = (q = '') => {
      const who2 = people.filter((p) => p.id !== excludeId && knOf(p).length && `${p.name} ${p.email}`.toLowerCase().includes(q));
      body.innerHTML = `<input class="settings-input" data-pq placeholder="Buscar persona" aria-label="Buscar persona" value="${esc(q)}" />
        <div class="pp-picks">${who2.length ? who2.map((p) => `<button type="button" class="pp-pick" data-pick="${esc(p.id)}">
          <span class="pp-av${p.active ? '' : ' off'}">${esc(initials(p.name))}</span>
          <span class="pp-who"><b>${esc(p.name)}</b><span>${esc(p.email)}</span></span><span class="pp-kn">${knTags(p)}</span></button>`).join('')
          : '<div class="pp-empty">Nadie con ese nombre tiene conocimiento asignado.</div>'}</div>`;
      const qi = body.querySelector('[data-pq]');
      qi.focus(); qi.setSelectionRange(q.length, q.length);
      qi.addEventListener('input', () => pick(qi.value.toLowerCase()));
    };
    const review = (src) => {
      m.querySelector('h3').textContent = `Igual que ${src.name}`;
      body.innerHTML = `<button type="button" class="pp-back" data-back>← Elegir otra persona</button>
        <div class="pp-review"><div>${esc(kbase?.name || 'Base')} <span>· ${knOf(src).map((id) => esc(groupName(id) || '?')).join(', ')}</span></div></div>`;
      const foot = m.querySelector('.pp-mf');
      foot.innerHTML = '<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cancelar</button><button class="lab-btn primary" data-ok>Aplicar</button>';
      wireFoot(m, (msg) => onApply(src, msg));
    };
    body.addEventListener('click', (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) return review(people.find((x) => x.id === p.dataset.pick));
      if (e.target.closest('[data-back]')) {
        m.querySelector('h3').textContent = '¿De quién copias el conocimiento?';
        m.querySelector('.pp-mf').innerHTML = '<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cancelar</button>';
        m.querySelector('[data-cancel]').addEventListener('click', closeModal);
        pick();
      }
    });
    pick();
  };

  /* ── roles: lista, crear, editar (se aplica a quien lo tiene) y borrar ── */
  const rolesModal = () => {
    const m = openModal({ title: 'Roles', lead: 'Un rol es un conjunto de vistas. Cambiarlo cambia a todas las personas que lo tienen.', wide: true,
      body: '<div class="pp-rolelist" data-rl></div>',
      foot: '<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cerrar</button><button class="lab-btn primary" data-new-role>+ Nuevo rol</button>' });
    const paint = () => {
      m.querySelector('[data-rl]').innerHTML = roles.map((r) => `<div class="pp-rl">
        <span class="r-ico">${roleIcon(r)}</span>
        <span class="pp-rl-main"><b>${esc(r.name)}</b><span>${viewsText(r.views)}</span></span>
        <span class="pp-rl-n">${Number(r.people)} ${Number(r.people) === 1 ? 'persona' : 'personas'}</span>
        ${r.builtin === 'admin' ? '<span class="pp-rl-fixed">Todas las vistas, fijo</span>'
          : `<button class="lab-btn" data-edit="${esc(r.id)}">Editar</button>${r.builtin ? '<span class="pp-rl-gap"></span>' : `<button class="icon-btn danger" data-del="${esc(r.id)}" title="Borrar rol" aria-label="Borrar rol">${TRASH_ICON}</button>`}`}
      </div>`).join('');
    };
    paint();
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    m.querySelector('[data-new-role]').addEventListener('click', () => roleEditor(null, paint));
    m.querySelector('[data-rl]').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]')?.dataset.edit, del = e.target.closest('[data-del]')?.dataset.del;
      if (edit) roleEditor(roleById(edit), paint);
      if (del) roleDelete(roleById(del), paint);
    });
  };
  // Crear o editar un rol: nombre y vistas (cajas como las de la ficha).
  const roleEditor = (r, repaint) => {
    let views = [...(r?.views || ['links'])];
    const n = Number(r?.people || 0);
    const m = openModal({ title: r ? `Editar «${r.name}»` : 'Nuevo rol', lead: r && n ? `Se aplica a ${n === 1 ? 'la persona que lo tiene' : `las ${n} personas que lo tienen`}.` : 'Qué vistas trae quien lo tenga.', wide: true,
      body: `<label class="pp-field"><span>Nombre</span><input class="settings-input" data-rname maxlength="40" placeholder="Supervisor" value="${esc(r?.name || '')}" autocomplete="off" /></label>
        <div class="pp-field"><span>Vistas</span><div class="pp-views" data-rviews></div></div>`,
      foot: footer(r ? 'Guardar' : 'Crear rol') });
    const paint = () => {
      m.querySelector('[data-rviews]').innerHTML = `<div class="pp-box on fixed"><span class="b-ico">${CHAT_ICON}</span><span class="b-name">Chat</span><span class="b-meta">Siempre</span></div>`
        + VIEWS.map((v) => `<button type="button" class="pp-box ${views.includes(v.id) ? 'on' : 'off'}" data-v="${v.id}" aria-pressed="${views.includes(v.id)}"><span class="b-ico">${v.icon}</span><span class="b-name">${v.label}</span><span class="b-meta">${views.includes(v.id) ? 'La ve' : 'No la ve'}</span></button>`).join('');
    };
    paint();
    m.querySelector('[data-rviews]').addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v) { views = views.includes(v) ? views.filter((x) => x !== v) : [...views, v]; paint(); }
    });
    m.querySelector('[data-rname]').focus();
    wireFoot(m, async (msg) => {
      try {
        const res = await usersApi.saveRole(r?.id, { name: m.querySelector('[data-rname]').value.trim(), views });
        closeModal(); toast(res?.warning || (r ? 'Rol guardado' : 'Rol creado'));
        await load(); repaint();
      } catch (e) { msg.textContent = e.message; }
    });
  };
  const roleDelete = (r, repaint) => {
    const n = Number(r.people);
    const m = openModal({ title: `Borrar «${r.name}»`, lead: n ? `${n === 1 ? 'La persona que lo tiene se queda' : `Las ${n} personas que lo tienen se quedan`} con sus vistas, como personalizadas.` : 'Nadie lo tiene.', foot: footer('Borrar rol', 'pp-danger-solid') });
    wireFoot(m, async (msg) => {
      try { await usersApi.removeRole(r.id); closeModal(); toast('Rol borrado'); await load(); repaint(); }
      catch (e) { msg.textContent = e.message; }
    });
  };

  /* ── alta: modal propio; el conocimiento se elige en él ── */
  const newModal = () => {
    const draft = { kn: [] };
    const m = openModal({ title: 'Nueva persona', lead: 'Se crea activa y puede entrar en cuanto le pases sus datos.', wide: true,
      body: `<div class="pp-fields2">
          <label class="pp-field"><span>Nombre</span><input class="settings-input" data-name placeholder="Nombre y apellidos" autocomplete="off" /></label>
          <label class="pp-field"><span>Email</span><input class="settings-input" data-email type="email" placeholder="nombre@empresa.com" autocomplete="off" spellcheck="false" /></label>
        </div>
        <div class="pp-field" data-roles><span>Rol</span>${roleCards(roles, roles.find((r) => r.builtin === 'agent')?.id)}</div>
        <div class="pp-field"><span>Contraseña inicial</span>
          <div class="pp-pw"><input class="settings-input" data-pw value="${esc(strongPassword())}" aria-label="Contraseña inicial" spellcheck="false" /><button type="button" class="lab-btn" data-copy>Copiar</button><button type="button" class="lab-btn" data-regen title="Generar otra" aria-label="Generar otra">↻</button></div>
          <small>Se le pedirá cambiarla al entrar por primera vez.</small></div>
        <div data-kn></div>`,
      foot: footer('Crear persona') });
    const val = (s) => m.querySelector(s).value.trim();
    const pw = m.querySelector('[data-pw]');
    wireRoleCards(m.querySelector('[data-roles]'));
    m.querySelector('[data-copy]').addEventListener('click', () => copyText(pw.value, pw, toast));
    m.querySelector('[data-regen]').addEventListener('click', () => { pw.value = strongPassword(); });
    const who = () => val('[data-name]') || 'la nueva persona';
    const paintKn = () => { m.querySelector('[data-kn]').innerHTML = knowledgeBlock(draft.kn); };
    m.querySelector('[data-kn]').addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]')?.dataset.g;
      if (g) { draft.kn = draft.kn.includes(g) ? draft.kn.filter((x) => x !== g) : [...draft.kn, g]; paintKn(); }
      if (e.target.closest('[data-act="kn-copy"]')) copyModal(who(), null, (src) => { draft.kn = knOf(src); closeModal(); paintKn(); });
    });
    paintKn();
    m.querySelector('[data-name]').focus();
    wireFoot(m, async (msg) => {
      try {
        const r = await usersApi.create({ email: val('[data-email]'), name: val('[data-name]'), role: pickedRole(m), password: pw.value, projects: draft.kn });
        created(m, r.user, pw.value, r.warning);
        load();
      } catch (e) { msg.textContent = e.message; }
    });
  };
  // La persona creada: sus datos de acceso para copiar.
  const created = (m, u, password, warning) => {
    m.classList.remove('wide');
    m.querySelector('.pp-mh').innerHTML = '<div><h3></h3><p>Pásale sus datos de acceso por un canal seguro.</p></div>';
    m.querySelector('h3').textContent = `${u.name} ya puede entrar`;
    m.querySelector('.pp-mb').innerHTML = `
      <label class="pp-field"><span>Email</span><div class="pp-pw"><input class="settings-input" data-ce value="${esc(u.email)}" readonly /><button class="lab-btn" data-c="ce">Copiar</button></div></label>
      <label class="pp-field" style="margin:0"><span>Contraseña inicial</span><div class="pp-pw"><input class="settings-input" data-cp value="${esc(password)}" readonly /><button class="lab-btn" data-c="cp">Copiar</button></div></label>
      ${warning ? `<p class="pp-msg" style="margin-top:12px">${esc(warning)}</p>` : ''}`;
    m.querySelector('.pp-mf').innerHTML = '<button class="lab-btn" data-both>Copiar los dos</button><button class="lab-btn primary" data-go>Ver su ficha</button>';
    m.querySelector('.pp-mb').addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]');
      if (c) { const i = m.querySelector(`[data-${c.dataset.c}]`); copyText(i.value, i, toast); }
    });
    m.querySelector('[data-both]').addEventListener('click', () => copyText(`Email: ${u.email}\nContraseña: ${password}`, null, toast));
    m.querySelector('[data-go]').addEventListener('click', async () => { closeModal(); await load(); openPerson(u.id); });
  };

  /* ── interacción de la vista ── */
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-metrics]')) return onMetrics();
    const chip = e.target.closest('.pp-chip');
    if (chip) { filter = chip.dataset.f; root.querySelectorAll('.pp-chip').forEach((c) => c.classList.toggle('on', c === chip)); return renderList(); }
    const row = e.target.closest('.pp-row:not(.hd)');
    if (row) return selected === row.dataset.id ? closePerson() : openPerson(row.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') return newModal();
    if (act === 'roles') return rolesModal();
    if (act === 'close') return closePerson();
    if (act === 'role') return roleModal();
    if (act === 'access') return accessModal();
    if (act === 'password') return passwordModal();
    if (act === 'delete') return deleteModal();
    const p = person();
    const view = e.target.closest('.pp-panel [data-view]');
    if (view && p) {
      const v = VIEWS.find((x) => x.id === view.dataset.view), on = (p.views || []).includes(v.id);
      const views = on ? p.views.filter((x) => x !== v.id) : [...(p.views || []), v.id];
      const custom = p.role_id ? ' (vistas personalizadas)' : '';
      return save(() => usersApi.update(p.id, { views }), `${p.name} ${on ? 'ya no ve' : 'ya ve'} ${v.label}${custom}`);
    }
    if (act === 'kn-copy' && p) {
      return copyModal(p.name, p.id, (src, msg) => save(() => knowledgeApi.copy(p.id, src.id), `Mismo conocimiento que ${src.name}`, msg));
    }
    const g = e.target.closest('.pp-panel [data-g]')?.dataset.g;
    if (g && p) {
      const cur = knOf(p), on = cur.includes(g);
      return save(() => knowledgeApi.setProjects(p.id, on ? cur.filter((x) => x !== g) : [...cur, g]), on ? `${p.name} ya no ve ${groupName(g)}` : `${p.name} ya ve ${groupName(g)}`);
    }
  });
  $('[data-q]').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });

  return { refresh: load };
};
