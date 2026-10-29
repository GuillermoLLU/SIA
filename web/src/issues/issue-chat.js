// El chat de una issue: una sesión del bridge ligada a ella (una por issue).
// Si ya existe, se re-engancha con su historial; si no, un solo botón, «Iniciar
// resolución asistida por IA», que abre Claude con conocimiento autónomo y el
// proyecto del origen de la issue (assisted.js); al arrancar, el bridge le
// inyecta los datos de la issue como primer mensaje. Salir de la issue no lo
// cierra: solo suelta el socket (dispose); el chat sigue vivo en el bridge.
import { msg, parse, sendOn } from '../chat/protocol.js';
import { esc } from '../ui/html.js';
import { assistedPlan } from './assisted.js';

// El arranque: solo el botón; si no se puede, el motivo debajo. `error`: por qué no.
export const assistHtml = (error = null) => `<div class="iss-assist">
    <button class="lab-btn primary iss-assist-go" data-assist ${error ? 'disabled' : ''}>Iniciar resolución asistida por IA</button>
    ${error ? `<p class="iss-assist-hint">${esc(error)}</p>` : ''}
  </div>`;

// host: el hueco del chat · origin: 'SGA' | 'SISU' · wsUrl(): socket del bridge
// loadProjects(): los proyectos visibles · makeTerminal(): { term, fit } con el tema de SIA
export const mountIssueChat = (host, { issueId, origin, wsUrl, loadProjects, makeTerminal }) => {
  host.innerHTML = '<div class="launcher iss-chat-chooser"><p class="iss-empty">Conectando…</p></div><div class="term-host" hidden></div>';
  const chooser = host.querySelector('.launcher');
  const termHost = host.querySelector('.term-host');
  let ws = null, term = null, fit = null, ro = null, disposed = false;

  const resize = () => { if (!term || termHost.hidden) return; try { fit.fit(); sendOn(ws, msg.resize(term.cols, term.rows)); } catch { /* aún sin tamaño */ } };

  // La cabecera del panel solo tiene sentido con el chat en marcha.
  const head = host.parentElement?.querySelector('[data-chat-head]');
  const showTerminal = () => {
    if (term) return;
    chooser.hidden = true;
    termHost.hidden = false;
    if (head) head.hidden = false;
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
    if (head) head.hidden = true;
    chooser.innerHTML = `<p class="iss-empty">${esc(text)}</p><button class="lab-btn primary" data-chat-again>Abrir otro chat</button>`;
    chooser.querySelector('[data-chat-again]').addEventListener('click', () => { dispose(); mountIssueChat(host, { issueId, origin, wsUrl, loadProjects, makeTerminal }); });
  };

  // El botón: se decide con qué se abre (Claude, autónomo, el proyecto del
  // origen) y, si falta algo, se explica en su lugar.
  const offerAssist = async (launchers) => {
    chooser.innerHTML = assistHtml();
    chooser.querySelector('[data-assist]').addEventListener('click', async () => {
      chooser.querySelector('[data-assist]').disabled = true;
      const plan = assistedPlan({ launchers, projects: await loadProjects(), origin });
      if (plan.error) { chooser.innerHTML = assistHtml(plan.error); return; }
      launch(plan.launcher, plan.knowledge, plan.projects);
    });
  };

  ws = new WebSocket(wsUrl());
  ws.onmessage = (e) => {
    const m = parse(e.data);
    if (!m) return;
    if (m.type === 'launchers') {
      const open = (m.sessions || []).find((r) => r.issue === issueId);
      if (open) { showTerminal(); sendOn(ws, msg.attach(open.id)); return; }
      offerAssist(m.list);
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
