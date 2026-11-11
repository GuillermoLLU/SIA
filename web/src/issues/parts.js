// Piezas de HTML que comparten la mesa y la pantalla de trabajo.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, REASON_ES, since, whenIso, when, stillInfo } from './format.js';

// El icono de recargar que acompaña a la fecha de la foto de Remedy (la mesa, el Backlog)
export const REFRESH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>';

export const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
export const origin = (i) => `<span class="iss-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</span>`;

// Me la ha traspasado alguien: la marca y, al pasar por el icono, de quién
// viene, cuándo y por qué.
const INFO = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
export const handed = (t) => (t ? `<span class="iss-handed"><span class="iss-tag-handed">Traspasada</span><span class="iss-tip" tabindex="0" aria-label="De ${esc(t.from || 'alguien')}: ${esc(t.reason || 'sin motivo')}">${INFO}<span class="iss-tip-box" role="tooltip"><b>${esc(t.from || 'Alguien')}</b> te la traspasó el ${whenIso(t.at)}${t.reason ? `<i>${esc(t.reason)}</i>` : ''}</span></span></span>` : '');

// Una pendiente de terceros: los días sin moverse, bien a la vista y con su color (format.js stillLevel)
const still = (i, now) => { const s = stillInfo(i, now); return `<span class="iss-still ${s.level}" title="Sin moverse desde el ${when(i.modified)}"><b>${s.label}</b> sin moverse</span>`; };

// Una issue en una lista; `key` dice qué tiempo enseñar (en curso, esperando o resuelta).
export const item = (i, key, now) => `<button class="iss-item" data-id="${esc(i.id)}">
    <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${key === 'waiting' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}${handed(i.transferred)}${key === 'waiting' ? '' : `<span class="iss-when">${since(i, key, now)}</span>`}</span>
    <span class="iss-text">${esc(i.text)}</span>${key === 'waiting' ? still(i, now) : ''}
  </button>`;
