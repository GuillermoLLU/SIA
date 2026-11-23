// El aviso de que el agente arranca (el Chat desde su portada, el chat de una
// issue desde su botón): un giro negro y, al lado, una línea sutil. Va
// escondido y quien lo pinta lo enseña (data-wait). Sus estilos, en style.css
// (.ai-wait).
import { esc } from './html.js';

export const waitHtml = (text, { hidden = true } = {}) => `<div class="ai-wait" data-wait${hidden ? ' hidden' : ''}><i class="ai-wait-spin"></i><span>${esc(text)}</span></div>`;
