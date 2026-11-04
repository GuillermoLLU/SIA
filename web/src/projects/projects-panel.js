// Configuración → Administración: los proyectos de la base. Crear y eliminar;
// a quién se habilita cada uno se decide en Personas, y su contenido se consulta
// y se nutre desde el Chat. Su caja solo sale con la Administración abierta
// (main.js), y la lista se pide al entrar, no al arrancar.
import { esc, TRASH_ICON } from '../ui/html.js';
import { setStatus } from '../ui/dom.js';

const entriesLabel = (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`;

export const mountProjectsPanel = ({ api, dialogs, toast, settings }) => {
  const $ = (id) => document.getElementById(id);
  const list = $('project-list'), name = $('project-name'), add = $('project-add'), status = $('project-status');
  const box = document.querySelector('#settings-home [data-pane="administracion"]');

  const paint = (projects) => {
    list.innerHTML = projects.length ? projects.map((p) => `<li data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-entries="${esc(p.entries)}">
      <span class="project-name">${esc(p.name)}</span><span class="project-count">${entriesLabel(p.entries)}</span>
      <button type="button" class="icon-btn danger" data-remove title="Eliminar proyecto" aria-label="Eliminar proyecto">${TRASH_ICON}</button></li>`).join('')
      : '<li class="token-empty">Aún no hay proyectos.</li>';
  };
  const refresh = async () => {
    try { paint(await api('/admin/projects')); }
    catch (err) { setStatus(status, `no se pudieron cargar: ${err.message}`, 'bad'); }
  };
  const create = async () => {
    setStatus(status, '');
    try {
      const p = await api('/admin/projects', { method: 'POST', body: { name: name.value } });
      name.value = '';
      await refresh();
      toast(`Proyecto «${p.name}» creado`);
    } catch (err) { setStatus(status, err.message, 'bad'); }
  };
  const remove = async ({ id, name: label, entries }) => {
    if (!await dialogs.confirm('Eliminar proyecto', `Se eliminará <strong>${esc(label)}</strong> con sus ${entriesLabel(Number(entries))}, sus enlaces y sus skills, y nadie podrá verlo. Irreversible.`, 'Eliminar')) return;
    setStatus(status, '');
    try { await api(`/admin/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh(); }
    catch (err) { setStatus(status, `no se pudo eliminar: ${err.message}`, 'bad'); }
  };

  add.addEventListener('click', create);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  list.addEventListener('click', (e) => { if (e.target.closest('[data-remove]')) remove(e.target.closest('li').dataset); });
  box.addEventListener('click', refresh);
  settings.onOpen(() => setStatus(status, ''));
};
