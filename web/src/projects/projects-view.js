// Vista «Administración»: los proyectos de la base. Es lo único que se
// gestiona (crear, ver sus entradas y borrar); a quién se habilita cada uno se
// decide en Personas. Sin grupos a la vista: por dentro cada proyecto lleva su
// propio token (server/projects/). Solo DOM: llegan inyectados api, los
// diálogos de la app y toast.

import { esc, fold, TRASH_ICON } from '../ui/html.js';

const entriesLabel = (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`;

export const mountProjectsView = (root, { api, dialogs, toast }) => {
  const rail = root.querySelector('#admin-rail-list');
  const main = root.querySelector('#admin-main');
  const search = root.querySelector('#admin-search');
  let projects = []; // [{ id, name, entries }]
  let open = null; // id del proyecto abierto; null = la rejilla

  const refresh = async () => {
    try {
      projects = await api('/admin/projects');
      if (!projects.some((p) => p.id === open)) open = null;
      renderRail(); renderMain();
    } catch (err) { main.innerHTML = `<div class="admin-empty"><span class="big">Error</span><span>${esc(err.message)}</span></div>`; }
  };
  const openProject = (id) => { open = id; renderRail(); renderMain(); };

  const renderRail = () => {
    const q = fold(search.value.trim());
    rail.innerHTML = '';
    for (const p of projects.filter((x) => !q || fold(x.name).includes(q))) {
      const li = document.createElement('li');
      if (open === p.id) li.classList.add('active');
      li.innerHTML = `<span>${esc(p.name)}</span><span class="rl-meta tnum">${p.entries}</span>`;
      li.addEventListener('click', () => openProject(open === p.id ? null : p.id)); // otra vez: a todos
      rail.appendChild(li);
    }
  };
  const renderMain = () => (open ? renderProjectView() : renderProjectsGrid());

  /* ── Todos los proyectos: rejilla de cards ── */
  const renderProjectsGrid = () => {
    main.innerHTML = `
      <div class="admin-main-head"><h1>Proyectos</h1><span class="spacer"></span>
        <button class="admin-primary" id="new-project">+ Nuevo proyecto</button></div>
      <div class="admin-main-sub"><span class="tnum">${projects.length} ${projects.length === 1 ? 'proyecto' : 'proyectos'}</span></div>
      <div class="admin-grid" id="proj-grid"></div>`;
    const grid = main.querySelector('#proj-grid');
    // la card de crear va la primera, como en skills y enlaces
    const add = document.createElement('div');
    add.className = 'admin-card new';
    add.innerHTML = '<span class="plus">+</span><span>Nuevo proyecto</span>';
    add.addEventListener('click', newProject);
    grid.appendChild(add);
    for (const p of projects) {
      const card = document.createElement('div');
      card.className = 'admin-card';
      card.innerHTML = `
        <span class="ac-actions"><button type="button" class="icon-btn danger" data-act="remove" title="Eliminar proyecto" aria-label="Eliminar proyecto">${TRASH_ICON}</button></span>
        <div class="ac-title">${esc(p.name)}</div>
        <div class="ac-meta tnum">${entriesLabel(p.entries)}</div>`;
      card.addEventListener('click', (e) => { if (!e.target.closest('.ac-actions')) openProject(p.id); });
      card.querySelector('[data-act="remove"]').addEventListener('click', (e) => { e.stopPropagation(); deleteProject(p); });
      grid.appendChild(card);
    }
    main.querySelector('#new-project').addEventListener('click', newProject);
  };

  const newProject = async () => {
    const name = await dialogs.prompt('Nuevo proyecto', 'SGA', 'Nombre del proyecto:');
    if (!name) return;
    try { const p = await api('/admin/projects', { method: 'POST', body: JSON.stringify({ name }) }); open = p.id; await refresh(); toast(`Proyecto «${p.name}» creado`); }
    catch (e) { dialogs.alert('No se pudo crear', esc(e.message)); }
  };
  const deleteProject = async (p) => {
    if (!await dialogs.confirm('Eliminar proyecto', `Se eliminará <strong>${esc(p.name)}</strong> con sus ${entriesLabel(p.entries)}, sus enlaces y sus skills, y nadie podrá verlo. Irreversible.`, 'Eliminar')) return;
    try { await api(`/admin/projects/${p.id}`, { method: 'DELETE' }); open = null; refresh(); }
    catch (e) { dialogs.alert('No se pudo eliminar', esc(e.message)); }
  };

  /* ── Un proyecto: sus entradas de conocimiento ── */
  const renderProjectView = () => {
    const p = projects.find((x) => x.id === open);
    main.innerHTML = `
      <div class="admin-main-head">
        <button class="lab-back" id="back-all" title="Volver a todos los proyectos" aria-label="Volver a todos los proyectos"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
        <h1>${esc(p.name)}</h1><span class="spacer"></span>
        <button class="admin-ghost danger" id="del-project">Eliminar proyecto</button></div>
      <div class="admin-main-sub"><span class="tnum">${entriesLabel(p.entries)}</span></div>
      <div class="admin-block"><h3>Entradas de conocimiento</h3><div class="entry-list" id="entry-list"><div class="entry-empty">Cargando…</div></div></div>`;
    main.querySelector('#back-all').addEventListener('click', () => openProject(null));
    main.querySelector('#del-project').addEventListener('click', () => deleteProject(p));
    loadEntries(p.id);
  };

  // cargar y pintar las entradas de un proyecto (capa de contextos oculta)
  const loadEntries = async (projectId) => {
    const list = main.querySelector('#entry-list');
    if (!list) return;
    let entries;
    try { entries = await api(`/admin/entries?project=${projectId}`); }
    catch (e) { list.innerHTML = `<div class="entry-empty">Error: ${esc(e.message)}</div>`; return; }
    if (open !== projectId || !main.contains(list)) return; // cambió de vista
    list.innerHTML = '';
    if (!entries.length) { list.innerHTML = '<div class="entry-empty">Aún no hay entradas. Se nutren desde el chat con la skill «Nutrir conocimiento».</div>'; return; }
    entries.forEach((en, i) => {
      const item = document.createElement('div');
      item.className = 'entry-item';
      item.innerHTML = `<div class="entry-head"><span class="entry-num tnum">${i + 1}</span><div class="entry-text clamp">${esc(en.content)}</div><button class="admin-icon-btn entry-del" title="Eliminar entrada">✕</button></div>`;
      const text = item.querySelector('.entry-text');
      item.querySelector('.entry-head').addEventListener('click', (e) => { if (!e.target.closest('.entry-del')) text.classList.toggle('clamp'); });
      item.querySelector('.entry-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await dialogs.confirm('Eliminar entrada', `Se eliminará esta entrada del conocimiento:<pre>${esc(en.content.slice(0, 200))}${en.content.length > 200 ? '…' : ''}</pre>`, 'Eliminar')) return;
        try { await api(`/admin/entries/${en.id}`, { method: 'DELETE' }); loadEntries(projectId); refresh(); } catch (err) { dialogs.alert('No se pudo eliminar', esc(err.message)); }
      });
      list.appendChild(item);
    });
  };

  search.addEventListener('input', renderRail);

  // show: se entra siempre a todos los proyectos; refresh: repinta lo que haya
  return { show: () => { open = null; refresh(); }, refresh };
};
