// El aviso de lo que le falta al equipo para la red del cliente (net-warning.js),
// igual en toda SIA: el título con su porqué en la ⓘ, la frase con la guía de
// certificados y «Reintentar». Cada vista lo pone en su sitio, en un contenedor con
// la clase net-warn, y decide qué hace «Reintentar» (el botón con data-net-retry):
// la puerta de inicio de sesión, Métricas… Solo DOM.
import './net-warning.css';
import { esc } from './html.js';
import { warning } from './net-warning.js';

const INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

// r: { code, error, help } (lo que manda el bridge) → el HTML de dentro del aviso.
export const netWarningHtml = (r) => {
  const url = r.help?.url || '';
  const { title, line, tips } = warning(r, Boolean(url));
  const guide = `la <a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">guía de certificados ↗</a>`;
  const tip = tips.map(esc).join('<br><br>');
  return `<p class="net-warn-title">${esc(title)}${tip ? ` <span class="info-tip" tabindex="0" aria-label="Más información">${INFO}<span role="tooltip">${tip}</span></span>` : ''}</p>
  ${line ? `<p class="net-warn-line">${esc(line).replace('{guía}', guide)}</p>` : ''}
  <button type="button" class="lab-btn primary net-retry" data-net-retry>Reintentar</button>
  <div class="lock-msg"></div>`;
};

// «Reintentar» y sigue faltando: el aviso se sacude.
export const shake = (box) => { box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad'); };
