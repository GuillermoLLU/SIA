// Piezas de HTML que comparten la mesa y la pantalla de trabajo.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, REASON_ES, since } from './format.js';

export const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
export const origin = (i) => `<span class="iss-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</span>`;

// Una issue en una lista; `key` dice qué tiempo enseñar (en curso, esperando o resuelta).
export const item = (i, key, now) => `<button class="iss-item" data-id="${esc(i.id)}">
    <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${key === 'waiting' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}<span class="iss-when">${since(i, key, now)}</span></span>
    <span class="iss-text">${esc(i.text)}</span>
  </button>`;
