// La conversación de un chat de Copilot como un chat de verdad: lo tuyo en
// burbujas a la derecha, las respuestas como prosa con su Markdown, las
// herramientas en una línea plegable, las preguntas y los planes en tarjetas
// (cards.js) y, debajo, la caja de escribir (composer.js) con su pie: el
// atajo, el botón de las skills y el modelo y el esfuerzo (../model-menu.js).
// Arriba a la derecha, «Nuevo chat». De fondo, las manchas de color de la
// portada, más suaves.
// Pinta lo que manda el bridge (server/chats/): el texto llega en streaming
// (typing), las preguntas se contestan con onPick(requestId, answers) y el
// plan con onApprove(requestId, ok). Solo repinta las filas que cambian, y se
// queda al final mientras lees (salvo que hayas subido a mirar algo). Si
// Copilot no tiene sesión iniciada sale su tarjeta (cards.js: authHtml), con
// onLogin() (llevar a Configuración → Proveedores IA) y onAuthCheck()
// (preguntar si ya la tiene).
//
// deps: host (el panel del chat) · fileUrl(nombre) (la URL de un adjunto) ·
//   onSend(text) · onStop() · onPick · onApprove · onLogin · onAuthCheck ·
//   onAttach() (elegir un fichero; null si no) · onSkills() (la paleta ⌘K; null
//   si no) · onClose() («Nuevo chat»; null si este chat no se cierra desde aquí) · agent
import { threadOf, localItem, settleLocal, rowSig } from './thread.js';
import { renderMarkdown } from './markdown.js';
import { createComposer } from './composer.js';
import { isImageName } from './compose.js';
import { createFind } from './find.js';
import { createDock } from './dock.js';
import { answerable, instant, complete, answerMap } from './ask.js';
import { askHtml, authHtml, picksOf } from './cards.js';
import { createModelMenu } from '../model-menu.js';
import { modelShown, effortLabel, effortsIn } from '../model-names.js';
import { esc } from '../../ui/html.js';
import './conversation.css';

const NEAR_BOTTOM_PX = 80;
const THINKING_SHOW_MS = 1500; // «Pensando…» se mantiene este tiempo desde el último aviso
const CHEVRON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const SKILL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';

const userHtml = (row, fileUrl) => {
  const files = row.files.map((f) => (isImageName(f)
    ? `<a class="cv-file img" href="${esc(fileUrl(f))}" target="_blank" rel="noopener"><img src="${esc(fileUrl(f))}" alt="${esc(f)}" loading="lazy"></a>`
    : `<a class="cv-file" href="${esc(fileUrl(f))}" target="_blank" rel="noopener">${esc(f.replace(/^\d+-/, ''))}</a>`)).join('');
  return `<div class="cv-user${row.local ? ' pending' : ''}"><div class="cv-bubble">${files ? `<div class="cv-files">${files}</div>` : ''}${row.text ? `<div class="cv-said">${esc(row.text)}</div>` : ''}</div></div>`;
};

const toolHtml = (t) => `<details class="cv-tool${t.error ? ' error' : ''}">
  <summary><span class="cv-state" data-done="${t.done}"></span><span class="cv-sum">${esc(t.summary)}</span></summary>
  <pre class="cv-detail">${esc(t.detail)}</pre>${t.done && t.result ? `<pre class="cv-result">${esc(t.result)}</pre>` : ''}
</details>`;

const toolsHtml = (row) => {
  const n = row.tools.length;
  if (n === 1) return `<div class="cv-tools">${toolHtml(row.tools[0])}</div>`;
  const busy = row.tools.some((t) => !t.done);
  return `<details class="cv-tools group"><summary><span class="cv-state" data-done="${!busy}"></span><span class="cv-sum">${n} pasos · ${esc(row.tools.at(-1).summary)}</span></summary>${row.tools.map(toolHtml).join('')}</details>`;
};

const rowHtml = (row, fileUrl, agent) => {
  if (row.kind === 'user') return userHtml(row, fileUrl);
  if (row.kind === 'ask') return askHtml(row, { agent });
  if (row.kind === 'auth') return authHtml(row, { agent });
  if (row.kind === 'text') return `<div class="cv-text cv-md">${renderMarkdown(row.text)}</div>`;
  return toolsHtml(row);
};

export const createConversationView = ({ host, fileUrl, onSend, onStop, onPick, onApprove, onLogin, onAuthCheck, onAttach = null, onSkills = null, onClose = null, agent = 'Copilot' }) => {
  const wrap = document.createElement('div');
  wrap.className = 'conversation entering';
  wrap.innerHTML = '<div class="cv-bg" aria-hidden="true"><i></i><i></i><i></i></div>';
  const el = document.createElement('div');
  el.className = 'cv';
  el.innerHTML = '<div class="cv-thread"></div><div class="cv-empty">¿Por dónde empezamos?</div><div class="cv-row cv-typing" hidden><div class="cv-text cv-md"></div></div><div class="cv-busy" hidden><i></i><i></i><i></i><span class="cv-busy-label"></span></div>';
  wrap.appendChild(el);
  // arriba a la derecha, empezar otro chat
  if (onClose) {
    const top = document.createElement('div');
    top.className = 'cv-top';
    top.innerHTML = '<button type="button" class="cv-close" title="Cerrar este chat y empezar otro">Nuevo chat</button>';
    top.querySelector('button').addEventListener('click', onClose);
    wrap.appendChild(top);
  }
  host.appendChild(wrap);
  const thread = el.querySelector('.cv-thread');
  const busyEl = el.querySelector('.cv-busy');
  const typingEl = el.querySelector('.cv-typing');
  // lo que Copilot está preguntando y espera (id de su herramienta → id de la petición)
  const pending = new Map();
  const requestOf = (toolId) => pending.get(toolId) || null;

  const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  // si estabas al final y la vista cambia de alto (crece la caja de escribir), sigues al final
  let stuck = true;
  el.addEventListener('scroll', () => { stuck = atBottom(); }, { passive: true });
  new ResizeObserver(() => { if (stuck) el.scrollTop = el.scrollHeight; }).observe(el);

  let items = [];
  const shown = new Map(); // id de fila → { node, sig, row }
  const askOf = (node) => shown.get(node.dataset.id)?.row.ask || [];

  // trabajando: desde que se manda algo hasta que acaba el turno; y mientras
  // pregunta no está trabajando: espera. status: qué pasa mientras (abriendo el chat)
  let working = false;
  let status = null;
  let typingText = ''; // lo que está escribiendo (paintTyping)
  let thoughtAt = 0;   // cuándo dijo por última vez que estaba pensando
  let thoughtT = 0;
  const thinking = () => Date.now() - thoughtAt < THINKING_SHOW_MS;
  const pendingAsk = () => threadOf(items).some((r) => r.kind === 'ask' && !r.done && answerable(r.ask));
  const paintBusy = () => {
    const on = (working || thinking()) && !pendingAsk() && !typingText; // escribiendo ya se ve: sin puntos
    const stick = atBottom();
    busyEl.hidden = !on;
    busyEl.querySelector('.cv-busy-label').textContent = !on ? '' : thinking() ? 'Pensando…' : (status || '');
    composer.busy((working || !!typingText) && !pendingAsk()); // parar también vale mientras escribe
    composer.asking(pendingAsk());
    if (stick) el.scrollTop = el.scrollHeight;
  };
  const sent = () => { working = true; paintBusy(); };
  // la caja de escribir y el pie van en un muelle pegado abajo, por encima de
  // la conversación, que pasa por debajo (dock.js)
  const dock = document.createElement('div');
  dock.className = 'cv-dock';
  wrap.appendChild(dock);
  // lo enviado se pinta en el acto (thread.js localItem), sin esperar al eco de Copilot
  let locals = [];
  const say = (text) => { onSend(text); locals = [...locals, localItem(text)]; paint(); sent(); };
  const composer = createComposer({ host: dock, onSend: say, onStop, onAttach, agent });
  // buscar en la conversación (⌘F / Ctrl+F, cuando esta vista se ve)
  const find = createFind({ host: wrap, scroller: el, onClose: () => composer.focus() });
  const onFindKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'f') return;
    if (!wrap.isConnected || !wrap.getClientRects().length) return; // otro chat delante
    e.preventDefault();
    e.stopPropagation();
    find.open();
  };
  document.addEventListener('keydown', onFindKey, true);
  // el muelle se esconde al subir por la conversación y vuelve solo (dock.js)
  createDock({ wrap, dock, scroller: el, atBottom });
  // bajo la caja, el pie: el atajo a la izquierda, las skills en el centro y,
  // a la derecha, con qué modelo y esfuerzo va (chips que abren el panel para
  // cambiarlos: ../model-menu.js)
  let meta = { model: null, effort: null, models: [], modelVia: null };
  const foot = document.createElement('div');
  foot.className = 'cv-foot';
  foot.innerHTML = `<span class="cv-foot-hint">Enter envía · Shift+Enter, salto de línea</span>
    <span class="cv-foot-mid">${onSkills ? `<button type="button" class="cv-foot-skills" title="Aplicar una skill a este chat (⌘K)">${SKILL}<span>Skills</span><kbd>⌘K</kbd></button>` : ''}</span>
    <span class="cv-foot-picks">
      <button type="button" class="cv-foot-pick" data-pick="model" title="Cambiar el modelo de este chat"><span>Modelo</span><b></b>${CHEVRON}</button>
      <button type="button" class="cv-foot-pick" data-pick="effort" title="Cuánto piensa antes de responder"><span>Esfuerzo</span><b></b>${CHEVRON}</button>
    </span>`;
  dock.appendChild(foot);
  foot.querySelector('.cv-foot-skills')?.addEventListener('click', () => onSkills());
  // los comandos del menú van directos: no son un mensaje de la conversación
  const modelMenu = createModelMenu({ host: wrap, getMeta: () => meta, onCommand: onSend });
  for (const b of foot.querySelectorAll('.cv-foot-pick')) b.addEventListener('click', (e) => { e.stopPropagation(); modelMenu.toggle(b.dataset.pick, b); });
  const paintModel = () => {
    foot.querySelector('[data-pick="model"]').hidden = !meta.model; // hasta que el bridge diga con cuál va
    foot.querySelector('[data-pick="model"] b').textContent = modelShown(meta.models, meta.model, meta.modelVia);
    foot.querySelector('[data-pick="effort"] b').textContent = effortLabel(meta.effort);
    // un modelo sin esfuerzos que elegir (el «Auto» de Copilot): sin su chip
    foot.querySelector('[data-pick="effort"]').hidden = effortsIn(meta.models, meta.model).length === 0;
    modelMenu.paint();
  };
  paintModel();

  // contestar desde una tarjeta: una vez, y la tarjeta queda a la espera de la respuesta
  const answered = (card) => { for (const b of card.querySelectorAll('button')) b.disabled = true; };
  // las respuestas (o el visto bueno) con el id de lo que Copilot espera
  const reply = (card, ask, picks) => {
    const requestId = requestOf(card.dataset.id);
    if (!requestId) return false; // aún no lo está esperando (llega un instante después)
    onPick(requestId, answerMap(ask, picks));
    return true;
  };
  thread.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-opt]');
    const card = e.target.closest('.cv-row');
    const auth = e.target.closest('[data-auth]');
    if (auth) { // la tarjeta de «sin sesión»: a dónde ir, o seguir si ya está
      const row = shown.get(card.dataset.id)?.row;
      const action = auth.dataset.auth;
      if (!row) return;
      if (action === 'login') onLogin();
      else if (action === 'check') { auth.disabled = true; setTimeout(() => { auth.disabled = false; }, 4000); onAuthCheck(); } // la respuesta repinta la tarjeta (o avisa de que sigue sin sesión)
      else if (action === 'retry' && row.retry) { answered(card); say(row.retry); }
      return;
    }
    if (e.target.closest('[data-approve]') || e.target.closest('[data-deny]')) {
      const requestId = requestOf(card.dataset.id);
      if (!requestId) return;
      answered(card);
      onApprove(requestId, !!e.target.closest('[data-approve]'));
      sent();
      return;
    }
    if (e.target.closest('[data-none]')) { // ninguna opción: se descarta y Copilot espera a lo que escribas
      answered(card);
      onStop();
      return;
    }
    if (opt) {
      const ask = askOf(card);
      if (instant(ask)) { if (!reply(card, ask, [[Number(opt.dataset.opt)]])) return; answered(card); opt.classList.add('picked'); sent(); return; }
      const qe = opt.closest('.cv-q');
      if (qe.hasAttribute('data-multi')) opt.classList.toggle('picked');
      else for (const b of qe.querySelectorAll('.cv-opt')) b.classList.toggle('picked', b === opt);
      card.querySelector('[data-send]').disabled = !complete(ask, picksOf(card));
    } else if (e.target.closest('[data-send]')) {
      const ask = askOf(card);
      const picks = picksOf(card);
      if (!complete(ask, picks)) return;
      if (!reply(card, ask, picks)) return;
      answered(card);
      sent();
    }
  });

  const paint = () => {
    const stick = atBottom();
    const rows = threadOf(locals.length ? items.concat(locals) : items);
    const seen = new Set();
    let prev = null;
    for (const row of rows) {
      seen.add(row.id);
      if (row.kind === 'ask') row.pending = !row.done && pending.has(row.id);
      const sig = rowSig(row);
      let cur = shown.get(row.id);
      if (!cur || cur.sig !== sig) {
        const node = document.createElement('div');
        node.className = cur ? 'cv-row' : 'cv-row cv-new'; // la fila nueva entra con su animación; la que cambia, no
        node.dataset.id = row.id;
        node.innerHTML = rowHtml(row, fileUrl, agent);
        if (cur) { // lo que estaba desplegado sigue desplegado
          const open = [...cur.node.querySelectorAll('details')].map((d) => d.open);
          node.querySelectorAll('details').forEach((d, i) => { d.open = !!open[i]; });
          cur.node.replaceWith(node);
        }
        cur = { node, sig, row };
        shown.set(row.id, cur);
      }
      const after = prev ? prev.nextSibling : thread.firstChild;
      if (cur.node !== after) thread.insertBefore(cur.node, after);
      prev = cur.node;
    }
    for (const [id, cur] of shown) if (!seen.has(id)) { cur.node.remove(); shown.delete(id); }
    el.classList.toggle('empty', !rows.length);
    el.classList.toggle('solo', rows.length === 1 && rows[0].kind === 'auth'); // sin sesión en un chat aún vacío: centrada, en el sitio del saludo
    if (stick) el.scrollTop = el.scrollHeight;
    find.refresh();
  };

  // el texto que está escribiendo, token a token, debajo del hilo; en cuanto
  // llega la respuesta entera (o acaba el turno), fuera
  const paintTyping = () => {
    const stick = atBottom();
    typingEl.hidden = !typingText;
    typingEl.querySelector('.cv-md').innerHTML = typingText ? renderMarkdown(typingText) : '';
    if (stick) el.scrollTop = el.scrollHeight;
    find.refresh();
  };
  const typingReset = () => { if (typingText) { typingText = ''; paintTyping(); paintBusy(); } };

  return {
    // lo que manda el bridge: { reset, items }
    feed: ({ reset, items: more = [] }) => {
      items = reset ? more : items.concat(more);
      locals = settleLocal(locals, more);
      if (more.some((i) => i.kind === 'text' || i.kind === 'tool')) { typingReset(); status = null; } // ya responde
      paint(); paintBusy();
    },
    // un trozo más de lo que escribe
    typing: (text) => { typingText += text; status = null; paintTyping(); paintBusy(); },
    // está pensando (antes de escribir): se dice, y se deja de decir si calla
    thinking: () => { thoughtAt = Date.now(); status = null; paintBusy(); clearTimeout(thoughtT); thoughtT = setTimeout(paintBusy, THINKING_SHOW_MS + 20); },
    // lo que Copilot pregunta y espera ({ requestId, toolUseId }) / ya no
    ask: ({ requestId, toolUseId }) => { if (toolUseId) { pending.set(toolUseId, requestId); paint(); paintBusy(); } },
    askOff: (requestId) => { for (const [t, r] of pending) if (r === requestId) pending.delete(t); paint(); paintBusy(); },
    // terminó el turno
    turn: () => { working = false; status = null; typingReset(); paintBusy(); },
    // con qué modelo y esfuerzo va, y cuáles ofrece ({ model, effort, models, modelVia }), para el pie
    meta: (m) => { meta = { ...meta, ...m }; paintModel(); },
    // qué pasa mientras trabaja («Abriendo el chat…»), junto a los puntos; null, nada.
    // Con texto, se da por trabajando (hasta que acabe el turno)
    status: (text) => { status = text; if (text) working = true; paintBusy(); },
    // como si se escribiera en la caja: la burbuja y a Copilot (la paleta de skills)
    send: say,
    // lo que ya se mandó al abrir el chat (la pregunta de la portada): su burbuja, y trabajando
    local: (text) => { locals = [...locals, localItem(text)]; paint(); sent(); },
    // el chat ha terminado: la caja se apaga
    ended: () => { working = false; composer.disable('Este chat ha terminado. Empieza otro con «Nuevo chat».'); paintBusy(); },
    // un adjunto ya subido ({ name, absPath, url, isImage }), como una ficha en la caja
    attachFile: composer.attachFile,
    draft: composer.draft,     // lo que se está escribiendo (text, files)
    restore: composer.restore, // …puesto en esta caja
    focus: composer.focus,
    // quitarla del panel (al volver a engancharse se monta otra)
    destroy: () => { find.close(); modelMenu.destroy(); document.removeEventListener('keydown', onFindKey, true); wrap.remove(); },
  };
};
