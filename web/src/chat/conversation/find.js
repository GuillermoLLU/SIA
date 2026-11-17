// Buscar en la conversación (⌘F / Ctrl+F): una barra flotante arriba a la
// derecha con lo que buscas, cuántas veces aparece y flechas para ir de una a
// otra (Enter / Shift+Enter). Las coincidencias se marcan con la API de
// highlights de CSS (::highlight), sin tocar el DOM del hilo, que la vista
// repinta por su cuenta: cuando lo hace, se vuelve a buscar (refresh).

// posiciones de `query` en `text`, sin distinguir mayúsculas
export const offsetsOf = (text, query) => {
  const out = [];
  if (!query) return out;
  let t = text.toLowerCase();
  let q = query.toLowerCase();
  if (t.length !== text.length || q.length !== query.length) { t = text; q = query; } // hay letras que cambian de largo en minúsculas (İ): entonces, tal cual
  let i = t.indexOf(q);
  while (i !== -1) { out.push(i); i = t.indexOf(q, i + q.length); }
  return out;
};

// se busca en la conversación: ni en lo que mandan las herramientas ni en lo
// que devuelven (.cv-detail, .cv-result), que son bloques enormes
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
const textNodes = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (SKIP.has(n.parentNode?.nodeName) || n.parentNode?.closest?.('.cv-empty, .cv-find, .cv-detail, .cv-result') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
  return out;
};

const ARROW = (d) => `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

// host: dónde va la barra (position: relative); scroller: lo que se busca y se desplaza
export const createFind = ({ host, scroller, onClose = () => {} }) => {
  const bar = document.createElement('div');
  bar.className = 'cv-find';
  bar.hidden = true;
  bar.innerHTML = `<input type="search" placeholder="Buscar en el chat" spellcheck="false" autocomplete="off" aria-label="Buscar en la conversación"><span class="cv-find-n"></span>
    <button type="button" data-go="-1" title="Anterior (Shift+Enter)" aria-label="Anterior">${ARROW('m6 15 6-6 6 6')}</button>
    <button type="button" data-go="1" title="Siguiente (Enter)" aria-label="Siguiente">${ARROW('m6 9 6 6 6-6')}</button>
    <button type="button" data-x title="Cerrar (Esc)" aria-label="Cerrar">${ARROW('M18 6 6 18M6 6l12 12')}</button>`;
  host.appendChild(bar);
  const input = bar.querySelector('input');
  const count = bar.querySelector('.cv-find-n');
  const marks = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  let ranges = [];
  let cur = -1;

  const paintMarks = () => {
    if (!marks) return;
    CSS.highlights.set('cv-find', new Highlight(...ranges));
    CSS.highlights.set('cv-find-cur', new Highlight(...(ranges[cur] ? [ranges[cur]] : [])));
  };
  const clearMarks = () => { if (marks) { CSS.highlights.delete('cv-find'); CSS.highlights.delete('cv-find-cur'); } };
  const paintCount = () => {
    const q = input.value;
    count.textContent = !q ? '' : ranges.length ? `${cur + 1}/${ranges.length}` : 'Nada';
    count.classList.toggle('none', !!q && !ranges.length);
  };
  const collect = () => {
    const q = input.value;
    ranges = [];
    if (!q) return;
    for (const n of textNodes(scroller)) {
      for (const o of offsetsOf(n.data, q)) {
        const r = new Range();
        r.setStart(n, o);
        r.setEnd(n, o + q.length);
        ranges.push(r);
      }
    }
  };
  // ir a la coincidencia i (circular): se abre lo que la tape (details) y se
  // desplaza para que quede a la vista
  const goTo = (i) => {
    if (!ranges.length) { cur = -1; paintCount(); paintMarks(); return; }
    cur = ((i % ranges.length) + ranges.length) % ranges.length;
    const r = ranges[cur];
    for (let d = r.startContainer.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    const box = r.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    if (box.top < s.top + 48 || box.bottom > s.bottom - 48) scroller.scrollTop += box.top - s.top - s.height / 2;
    paintCount();
    paintMarks();
  };
  // al escribir: la primera coincidencia que esté a la vista o más abajo (no
  // vuelve al principio del hilo cada vez)
  const search = () => {
    collect();
    const top = scroller.getBoundingClientRect().top;
    const i = ranges.findIndex((r) => r.getBoundingClientRect().bottom >= top);
    goTo(i === -1 ? 0 : i);
  };
  const open = () => {
    const was = bar.hidden;
    bar.hidden = false;
    const sel = document.getSelection();
    const picked = sel && !sel.isCollapsed && scroller.contains(sel.anchorNode) ? sel.toString().trim() : '';
    if (picked && !picked.includes('\n')) input.value = picked.slice(0, 200);
    input.focus();
    input.select();
    if (was || picked) search();
  };
  const close = () => {
    if (bar.hidden) return;
    bar.hidden = true;
    ranges = [];
    cur = -1;
    clearMarks();
    onClose();
  };

  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goTo(cur + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  for (const b of bar.querySelectorAll('[data-go]')) b.addEventListener('click', () => { goTo(cur + Number(b.dataset.go)); input.focus(); });
  bar.querySelector('[data-x]').addEventListener('click', close);

  return {
    open,
    close,
    // el hilo se ha repintado: mismas posiciones, nuevos nodos
    refresh: () => {
      if (bar.hidden || !input.value) return;
      collect();
      cur = ranges.length ? Math.min(Math.max(cur, 0), ranges.length - 1) : -1;
      paintCount();
      paintMarks();
    },
  };
};
