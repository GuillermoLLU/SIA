// La portada del Chat (dominio, sin E/S): el HTML del saludo y del campo de la
// pregunta y, escondido debajo, el aviso de que el agente arranca (ui/wait.js;
// chat-view.js lo enseña mientras el saludo y lo escrito se difuminan). Con un
// error (start.js), el campo se apaga y el motivo va debajo.
import { esc } from '../ui/html.js';
import { waitHtml } from '../ui/wait.js';

// El nombre de pila de quien entra, para el saludo; sin nombre, solo «Hola.»
export const greeting = (me) => { const first = String(me ?? '').trim().split(/\s+/)[0]; return first ? `Hola, ${first}.` : 'Hola.'; };

export const heroHtml = ({ me = null, error = null } = {}) => `<div class="ai-hero">
    <div class="ai-hero-bg" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="ai-hero-box">
      <h1 class="ai-hero-hi">${esc(greeting(me))}</h1>
      <form class="ai-ask" data-ask novalidate>
        <textarea name="ask" rows="1" placeholder="¿En qué te puedo ayudar hoy?" aria-label="Tu pregunta" ${error ? 'disabled' : ''}></textarea>
      </form>
      ${waitHtml('Iniciando agente…')}
      ${error ? `<p class="ai-hero-err">${esc(error)}</p>` : ''}
    </div></div>`;
