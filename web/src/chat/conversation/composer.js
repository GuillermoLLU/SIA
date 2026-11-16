// La caja de escribir de la conversación: Enter envía, Shift+Enter es salto
// de línea y crece con lo escrito; Esc dos veces vacía lo escrito. Mientras
// Copilot trabaja sale «Detener». Los adjuntos se añaden como una marca corta
// («[Imagen 1]») donde está el cursor, que al enviar se cambia por su ruta
// (compose.js).
//
// deps: host (donde se monta) · onSend(text) · onStop() · agent (a quién se escribe)
import { messageOf, sends, escapes, escTwice, appendText, attachMark, insertAt, expandMarks } from './compose.js';

const MAX_ROWS_PX = 200;
const SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';

const placeholderOf = (agent) => `Escribe a ${agent}…`;
const ASKING_PLACEHOLDER = 'Elige una opción o escribe aquí tu respuesta…';
export const createComposer = ({ host, onSend, onStop, agent = 'Copilot' }) => {
  const PLACEHOLDER = placeholderOf(agent);
  const el = document.createElement('form');
  el.className = 'composer';
  el.innerHTML = `<textarea rows="1" placeholder="${PLACEHOLDER}" aria-label="Mensaje para ${agent}" enterkeyhint="send"></textarea>
    <button type="button" class="cp-stop" aria-label="Detener" title="Detener (Esc)" hidden>${STOP}</button>
    <button type="submit" class="cp-send" aria-label="Enviar" title="Enviar (Enter)">${SEND}</button>`;
  host.appendChild(el);
  const box = el.querySelector('textarea');
  const sendBtn = el.querySelector('.cp-send');

  // crece con lo escrito; vacía, una línea. Solo se mide si se ve: oculta
  // (otro chat delante) no tiene ancho y lo escrito se partiría en mil líneas
  const fit = () => {
    sendBtn.disabled = !messageOf(box.value);
    if (!box.value) { box.style.height = ''; return; }
    if (!box.offsetWidth) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, MAX_ROWS_PX)}px`;
  };
  let files = []; // los adjuntos de lo que se está escribiendo: { mark, path }
  const send = () => {
    const text = messageOf(box.value);
    if (!text) return;
    onSend(expandMarks(text, files));
    box.value = '';
    files = [];
    fit();
  };
  // donde estaba el cursor (aunque la caja no tenga el foco: se subía una foto)
  const attach = (path) => {
    const mark = attachMark(path, files);
    files.push({ mark, path });
    const end = box.value.length;
    const { text, at } = insertAt(box.value, box.selectionStart ?? end, box.selectionEnd ?? end, mark);
    box.value = text;
    fit();
    box.focus();
    box.setSelectionRange(at, at);
  };
  el.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  // Esc, Esc: se vacía la caja (texto y adjuntos)
  let escAt = null;
  const clear = () => { box.value = ''; files = []; fit(); };
  box.addEventListener('keydown', (e) => {
    if (sends(e)) { e.preventDefault(); send(); return; }
    if (!escapes(e)) return;
    if (escTwice(escAt, Date.now())) { escAt = null; if (box.value) clear(); return; }
    escAt = Date.now();
  });
  box.addEventListener('input', fit);
  box.addEventListener('focus', fit);
  el.querySelector('.cp-stop').addEventListener('click', onStop);
  fit();

  return {
    insert: (text) => { box.value = appendText(box.value, text); fit(); box.focus(); },
    attach,
    // lo escrito y sus adjuntos, para llevarlo a otra caja (la vista se vuelve
    // a montar al re-engancharse el chat); y ponerlo
    draft: () => ({ text: box.value, files: [...files] }),
    restore: (d) => { if (!d) return; box.value = d.text || ''; files = Array.isArray(d.files) ? [...d.files] : []; fit(); },
    busy: (on) => { el.querySelector('.cp-stop').hidden = !on; },
    // está preguntando: escribir aquí vale como respuesta (descarta sus opciones)
    asking: (on) => { box.placeholder = on ? ASKING_PLACEHOLDER : PLACEHOLDER; },
    focus: () => box.focus(),
  };
};
