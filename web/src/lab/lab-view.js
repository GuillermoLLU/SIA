// Laboratorio de skills: el catálogo (publicadas y borradores, en Configuración → Skills) y el
// editor multifichero de una skill, a pantalla completa, con su visibilidad (común o de un proyecto). Los
// borradores son locales; publicar la deja en la base para todo el equipo.
// Las reglas, en lab.js.
import { esc, svg } from '../ui/html.js';
import { emptyState } from '../ui/dom.js';
import { pickerHtml, pickClick } from '../ui/picker.js';
import { SKILL_TEMPLATE, cleanSkillId, groupName, scopeOptions, isReadOnly, scopeLabel, cleanPath, filesList } from './lab.js';

const SKILLS_ICON = svg('<path d="M10 2v6.5L4.8 17a3 3 0 0 0 2.6 4.5h9.2a3 3 0 0 0 2.6-4.5L14 8.5V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/>', { width: 1.5, size: 38 });
const LOCK_ICON = svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', { width: 1.6, size: 34 });
const CACHE_KEY = 'sia-lab-cache';

// perms(): lo que abre la clave de poder en la base (owner decide las comunes)
// · onSkills(list): el bridge ha resincronizado las skills (la paleta, al día)
// · onEditor(): se abre una skill, el editor a pantalla completa · onCatalog(): se vuelve al catálogo
export const mountLabView = ({ api, dialogs, perms, onSkills, onEditor, onCatalog }) => {
  const $ = (id) => document.getElementById(id);
  const cards = $('lab-cards'), work = $('lab-work');
  const skillId = $('lab-skill-id'), state = $('lab-state'), statusEl = $('lab-status');
  const saveBtn = $('lab-save'), publishBtn = $('lab-publish'), deleteBtn = $('lab-delete'), refreshBtn = $('lab-refresh');
  const fileTabs = $('lab-file-tabs'), textarea = $('lab-textarea'), scopeSel = $('lab-scope');
  let cur = null;   // la skill abierta en el editor: { id, files: Map(path → content), active, dirty, isDraft, scope, readOnly }
  let groups = [];  // proyectos para la visibilidad: [{ token, name }]

  work.addEventListener('click', (e) => pickClick(work, e.target));

  const setState = (text, dirty = false) => { state.textContent = text; state.className = `lab-state ${dirty ? 'dirty' : ''}`; };
  const status = (text) => { statusEl.textContent = text; };
  const showCatalog = () => { work.hidden = true; onCatalog(); };   // onCatalog abre Configuración → Skills, que lo refresca
  const showEditor = () => { work.hidden = false; onEditor(); };

  // tags: [{ text, cls }] — van en su propia fila, alineados a la derecha; una
  // etiqueta larga se recorta con «…» dentro de la card y se lee entera al pasar el ratón
  const card = ({ title, tags = [], desc, meta, onClick }) => {
    const el = document.createElement('div');
    el.className = 'lab-card';
    el.innerHTML = `
      <div class="lab-card-title">${esc(title)}</div>
      <div class="lab-card-tags">${tags.map((t) => `<span class="badge ${t.cls || ''}" title="${esc(t.text)}">${esc(t.text)}</span>`).join('')}</div>
      <div class="lab-card-desc">${esc(desc || '')}</div>
      <div class="lab-card-meta">${esc(meta || '')}</div>`;
    el.addEventListener('click', onClick);
    return el;
  };

  const renderCards = (skills, drafts) => {
    cards.innerHTML = '';
    // card de crear: la primera de la rejilla, o sola bajo el mensaje si no hay nada
    const newCard = document.createElement('div');
    newCard.className = 'lab-card new';
    newCard.innerHTML = '<span class="plus">+</span><span>Nueva skill</span>';
    newCard.addEventListener('click', newSkill);
    if (!skills.length && !drafts.length) { cards.appendChild(emptyState(SKILLS_ICON, 'No tienes aún ninguna skill definida.', newCard)); return; }
    cards.appendChild(newCard);
    for (const id of drafts) {
      cards.appendChild(card({ title: id, tags: [{ text: 'borrador', cls: 'draft' }], desc: 'Trabajo en curso, aún sin publicar.', meta: id, onClick: () => openDraft(id) }));
    }
    for (const sk of skills) {
      const tags = [];
      if (!sk.enabled) tags.push({ text: 'off', cls: 'off' });
      if (sk.category) tags.push({ text: sk.category });
      tags.push({ text: scopeLabel(groups, sk), cls: 'scope' });
      cards.appendChild(card({ title: sk.label, tags, desc: sk.description, meta: `${sk.id} · v${sk.version}`, onClick: () => openPublished(sk.id) }));
    }
  };

  // Sin permiso de Laboratorio en la base (le quitaron la vista): estado
  // explicativo; sin permisos no tiene sentido el botón de actualizar.
  const renderLocked = () => {
    refreshBtn.hidden = true;
    cards.innerHTML = `
      <div class="lab-locked">
        ${LOCK_ICON}
        <h3>Sin acceso al Laboratorio</h3>
        <p>
          El Laboratorio permite crear, editar y publicar skills para todo el
          equipo. Pide a quien gestiona Personas que te dé esa vista.
        </p>
      </div>`;
  };

  // stale-while-revalidate: pinta al instante la última copia conocida y
  // refresca desde la base por debajo.
  const refresh = async ({ background = false } = {}) => {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* copia rota: sin ella */ }
    if (cached && !background) renderCards(cached.skills || [], cached.drafts || []);
    status('actualizando skills…');
    try {
      const [skills, drafts, grps] = await Promise.all([api('/skills'), api('/drafts'), api('/groups')]);
      groups = grps || [];
      refreshBtn.hidden = false;
      renderCards(skills, drafts);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ skills, drafts }));
      status('');
    } catch (err) {
      status('');
      if (err.status === 403) { renderLocked(); return; }
      if (cached) status('sin conexión — mostrando la última copia');
      else cards.innerHTML = `<div class="lab-card-desc">Error cargando el catálogo: ${esc(err.message)}</div>`;
    }
  };

  // Actualizar a mano: re-sincroniza el bridge desde la base (paleta ⌘K
  // incluida) y repinta el catálogo — por si un compañero acaba de publicar algo.
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    status('actualizando skills…');
    try {
      const out = await api('/skills/refresh', { method: 'POST' });
      if (out.skills) onSkills(out.skills);
      await refresh({ background: true });
      status('catálogo actualizado ✓');
      setTimeout(() => { if (statusEl.textContent === 'catálogo actualizado ✓') status(''); }, 2500);
    } catch (err) {
      status('');
      if (err.status === 403) renderLocked();
      else status(`error: ${err.message}`);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('loading');
    }
  });

  const fillScope = (scope, readOnly) => {
    const { options, value } = scopeOptions(groups, scope, !!perms()?.owner);
    scopeSel.innerHTML = pickerHtml({ id: 'lab-scope-btn', name: 'scope', value, inline: true, disabled: readOnly, groups: [{ options }] });
  };

  const openFiles = (id, files, { isDraft, scope = null }) => {
    cur = { id, files: new Map(files.map((f) => [f.path, f.content])), active: 'SKILL.md', dirty: false, isDraft, scope };
    if (!cur.files.has('SKILL.md')) cur.active = files[0]?.path;
    skillId.textContent = id;
    cur.readOnly = isReadOnly({ isDraft, scope, isOwner: !!perms()?.owner });
    fillScope(scope, cur.readOnly);
    publishBtn.disabled = cur.readOnly;
    deleteBtn.disabled = cur.readOnly;
    textarea.readOnly = cur.readOnly;
    setState(cur.readOnly ? 'común · solo lectura (la edita quien tiene Administración)' : (isDraft ? 'borrador' : 'publicada'));
    showEditor();
    renderFileTabs();
    textarea.value = cur.files.get(cur.active) ?? '';
  };
  const openDraft = async (id) => {
    try { const d = await api(`/drafts/${encodeURIComponent(id)}`); openFiles(id, d.files, { isDraft: true }); }
    catch (err) { dialogs.alert('No se pudo abrir el borrador', esc(err.message)); }
  };
  const openPublished = async (id) => {
    try { const d = await api(`/skills/${encodeURIComponent(id)}`); openFiles(id, d.files, { isDraft: false, scope: d.scope || null }); }
    catch (err) { dialogs.alert('No se pudo abrir la skill', esc(err.message)); }
  };

  $('lab-back').addEventListener('click', async () => {
    if (cur?.dirty && !await dialogs.confirm('Cambios sin guardar', 'Si vuelves al catálogo perderás los cambios no guardados. ¿Salir igualmente?', 'Salir sin guardar')) return;
    cur = null;
    showCatalog();
  });

  const markDirty = () => { cur.dirty = true; setState('cambios sin guardar', true); };
  const renderFileTabs = () => {
    fileTabs.innerHTML = '';
    for (const p of [...cur.files.keys()].sort()) {
      const b = document.createElement('button');
      b.className = `lab-file-tab ${p === cur.active ? 'active' : ''}`;
      b.innerHTML = `<span>${esc(p)}</span>${p !== 'SKILL.md' ? '<span class="rm" title="Eliminar fichero">×</span>' : ''}`;
      b.addEventListener('click', async (e) => {
        if (e.target.classList.contains('rm')) {
          if (!await dialogs.confirm('Eliminar fichero', `Se eliminará <code>${esc(p)}</code> de la skill (al publicar desaparecerá también del catálogo).`, 'Eliminar')) return;
          cur.files.delete(p);
          if (cur.active === p) { cur.active = 'SKILL.md'; textarea.value = cur.files.get('SKILL.md') ?? ''; }
          markDirty(); renderFileTabs();
          return;
        }
        cur.files.set(cur.active, textarea.value);
        cur.active = p;
        textarea.value = cur.files.get(p) ?? '';
        renderFileTabs();
      });
      fileTabs.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'lab-file-tab';
    add.textContent = '+ fichero';
    add.addEventListener('click', async () => {
      const p = await dialogs.prompt('Nuevo fichero', 'phases/01-captura.md', 'Ruta relativa dentro de la skill:');
      if (!p) return;
      const clean = cleanPath(p);
      if (cur.files.has(clean)) { dialogs.alert('Ya existe', `La skill ya tiene un fichero <code>${esc(clean)}</code>.`); return; }
      cur.files.set(cur.active, textarea.value);
      cur.files.set(clean, `# ${clean}\n\n`);
      cur.active = clean;
      textarea.value = cur.files.get(clean);
      markDirty();
      renderFileTabs();
    });
    fileTabs.appendChild(add);
  };

  textarea.addEventListener('input', () => {
    if (!cur) return;
    cur.files.set(cur.active, textarea.value);
    if (!cur.dirty) markDirty();
  });

  const newSkill = async () => {
    const id = await dialogs.prompt('Nueva skill', 'knowledge-faq', 'Identificador en kebab-case (será la carpeta y el nombre técnico):');
    if (!id) return;
    const clean = cleanSkillId(id);
    if (!clean) { dialogs.alert('Identificador inválido', 'Usa solo letras, números y guiones (p. ej. <code>knowledge-faq</code>).'); return; }
    openFiles(clean, [{ path: 'SKILL.md', content: SKILL_TEMPLATE(clean) }], { isDraft: true });
    cur.dirty = true;
    setState('borrador nuevo (sin guardar)', true);
  };

  const curFiles = () => { cur.files.set(cur.active, textarea.value); return filesList(cur.files); };

  deleteBtn.addEventListener('click', async () => {
    if (!cur) return;
    try {
      if (cur.isDraft) {
        if (!await dialogs.confirm('Eliminar borrador', `Se eliminará el borrador <code>${esc(cur.id)}</code>. Es solo local: no afecta al catálogo publicado del equipo.`, 'Eliminar')) return;
        await api(`/drafts/${encodeURIComponent(cur.id)}`, { method: 'DELETE' });
      } else {
        if (!await dialogs.confirm('Eliminar skill publicada', `<strong>${esc(cur.id)}</strong> desaparecerá del catálogo de <strong>todo el equipo</strong> (paleta incluida) y se borrará de la base central. Esta acción es irreversible.`, 'Eliminar para todos')) return;
        await api(`/skills/${encodeURIComponent(cur.id)}`, { method: 'DELETE' });
      }
      cur = null;
      showCatalog();
    } catch (err) { dialogs.alert('No se pudo eliminar', esc(err.message)); }
  });

  saveBtn.addEventListener('click', async () => {
    if (!cur) return;
    try {
      await api(`/drafts/${encodeURIComponent(cur.id)}`, { method: 'PUT', body: { files: curFiles() } });
      cur.dirty = false; cur.isDraft = true;
      setState('borrador guardado');
    } catch (err) { dialogs.alert('No se pudo guardar', esc(err.message)); }
  });

  publishBtn.addEventListener('click', async () => {
    if (!cur || cur.readOnly) return;
    const scope = scopeSel.querySelector('[name="scope"]').value || null;
    const files = curFiles();
    const resume = files.map((f) => ` • ${f.path} (${f.content.length} chars)`).join('\n');
    const visib = scope ? `proyecto «${groupName(groups, scope)}»` : 'COMÚN (todo el equipo)';
    if (!await dialogs.confirm(`Publicar «${cur.id}»`, `Visibilidad: <strong>${esc(visib)}</strong>. Llegará a quien corresponda en su siguiente chat.<pre>${esc(resume)}</pre>`, 'Publicar')) return;
    try {
      await api('/skills/publish', { method: 'POST', body: { id: cur.id, files, scope } });
      if (cur.isDraft) await api(`/drafts/${encodeURIComponent(cur.id)}`, { method: 'DELETE' }).catch(() => {});
      cur.dirty = false; cur.isDraft = false; cur.scope = scope;
      setState('publicada ✓');
    } catch (err) { dialogs.alert('No se pudo publicar', esc(err.message)); }
  });

  return { refresh };
};
