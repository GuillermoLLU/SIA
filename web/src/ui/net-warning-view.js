// El aviso de lo que le falta al equipo para la red del cliente (net-warning.js),
// igual en toda SIA: qué falta, la frase con la guía de certificados y
// «Reintentar». Cada vista lo pone en su sitio, en un contenedor con
// la clase net-warn, y decide qué hace «Reintentar» (el botón con data-net-retry):
// la puerta de inicio de sesión, Métricas… Solo DOM.
import './net-warning.css';
import { esc } from './html.js';
import { warning } from './net-warning.js';

// r: { code, error, help } (lo que manda el bridge) → el HTML de dentro del aviso.
export const netWarningHtml = (r) => {
  const url = r.help?.url || '';
  const { title, line } = warning(r, Boolean(url));
  const guide = `la <a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">guía de certificados ↗</a>`;
  return `<p class="net-warn-title">${esc(title)}</p>
  ${line ? `<p class="net-warn-line">${esc(line).replace('{guía}', guide)}</p>` : ''}
  <button type="button" class="lab-btn primary net-retry" data-net-retry>Reintentar</button>
  <div class="lock-msg"></div>`;
};

// «Reintentar» y sigue faltando: el aviso se sacude.
export const shake = (box) => { box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad'); };
