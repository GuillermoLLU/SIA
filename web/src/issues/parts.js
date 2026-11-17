// Piezas de HTML que comparten la mesa y la pantalla de trabajo.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, REASON_ES, JIRA_ES, since, whenIso, when, stillInfo, jiraDone } from './format.js';

// El icono de recargar que acompaña a la fecha de la foto de Remedy (la mesa, el Backlog)
export const REFRESH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>';

export const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
export const origin = (i) => `<span class="iss-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</span>`;

// Me la ha traspasado alguien: la marca y, al pasar por el icono, de quién
// viene, cuándo y por qué.
const INFO = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
export const handed = (t) => (t ? `<span class="iss-handed"><span class="iss-tag-handed">Traspasada</span><span class="iss-tip" tabindex="0" aria-label="De ${esc(t.from || 'alguien')}: ${esc(t.reason || 'sin motivo')}">${INFO}<span class="iss-tip-box" role="tooltip"><b>${esc(t.from || 'Alguien')}</b> te la traspasó el ${whenIso(t.at)}${t.reason ? `<i>${esc(t.reason)}</i>` : ''}</span></span></span>` : '');

// Una pendiente de terceros: los días sin moverse, bien a la vista y con su color (format.js stillLevel).
// Si su Jira ya está resuelto, lo que toca es cerrarla.
const still = (i, now) => {
  if (jiraDone(i)) return `<span class="iss-still done" title="Su Jira está resuelto${i.jira.at ? ` desde el ${when(i.jira.at)}` : ''}: se cierra sola (en Remedy, cuando conectemos SIGLO)"><b>Cerrada</b> Jira resuelto</span>`;
  const s = stillInfo(i, now);
  return `<span class="iss-still ${s.level}" title="Sin moverse desde el ${when(i.modified)}"><b>${s.label}</b> sin moverse</span>`;
};

// El Jira al que espera, con su estado; en su lugar iría el motivo de Remedy, que dice menos.
const jira = (j) => `<span class="iss-jira ${esc(j.state)}" title="Jira ${esc(JIRA_ES[j.state] || j.state)}">${esc(j.key)}<i>${esc(JIRA_ES[j.state] || j.state)}</i></span>`;
const waitingFor = (i) => (i.jira ? jira(i.jira) : i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : '');
// De quién es, en el seguimiento del equipo
const owner = (i) => `<span class="iss-owner${i.mine ? ' mine' : ''}">${i.mine ? 'Tuya' : esc(i.owner || 'Sin dueño')}</span>`;

// Una issue en una lista; `key` dice qué tiempo enseñar (en curso, esperando o resuelta).
// 'team': un escalado del equipo, con su dueño.
export const item = (i, key, now) => {
  const waiting = key === 'waiting' || key === 'team';
  return `<button class="iss-item" data-id="${esc(i.id)}">
    <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${key === 'team' ? owner(i) : ''}${waiting ? waitingFor(i) : ''}${handed(i.transferred)}${waiting ? '' : `<span class="iss-when">${since(i, key, now)}</span>`}</span>
    <span class="iss-text">${esc(i.text)}</span>${waiting ? still(i, now) : ''}
  </button>`;
};

// Un escalado del equipo: la fila y, a su derecha, «⋮», que asoma al pasar por encima sin mover los
// días y abre un menú como «Otras acciones» (lo abre y cierra issues-view.js, data-more): la de otro
// me la asigno (pasa a mi mesa) o se reasigna; el Jira se abre si hay base de Jira en Conexiones.
const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ACT_ICON = {
  take: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>'),
  reassign: icon('<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>'),
  jira: icon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
};
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
export const teamItem = (e, now) => {
  const acts = [
    e.mine ? '' : `<button type="button" data-esc-take="${esc(e.id)}">${ACT_ICON.take}<b>Asignármela</b><small>Pasa a tu mesa como tuya</small></button><button type="button" data-esc-reassign="${esc(e.id)}">${ACT_ICON.reassign}<b>Reasignar</b><small>A otro compañero</small></button>`,
    e.jira.url ? `<a href="${esc(e.jira.url)}" target="_blank" rel="noopener">${ACT_ICON.jira}<b>Abrir en Jira</b><small>${esc(e.jira.key)}</small></a>` : '',
  ].join('');
  const menu = `iss-esc-menu-${esc(e.id)}`;
  return `<div class="iss-esc-row">${item(e, 'team', now)}${acts ? `<div class="iss-esc-more"><button type="button" class="iss-esc-dots" data-more aria-expanded="false" aria-controls="${menu}" aria-label="Acciones de ${esc(e.id)}">${DOTS}</button><div class="iss-more-menu" id="${menu}" hidden>${acts}</div></div>` : ''}</div>`;
};
