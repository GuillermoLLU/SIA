// El chat de una issue: una sesión del bridge ligada a ella (una por issue).
// Si ya existe, se re-engancha con su historial; si no, el selector de siempre
// (agente, conocimiento, fuentes) y al arrancar el bridge le inyecta los datos
// de la issue como primer mensaje. Salir de la issue no lo cierra: solo suelta
// el socket (dispose); el chat sigue vivo en el bridge.
import { renderChooser } from '../chat/chooser.js';
import { msg, parse, sendOn } from '../chat/protocol.js';
import { esc } from '../ui/html.js';

// host: el hueco del chat · wsUrl(): socket del bridge · loadProjects(): las fuentes
// makeTerminal(): { term, fit } con el tema de SIA
export const mountIssueChat = (host, { issueId, wsUrl, loadProjects, makeTerminal }) => {
  host.innerHTML = '<div class="launcher iss-chat-chooser"><p class="iss-empty">Conectando…</p></div><div class="term-host" hidden></div>';
  const chooser = host.querySelector('.launcher');
  const termHost = host.querySelector('.term-host');
  let ws = null, term = null, fit = null, ro = null, disposed = false;

  const resize = () => { if (!term || termHost.hidden) return; try { fit.fit(); sendOn(ws, msg.resize(term.cols, term.rows)); } catch { /* aún sin tamaño */ } };

  const showTerminal = () => {
    if (term) return;
    chooser.hidden = true;
    termHost.hidden = false;
    ({ term, fit } = makeTerminal());
    term.open(termHost);
    term.onData((data) => sendOn(ws, msg.input(data)));
    ro = new ResizeObserver(resize);
    ro.observe(termHost);
    requestAnimationFrame(resize);
  };

  const launch = (launcher, knowledge, projects) => {
    showTerminal();
    // medir antes de arrancar: el CLI nace con el ancho real
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fit.fit(); } catch { /* sin tamaño */ }
      sendOn(ws, msg.start(launcher.id, knowledge, projects, term.cols, term.rows, issueId));
    }));
  };

  const ended = (text) => {
    if (ro) { ro.disconnect(); ro = null; }
    if (term) { term.dispose(); term = null; }
    termHost.hidden = true;
    chooser.hidden = false;
    chooser.innerHTML = `<p class="iss-empty">${esc(text)}</p><button class="lab-btn primary" data-chat-again>Abrir otro chat</button>`;
    chooser.querySelector('[data-chat-again]').addEventListener('click', () => { dispose(); mountIssueChat(host, { issueId, wsUrl, loadProjects, makeTerminal }); });
  };

  ws = new WebSocket(wsUrl());
  ws.onmessage = (e) => {
    const m = parse(e.data);
    if (!m) return;
    if (m.type === 'launchers') {
      const open = (m.sessions || []).find((r) => r.issue === issueId);
      if (open) { showTerminal(); sendOn(ws, msg.attach(open.id)); return; }
      renderChooser(chooser, { launchers: m.list, loadProjects, onLaunch: launch, title: '¿Con qué agente abrimos el chat de esta issue?' });
    } else if ((m.type === 'history' || m.type === 'data') && term) {
      if (m.type === 'history') term.reset();
      term.write(m.data);
    } else if (m.type === 'exit' || m.type === 'gone') {
      ended('El chat de esta issue se ha cerrado.');
    } else if (m.type === 'error') {
      ended(m.message || 'No se pudo abrir el chat.');
    }
  };
  ws.onclose = () => { if (!disposed && term) term.write('\r\n\x1b[2m[sin conexión con SIA: vuelve a abrir la issue]\x1b[0m\r\n'); };

  const dispose = () => {
    disposed = true;
    if (ro) ro.disconnect();
    if (term) term.dispose();
    try { ws.close(); } catch { /* ya cerrado */ }
  };
  return { dispose };
};
