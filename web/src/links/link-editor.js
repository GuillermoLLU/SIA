// El formulario de un enlace (crear o editar) y sus notas. El formulario sale en la columna
// de enlaces de Configuración cuando ocupa todo el ancho (links-directory.js): solo los datos
// de ese enlace. Las reglas, en links.js.
import { esc } from '../ui/html.js';
import { pickerHtml, pickClick } from '../ui/picker.js';
import { miniMarkdown, linkPayload, shrinkTo, dataUriKb } from './links.js';

// onChange(): se ha creado, editado o borrado un enlace
export const mountLinkEditor = ({ api, dialogs, settings, onChange }) => {
  const $ = (id) => document.getElementById(id);

  /* ── Notas ── */
  const notesModal = $('link-notes-modal');
  const openNotes = (l) => {
    $('link-notes-title').textContent = l.title;
    $('link-notes-body').innerHTML = `<p>${miniMarkdown(l.notes)}</p>`;
    notesModal.hidden = false;
  };
  $('link-notes-close').addEventListener('click', () => { notesModal.hidden = true; });
  notesModal.addEventListener('mousedown', (e) => { if (e.target === notesModal) notesModal.hidden = true; });

  /* ── Alta / edición ── */
  const form = $('link-edit');
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
  const open = (l, projects) => {
    editing = l;
    image = l?.image || null;
    fImageInput.value = '';
    fProject.innerHTML = pickerHtml({ id: 'link-f-project-btn', name: 'project', placeholder: 'Elige el conocimiento', value: String(l?.project_id ?? projects[0]?.id ?? ''),
      groups: [{ options: projects.map((p) => ({ value: String(p.id), label: p.name })) }] });
    fTitle.value = l?.title || '';
    fUrl.value = l?.url || '';
    fNotes.value = l?.notes || '';
    fErr.hidden = true;
    fDelete.hidden = !l;
    paintImage();
    settings.showSide(true);
  };
  const close = () => settings.showSide(false);
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
  $('link-f-cancel').addEventListener('click', close);
  form.addEventListener('click', (e) => pickClick(form, e.target));

  $('link-f-save').addEventListener('click', async () => {
    const payload = linkPayload({ project: fProject.querySelector('[name="project"]').value, title: fTitle.value, url: fUrl.value, image, notes: fNotes.value });
    try {
      if (editing) await api(`/links/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: payload });
      else await api('/links', { method: 'POST', body: payload });
      close();
      onChange();
    } catch (e) { showError(e.message); }
  });
  fDelete.addEventListener('click', async () => {
    if (!editing) return;
    if (!await dialogs.confirm('Eliminar enlace', `Se eliminará <strong>${esc(editing.title)}</strong> para todo el equipo. No se puede deshacer.`, 'Eliminar')) return;
    try { await api(`/links/${encodeURIComponent(editing.id)}`, { method: 'DELETE' }); close(); onChange(); }
    catch (e) { showError(e.message); }
  });

  return { open, openNotes };
};
