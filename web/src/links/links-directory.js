// Los enlaces en Configuración: una columna a la derecha del modal, como una guía telefónica,
// para quien tenga la vista de enlaces. Pulsar uno lo abre. Con permiso para editar, cada uno
// lleva su lápiz y arriba del todo está «Añadir enlace»: la columna ocupa entonces todo el ancho del
// modal y enseña solo ese enlace (link-editor.js).
import { esc, firstLetter, svg } from '../ui/html.js';
import { projectName } from './links.js';
import { mountLinkEditor } from './link-editor.js';

const EDIT_ICON = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', { size: 15 });
const NOTES_ICON = svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', { size: 15 });

export const mountLinksDirectory = ({ api, dialogs, settings }) => {
  const box = document.getElementById('settings-links');
  const list = box.querySelector('.dir-list');
  const refreshBtn = box.querySelector('.dir-refresh');
  let canEdit = false;
  let projects = [];
  let links = [];
  let failure = null;

  const row = (l, i) => {
    const img = l.image
      ? `<img class="dir-img" src="${esc(l.image)}" alt="" />`
      : `<span class="dir-img">${esc(firstLetter(l.title))}</span>`;
    const notes = l.notes?.trim() ? `<button type="button" class="modal-close dir-act" data-act="notes" data-i="${i}" title="Ver notas" aria-label="Ver notas de ${esc(l.title)}">${NOTES_ICON}</button>` : '';
    const edit = canEdit ? `<button type="button" class="modal-close dir-act" data-act="edit" data-i="${i}" title="Editar" aria-label="Editar ${esc(l.title)}">${EDIT_ICON}</button>` : '';
    return `<li class="dir-item"><button type="button" class="dir-row" data-act="go" data-i="${i}" title="${esc(l.url)}">${img}<span class="dir-text"><span class="dir-title">${esc(l.title)}</span><span class="dir-project">${esc(projectName(projects, l.project_id))}</span></span></button>${notes}${edit}</li>`;
  };
  const paint = () => {
    if (failure) { list.innerHTML = `<li class="dir-empty">No se pudieron cargar: ${esc(failure)}</li>`; return; }
    const rows = links.map(row).join('') || '<li class="dir-empty">Sin enlaces.</li>';
    const add = canEdit && projects.length ? '<li><button type="button" class="dir-add" data-act="add"><span>+</span> Añadir enlace</button></li>' : '';
    list.innerHTML = add + rows;
  };
  const refresh = async () => {
    try {
      [projects, links] = await Promise.all([api('/access/projects'), api('/links')]);
      failure = null;
    } catch (e) { failure = e.message; }
    paint();
  };
  const editor = mountLinkEditor({ api, dialogs, settings, onChange: refresh });

  list.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const l = links[Number(t.dataset.i)];
    if (t.dataset.act === 'go') window.open(l.url, '_blank', 'noopener');
    if (t.dataset.act === 'notes') editor.openNotes(l);
    if (t.dataset.act === 'edit') editor.open(l, projects);
    if (t.dataset.act === 'add') editor.open(null, projects);
  });
  // Los enlaces son del equipo: por si un compañero acaba de cambiar alguno
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    try { await refresh(); }
    finally { refreshBtn.disabled = false; refreshBtn.classList.remove('loading'); }
  });
  settings.onOpen(() => { if (!box.hidden) refresh(); });
  return {
    show: (on, edit = false) => {
      const appears = on && box.hidden; // p. ej. llegan los permisos con Configuración ya abierta
      box.hidden = !on;
      if (edit !== canEdit) { canEdit = edit; paint(); }
      if (!edit) settings.showSide(false);
      if (appears) refresh();
    },
  };
};
