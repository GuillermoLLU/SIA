// Las tarjetas de la conversación (view.js), como HTML: la de lo que Copilot
// pregunta (con sus opciones o, ya contestada, su resumen), la del plan que
// propone y la de «sin sesión iniciada». Lo que se pulsa lo decide view.js;
// aquí solo se pinta.
import { renderMarkdown } from './markdown.js';
import { answerable, instant, answersOf } from './ask.js';
import { esc } from '../../ui/html.js';

// ya contestado: cada pregunta → su respuesta; las opciones, plegadas
// descartada (sin elegir nada: «Ninguna», parar o escribiendo otra cosa)
const DISMISSED = /^\[Request interrupted|doesn't want to proceed|was rejected/i;
const doneHtml = (row, questions, plan) => {
  const pairs = answersOf(row.result);
  const off = !pairs.length && DISMISSED.test(row.result);
  const summary = pairs.length
    ? `<ul class="cv-answers">${pairs.map((p) => `<li><span>${esc(p.question)}</span><b>→</b><strong>${esc(p.answer)}</strong></li>`).join('')}</ul>`
    : `<div class="cv-ask-answer">${off ? 'Sin elegir ninguna opción.' : esc(row.result.slice(0, 400))}</div>`;
  return `<div class="cv-ask done"><div class="cv-ask-title">${off ? 'Descartada' : 'Contestado'}</div>${summary}
    <details class="cv-ask-more"><summary>Ver detalle</summary>${questions}${plan}</details></div>`;
};

// lo que Copilot pregunta: sus opciones como botones (ask.js). Una pregunta de
// una respuesta se contesta con un clic; si no, se elige (☐ en las de varias)
// y «Enviar respuestas»; «Ninguna» descarta las opciones (y escribir abajo
// también: lo escrito va en su lugar). El plan se aprueba o se rechaza
// mientras Copilot lo está esperando (row.pending). Ya contestado, su resumen.
export const askHtml = (row, { agent = 'Copilot' } = {}) => {
  const live = !row.done && answerable(row.ask);
  const form = live && !instant(row.ask);
  const questions = (row.ask || []).map((q, n) => `<div class="cv-q" data-q="${n}"${q.multi ? ' data-multi' : ''}>
    ${q.header ? `<div class="cv-q-head">${esc(q.header)}${form && q.multi ? ' · elige una o varias' : ''}</div>` : ''}<p class="cv-q-text">${esc(q.question)}</p>
    <div class="cv-opts">${q.options.map((o, i) => (live
      ? `<button type="button" class="cv-opt${form ? (q.multi ? ' check' : ' radio') : ''}" data-opt="${i}"><strong>${esc(o.label)}</strong>${o.description ? `<small>${esc(o.description)}</small>` : ''}</button>`
      : `<div class="cv-opt static"><strong>${esc(o.label)}</strong>${o.description ? `<small>${esc(o.description)}</small>` : ''}</div>`)).join('')}</div>
  </div>`).join('');
  const plan = row.plan ? `<div class="cv-plan cv-md">${renderMarkdown(row.plan)}</div>` : '';
  if (row.done) return doneHtml(row, questions, plan);
  const none = live ? `<button type="button" class="cv-ask-deny" data-none title="Descartar las opciones: ${esc(agent)} espera a lo que escribas">Ninguna</button><span class="cv-ask-hint">o escribe abajo lo que prefieras</span>` : '';
  const foot = form ? `<div class="cv-ask-foot"><button type="button" class="cv-ask-send" data-send disabled>Enviar respuestas</button>${none}</div>`
    : live ? `<div class="cv-ask-foot">${none}</div>`
      : row.pending ? '<div class="cv-ask-foot"><button type="button" class="cv-ask-send" data-approve>Aprobar</button><button type="button" class="cv-ask-deny" data-deny>Rechazar</button></div>' : '';
  return `<div class="cv-ask"><div class="cv-ask-title">${esc(agent)} ${row.plan ? 'te propone un plan' : 'te pregunta'}</div>${questions}${plan}${foot}</div>`;
};

// lo elegido en una tarjeta: por pregunta, los índices marcados
export const picksOf = (card) => [...card.querySelectorAll('.cv-q')].map((qe) => [...qe.querySelectorAll('.cv-opt.picked')].map((b) => Number(b.dataset.opt)));

// Copilot no tiene sesión iniciada (fila 'auth': thread.js, server/chats/auth.js):
// en vez del error de su CLI («run /login», imposible sin terminal), qué pasa y
// a dónde ir. Centrada y sin marco de aviso: su icono, lo que pasa en una
// frase, el botón debajo y, si hay otra salida, un enlace discreto. Lo que se
// pulsa (data-auth: login | check | retry) lo atiende view.js. Con algo escrito
// después (row.live = false) queda en una línea fina, sin botones.
const AUTH_ICON = {
  login: '<path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5"/><path d="M15 12H4"/>',
  again: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/>',
  done: '<path d="M20 6 9 17l-5-5"/>',
};
const authIcon = (kind) => `<span class="cv-auth-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AUTH_ICON[kind]}</svg></span>`;
export const authHtml = (row, { agent = 'Copilot' } = {}) => {
  const name = esc(agent);
  if (!row.live) return `<div class="cv-auth past"><span>${row.state === 'ready' ? `Sesión de ${name} iniciada.` : `${name} no tenía sesión iniciada.`}</span></div>`;
  // el primero, el botón; los demás, enlaces debajo
  const actions = (list) => (list.length ? `<div class="cv-auth-actions">${list.map(([action, label], i) => `<button type="button" class="${i ? 'cv-auth-link' : 'cv-auth-main'}" data-auth="${action}">${label}</button>`).join('')}</div>` : '');
  const card = (cls, icon, title, text, list, extra = '') => `<div class="cv-auth${cls}">${authIcon(icon)}<div class="cv-auth-title">${title}</div><p>${text}</p>${actions(list)}${extra}</div>`;
  if (row.state === 'ready') {
    return card(' ok', 'done', `Sesión de ${name} iniciada`, row.retry ? `Ya puedes seguir. Tu último mensaje no le llegó a ${name}.` : 'Ya puedes escribir.', row.retry ? [['retry', 'Reenviar mensaje']] : []);
  }
  const detail = row.detail ? `<small class="cv-auth-detail">${name} dice: ${esc(row.detail)}</small>` : '';
  if (row.state === 'logged') {
    return card('', 'again', `${name} no ha podido usar tu sesión`,
      'En este equipo hay una sesión iniciada, pero este chat no ha podido usarla: puede haber caducado, o haberse iniciado después de abrir el chat. Cierra el chat y abre otro; si sigue igual, vuelve a iniciar sesión.',
      [['login', 'Iniciar sesión de nuevo']], detail);
  }
  return card('', 'login', `${name} no tiene sesión iniciada`,
    `Inicia sesión con tu cuenta en Configuración → Proveedores IA para usar este chat.${row.retry ? ` Tu mensaje no le ha llegado a ${name}.` : ''}`,
    [['login', 'Iniciar sesión'], ['check', 'Ya la he iniciado']]);
};
