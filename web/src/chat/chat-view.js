// La vista Chat: un chat, con su sesión del bridge (un CLI en un PTY) y su
// terminal. Se abre con un botón y sin elegir nada: Claude, conocimiento
// autónomo y todo el conocimiento al que la persona tiene acceso (start.js).
// El chat vive en el bridge, no aquí: la pestaña se puede cerrar y reabrir,
// recargar la página o abrir el mismo chat desde otro dispositivo
// (multidispositivo: una pestaña pasiva es un chat que tiene otro dispositivo;
// no se roba, se reclama con un botón). Las reglas, en sessions.js y
// protocol.js; la terminal, en terminal.js.
import { esc } from '../ui/html.js';
import { chatPlan, knowledgeLabel } from './start.js';
import { msg, parse, closeReason, sendOn, isOpen } from './protocol.js';
import { chatSessions, defaultLabel, chromeVisible, nextActive, toAsset, reconcile } from './sessions.js';
import { makeTerminal, useWebgl, enableTouchScroll, wireCopyPaste } from './terminal.js';
import { createAssets } from './assets.js';
import { createTabBar } from './tabs.js';

// api/apiBase: el bridge · wsUrl(): el socket · theme(): el tema actual ·
// phone/mac: dónde corre · remote(): si es un móvil emparejado · gate(): la
// puerta del candado · onRevoked(): el ordenador cerró este móvil ·
// onTheme(id): el ordenador cambió de tema (lo sigue el móvil) ·
// onSkills(list): las skills de la paleta, cuando el bridge las manda
export const mountChatView = ({ api, apiBase, wsUrl, dialogs, theme, phone, mac, remote, gate, onRevoked, onTheme, onSkills }) => {
  const viewEl = document.getElementById('view-chat');
  const stackEl = document.getElementById('term-stack');
  const sessions = new Map();
  let counter = 0;
  let activeId = null;
  let bootstrapped = false; // tras el primer 'launchers' restauramos sesiones vivas
  let lastSessionsList = null; // última lista del bridge (para re-reconciliar)
  const killed = new Set(); // chats cerrados aquí que el bridge aún puede listar
  let accessProjects = []; // proyectos que ves en la base de conocimiento (del bridge)

  const active = () => (activeId ? sessions.get(activeId) : null);
  const all = () => [...sessions.values()];

  const sendResize = (s) => { if (s.launched) sendOn(s.ws, msg.resize(s.term.cols, s.term.rows)); };
  const refit = (s, { toBottom = false } = {}) => { try { s.fit.fit(); sendResize(s); if (toBottom) s.term.scrollToBottom(); } catch { /* aún sin tamaño */ } };
  const refitActive = (opts) => { const s = active(); if (s?.launched) requestAnimationFrame(() => refit(s, opts)); };
  const updateChrome = () => { tabs.tabsEl.hidden = !chromeVisible(all()); };

  // ¿Está el usuario escribiendo en un campo (renombrar pestaña, ajustes, PIN…)?
  // Entonces la terminal NO debe robarle el foco. Cubre la carrera del doble
  // clic (los click→setActive→rAF aterrizan después de abrir el editor) y los
  // setActive de fondo que dispara la reconciliación multidispositivo.
  const typingElsewhere = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || (el.tagName === 'TEXTAREA' && !el.classList.contains('xterm-helper-textarea')));
  };
  const focusActive = () => { const s = active(); if (s?.term && !viewEl.hidden) s.term.focus(); };

  const setActive = (id) => {
    activeId = id;
    for (const s of sessions.values()) {
      const on = s.id === id;
      s.pane.hidden = !on;
      s.tab.classList.toggle('active', on);
    }
    assets.render();
    const s = sessions.get(id);
    if (s?.launched) requestAnimationFrame(() => { refit(s); if (!typingElsewhere()) s.term.focus(); });
  };

  const assets = createAssets({ api, apiBase, dialogs, phone, active, onLayout: refitActive });
  const tabs = createTabBar({ onPick: (s) => setActive(s.id), onClose: (s) => closeSession(s.id), onMeta: (s) => sendMeta(s) });
  /* Sincronizar nombre/color de la pestaña con el bridge (persisten entre recargas). */
  const sendMeta = (s) => { if (s.launched) sendOn(s.ws, msg.meta(s.label, s.color)); };

  /* El arranque del chat: un botón y, debajo, con qué conocimiento se abre.
     Los proyectos se vuelven a pedir al pulsar (recoge los creados al vuelo);
     si falta algo (start.js), se explica en lugar del aviso. */
  const loadProjects = async () => {
    try { accessProjects = await api('/access/projects'); } catch { /* deja lo último conocido */ }
    return accessProjects;
  };
  const startHtml = (hint, error = null) => `<div class="ai-start">
    <button class="lab-btn primary ai-start-go" data-start ${error ? 'disabled' : ''}>Iniciar chat con IA</button>
    <p class="ai-start-hint">${esc(error || hint)}</p></div>`;
  const renderStart = (s, launchers) => {
    s.start.innerHTML = startHtml(knowledgeLabel(accessProjects));
    const btn = s.start.querySelector('[data-start]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const projects = await loadProjects();
      const plan = chatPlan({ launchers, projects });
      if (plan.error) { s.start.innerHTML = startHtml(null, plan.error); return; }
      launchSession(s, plan.launcher, plan.knowledge, plan.projects);
    });
  };

  /* Montar la terminal de una sesión (común a lanzar nueva y re-enganchar). */
  const materialize = (s) => {
    s.launched = true;
    s.start.hidden = true;
    s.termHost.hidden = false;
    ({ term: s.term, fit: s.fit } = makeTerminal(theme().term));
    s.term.open(s.termHost);
    if (phone) { useWebgl(s.term); enableTouchScroll(s.termHost, s.term); }
    if (!mac) wireCopyPaste(s.term, () => assets.pasteFromClipboard(s));
    s.term.onData((data) => sendOn(s.ws, msg.input(data)));
    tabs.setStatus(s, 'ok');
    updateChrome();
    // Reajuste robusto: en cuanto el panel tiene su tamaño real (el layout flex
    // asienta, cambia la fuente del tema, o se muestra la pestaña), refit. Evita
    // tener que redimensionar la ventana a mano para que ocupe todo.
    const onSize = () => { if (!s.pane.hidden && s.term) refit(s); };
    s.ro = new ResizeObserver(onSize);
    s.ro.observe(s.termHost);
    document.fonts?.ready.then(onSize); // la fuente del tema puede cambiar la métrica de celda
    requestAnimationFrame(() => { onSize(); if (!typingElsewhere()) s.term.focus(); });
  };

  /* Desmontar la terminal local sin tocar el chat del bridge. Al re-engancharse
     llega el scrollback entero en el 'history', así que no se pierde nada. */
  const teardownTerm = (s) => {
    if (s.ro) { try { s.ro.disconnect(); } catch { /* ya desconectado */ } s.ro = null; }
    if (s.term) { try { s.term.dispose(); } catch { /* ya liberada */ } s.term = null; }
  };

  /* Abrir de verdad el lanzador elegido: la terminal y el PTY. */
  const launchSession = (s, launcher, knowledge, projects) => {
    if (s.launched) return;
    s.launcher = launcher.id;
    if (!s.renamed) tabs.setLabel(s, launcher.label); // el nombre del lanzador (se puede renombrar)
    materialize(s);
    // medir el terminal ANTES de lanzar y mandar el tamaño en el start, para que
    // el PTY nazca con el ancho real (si no, el CLI dibuja a 80 columnas y queda
    // estrecho hasta el primer resize). Doble rAF: deja asentar el layout.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { s.fit.fit(); } catch { /* aún sin tamaño */ }
      sendOn(s.ws, msg.start(launcher.id, knowledge, projects, s.term.cols, s.term.rows));
    }));
  };

  // attach: sesión viva del bridge a re-enganchar · passive: el chat existe en
  // el bridge pero lo tiene OTRO dispositivo; se muestra la pestaña con un
  // botón para traer los chats aquí (no se roba).
  const createSession = ({ attach = null, passive = false } = {}) => {
    const id = ++counter;
    const pane = document.createElement('div');
    pane.className = 'term-pane';
    pane.hidden = true;
    const start = document.createElement('div');
    start.className = 'launcher';
    const termHost = document.createElement('div');
    termHost.className = 'term-host';
    termHost.hidden = true;
    pane.append(start, termHost);
    stackEl.appendChild(pane);
    const s = {
      id, label: attach?.label || defaultLabel(id), pane, start, termHost,
      term: null, fit: null, ro: null, ws: null, passive, tab: null, dot: null, status: 'idle',
      launched: false, renamed: !!attach?.label, launcher: attach?.launcher || null,
      color: attach?.color || null, remoteId: attach?.id || null,
      dead: false,      // el PTY murió de verdad: no hay nada que recuperar
      linkLost: false,  // el socket cayó con el chat vivo: la reconciliación decide
      handoffEl: null,  // el aviso «abierto en otro dispositivo»
      assets: (attach?.assets || []).map((a) => toAsset(a, apiBase)),
      assetsOpen: true,
      pendingAssets: [], // subidos sin socket: entran al volver
    };
    tabs.add(s);
    sessions.set(id, s);
    if (passive) showHandoff(s);
    else connectSession(s, attach);
    setActive(id);
    updateChrome();
  };

  /* Abre el socket de una sesión y cablea el protocolo. Se usa al crear la
     pestaña y también al reclamar un chat que tenía otro dispositivo. */
  const connectSession = (s, attach) => {
    const ws = new WebSocket(wsUrl());
    s.ws = ws;
    // re-enganche: montar la terminal en cuanto abra el socket y pedir attach
    ws.onopen = () => {
      if (!attach) return;
      tabs.applyColor(s);
      materialize(s);
      sendOn(ws, msg.attach(attach.id));
      assets.flushPending(s);
    };
    ws.onmessage = (e) => {
      const m = parse(e.data);
      if (!m) return;
      switch (m.type) {
        case 'launchers':
          onSkills(m.skills || []);
          accessProjects = m.accessProjects || [];
          if (!s.launched && !attach) renderStart(s, m.list);
          if (!bootstrapped) {
            bootstrapped = true;
            const own = chatSessions(m.sessions);
            if (own.length) restoreSessions(own, s.id);
          }
          break;
        case 'started':
          s.remoteId = m.sessionId;
          if (s.renamed || s.color) sendMeta(s); // sincroniza nombre/color previos
          // ya sabemos qué chat es el nuestro: re-reconciliar quita cualquier
          // pestaña fantasma de la carrera broadcast-vs-started y trae las
          // pasivas legítimas que se hubieran pospuesto en esa ventana
          if (lastSessionsList) reconcileSessions(lastSessionsList);
          break;
        case 'history':
        case 'data':
          if (s.term) s.term.write(m.data);
          break;
        case 'exit':
          s.dead = true;
          tabs.setStatus(s, 'off');
          break;
        case 'gone': // la sesión ya no existe en el bridge
          closeSession(s.id);
          break;
        case 'error':
          if (s.launched) dialogs.alert('Error de sesión', esc(m.message));
          else s.start.insertAdjacentHTML('beforeend', `<div class="launcher-err">${esc(m.message)}</div>`);
          break;
      }
    };
    ws.onclose = (e) => {
      if (s.ws !== ws) return; // socket ya sustituido por un re-enganche: no pisarlo
      const why = closeReason(e.code, { remote: remote() });
      if (why === 'locked') { gate(); return; }
      if (why === 'revoked') { onRevoked(); return; }
      if (why === 'handoff') { setPassive(s); return; }
      if (!sessions.has(s.id) || !s.launched) return; // pestaña ya cerrada aquí
      s.ws = null;
      tabs.setStatus(s, 'off');
      if (s.dead) return; // el PTY ya había salido: es una muerte real
      // Sin reconciliar aquí a propósito: la lista que tenemos es de ANTES del
      // cierre y aún nos da como enganchados. El bridge emite una nueva al
      // detectar el cierre (y al reconectar el socket de control), y es esa la
      // que decide si el chat vuelve solo o hay que ofrecer el botón.
      s.linkLost = true;
    };
    ws.onerror = () => { if (s.ws === ws && s.launched && !s.passive) tabs.setStatus(s, 'off'); };
  };

  /* Recargaste con chats vivos: re-crear sus pestañas y quitar el selector
     inicial. Solo nos enganchamos a los chats LIBRES; los que ya tiene otro
     dispositivo aparecen en modo pasivo con el botón de traerlos aquí. */
  const restoreSessions = (list, bootstrapId) => {
    for (const r of list) createSession({ attach: r, passive: !!r.attached });
    closeSession(bootstrapId);
  };

  /* Una pestaña pasiva es un chat vivo en el bridge que tiene OTRO dispositivo
     (o quedó libre al cerrarse aquel). No se roba: muestra un botón que lo
     trae a este dispositivo. */
  const showHandoff = (s) => {
    s.start.hidden = true;
    s.termHost.hidden = true;
    if (!s.handoffEl) {
      s.handoffEl = document.createElement('div');
      s.handoffEl.className = 'handoff';
      s.handoffEl.innerHTML = `
        <p>Este chat está abierto en otro dispositivo.</p>
        <button class="lab-btn primary">Usar el chat en este dispositivo</button>`;
      s.handoffEl.querySelector('button').addEventListener('click', claimAllHere);
      s.pane.appendChild(s.handoffEl);
    }
    s.handoffEl.hidden = false;
    tabs.setStatus(s, 'idle'); // punto neutro: ni vivo ni muerto
  };
  /* Otro dispositivo tomó este chat: desmontar la terminal local y quedar en
     pasivo, listo para recuperarlo con el botón. */
  const setPassive = (s) => {
    s.passive = true;
    s.launched = false;
    s.linkLost = false;
    teardownTerm(s);
    s.ws = null;
    showHandoff(s);
    updateChrome();
  };
  /* Volver a engancharse a un chat que sigue vivo en el bridge (perdimos el
     socket, o lo tenía otro dispositivo y lo reclamamos aquí). */
  const reattach = (s) => {
    s.passive = false;
    s.linkLost = false;
    if (s.handoffEl) s.handoffEl.hidden = true;
    teardownTerm(s); // fuera la terminal vieja: 'history' la repinta entera
    s.termHost.hidden = false;
    connectSession(s, { id: s.remoteId });
  };
  /* Traer el chat a este dispositivo (el que lo tenía pasa a pasivo). Cubre
     tanto las pestañas pasivas como las que perdieron el enlace. */
  const claimAllHere = () => {
    for (const s of sessions.values()) if (s.remoteId && (s.passive || s.linkLost)) reattach(s);
    updateChrome();
  };

  /* Quitar una pestaña. Con kill, también el chat del bridge (cerrar pestaña =
     matar la sesión; recargar NO pasa por aquí). Sin kill, limpieza solo local
     (el chat murió o dejó de existir). Sin chats, de vuelta al selector. */
  const dropTab = (id, { kill }) => {
    const s = sessions.get(id);
    if (!s) return;
    if (kill) {
      if (s.remoteId) killed.add(s.remoteId);
      if (s.launched && isOpen(s.ws)) sendOn(s.ws, msg.kill());
      else if (s.remoteId) sendOn(controlWS, msg.kill(s.remoteId)); // pestaña pasiva o sin socket: la X es la X
    }
    try { s.ws?.close(); } catch { /* ya cerrado */ }
    teardownTerm(s);
    s.pane.remove();
    tabs.remove(s);
    sessions.delete(id);
    if (activeId === id) {
      const next = nextActive([...sessions.keys()]);
      if (next) setActive(next);
      else { activeId = null; createSession(); }
    }
    updateChrome();
  };
  const closeSession = (id) => dropTab(id, { kill: true });
  const removeTab = (id) => dropTab(id, { kill: false });

  // Aplicar lo que diga la reconciliación (sessions.js) a las pestañas.
  const reconcileSessions = (allRemote) => {
    if (!bootstrapped) return; // el arranque lo gestiona restoreSessions
    const { list, actions, create } = reconcile(all(), allRemote, killed);
    lastSessionsList = list;
    for (const id of killed) if (!list.some((r) => r.id === id)) killed.delete(id); // ya murió del todo
    for (const a of actions) {
      const s = sessions.get(a.id);
      if (a.do === 'remove') { removeTab(s.id); continue; }
      if (a.do === 'dead') { s.linkLost = false; s.dead = true; continue; }
      // adjuntos subidos desde otro dispositivo (una foto desde el móvil): salen
      // aquí al momento, en el clip de la barra y en el panel
      if (a.assets?.length) {
        s.assets.push(...a.assets.map((x) => toAsset(x, apiBase)));
        if (s.id === activeId) { assets.render(); refitActive(); }
      }
      if (a.do === 'passive') { setPassive(s); continue; }
      if (a.do === 'reattach') { reattach(s); continue; }
      if (a.label) tabs.setLabel(s, a.label);
      if ('color' in a) { s.color = a.color; tabs.applyColor(s); }
    }
    // chats nuevos abiertos en otro dispositivo → pestaña pasiva aquí, sin
    // robar el foco de lo que se esté haciendo en ESTE dispositivo
    const keep = activeId;
    for (const r of create) createSession({ attach: r, passive: true });
    if (keep && sessions.has(keep)) setActive(keep);
  };

  /* Socket de control: siempre conectado (aunque todos los chats estén en otro
     dispositivo) para recibir la lista sincronizada; reintenta si se cae.
     También lleva la X de las pestañas pasivas (kill por sessionId). */
  let controlWS = null;
  const connectControl = () => {
    controlWS = new WebSocket(wsUrl());
    controlWS.onmessage = (e) => {
      const m = parse(e.data);
      if (!m) return;
      // 'launchers' es el saludo del bridge y trae la lista viva: reconciliar
      // también con él es lo que recupera los chats al reconectar (tras dormir el
      // Mac nadie más emite un broadcast, así que sin esto nada se cura).
      if (m.type === 'sessions' || m.type === 'launchers') reconcileSessions(m.sessions || []);
      // el ordenador cambió de tema: el móvil lo sigue al momento
      if (m.type === 'theme' && remote() && m.theme?.id) onTheme(m.theme.id);
    };
    controlWS.onclose = (e) => {
      if (e.target !== controlWS) return; // socket ya sustituido: no duplicar
      const why = closeReason(e.code, { remote: remote() });
      if (why === 'locked') { gate(); return; } // candado: nada de reintentar
      if (why === 'revoked') { onRevoked(); return; }
      setTimeout(connectControl, 3000);
    };
  };
  /* Al despertar el Mac (o volver a la ventana) el socket de control puede haber
     quedado medio abierto: no da error, pero tampoco llega nada, así que nadie
     avisaría de que los chats siguen vivos. Se rehace sin esperar, y su saludo
     trae la lista con la que se recuperan las pestañas. */
  let lastRevive = 0;
  const reviveControl = () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastRevive < 10_000) return; // el foco va y viene: no rehacerlo a cada clic
    lastRevive = now;
    const old = controlWS;
    controlWS = null;
    if (old) { old.onclose = null; try { old.close(); } catch { /* ya cerrado */ } }
    connectControl();
  };
  window.addEventListener('online', reviveControl);
  window.addEventListener('focus', reviveControl);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reviveControl(); });
  window.addEventListener('resize', () => { const s = active(); if (s?.launched) refit(s); });

  assets.wire(viewEl, stackEl);
  connectControl();
  createSession(); // arranque: el botón de abrir el chat (sin chrome de pestañas)

  return {
    active,
    upload: assets.upload,
    refitActive,
    focusActive,
    loadProjects,
    makeTerminal: () => makeTerminal(theme().term),
    // el tema cambió: todas las terminales con el nuevo
    setTermTheme: (term) => { for (const s of sessions.values()) if (s.term) s.term.options.theme = term; },
    // mandar una orden al chat activo (texto y Enter por separado: si van
    // juntos, el TUI lo trata como «pegado» y el Enter cuenta como salto de
    // línea en vez de enviar)
    sendOrder: (text) => {
      const s = active();
      if (!s?.launched || !isOpen(s.ws)) return false;
      sendOn(s.ws, msg.input(text));
      setTimeout(() => sendOn(s.ws, msg.input('\r')), 120);
      s.term.focus();
      return true;
    },
  };
};
