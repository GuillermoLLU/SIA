// Piezas de HTML que comparten la mesa y la pantalla de trabajo.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, REASON_ES, since, when, stamp } from './format.js';

export const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
export const origin = (i) => `<span class="iss-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</span>`;

// Me la ha traspasado alguien: la marca y, al pasar por el icono, de quién
// viene, cuándo y por qué.
const INFO = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
export const handed = (t) => (t ? `<span class="iss-handed"><span class="iss-tag-handed">Traspasada</span><span class="iss-tip" tabindex="0" aria-label="De ${esc(t.from || 'alguien')}: ${esc(t.reason || 'sin motivo')}">${INFO}<span class="iss-tip-box" role="tooltip"><b>${esc(t.from || 'Alguien')}</b> te la traspasó el ${when(stamp(new Date(t.at)))}${t.reason ? `<i>${esc(t.reason)}</i>` : ''}</span></span></span>` : '');

// Una issue en una lista; `key` dice qué tiempo enseñar (en curso, esperando o resuelta).
export const item = (i, key, now) => `<button class="iss-item" data-id="${esc(i.id)}">
    <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${key === 'waiting' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}${handed(i.transferred)}<span class="iss-when">${since(i, key, now)}</span></span>
    <span class="iss-text">${esc(i.text)}</span>
  </button>`;
