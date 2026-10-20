// Enlaces rápidos: accesos del equipo agrupados por conocimiento. Verlos puede
// cualquiera (acotado a los proyectos que dan sus tokens); crearlos, editarlos
// y borrarlos exige el permiso links de la clave de poder. La card ENTERA es
// el enlace: al pulsarla se abre en el navegador del sistema. Las notas tienen
// su propio icono para no robarle ese gesto. Las reglas, en links.js.
import { esc, svg } from '../ui/html.js';
import { emptyState } from '../ui/dom.js';
import { projectName, linkFilters, miniMarkdown, linkPayload, shrinkTo, dataUriKb } from './links.js';

const LINKS_ICON = svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', { width: 1.5, size: 38 });
const NOTES_ICON = svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', { size: 15 });
const EDIT_ICON = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', { size: 15 });

// perms(): lo que abre la clave de poder (links: editar)
export const mountLinksView = ({ api, dialogs, perms }) => {
  const $ = (id) => document.getElementById(id);
  const grid = $('links-grid'), filters = $('links-filters');
  let all = [];        // enlaces devueltos por el bridge
  let projects = [];   // proyectos accesibles con el token del usuario
  let filter = null;   // id de proyecto, o null = todos

  const render = () => {
    const canEdit = !!perms()?.links;
    // card de crear (solo con permiso de editar enlaces): como en las skills, la
    // primera de la rejilla, o sola bajo el mensaje si aún no hay ningún enlace
    const newCard = () => {
      const b = document.createElement('button');
      b.className = 'link-card new';
      b.innerHTML = '<span class="plus">+</span><span>Nuevo enlace</span>';
      b.addEventListener('click', () => openEditor());
      return b;
    };
    const f = linkFilters(projects, all, filter);
    filter = f.filter;
    filters.innerHTML = '';
    for (const c of f.chips) {
      const b = document.createElement('button');
      b.className = `links-chip${filter === c.value ? ' active' : ''}`;
      b.innerHTML = `${esc(c.label)}<span class="links-chip-n">${c.n}</span>`;
      b.addEventListener('click', () => { filter = c.value; render(); });
      filters.appendChild(b);
    }
    grid.innerHTML = '';
    if (!projects.length) { grid.appendChild(emptyState(LINKS_ICON, 'Aún no tienes ningún proyecto: pídeselo a quien gestiona Personas.')); return; } // los da quien gestiona Personas
    if (!f.list.length) { grid.appendChild(emptyState(LINKS_ICON, 'No tienes aún ningún enlace definido.', canEdit ? newCard() : null)); return; }
    if (canEdit) grid.appendChild(newCard());
    for (const l of f.list) {
      const card = document.createElement('button');
      card.className = 'link-card';
      card.title = l.url;
      // título arriba, imagen grande debajo. La URL no se pinta: no aporta y
      // chocaba con la etiqueta del conocimiento — para verla está el title.
      const img = l.image
        ? `<img class="link-card-img" src="${esc(l.image)}" alt="" />`
        : `<span class="link-card-img placeholder">${esc((l.title || '?').trim().charAt(0).toUpperCase())}</span>`;
      card.innerHTML = `
        <span class="link-card-title">${esc(l.title)}</span>
        ${img}
        <span class="link-card-tag">${esc(projectName(projects, l.project_id))}</span>`;
      // pulsar la card = abrir el enlace (setWindowOpenHandler lo desvía al navegador)
      card.addEventListener('click', () => window.open(l.url, '_blank', 'noopener'));
      const actions = document.createElement('span');
      actions.className = 'link-card-actions';
      const action = (title, icon, onClick) => {
        const b = document.createElement('span');
        b.className = 'link-card-act';
        b.title = title;
        b.innerHTML = icon;
        b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        actions.appendChild(b);
      };
      if (l.notes && l.notes.trim()) action('Ver notas', NOTES_ICON, () => openNotes(l));
      if (canEdit) action('Editar', EDIT_ICON, () => openEditor(l));
      if (actions.childElementCount) card.appendChild(actions);
      grid.appendChild(card);
    }
  };

  const refresh = async () => {
    try {
      [projects, all] = await Promise.all([api('/access/projects'), api('/links')]);
      render();
    } catch (e) {
      grid.innerHTML = `<p class="links-empty">No se pudieron cargar los enlaces: ${esc(e.message)}</p>`;
    }
  };

  /* ── Notas ── */
  const notesModal = $('link-notes-modal');
  const openNotes = (l) => {
    $('link-notes-title').textContent = l.title;
    $('link-notes-body').innerHTML = `<p>${miniMarkdown(l.notes)}</p>`;
    notesModal.hidden = false;
  };
  $('link-notes-close').addEventListener('click', () => { notesModal.hidden = true; });
  notesModal.addEventListener('click', (e) => { if (e.target === notesModal) notesModal.hidden = true; });

  /* ── Alta / edición ── */
  const editModal = $('link-edit-modal');
  const fProject = $('link-f-project'), fTitle = $('link-f-title'), fUrl = $('link-f-url'), fNotes = $('link-f-notes');
  const fImageInput = $('link-f-image'), fImagePrev = $('link-f-image-prev'), fImageInfo = $('link-f-image-info'), fImageClear = $('link-f-image-clear');
  const fErr = $('link-f-err'), fDelete = $('link-f-delete');
  let editing = null;  // enlace en edición, o null si es alta
  let image = null;    // data URI pendiente de guardar

  const paintImage = () => {
    fImagePrev.innerHTML = image ? `<img src="${esc(image)}" alt="" />` : '';
    fImageClear.hidden = !image;
    fImageInfo.textContent = image ? `${dataUriKb(image)} KB` : '';
  };
  const openEditor = (l = null) => {
    editing = l;
    image = l?.image || null;
    $('link-edit-title').textContent = l ? 'Editar enlace' : 'Nuevo enlace';
    fProject.innerHTML = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    fProject.value = String(l?.project_id ?? (filter ?? projects[0]?.id ?? ''));
    fTitle.value = l?.title || '';
    fUrl.value = l?.url || '';
    fNotes.value = l?.notes || '';
    fErr.hidden = true;
    fDelete.hidden = !l;
    paintImage();
    editModal.hidden = false;
    setTimeout(() => fTitle.focus(), 30);
  };
  const closeEditor = () => { editModal.hidden = true; editing = null; image = null; fImageInput.value = ''; };
  const showError = (text) => { fErr.textContent = text; fErr.hidden = false; };

  /* La imagen se redimensiona AQUÍ, antes de guardarla: viaja dentro del
     listado, así que una foto de 5 MB se descargaría entera cada vez que
     alguien abre el panel. Escalada, el usuario puede elegir el fichero que
     quiera sin toparse nunca con un límite. */
  const shrinkImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('no se pudo leer el fichero'));
    reader.onload = () => {
      const raw = String(reader.result);
      const img = new Image();
      // si algo falla (SVG sin dimensiones, formato raro) se guarda tal cual y
      // que decida el servidor: mejor eso que dejar al usuario sin imagen
      img.onerror = () => resolve(raw);
      img.onload = () => {
        try {
          const { w, h } = shrinkTo(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          // webp mantiene transparencia y pesa poco; si no está disponible el
          // navegador devuelve png, que también vale
          const out = canvas.toDataURL('image/webp', 0.85);
          resolve(out.length < raw.length ? out : raw);
        } catch { resolve(raw); }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });

  $('link-f-image-pick').addEventListener('click', () => fImageInput.click());
  fImageClear.addEventListener('click', () => { image = null; fImageInput.value = ''; paintImage(); });
  fImageInput.addEventListener('change', async () => {
    const file = fImageInput.files?.[0];
    if (!file) return;
    fImageInfo.textContent = 'ajustando…';
    try { image = await shrinkImage(file); paintImage(); }
    catch (e) { fImageInfo.textContent = e.message; }
  });
  $('link-edit-close').addEventListener('click', closeEditor);
  $('link-f-cancel').addEventListener('click', closeEditor);
  editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditor(); });

  $('link-f-save').addEventListener('click', async () => {
    const payload = linkPayload({ project: fProject.value, title: fTitle.value, url: fUrl.value, image, notes: fNotes.value });
    try {
      if (editing) await api(`/links/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: payload });
      else await api('/links', { method: 'POST', body: payload });
      closeEditor();
      refresh();
    } catch (e) { showError(e.message); }
  });
  fDelete.addEventListener('click', async () => {
    if (!editing) return;
    if (!await dialogs.confirm('Eliminar enlace', `Se eliminará <strong>${esc(editing.title)}</strong> para todo el equipo. No se puede deshacer.`, 'Eliminar')) return;
    try { await api(`/links/${encodeURIComponent(editing.id)}`, { method: 'DELETE' }); closeEditor(); refresh(); }
    catch (e) { showError(e.message); }
  });

  // Actualizar a mano, como en el Laboratorio: por si un compañero acaba de
  // añadir un enlace o te han dado acceso a otro conocimiento.
  const refreshBtn = $('links-refresh');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    try { await refresh(); }
    finally { refreshBtn.disabled = false; refreshBtn.classList.remove('loading'); }
  });

  return { refresh };
};
