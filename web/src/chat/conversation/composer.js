// La caja de escribir de la conversación: una sola línea que crece con lo
// escrito (Enter envía, Shift+Enter es salto de línea; Esc dos veces la
// vacía), con el clip para adjuntar y Enviar, que mientras Copilot trabaja es
// Detener. Los adjuntos (pegados, arrastrados o elegidos con el clip) van como
// fichas con su miniatura encima del texto y al enviar viajan como sus rutas
// (compose.js: withFiles).
//
// deps: host (donde se monta) · onSend(text) · onStop() · onAttach() (elegir
//   un fichero; null si aquí no se puede) · agent (a quién se escribe)
import { messageOf, sends, escapes, escTwice, appendText, withFiles, fileExt } from './compose.js';
import { esc } from '../../ui/html.js';

const MAX_ROWS_PX = 200;
const SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';
const CLIP = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

const placeholderOf = (agent) => `Escribe a ${agent}…`;
const ASKING_PLACEHOLDER = 'Elige una opción o escribe aquí tu respuesta…';
export const createComposer = ({ host, onSend, onStop, onAttach = null, agent = 'Copilot' }) => {
  const PLACEHOLDER = placeholderOf(agent);
  const el = document.createElement('form');
  el.className = 'composer';
  el.innerHTML = `<div class="cp-files" hidden></div>
    <div class="cp-row">
      <textarea rows="1" placeholder="${PLACEHOLDER}" aria-label="Mensaje para ${agent}" enterkeyhint="send"></textarea>
      ${onAttach ? `<button type="button" class="cp-clip" aria-label="Adjuntar imagen o archivo" title="Adjuntar imagen o archivo (también pegando o arrastrando)">${CLIP}</button>` : ''}
      <button type="button" class="cp-stop" aria-label="Detener" title="Detener (Esc)" hidden>${STOP}</button>
      <button type="submit" class="cp-send" aria-label="Enviar" title="Enviar (Enter)">${SEND}</button>
    </div>`;
  host.appendChild(el);
  const box = el.querySelector('textarea');
  const sendBtn = el.querySelector('.cp-send');
  const stopBtn = el.querySelector('.cp-stop');
  const clipBtn = el.querySelector('.cp-clip');
  const filesEl = el.querySelector('.cp-files');
  let files = []; // los adjuntos de lo que se está escribiendo: { name, absPath, url, isImage }
  let off = false;  // el chat ha terminado: no se escribe más
  let busy = false; // Copilot trabaja: Detener en vez de Enviar (y Enviar, si hay algo escrito, para colarlo)

  // crece con lo escrito; vacía, una línea. Solo se mide si se ve: oculta
  // (otro chat delante) no tiene ancho y lo escrito se partiría en mil líneas
  const fit = () => {
    const something = !!messageOf(box.value) || files.length > 0;
    sendBtn.disabled = off || !something;
    sendBtn.hidden = busy && !something;
    stopBtn.hidden = !busy;
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
  clipBtn?.addEventListener('click', () => onAttach());

  // Esc, Esc: se vacía la caja (texto y adjuntos)
  let escAt = null;
  const clear = () => { box.value = ''; files = []; paintFiles(); };
  box.addEventListener('keydown', (e) => {
    if (sends(e)) { e.preventDefault(); send(); return; }
    if (!escapes(e)) return;
    if (escTwice(escAt, Date.now())) { escAt = null; if (box.value || files.length) clear(); return; }
    escAt = Date.now();
  });
  box.addEventListener('input', fit);
  box.addEventListener('focus', fit);
  stopBtn.addEventListener('click', onStop);
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
    disable: (why) => { off = true; box.disabled = true; box.placeholder = why; if (clipBtn) clipBtn.disabled = true; el.classList.add('off'); fit(); },
    focus: () => { if (!off) box.focus(); },
  };
};
