// La barra de pestañas del chat: cada sesión tiene su pestaña (punto de
// estado, nombre, X) y con doble clic se abre el editor de nombre y color.
// Nombre y color se mandan al bridge (onMeta) y persisten entre recargas.
import { defaultLabel } from './sessions.js';

const TAB_COLORS = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#89b4fa', '#cba6f7', '#f5c2e7'];

// onPick(s): activar · onClose(s): cerrar · onMeta(s): nombre o color cambiados
export const createTabBar = ({ onPick, onClose, onMeta }) => {
  const $ = (id) => document.getElementById(id);
  const tabsEl = $('tabs'), spacer = tabsEl.querySelector('.tabs-spacer');
  const editor = $('tab-editor'), nameInput = $('tab-name-input'), colorsEl = $('tab-colors');
  let editing = null; // la sesión abierta en el editor

  const applyColor = (s) => {
    if (s.color) { s.tab.classList.add('colored'); s.tab.style.setProperty('--tab-color', s.color); }
    else { s.tab.classList.remove('colored'); s.tab.style.removeProperty('--tab-color'); }
  };
  const setLabel = (s, label) => { s.label = label; s.tab.querySelector('.tab-label').textContent = label; };
  const setStatus = (s, status) => {
    s.status = status;
    s.dot.className = `tab-dot ${status === 'ok' ? 'ok' : status === 'off' ? 'off' : ''}`;
  };

  const add = (s) => {
    const tab = document.createElement('button');
    tab.className = 'tab';
    const dot = document.createElement('span');
    dot.className = 'tab-dot';
    const name = document.createElement('span');
    name.className = 'tab-label';
    name.textContent = s.label;
    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Cerrar';
    tab.append(dot, name, close);
    tabsEl.insertBefore(tab, spacer);
    s.tab = tab;
    s.dot = dot;
    tab.addEventListener('click', () => onPick(s));
    tab.addEventListener('dblclick', (e) => { e.stopPropagation(); openEditor(s); });
    close.addEventListener('click', (e) => { e.stopPropagation(); onClose(s); });
    applyColor(s);
  };

  // editor: nombre y color
  const markColor = (color) => colorsEl.querySelectorAll('.swatch').forEach((sw) => sw.classList.toggle('active', (sw.dataset.color || '') === (color || '')));
  const none = document.createElement('span');
  none.className = 'swatch none'; none.dataset.color = ''; none.title = 'Sin color';
  colorsEl.appendChild(none);
  for (const c of TAB_COLORS) {
    const sw = document.createElement('span');
    sw.className = 'swatch'; sw.style.background = c; sw.dataset.color = c;
    colorsEl.appendChild(sw);
  }
  colorsEl.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw || !editing) return;
    editing.color = sw.dataset.color || null;
    applyColor(editing);
    markColor(editing.color);
    onMeta(editing);
  });
  const openEditor = (s) => {
    editing = s;
    const r = s.tab.getBoundingClientRect();
    editor.style.left = `${Math.round(r.left)}px`;
    editor.style.top = `${Math.round(r.bottom + 6)}px`;
    nameInput.value = s.label;
    markColor(s.color);
    editor.hidden = false;
    nameInput.focus();
    nameInput.select();
  };
  const closeEditor = () => { editor.hidden = true; editing = null; };
  nameInput.addEventListener('input', () => {
    if (!editing) return;
    setLabel(editing, nameInput.value.trim() || defaultLabel(editing.id));
    editing.renamed = true;
    onMeta(editing);
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') closeEditor(); });
  // mousedown (no click): solo cuenta dónde empezó la pulsación, así que
  // seleccionar texto del campo y soltar fuera no cierra el editor
  document.addEventListener('mousedown', (e) => {
    if (!editor.hidden && !editor.contains(e.target) && !e.target.closest('.tab')) closeEditor();
  });

  return { tabsEl, add, applyColor, setLabel, setStatus, remove: (s) => s.tab.remove() };
};
