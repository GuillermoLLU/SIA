// La caja de escribir de la conversación: el texto arriba (crece con lo
// escrito; Enter envía, Shift+Enter es salto de línea; Esc dos veces la
// vacía) y, debajo, «+» (adjuntar una imagen o un fichero, usar una skill) y
// Enviar, que mientras Copilot trabaja es Detener. Los adjuntos van como
// fichas encima del texto, con su miniatura, y al enviar viajan como sus rutas
// (compose.js: withFiles).
//
// deps: host (donde se monta) · onSend(text) · onStop() · onAttach() (elegir
//   un fichero; null si aquí no se puede) · onSkills() (la paleta ⌘K; null si
//   no) · agent (a quién se escribe)
import { messageOf, sends, escapes, escTwice, appendText, withFiles, fileExt } from './compose.js';
import { esc } from '../../ui/html.js';

const MAX_ROWS_PX = 200;
const SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
const SKILL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';

const placeholderOf = (agent) => `Escribe a ${agent}…`;
const ASKING_PLACEHOLDER = 'Elige una opción o escribe aquí tu respuesta…';
export const createComposer = ({ host, onSend, onStop, onAttach = null, onSkills = null, agent = 'Copilot' }) => {
  const PLACEHOLDER = placeholderOf(agent);
  const el = document.createElement('form');
  el.className = 'composer';
  el.innerHTML = `<div class="cp-files" hidden></div>
    <textarea rows="1" placeholder="${PLACEHOLDER}" aria-label="Mensaje para ${agent}" enterkeyhint="send"></textarea>
    <div class="cp-bar">
      <div class="cp-more"${onAttach || onSkills ? '' : ' hidden'}>
        <button type="button" class="cp-plus" aria-label="Más" title="Adjuntar o usar una skill" aria-haspopup="menu" aria-expanded="false">${PLUS}</button>
        <div class="cp-menu" role="menu" hidden>
          ${onAttach ? `<button type="button" role="menuitem" data-attach>${CLIP}<span>Adjuntar imagen o archivo</span></button>` : ''}
          ${onSkills ? `<button type="button" role="menuitem" data-skills>${SKILL}<span>Usar una skill</span><kbd>⌘K</kbd></button>` : ''}
        </div>
      </div>
      <span class="cp-space"></span>
      <button type="button" class="cp-stop" aria-label="Detener" title="Detener (Esc)" hidden>${STOP}</button>
      <button type="submit" class="cp-send" aria-label="Enviar" title="Enviar (Enter)">${SEND}</button>
    </div>`;
  host.appendChild(el);
  const box = el.querySelector('textarea');
  const sendBtn = el.querySelector('.cp-send');
  const filesEl = el.querySelector('.cp-files');
  const plus = el.querySelector('.cp-plus');
  const menu = el.querySelector('.cp-menu');
  let files = []; // los adjuntos de lo que se está escribiendo: { name, absPath, url, isImage }
  let off = false;  // el chat ha terminado: no se escribe más
  let busy = false; // Copilot trabaja: Detener en vez de Enviar (y Enviar, si hay algo escrito, para colarlo)

  // crece con lo escrito; vacía, una línea. Solo se mide si se ve: oculta
  // (otro chat delante) no tiene ancho y lo escrito se partiría en mil líneas
  const fit = () => {
    const something = !!messageOf(box.value) || files.length > 0;
    sendBtn.disabled = off || !something;
    sendBtn.hidden = busy && !something;
    el.querySelector('.cp-stop').hidden = !busy;
    if (!box.value) { box.style.height = ''; return; }
    if (!box.offsetWidth) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, MAX_ROWS_PX)}px`;
  };
  // las fichas de los adjuntos: la miniatura (o su extensión) y quitarlo
  const paintFiles = () => {
    filesEl.hidden = !files.length;
    filesEl.innerHTML = files.map((f, i) => `<span class="cp-file" title="${esc(f.name)}">${f.isImage ? `<img src="${esc(f.url)}" alt="">` : `<i class="cp-file-ico">${esc(fileExt(f.name))}</i>`}<span class="cp-file-name">${esc(f.name.replace(/^\d+-/, ''))}</span><button type="button" data-rm="${i}" aria-label="Quitar">×</button></span>`).join('');
    fit();
  };
  filesEl.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    files.splice(Number(rm.dataset.rm), 1);
    paintFiles();
    box.focus();
  });
  const send = () => {
    const text = messageOf(box.value);
    if (off || (!text && !files.length)) return;
    onSend(withFiles(text, files.map((f) => f.absPath)));
    box.value = '';
    files = [];
    paintFiles();
  };
  el.addEventListener('submit', (e) => { e.preventDefault(); send(); });

  // el menú del «+»: se abre encima del botón y se cierra al elegir, al pulsar fuera o con Esc
  const openMenu = (on) => { menu.hidden = !on; plus.setAttribute('aria-expanded', String(on)); };
  plus.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu.hidden); });
  menu.querySelector('[data-attach]')?.addEventListener('click', () => { openMenu(false); onAttach(); });
  menu.querySelector('[data-skills]')?.addEventListener('click', () => { openMenu(false); onSkills(); });
  const onClickAway = (e) => { if (!menu.hidden && !el.querySelector('.cp-more').contains(e.target)) openMenu(false); };
  document.addEventListener('click', onClickAway);

  // Esc, Esc: se vacía la caja (texto y adjuntos); con el menú abierto, Esc lo cierra
  let escAt = null;
  const clear = () => { box.value = ''; files = []; paintFiles(); };
  box.addEventListener('keydown', (e) => {
    if (sends(e)) { e.preventDefault(); send(); return; }
    if (!escapes(e)) return;
    if (!menu.hidden) { openMenu(false); return; }
    if (escTwice(escAt, Date.now())) { escAt = null; if (box.value || files.length) clear(); return; }
    escAt = Date.now();
  });
  box.addEventListener('input', fit);
  box.addEventListener('focus', fit);
  el.querySelector('.cp-stop').addEventListener('click', onStop);
  fit();

  return {
    insert: (text) => { box.value = appendText(box.value, text); fit(); box.focus(); },
    // un adjunto ya subido: su ficha en la caja
    attachFile: (f) => { files.push(f); paintFiles(); box.focus(); },
    // lo escrito y sus adjuntos, para llevarlo a otra caja (la vista se vuelve
    // a montar al re-engancharse el chat); y ponerlo
    draft: () => ({ text: box.value, files: [...files] }),
    restore: (d) => { if (!d) return; box.value = d.text || ''; files = Array.isArray(d.files) ? [...d.files] : []; paintFiles(); },
    busy: (on) => { busy = on; fit(); },
    // está preguntando: escribir aquí vale como respuesta (descarta sus opciones)
    asking: (on) => { if (!off) box.placeholder = on ? ASKING_PLACEHOLDER : PLACEHOLDER; },
    // el chat ha terminado: la caja se apaga con el motivo
    disable: (why) => { off = true; box.disabled = true; box.placeholder = why; plus.disabled = true; el.classList.add('off'); fit(); },
    focus: () => { if (!off) box.focus(); },
    destroy: () => document.removeEventListener('click', onClickAway),
  };
};
