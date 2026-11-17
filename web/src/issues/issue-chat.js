// El chat de una issue: una sesión del bridge ligada a ella (una por issue).
// Si ya existe, se re-engancha con lo que lleva; si no, un solo botón, «Iniciar
// resolución asistida por IA», que abre Copilot con conocimiento autónomo y el
// proyecto del origen de la issue (assisted.js); al arrancar, el bridge le
// inyecta los datos de la issue como primer mensaje. La conversación se ve
// como en el Chat (chat/conversation/view.js). Salir de la issue no lo cierra:
// solo suelta el socket (dispose); el chat sigue vivo en el bridge.
import { msg, parse, sendOn } from '../chat/protocol.js';
import { createConversationView } from '../chat/conversation/view.js';
import { createUploads } from '../chat/uploads.js';
import { esc } from '../ui/html.js';
import { assistedPlan } from './assisted.js';
import { originOf } from './origin.js';
import { assistHtml, assistWaitHtml } from './work-screen.js';

// host: el hueco del chat · issue: la issue abierta (su id y su origen)
// wsUrl(): socket del bridge · loadProjects(): los proyectos visibles · api y
// dialogs (los adjuntos: chat/uploads.js) · fileUrl(nombre): la URL de un
// adjunto · onLogin(): a Configuración → Proveedores IA (Copilot sin sesión)
export const mountIssueChat = (host, { issue, wsUrl, loadProjects, api, dialogs, fileUrl, onLogin }) => {
  const issueId = issue.id, origin = originOf(issue);
  host.innerHTML = `<div class="iss-chat-start"><p class="iss-empty">Conectando…</p></div><div class="iss-chat-conv" hidden></div>`;
  const chooser = host.querySelector('.iss-chat-start');
  const convHost = host.querySelector('.iss-chat-conv');
  let ws = null, view = null, disposed = false, launching = false; // launching: pedido al bridge, esperando «started»
  const uploads = createUploads({ api, active: () => ({ launched: !!view, view }), dialogs });
  const unwire = uploads.wire(host);

  // Al arrancar (el bridge ya ha dicho «started»), el aviso se va en fundido
  // mientras entra la conversación; al reengancharse, llega al momento. Avisa a
  // la pantalla (chat-open) para que deje sitio.
  const CHOOSER_OUT_MS = 400; // lo que tarda el aviso en irse (issues.css: .iss-chat-start.leaving)
  const showConversation = (animated = false) => {
    if (view) return;
    if (animated) { chooser.classList.add('leaving'); setTimeout(() => { chooser.hidden = true; }, CHOOSER_OUT_MS); }
    else chooser.hidden = true;
    convHost.hidden = false;
    host.dispatchEvent(new CustomEvent('chat-open'));
    view = createConversationView({
      host: convHost, fileUrl,
      onSend: (text) => sendOn(ws, msg.say(text)),
      onStop: () => sendOn(ws, msg.stop()),
      onPick: (requestId, answers) => sendOn(ws, msg.answer(requestId, answers)),
      onApprove: (requestId, allow) => sendOn(ws, msg.approve(requestId, allow)),
      onAuthCheck: () => sendOn(ws, msg.authCheck()),
      onLogin,
      onAttach: () => uploads.pick({ view }),
      greeting: null, // arranca solo con los datos de la issue: nada que preguntar
    });
  };

  const unmount = () => {
    if (view) { view.destroy(); view = null; }
    convHost.hidden = true;
  };
  const ended = (text) => {
    unmount();
    launching = false;
    chooser.hidden = false;
    chooser.classList.remove('leaving');
    chooser.innerHTML = `<p class="iss-empty">${esc(text)}</p><button class="lab-btn primary" data-chat-again>Iniciar otra resolución asistida</button>`;
    chooser.querySelector('[data-chat-again]').addEventListener('click', () => { dispose(); mountIssueChat(host, { issue, wsUrl, loadProjects, api, dialogs, fileUrl, onLogin }); });
  };

  // El botón: se decide con qué se abre (conocimiento autónomo, el proyecto del
  // origen) y, si falta algo, se explica en su lugar.
  const offerAssist = (copilot) => {
    chooser.innerHTML = assistHtml();
    const btn = chooser.querySelector('[data-assist]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      let projects;
      try { projects = await loadProjects(); } catch { chooser.innerHTML = assistHtml('No se pudieron cargar los proyectos de conocimiento.'); return; }
      const plan = assistedPlan({ copilot, projects, origin });
      if (plan.error) { chooser.innerHTML = assistHtml(plan.error); return; }
      chooser.innerHTML = assistWaitHtml(); // «Iniciando agente…», hasta que Copilot está en pie («started»)
      launching = true;
      sendOn(ws, msg.start(plan.knowledge, plan.projects, { issue: issueId }));
    });
  };

  ws = new WebSocket(wsUrl());
  ws.onmessage = (e) => {
    const m = parse(e.data);
    if (!m) return;
    switch (m.type) {
      case 'hello': {
        const open = (m.sessions || []).find((r) => r.issue === issueId);
        if (open) { showConversation(); sendOn(ws, msg.attach(open.id)); return; }
        offerAssist(m.copilot);
        break;
      }
      case 'started': // Copilot en pie: entra la conversación y le llegan los datos de la issue
        if (launching) { launching = false; showConversation(true); }
        view?.status('Leyendo la issue…');
        break;
      case 'transcript': view?.feed(m); break;
      case 'typing': view?.typing(m.text); break;
      case 'thinking': view?.thinking(); break;
      case 'ask': view?.ask(m); break;
      case 'ask-off': view?.askOff(m.requestId); break;
      case 'turn': view?.turn(); break;
      case 'meta': view?.meta(m); break;
      case 'auth-check': if (!m.ok) view?.feed({ items: [{ kind: 'text', id: `auth-${Date.now()}`, text: 'Copilot sigue sin sesión iniciada: inicia sesión en Configuración → Proveedores IA y vuelve a probar.' }] }); break;
      case 'exit':
      case 'gone':
        ended('El chat de esta issue se ha cerrado.');
        break;
      case 'error':
        ended(m.message || 'No se pudo abrir el chat.');
        break;
    }
  };
  ws.onclose = () => { if (!disposed) view?.feed({ items: [{ kind: 'text', id: 'offline', text: 'Sin conexión con SIA: vuelve a abrir la issue.' }] }); };

  const dispose = () => {
    disposed = true;
    unmount();
    unwire();
    try { ws.close(); } catch { /* ya cerrado */ }
  };
  return { dispose };
};
