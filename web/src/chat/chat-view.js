// La vista Chat: un chat, con su sesión del bridge y, ocupando toda la vista,
// su conversación (conversation/view.js). Se abre desde la portada escribiendo
// la pregunta, sin elegir nada: Copilot, conocimiento autónomo y todo el
// conocimiento al que la persona tiene acceso (start.js). El chat vive en el
// bridge, no aquí: se puede recargar la página o abrir el mismo chat desde
// otro dispositivo (multidispositivo: una sesión pasiva es un chat que tiene
// otro dispositivo; no se roba, se reclama con un botón). Las reglas, en
// sessions.js y protocol.js; los adjuntos, en uploads.js.
import { esc } from '../ui/html.js';
import { chatPlan } from './start.js';
import { heroHtml } from './hero.js';
import { msg, parse, closeReason, sendOn, isOpen } from './protocol.js';
import { chatSessions, nextActive, uploadUrl, reconcile } from './sessions.js';
import { createUploads } from './uploads.js';
import { createConversationView } from './conversation/view.js';

const HERO_OUT_MS = 360; // lo que tarda la portada en irse, ampliándose (style.css: .ai-hero-host.leaving)

// api/apiBase: el bridge · wsUrl(): el socket · me: el nombre de quien entra
// (saluda la portada) · gate(): la puerta del candado · onSkills(list): las
// skills de la paleta, cuando el bridge las manda · onFirstScreen('hero' |
// 'chat'): qué se pinta primero al cargar (la portada o un chat vivo), para el
// arranque · onLogin(): llevar a Configuración → Proveedores IA (Copilot sin
// sesión) · onPalette(): abrir la paleta de skills (desde el «+» de la caja)
export const mountChatView = ({ api, apiBase, wsUrl, dialogs, me = null, gate, onSkills, onFirstScreen = () => {}, onLogin = () => {}, onPalette = null }) => {
  const viewEl = document.getElementById('view-chat');
  const stackEl = document.getElementById('chat-stack');
  const sessions = new Map();
  let counter = 0;
  let activeId = null;
  let bootstrapped = false; // tras el primer saludo del bridge restauramos sesiones vivas
  let lastSessionsList = null; // última lista del bridge (para re-reconciliar)
  let killed = new Set(); // chats cerrados aquí que el bridge aún puede listar
  let accessProjects = []; // proyectos que ves en la base de conocimiento (del bridge)
  const fileUrl = (name) => uploadUrl(apiBase, name);

  const active = () => (activeId ? sessions.get(activeId) : null);
  const all = () => [...sessions.values()];

  // ¿Está la persona escribiendo en un campo (ajustes, PIN…)? Entonces el chat
  // NO debe robarle el foco: cubre los setActive de fondo que dispara la
  // reconciliación multidispositivo.
  const typingElsewhere = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || (el.tagName === 'TEXTAREA' && !el.closest('.composer')));
  };
  const focusActive = () => { const s = active(); if (s?.launched && !viewEl.hidden) s.view.focus(); };

  const setActive = (id) => {
    activeId = id;
    for (const s of sessions.values()) s.pane.hidden = s.id !== id;
    const s = sessions.get(id);
    if (s?.launched) requestAnimationFrame(() => { if (!typingElsewhere()) s.view.focus(); });
  };

  const uploads = createUploads({ api, active, dialogs });

  /* La portada del chat (hero.js): un saludo y el campo de la pregunta. Al
     enviar, el chat arranca con esa pregunta como primer mensaje. Los
     proyectos se piden al enviar (recoge los creados al vuelo); si falta algo
     (start.js), el campo se apaga y se explica debajo. Intro envía;
     Mayús+Intro, salto. */
  const loadProjects = async () => {
    try { accessProjects = await api('/access/projects'); } catch { /* deja lo último conocido */ }
    return accessProjects;
  };
  const renderStart = (s, copilot) => {
    s.start.innerHTML = heroHtml({ me });
    const form = s.start.querySelector('[data-ask]');
    const field = form.elements.ask;
    const grow = () => { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 180)}px`; };
    field.addEventListener('input', grow);
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prompt = field.value.trim();
      if (!prompt || s.launched) return;
      field.disabled = true;
      const projects = await loadProjects();
      const plan = chatPlan({ copilot, projects });
      if (plan.error) { s.start.innerHTML = heroHtml({ me, error: plan.error }); return; }
      launchSession(s, plan, prompt);
    });
    if (!typingElsewhere()) field.focus();
  };

  /* «Nuevo chat»: se confirma, porque el chat muere en el bridge para todos
     los dispositivos; si ya había terminado, se cierra sin preguntar. */
  const closeActive = async () => {
    const s = active();
    if (!s) return;
    if (!s.dead && !(await dialogs.open({ title: 'Nuevo chat', bodyHTML: '<p class="dlg-lead">Se cierra este chat y vuelves a la portada para empezar otro.</p>', okLabel: 'Nuevo chat', centered: true }))) return;
    closeSession(s.id);
  };

  /* Montar la conversación de una sesión (común a lanzar nueva y re-enganchar).
     Se vuelve a montar al re-engancharse: lo que se estaba escribiendo pasa a
     la caja nueva. */
  const materialize = (s) => {
    s.launched = true;
    if (!s.start.classList.contains('leaving')) s.start.hidden = true; // al lanzar, la portada se va con su animación
    const draft = s.view?.draft();
    s.view?.destroy();
    s.view = createConversationView({
      host: s.pane, fileUrl,
      onSend: (text) => sendOn(s.ws, msg.say(text)),
      onStop: () => sendOn(s.ws, msg.stop()),
      onPick: (requestId, answers) => sendOn(s.ws, msg.answer(requestId, answers)),
      onApprove: (requestId, allow) => sendOn(s.ws, msg.approve(requestId, allow)),
      onAuthCheck: () => sendOn(s.ws, msg.authCheck()),
      onLogin,
      onAttach: () => uploads.pick(s),
      onSkills: onPalette,
      onClose: closeActive,
    });
    if (draft) s.view.restore(draft);
    requestAnimationFrame(() => { if (!typingElsewhere()) s.view.focus(); });
  };

  /* Desmontar la conversación local sin tocar el chat del bridge. Al
     re-engancharse llega todo lo que lleva, así que no se pierde nada. */
  const teardown = (s) => { if (s.view) { s.view.destroy(); s.view = null; } };

  /* Abrir de verdad el chat: se pide la sesión al bridge con el plan de
     start.js y la portada se queda, con un giro bajo el campo, mientras
     Copilot arranca. Cuando el bridge dice «started», la portada se va
     ampliándose y la conversación entra con la pregunta ya puesta (open). */
  const launchSession = (s, { knowledge, projects }, prompt) => {
    if (s.launched) return;
    s.launched = true;
    s.pending = prompt;
    s.start.querySelector('[data-wait]').hidden = false;
    sendOn(s.ws, msg.start(knowledge, projects, { prompt }));
  };
  const open = (s) => {
    const prompt = s.pending;
    s.pending = null;
    s.start.classList.add('leaving');
    setTimeout(() => { s.start.hidden = true; }, HERO_OUT_MS);
    materialize(s);
    s.view.local(prompt);
  };

  // attach: sesión viva del bridge a re-enganchar · passive: el chat existe en
  // el bridge pero lo tiene OTRO dispositivo; se muestra un botón para traerlo
  // aquí (no se roba).
  const createSession = ({ attach = null, passive = false } = {}) => {
    const id = ++counter;
    const pane = document.createElement('div');
    pane.className = 'chat-pane';
    pane.hidden = true;
    const start = document.createElement('div');
    start.className = 'ai-hero-host';
    pane.append(start);
    stackEl.appendChild(pane);
    const s = {
      id, pane, start,
      view: null, ws: null, passive,
      launched: false, remoteId: attach?.id || null,
      dead: false,      // el chat murió de verdad: no hay nada que recuperar
      linkLost: false,  // el socket cayó con el chat vivo: la reconciliación decide
      handoffEl: null,  // el aviso «abierto en otro dispositivo»
    };
    sessions.set(id, s);
    if (passive) showHandoff(s);
    else connectSession(s, attach);
    setActive(id);
  };

  // Copilot no tiene sesión iniciada: el aviso lleva a iniciarla; el chat, que se quedaba sin sesión, vuelve a la portada
  const noSession = (s, message) => {
    dialogs.open({ title: 'Copilot no tiene sesión iniciada', bodyHTML: `<p class="dlg-lead">${esc(message)}</p>`, okLabel: 'Ir a Proveedores IA', centered: true }).then((go) => { if (go) onLogin(); });
    if (s.launched && !s.remoteId) removeSession(s.id);
  };

  /* Abre el socket de una sesión y cablea el protocolo. Se usa al crear la
     sesión y también al reclamar un chat que tenía otro dispositivo. */
  const connectSession = (s, attach) => {
    const ws = new WebSocket(wsUrl());
    s.ws = ws;
    // re-enganche: montar la conversación en cuanto abra el socket y pedir attach
    ws.onopen = () => {
      if (!attach) return;
      materialize(s);
      sendOn(ws, msg.attach(attach.id));
    };
    ws.onmessage = (e) => {
      const m = parse(e.data);
      if (!m) return;
      switch (m.type) {
        case 'hello':
          onSkills(m.skills || []);
          accessProjects = m.accessProjects || [];
          if (!s.launched && !attach) renderStart(s, m.copilot);
          if (!bootstrapped) {
            bootstrapped = true;
            const own = chatSessions(m.sessions);
            if (own.length) restoreSessions(own, s.id);
            onFirstScreen(own.length ? 'chat' : 'hero');
          }
          break;
        case 'started':
          s.remoteId = m.sessionId;
          if (s.pending) open(s); // Copilot ya está en pie: de la portada a la conversación
          // ya sabemos qué chat es el nuestro: re-reconciliar quita cualquier
          // sesión fantasma de la carrera broadcast-vs-started y trae las
          // pasivas legítimas que se hubieran pospuesto en esa ventana
          if (lastSessionsList) reconcileSessions(lastSessionsList);
          break;
        // la conversación (conversation/view.js)
        case 'transcript': s.view?.feed(m); break;
        case 'typing': s.view?.typing(m.text); break;
        case 'thinking': s.view?.thinking(); break;
        case 'ask': s.view?.ask(m); break;
        case 'ask-off': s.view?.askOff(m.requestId); break;
        case 'turn': s.view?.turn(); break;
        case 'meta': s.view?.meta(m); break;
        case 'auth-check': // «Ya la he iniciado» en la tarjeta de «sin sesión», y su CLI dice que aún no
          if (!m.ok) dialogs.alert('Copilot sigue sin sesión iniciada', '<p class="dlg-lead">Inicia sesión en Configuración → Proveedores IA y vuelve a probar.</p>');
          break;
        case 'exit': // el chat terminó: se deja leer lo último; «Nuevo chat» vuelve a la portada
          s.dead = true;
          s.view?.ended();
          break;
        case 'gone': // la sesión ya no existe en el bridge
          closeSession(s.id);
          break;
        case 'error': // solo llega con el chat lanzado (antes el bridge solo saluda)
          if (m.auth) noSession(s, m.message);
          else { dialogs.alert('Error de sesión', esc(m.message)); if (s.launched && !s.remoteId) removeSession(s.id); } // no llegó a abrirse: de vuelta a la portada
          break;
      }
    };
    ws.onclose = (e) => {
      if (s.ws !== ws) return; // socket ya sustituido por un re-enganche: no pisarlo
      if (!bootstrapped) onFirstScreen('chat'); // sin saludo del bridge no hay portada que esperar: que se vea la app
      const why = closeReason(e.code);
      if (why === 'locked') { gate(); return; }
      if (why === 'handoff') { setPassive(s); return; }
      if (!sessions.has(s.id) || !s.launched) return; // sesión ya cerrada aquí
      s.ws = null;
      if (s.dead) return; // el chat ya había terminado: es una muerte real
      // Sin reconciliar aquí a propósito: la lista que tenemos es de ANTES del
      // cierre y aún nos da como enganchados. El bridge emite una nueva al
      // detectar el cierre (y al reconectar el socket de control), y es esa la
      // que decide si el chat vuelve solo o hay que ofrecer el botón.
      s.linkLost = true;
    };
  };

  /* Recargaste con el chat vivo: re-crear su sesión y quitar la portada. Solo
     nos enganchamos a los chats LIBRES; el que ya tiene otro dispositivo
     aparece en modo pasivo con el botón de traerlo aquí. */
  const restoreSessions = (list, bootstrapId) => {
    for (const r of list) createSession({ attach: r, passive: !!r.attached });
    closeSession(bootstrapId);
  };

  /* Una sesión pasiva es un chat vivo en el bridge que tiene OTRO dispositivo
     (o quedó libre al cerrarse aquel). No se roba: muestra un botón que lo
     trae a este dispositivo. */
  const showHandoff = (s) => {
    s.start.hidden = true;
    if (!s.handoffEl) {
      s.handoffEl = document.createElement('div');
      s.handoffEl.className = 'handoff';
      s.handoffEl.innerHTML = `
        <p>Este chat está abierto en otro dispositivo.</p>
        <button class="lab-btn primary">Usar el chat en este dispositivo</button>`;
      s.handoffEl.querySelector('button').addEventListener('click', claimHere);
      s.pane.appendChild(s.handoffEl);
    }
    s.handoffEl.hidden = false;
  };
  /* Otro dispositivo tomó este chat: desmontar lo local y quedar en pasivo,
     listo para recuperarlo con el botón. */
  const setPassive = (s) => {
    s.passive = true;
    s.launched = false;
    s.linkLost = false;
    teardown(s);
    s.ws = null;
    showHandoff(s);
  };
  /* Volver a engancharse a un chat que sigue vivo en el bridge (perdimos el
     socket, o lo tenía otro dispositivo y lo reclamamos aquí). */
  const reattach = (s) => {
    s.passive = false;
    s.linkLost = false;
    if (s.handoffEl) s.handoffEl.hidden = true;
    teardown(s); // fuera lo viejo: el bridge lo repinta entero
    connectSession(s, { id: s.remoteId });
  };
  /* Traer el chat a este dispositivo (el que lo tenía pasa a pasivo). Cubre
     tanto las sesiones pasivas como las que perdieron el enlace. */
  const claimHere = () => {
    for (const s of sessions.values()) if (s.remoteId && (s.passive || s.linkLost)) reattach(s);
  };

  /* Quitar una sesión. Con kill, también el chat del bridge («Nuevo chat» =
     matar la sesión; recargar NO pasa por aquí). Sin kill, limpieza solo local
     (el chat murió o dejó de existir). Sin chats, de vuelta a la portada. */
  const dropSession = (id, { kill }) => {
    const s = sessions.get(id);
    if (!s) return;
    if (kill) {
      if (s.remoteId) killed.add(s.remoteId);
      if (s.launched && isOpen(s.ws)) sendOn(s.ws, msg.kill());
      else if (s.remoteId) sendOn(controlWS, msg.kill(s.remoteId)); // sesión pasiva o sin socket: cerrar es cerrar
    }
    try { s.ws?.close(); } catch { /* ya cerrado */ }
    teardown(s);
    s.pane.remove();
    sessions.delete(id);
    if (activeId === id) {
      const next = nextActive([...sessions.keys()]);
      if (next) setActive(next);
      else { activeId = null; createSession(); }
    }
  };
  const closeSession = (id) => dropSession(id, { kill: true });
  const removeSession = (id) => dropSession(id, { kill: false });

  // Aplicar lo que diga la reconciliación (sessions.js) a las sesiones.
  const reconcileSessions = (allRemote) => {
    if (!bootstrapped) return; // el arranque lo gestiona restoreSessions
    const { list, actions, create, killed: stillKilled } = reconcile(all(), allRemote, killed);
    lastSessionsList = list;
    killed = stillKilled;
    for (const a of actions) {
      const s = sessions.get(a.id);
      if (a.do === 'remove') removeSession(s.id);
      else if (a.do === 'dead') { s.linkLost = false; s.dead = true; }
      else if (a.do === 'passive') setPassive(s);
      else if (a.do === 'reattach') reattach(s);
    }
    // un chat abierto en otro dispositivo → sesión pasiva aquí, sin robar el
    // foco de lo que se esté haciendo en ESTE dispositivo
    const keep = activeId;
    for (const r of create) createSession({ attach: r, passive: true });
    if (keep && sessions.has(keep)) setActive(keep);
  };

  /* Socket de control: siempre conectado (aunque todos los chats estén en otro
     dispositivo) para recibir la lista sincronizada; reintenta si se cae.
     También lleva el cierre de las sesiones pasivas (kill por sessionId). */
  let controlWS = null;
  const connectControl = () => {
    controlWS = new WebSocket(wsUrl());
    controlWS.onmessage = (e) => {
      const m = parse(e.data);
      if (!m) return;
      // el saludo del bridge trae la lista viva: reconciliar también con él es
      // lo que recupera los chats al reconectar (tras dormir el Mac nadie más
      // emite un broadcast, así que sin esto nada se cura).
      if (m.type === 'sessions' || m.type === 'hello') reconcileSessions(m.sessions || []);
    };
    controlWS.onclose = (e) => {
      if (e.target !== controlWS) return; // socket ya sustituido: no duplicar
      if (closeReason(e.code) === 'locked') { gate(); return; } // candado: nada de reintentar
      setTimeout(connectControl, 3000);
    };
  };
  /* Al despertar el Mac (o volver a la ventana) el socket de control puede haber
     quedado medio abierto: no da error, pero tampoco llega nada, así que nadie
     avisaría de que los chats siguen vivos. Se rehace sin esperar, y su saludo
     trae la lista con la que se recupera el chat. */
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

  uploads.wire(viewEl);
  connectControl();
  createSession(); // arranque: la portada

  return {
    active,
    focusActive,
    loadProjects,
    fileUrl,
    // mandar una orden al chat activo (la paleta de skills), como si se escribiera en su caja
    sendOrder: (text) => {
      const s = active();
      if (!s?.launched || !isOpen(s.ws)) return false;
      s.view.send(text);
      s.view.focus();
      return true;
    },
  };
};
