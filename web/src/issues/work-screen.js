// La pantalla de trabajo de una issue. A la izquierda, en pestañas: el
// detalle de la issue (por defecto), sus notas (las de Remedy y las del equipo
// en SIA, con sus movimientos, en una sola conversación: notes-html.js) y las
// relacionadas. A la derecha, sus datos clave (un cuadro que se pliega
// a una línea de resumen cuando arranca el chat) y debajo la resolución
// asistida por IA (issue-chat.js), que vive mientras la issue esté abierta y
// se puede ampliar a toda la pantalla de trabajo.
// Las parecidas, por conectar: solo su hueco.
import { esc, svg } from '../ui/html.js';
import { STATUS_ES, SEVERITY_ES, when, whenIso, whenLabel, newestFirst, age, pendingSince, stillInfo, escalatedLabel } from './format.js';
import { item } from './parts.js';
import { waitHtml } from '../ui/wait.js';
import { ACTIONS, actionsFor, CENTRE_ACTIONS } from './actions.js';
import { notesPanelHtml, notesTab, notesCountOf, PHONE } from './notes-html.js';

const WORK_TABS = [
  { key: 'detail', label: 'Detalle' },
  { key: 'notes', label: 'Seguimiento' },
  { key: 'related', label: 'Relacionadas' },
];

// Las notas de trabajo de Remedy (worklog de la foto) en tarjetas: quién,
// cuándo y qué, la más reciente arriba y abierta; el resto, plegadas con su
// primera línea. La usa el panel del Backlog (en la issue van en Notas). Sin la
// columna en la foto (cargada antes de leerla), se pide un CSV nuevo.
export const firstLine = (text) => { const l = String(text).trim().split('\n')[0]; return l.length > 90 ? `${l.slice(0, 90)}…` : l; };
export const worklogHtml = (worklog, now = new Date()) => {
  if (!worklog) return '<p class="iss-empty">La foto cargada no trae las notas de Remedy: carga un CSV nuevo de la consulta.</p>';
  if (!worklog.length) return '<p class="iss-empty">Sin notas de trabajo en Remedy.</p>';
  return `<div class="iss-wl">${newestFirst(worklog).map((n, k) => `<details class="iss-wl-card"${k === 0 ? ' open' : ''}>
      <summary><b>${esc(n.who)}</b><span class="iss-wl-peek">${esc(firstLine(n.text))}</span><time>${whenLabel(n.at, now)}</time></summary>
      <p>${esc(n.text)}</p>
    </details>`).join('')}</div>`;
};

const CHEVRON = '<svg class="iss-keys-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const EXPAND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';

// El arranque de la resolución asistida: solo el botón; si no se puede, el
// motivo debajo y el botón apagado.
export const assistHtml = (error = null) => `<div class="ai-start">
    <button class="lab-btn primary ai-start-go" data-assist ${error ? 'disabled' : ''}>Iniciar resolución asistida por IA</button>
    ${error ? `<p class="ai-start-hint">${esc(error)}</p>` : ''}
  </div>`;

// …y, pulsado, el aviso de que el agente arranca (ui/wait.js), en su sitio
export const assistWaitHtml = () => `<div class="ai-start">${waitHtml('Iniciando agente…', { hidden: false })}</div>`;

// El cuerpo del diálogo de confirmación al devolver a la cola.
export const releaseDialogHtml = (id, text) => `<div class="iss-dlg-issue"><span class="iss-dlg-code">${esc(id)}</span><span class="iss-dlg-text">${esc(text || '')}</span></div>
  <p class="iss-dlg-p">Volverá a la cola y podrá cogerla cualquier compañero.</p>`;

// La cabecera: a la vista, Resolver (la principal) y Escalar; el resto de sus acciones
// (actions.js actionsFor), en «Otras acciones»: un menú bajo el botón con lo de hablar con el
// centro, abrir un WAR-ROOM y, separado, lo de soltarla (traspasar o devolver). Lo abre y cierra
// issues-view.js.
const MAIN = ['resolve', 'escalate'];
const ACTION_BUTTON = {
  resolve: '<button class="lab-btn primary" data-act="resolve">Resolver</button>',
  escalate: '<button class="lab-btn" data-act="escalate">Escalar</button>',
};
const icon = (paths) => svg(paths, { width: 2, hidden: true });
const HANDOFF_PATHS = '<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>';
// cada una con su nombre (el de actions.js; devolver no es una ventana, sino el diálogo de confirmar)
const MORE_ITEM = {
  call: { label: ACTIONS.call.label, hint: 'Registrar una llamada con el centro', icon: PHONE },
  contact: { label: ACTIONS.contact.label, hint: 'Escribirle tus dudas como nota pública', icon: icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') },
  warroom: { label: ACTIONS.warroom.label, icon: icon('<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>') },
  transfer: { label: ACTIONS.transfer.label, hint: 'A un compañero o a otro equipo', icon: icon(HANDOFF_PATHS) },
  release: { label: 'Devolver a la cola', hint: 'Que la coja otro compañero', icon: icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>') },
};
const CHEV = icon('<path d="M6 9l6 6 6-6"/>');
const moreItem = (key) => { const m = MORE_ITEM[key]; return `<button type="button" ${key === 'release' ? 'data-release' : `data-act="${key}"`}>${m.icon}<b>${m.label}</b>${m.hint ? `<small>${m.hint}</small>` : ''}</button>`; };
// en grupos, separados por una línea: hablar con el centro, el WAR-ROOM y soltarla
const MORE_GROUPS = [CENTRE_ACTIONS, ['warroom'], ['transfer', 'release']];
const moreMenu = (keys) => {
  const groups = MORE_GROUPS.map((g) => keys.filter((k) => g.includes(k))).filter((g) => g.length);
  return `<div class="iss-more"><button type="button" class="lab-btn" data-more aria-expanded="false" aria-controls="iss-more-menu">Otras acciones${CHEV}</button><div class="iss-more-menu" id="iss-more-menu" hidden>${groups.map((g) => g.map(moreItem).join('')).join('<hr>')}</div></div>`;
};
const headerActions = (i, mine) => {
  const acts = actionsFor(i, mine);
  return `${acts.filter((k) => MAIN.includes(k)).map((k) => ACTION_BUTTON[k]).join('')}${moreMenu(acts.filter((k) => !MAIN.includes(k)))}`;
};

// Pendiente de un tercero no hay nada que resolver con la IA: en lugar del chat, sus dos acciones,
// grandes (y fuera de la cabecera, para no repetirlas)
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const HANDOFF = svg(HANDOFF_PATHS, { width: 1.6, hidden: true });
// En la cabecera, donde irían Resolver y compañía: que ya está escalada, a quién y desde cuándo
const escalatedTag = (i) => `<span class="iss-escalated" title="Pendiente de un tercero: resolver, escalar o devolverla no tiene sentido hasta que responda">${BELL}<b>${esc(escalatedLabel(i))}</b><span>desde el ${when(pendingSince(i))}</span></span>`;
// Sus acciones (actionsFor), grandes. En «Reclamar», a modo de aviso, los días que lleva parada
// (con el color de la mesa, stillLevel).
const BIG_ACTION = {
  chase: (i, now) => { const s = stillInfo(i, now); return `<button class="iss-big-act primary" data-act="chase">${BELL}<span>Reclamar respuesta</span><em class="iss-big-still ${s.level}">${s.label} sin moverse</em></button>`; },
  transfer: () => `<button class="iss-big-act" data-act="transfer">${HANDOFF}<span>Traspasar</span></button>`,
};
const pendingActs = (i, now, mine) => `<aside class="iss-card iss-pending-acts" aria-label="Qué hacer con ella">
      ${actionsFor(i, mine).map((key) => BIG_ACTION[key](i, now)).join('')}
    </aside>`;

export const workScreen = ({ issue: i, sameCenter, timeline = [], now, mine, meId = null, tab = 'detail' }) => `<div class="iss-page iss-work-page">
  <header class="iss-work-h">
    <button class="lab-btn primary" data-back>Volver al panel</button>
    <h2 title="${esc(i.text)}">${esc(i.text)}</h2>
    <div class="iss-actions">${i.status === 'PENDING' ? `${escalatedTag(i)}${moreMenu(CENTRE_ACTIONS)}` : headerActions(i, mine)}</div>
  </header>

  <div class="iss-work">
    <section class="iss-card iss-work-main">
      <div class="iss-wtabs" role="tablist">
        ${WORK_TABS.map((t) => `<button role="tab" data-wtab="${t.key}" aria-selected="${t.key === tab}">${t.key === 'notes' ? notesTab(notesCountOf({ worklog: i.worklog, timeline })) : t.label}${t.key === 'related' && sameCenter.length ? `<span>${sameCenter.length}</span>` : ''}</button>`).join('')}
      </div>

      <div class="iss-wpanel" data-wpanel="detail"${tab === 'detail' ? '' : ' hidden'}>
        <h4 class="iss-sub">Lo que dice el centro <span class="iss-low">· ${when(i.reported)}</span></h4>
        <div class="iss-notes">${esc(i.notes || 'Sin descripción.')}</div>
        ${i.resolution ? `<h4 class="iss-sub">Resolución en Remedy</h4><div class="iss-notes">${esc(i.resolution)}</div>` : ''}
        <div class="iss-facts">
          <div><h4 class="iss-sub">Ficha</h4>
            <dl class="iss-kv">
              <dt>Categoría</dt><dd>${esc(i.category || '—')}</dd>
              <dt>Grupo</dt><dd>${esc(i.group || '—')}</dd>
              <dt>Responsable</dt><dd>${esc(i.assignee || 'Nadie en Remedy')}</dd>
              <dt>Reportada</dt><dd>${when(i.reported)}</dd>
              <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
              ${i.vendorTicket ? `<dt>Ticket proveedor</dt><dd>${esc(i.vendorTicket)}</dd>` : ''}
            </dl>
          </div>
          <div><h4 class="iss-sub">Historial</h4>
            <ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}${esc(STATUS_ES[b] || b)}</li>`).join('') || '<li>Sin cambios de estado.</li>'}</ol>
          </div>
        </div>
      </div>

      <div class="iss-wpanel nt-panel" data-wpanel="notes"${tab === 'notes' ? '' : ' hidden'}>
        ${notesPanelHtml({ worklog: i.worklog, timeline, meId, now })}
      </div>
      <div class="iss-wpanel" data-wpanel="related"${tab === 'related' ? '' : ' hidden'}>
        ${i.related ? `<h4 class="iss-sub">Enlazadas en Remedy</h4><p class="iss-linked">${i.related.split('|').map((x) => `<span>${esc(x.trim())}</span>`).join('')}</p>` : ''}
        <h4 class="iss-sub">Del mismo centro <span class="iss-low">· ${sameCenter.length}</span></h4>
        ${sameCenter.length ? `<div class="iss-items">${sameCenter.map((x) => item(x, 'doing', now)).join('')}</div>` : '<p class="iss-empty">Ninguna otra abierta de este centro.</p>'}
        <h4 class="iss-sub">Parecidas <span class="iss-badge">Por conectar</span></h4>
        <p class="iss-pending">Issues de otros centros con el mismo problema y cómo se resolvieron.</p>
      </div>

    </section>

    <div class="iss-side">
    <section class="iss-card iss-keys" aria-label="Datos clave">
      <button type="button" class="iss-keys-toggle" data-keys-toggle aria-expanded="true" title="Plegar o desplegar los datos">
        <span class="iss-keys-title">Datos de la issue</span>
        <span class="iss-keys-sum"><span><i>Crit.</i><b class="k-sev ${esc(i.priority)}">${esc(SEVERITY_ES[i.priority] || i.priority)}</b></span><span><i>Origen</i><b class="k-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</b></span><span><i>Centro</i><b class="iss-code">${esc(i.center || '—')}</b></span><span><i>Remedy</i><b>${esc(i.id)}</b></span></span>
        ${CHEVRON}
      </button>
      <div class="iss-keys-fold"><div class="iss-keys-grid">
      <div class="k-sev ${esc(i.priority)}"><span>Criticidad</span><b>${esc(SEVERITY_ES[i.priority] || i.priority)}</b><small>${i.prio ? 'priorizada por negocio' : '&nbsp;'}</small></div>
      <div class="k-origin${i.sisu ? ' sisu' : ''}"><span>Origen</span><b>${i.sisu ? 'SISU' : 'SGA'}</b><small>&nbsp;</small></div>
      <div class="k-center"><span>Centro</span><b class="iss-code">${esc(i.center || '—')}</b><small>&nbsp;</small></div>
      <div class="k-link"><span>Remedy</span><b>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">Abrir ↗</a>` : '—'}</b><small>${esc(i.id)}</small></div>
      <div class="k-created"><span>Creada</span><b>${when(i.reported)}</b><small>hace ${age(i.reported, now)}</small></div>
      <div class="k-claimed"><span>Asignada</span><b>${i.claimedBy?.at ? whenIso(i.claimedBy.at) : '—'}</b><small>${i.claimedBy ? `en SIA, ${esc(i.claimedBy.name)}` : 'nadie la ha cogido en SIA'}</small></div>
      <div class="k-open"><span>Abierta</span><b>${age(i.reported, now)}</b><small>desde que se creó</small></div>
      <div class="k-moved"><span>Último movimiento</span><b>${i.modified ? `hace ${age(i.modified, now)}` : '—'}</b><small>${when(i.modified)}</small></div>
      </div></div>
    </section>
    ${i.status === 'PENDING' ? pendingActs(i, now, mine) : `<aside class="iss-card iss-chat" aria-label="Resolución asistida por IA">
      <button type="button" class="iss-chat-expand" data-chat-expand title="Ampliar el chat" aria-label="Ampliar el chat">${EXPAND}</button>
      <div class="iss-chat-body"></div>
    </aside>`}
    </div>
  </div>
</div>`;
