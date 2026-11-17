// Registrar una llamada al centro (dominio y su ventana, sin E/S; el cableado,
// issues-view.js). Se apunta el teléfono y lo que se habló («Guardar llamada»)
// o solo el teléfono si no respondieron («No responden»). Queda como una nota
// interna con la etiqueta de llamada de Remedy (CALLOK o CALLKO) y el teléfono
// delante, que es como la pinta Seguimiento (notes.js: callOf) y como el equipo
// la escribe en Remedy («[CALLKO] +90 212 555 0143»). Aún no llega a Remedy:
// irá por SIGLO cuando lo conectemos, como Resolver, Escalar o Reclamar.
import { esc } from '../ui/html.js';
import { callOf, isPhone, PHONE } from './notes.js';

// Qué se puede guardar con lo escrito: una llamada atendida necesita teléfono y
// lo que se habló; una sin respuesta, solo el teléfono.
export const callReady = ({ phone = '', comment = '' } = {}) => ({ answered: isPhone(phone) && !!String(comment).trim(), noAnswer: isPhone(phone) });

// La nota que la registra
// (sin respuesta y sin nada más, lo que escribiría el técnico: «Intentamos contactar…»)
const NO_ANSWER = 'Intentamos contactar con el centro y no responden.';
export const callNote = ({ phone, comment = '', answered }) => ({
  body: `${String(phone).trim()} ${String(comment).trim() || (answered ? '' : NO_ANSWER)}`.trim(),
  tag: answered ? 'CALLOK' : 'CALLKO',
  visibility: 'internal',
});

// El teléfono que se propone: el de la última llamada de la issue; si no hay,
// el de contacto que deja el centro en su descripción («Contact Phone: …»).
const CONTACT = new RegExp(String.raw`contact\s*phone\s*:?\s*(${PHONE})`, 'i');
export const suggestedPhone = (feed = [], notes = '') => {
  const last = [...feed].reverse().map(callOf).find((c) => c?.phone);
  if (last) return { phone: last.phone, from: 'last' };
  const m = String(notes || '').match(CONTACT);
  return m ? { phone: m[1].trim(), from: 'contact' } : { phone: '', from: null };
};

// La ventana: el teléfono (con el propuesto) y lo que se habló; abajo,
// Cancelar a la izquierda y, a la derecha, «No responden» y «Guardar llamada»
// (primero en el código: es el que manda Intro).
const FROM = { last: 'El de la última llamada.', contact: 'El de contacto que dejó el centro.' };
export const callForm = (issueId, { phone = '', from = null } = {}) => `<form class="iss-act-form iss-call" data-act-form="call" novalidate>
    <header><h3>Llamada al centro</h3><span>${esc(issueId)}</span></header>
    <label class="iss-field" for="iss-f-phone"><span>Teléfono</span><input id="iss-f-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+34 600 000 000" value="${esc(phone)}" />${from ? `<small>${FROM[from]}</small>` : ''}</label>
    <label class="iss-field" for="iss-f-comment"><span>Lo que se habló</span><textarea id="iss-f-comment" name="comment" rows="5"></textarea><small>Si no responden, no hace falta: pulsa «No responden» y queda el intento.</small></label>
    <p class="iss-act-note">Queda en el Seguimiento de la issue en SIA. Aún no llega a Remedy: irá por SIGLO cuando lo conectemos.</p>
    <p class="iss-act-err" hidden></p>
    <footer><button type="submit" class="lab-btn primary" name="outcome" value="answered" disabled>Guardar llamada</button><button type="submit" class="lab-btn" name="outcome" value="noanswer" ${isPhone(phone) ? '' : 'disabled'}>No responden</button><button type="button" class="lab-btn" data-act-cancel>Cancelar</button></footer>
  </form>`;
