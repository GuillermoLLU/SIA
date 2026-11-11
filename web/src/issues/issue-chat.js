// El chat de una issue: una sesión del bridge ligada a ella (una por issue).
// Si ya existe, se re-engancha con su historial; si no, un solo botón, «Iniciar
// resolución asistida por IA», que abre Claude con conocimiento autónomo y el
// proyecto del origen de la issue (assisted.js); al arrancar, el bridge le
// inyecta los datos de la issue como primer mensaje. Salir de la issue no lo
// cierra: solo suelta el socket (dispose); el chat sigue vivo en el bridge.
import { msg, parse, sendOn } from '../chat/protocol.js';
import { esc } from '../ui/html.js';
import { assistedPlan } from './assisted.js';
import { originOf } from './origin.js';
import { assistHtml } from './work-screen.js';

// host: el hueco del chat · issue: la issue abierta (su id y su origen)
// wsUrl(): socket del bridge · loadProjects(): los proyectos visibles
// makeTerminal(): { term, fit } con el tema de SIA
export const mountIssueChat = (host, { issue, wsUrl, loadProjects, makeTerminal }) => {
  const issueId = issue.id, origin = originOf(issue);
  host.innerHTML = `<div class="iss-card-h" data-chat-head hidden><h3>Resolución asistida por IA</h3></div>
    <div class="iss-chat-start"><p class="iss-empty">Conectando…</p></div><div class="term-host" hidden></div>`;
  const head = host.querySelector('[data-chat-head]');
  const chooser = host.querySelector('.iss-chat-start');
  const termHost = host.querySelector('.term-host');
  let ws = null, term = null, fit = null, ro = null, disposed = false;

  const resize = () => { if (!term || termHost.hidden) return; try { fit.fit(); sendOn(ws, msg.resize(term.cols, term.rows)); } catch { /* aún sin tamaño */ } };

  // La cabecera del panel solo tiene sentido con el chat en marcha.
  const showTerminal = () => {
    if (term) return;
    chooser.hidden = true;
    termHost.hidden = false;
    head.hidden = false;
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
      sendOn(ws, msg.start(launcher.id, knowledge, projects, term.cols, term.rows, { issue: issueId }));
    }));
  };

  const ended = (text) => {
    if (ro) { ro.disconnect(); ro = null; }
    if (term) { term.dispose(); term = null; }
    termHost.hidden = true;
    chooser.hidden = false;
    head.hidden = true;
    chooser.innerHTML = `<p class="iss-empty">${esc(text)}</p><button class="lab-btn primary" data-chat-again>Iniciar otra resolución asistida</button>`;
    chooser.querySelector('[data-chat-again]').addEventListener('click', () => { dispose(); mountIssueChat(host, { issue, wsUrl, loadProjects, makeTerminal }); });
  };

  // El botón: se decide con qué se abre (Claude, autónomo, el proyecto del
  // origen) y, si falta algo, se explica en su lugar.
  const offerAssist = (launchers) => {
    chooser.innerHTML = assistHtml();
    const btn = chooser.querySelector('[data-assist]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      let projects;
      try { projects = await loadProjects(); } catch { chooser.innerHTML = assistHtml('No se pudieron cargar los proyectos de conocimiento.'); return; }
      const plan = assistedPlan({ launchers, projects, origin });
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
      ended('El chat de esta incidencia se ha cerrado.');
    } else if (m.type === 'error') {
      ended(m.message || 'No se pudo abrir el chat.');
    }
  };
  ws.onclose = () => { if (!disposed && term) term.write('\r\n\x1b[2m[sin conexión con SIA: vuelve a abrir la incidencia]\x1b[0m\r\n'); };

  const dispose = () => {
    disposed = true;
    if (ro) ro.disconnect();
    if (term) term.dispose();
    try { ws.close(); } catch { /* ya cerrado */ }
  };
  return { dispose };
};
