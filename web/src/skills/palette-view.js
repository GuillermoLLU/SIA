// La paleta de skills (⌘K / Ctrl+K): busca entre las skills de la base de
// conocimiento y aplica una al chat activo; abajo, «no sé cuál» lanza
// skill-finder con lo que se describa. Las reglas, en palette.js.
import { esc } from '../ui/html.js';
import { filterSkills, clampIndex, skillOrder, finderOrder } from './palette.js';

// chat: la vista del Chat (active(), sendOrder(text))
export const mountPalette = ({ chat }) => {
  const $ = (id) => document.getElementById(id);
  const palette = $('skills-palette'), input = $('palette-input'), list = $('palette-list'), finder = $('palette-finder');
  let skills = [];   // las de la base de conocimiento, las que enseña la paleta
  let items = [];    // las que casan con lo escrito
  let index = 0;

  const close = () => { palette.hidden = true; };
  const apply = (sk) => { if (chat.sendOrder(skillOrder(sk.id))) close(); };
  const applyFinder = (desc) => { if (desc.trim() && chat.sendOrder(finderOrder(desc))) close(); };

  const render = () => {
    items = filterSkills(skills, input.value);
    index = clampIndex(index, items.length);
    list.innerHTML = '';
    const s = chat.active();
    if (!s?.launched) { list.innerHTML = '<li class="palette-empty">Abre un chat primero para poder aplicar una skill.</li>'; return; }
    if (!skills.length) { list.innerHTML = '<li class="palette-empty">No hay skills en workspace/skills/</li>'; return; }
    if (!items.length) { list.innerHTML = `<li class="palette-empty">Sin resultados para «${esc(input.value.trim())}»</li>`; return; }
    items.forEach((sk, i) => {
      const li = document.createElement('li');
      if (i === index) li.classList.add('selected');
      li.innerHTML = `
        <span class="palette-row">
          <span class="skill-name">${esc(sk.label)}</span>
          ${sk.category ? `<span class="skill-cat">${esc(sk.category)}</span>` : ''}
        </span>
        <span class="skill-desc">${esc(sk.description)}</span>`;
      li.addEventListener('click', () => apply(sk));
      li.addEventListener('mousemove', () => { if (index !== i) { index = i; render(); } });
      list.appendChild(li);
    });
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    index = 0;
    input.value = '';
    finder.value = '';
    render();
    palette.hidden = false;
    input.focus();
  };
  const toggle = () => (palette.hidden ? open() : close());

  finder.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyFinder(finder.value); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  $('skills-btn').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  palette.addEventListener('mousedown', (e) => { if (e.target === palette) close(); }); // clic en el fondo
  input.addEventListener('input', () => { index = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = clampIndex(index + 1, items.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = clampIndex(index - 1, items.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[index]) apply(items[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  // ⌘K / Ctrl+K desde cualquier sitio: en captura, para ganar a la terminal
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);

  return { toggle, setSkills: (list) => { skills = list; } };
};
