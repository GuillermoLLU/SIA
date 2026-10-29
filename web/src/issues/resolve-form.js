// Resolver, en tres pasos: 1) la nota interna (el equipo y la auditoría), que
// solo se escribe con las notas del procedimiento ya en Remedy, 2) el mensaje al
// centro (la nota externa, con un adjunto si hace falta) y 3) revisar lo que se
// va a enviar y confirmar. No se pasa de paso sin lo obligatorio. Lo escrito se
// guarda solo en la BBDD local (/api/issues/:id/draft). `r`: lo que manda el
// bridge al abrir Resolver (resolveDraft, en server/issues/resolve.js), que lo
// vuelve a comprobar todo al confirmar; `saved`: el borrador, si lo hay
// ({ at, note, what, how, prevent, lang, file }).
import { esc } from '../ui/html.js';
import { ACTIONS } from './actions.js';
import { centerMessage, LANGS } from './center-message.js';

let tips = 0;
// Una ayuda: un botón «?» que enseña el texto al pasar o al enfocarlo con el teclado.
const tip = (text) => {
  const id = `iss-tip-${++tips}`;
  return `<span class="iss-tip"><button type="button" aria-describedby="${id}" aria-label="¿Qué es esto?">?</button><span role="tooltip" id="${id}">${text}</span></span>`;
};

export const STEPS = [
  { n: 1, title: 'Nota interna', fields: ['note'] },
  { n: 2, title: 'Mensaje al centro', fields: ['what', 'how', 'prevent'] },
  { n: 3, title: 'Revisar y enviar', fields: [] },
];

// Lo que falta para salir del paso n (la etiqueta del primer campo vacío) o null.
export const stepMissing = (n, values) => {
  const need = STEPS[n - 1].fields;
  const f = ACTIONS.resolve.fields.find((x) => need.includes(x.name) && x.required && !String(values[x.name] ?? '').trim());
  return f ? f.label : null;
};

// «2026-10-27 09:12» → «27/10 09:12», como en el resto de SIA
const short = (at) => `${at.slice(8, 10)}/${at.slice(5, 7)} ${at.slice(11, 16)}`;
// el mismo tope que el bridge (draft.js): más no se guarda
const MAX_TEXT = 20000;

// El adjunto del mensaje: uno solo y, de momento, de prueba (no sale de SIA).
export const MAX_FILE = 20 * 1024 * 1024;
export const fileSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

// «2026-10-28T14:20:00.000Z» → «28/10 15:20», en la hora de este equipo
export const localShort = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// La zona del adjunto: se suelta el archivo encima o se pulsa para elegirlo.
export const fileBox = (file) => file
  ? `<p class="iss-file-on"><span data-file-name>${esc(file.name)} · ${fileSize(file.size)}</span><button type="button" class="lab-btn" data-file-clear>Quitar</button></p>`
  : `<label class="iss-drop" data-drop><input type="file" data-file hidden /><b>Arrastra aquí el archivo</b><span>o pulsa para elegirlo · uno, hasta 20 MB</span></label>`;

const area = (name, rows, d, empty, saved) => `<textarea id="iss-f-${name}" name="${name}" rows="${rows}" maxlength="${MAX_TEXT}">${esc(saved?.[name] ?? d?.value ?? '')}</textarea>
      <small>${d ? `Sale de tu nota de ${esc(d.from)}. Cuéntalo sin jerga: lo lee el centro.` : empty}</small>`;

// El paso 3: lo que se va a enviar, ya limpio y como se va a leer: la nota
// externa con la plantilla (centerMessage). `v`: los valores del formulario, ya
// completos; `file`: { name, size } o null; `msg`: { lang, hour }.
export const resolveReview = (v, file, msg) => `<p class="iss-cf-lead">Así quedará. Si algo no está bien, vuelve atrás y cámbialo.</p>

      <section class="iss-cf">
        <h4>Nota interna en Remedy <em>Solo la ve el equipo</em></h4>
        <div class="iss-cf-box"><p>[RESOLUCION] ${esc(v.note)}</p></div>
      </section>

      <section class="iss-cf">
        <h4>Nota externa para el centro en Remedy <em>Lo reciben el centro y quien haya participado</em></h4>
        <div class="iss-cf-box iss-cf-mail">${centerMessage(v, msg).map((p) => `<p>${esc(p)}</p>`).join('')}
          ${file ? `<p class="iss-cf-file">Adjunto: ${esc(file.name)} · ${fileSize(file.size)}</p>` : ''}</div>
      </section>

      <p class="iss-cf-state"><span>Estado final</span><b>Resuelta</b> Si el centro no la reabre, se cierra sola a los 5 días.</p>
      <p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>`;

const done = (n) => `<li class="${n.note ? 'ok' : 'no'}"><i>${n.note ? '✓' : '—'}</i><span>${n.label}</span><small>${n.note ? `${short(n.note.at)} · ${esc(n.note.who)}` : n.key === 'resolution' ? 'la escribes ahora' : 'no está'}</small></li>`;

const steps = () => `<ol class="iss-steps">${STEPS.map((s) => `<li data-step-mark="${s.n}"${s.n === 1 ? ' aria-current="step"' : ''}><i>${s.n}</i>${s.title}</li>`).join('')}</ol>`;

export const resolveForm = (issueId, r, saved = null) => `<form class="iss-act-form iss-resolve" data-act-form="resolve" data-step="1" novalidate>
    <header><h3>Resolver incidencia</h3><span class="iss-act-id">${esc(issueId)}</span></header>
    ${steps()}
    ${saved ? `<p class="iss-saved">Seguimos con lo que dejaste el ${localShort(saved.at)}. <button type="button" class="lab-btn" data-saved-drop>Descartar y empezar de nuevo</button></p>` : ''}

    <div class="iss-rstep" data-rstep="1">
      <section class="iss-rs">
        <h4>Lo que ya hay en Remedy ${tip('Las notas internas que pide el procedimiento, leídas del historial de la issue. Te lo enseñamos para que no tengas que ir a buscarlo: lo que ya está escrito se aprovecha.')}</h4>
        <ul class="iss-done">${r.notes.map(done).join('')}</ul>
        ${r.warnings.length ? `<ul class="iss-warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        ${r.missing.length ? `<p class="iss-block" role="alert">Para escribir la nota de cierre faltan en Remedy: <b>${r.missing.map(esc).join(', ')}</b>. Añádelas en Remedy y vuelve a cargar la foto.</p>` : ''}
      </section>

      <section class="iss-rs">
        <h4>Nota interna de resolución <em>Solo la ve el equipo</em> ${tip('Se guarda en el historial de Remedy como <b>[RESOLUCION]</b>. No le llega al centro. La leen la auditoría de calidad y quien coja la issue si se reabre: cuenta qué se hizo, con el detalle técnico que haga falta.')}</h4>
        ${r.resolution
          ? `<p class="iss-rs-have">Ya la escribiste en Remedy (${short(r.resolution.at)}, ${esc(r.resolution.who)}): no hace falta repetirla.</p>
        <blockquote>${esc(r.resolution.text)}</blockquote><input type="hidden" name="note" value="${esc(r.resolution.text)}" />`
          : `<label class="iss-field" for="iss-f-note"><span>¿Qué se ha hecho?</span>
        <textarea id="iss-f-note" name="note" rows="4" maxlength="${MAX_TEXT}"${r.missing.length ? ' disabled' : ''}>${esc(saved?.note || '')}</textarea>
        <small>Técnico y concreto: la query, el script o el cambio aplicado.</small></label>`}
      </section>
    </div>

    <div class="iss-rstep" data-rstep="2" hidden>
      <section class="iss-rs">
        <div class="iss-rs-h"><h4>Mensaje al centro <em>Lo reciben el centro y quien haya participado</em> ${tip('Es la nota externa de resolución en Remedy. Le llega a quien abrió la issue y a todos los que han participado (proveedor, desarrollo…). Lo lee gente que no es técnica, así que va sin jerga. La auditoría comprueba que trae los tres puntos y que «¿Qué ocurrió?» coincide con tu nota de diagnóstico. El saludo y la despedida se ponen solos.')}</h4>
        <fieldset class="iss-lang"><legend>Idioma del mensaje</legend>${LANGS.map((l) => `<label><input type="radio" name="lang" value="${l.key}"${(saved?.lang || 'es') === l.key ? ' checked' : ''} /><span>${l.label}</span></label>`).join('')}</fieldset></div>
        <label class="iss-field" for="iss-f-what"><span>¿Qué ocurrió?</span>
        ${area('what', 3, r.draft.what, 'Lo que pasó, contado para el centro. Tiene que coincidir con tu diagnóstico.', saved)}</label>
        <label class="iss-field" for="iss-f-how"><span>¿Cómo se resolvió?</span>
        ${area('how', 3, r.draft.how, 'Lo que se hizo, en palabras del centro. Si es temporal, dilo: puede volver a pasar.', saved)}</label>
        <label class="iss-field" for="iss-f-prevent"><span>¿Qué se hará para evitarlo?</span>
        ${area('prevent', 2, null, 'Si es un fallo del sistema, basta con decir que se ha pedido su corrección: la gestiona A&S Proyectos. Si no, una pauta para el centro.', saved)}</label>
      </section>

      <section class="iss-rs">
        <h4>Adjunto <em>Opcional · uno</em> ${tip('Va con la nota externa al centro: una captura, un listado… Solo uno, de hasta 20 MB. Se guarda con el borrador.')}</h4>
        <div data-file-box>${fileBox(saved?.file)}</div>
      </section>
    </div>

    <div class="iss-rstep" data-rstep="3" hidden></div>

    <p class="iss-act-err" hidden></p>
    <footer>
      <small class="iss-autosave" data-autosave>${saved ? `Borrador guardado ${localShort(saved.at)}` : 'El borrador se guarda solo mientras escribes'}</small>
      <button type="button" class="lab-btn" data-act-cancel>Cancelar</button>
      <button type="button" class="lab-btn" data-step-back hidden>Atrás</button>
      <button type="button" class="lab-btn primary" data-step-next${r.missing.length ? ' disabled' : ''}>Siguiente: mensaje al centro</button>
      <button type="submit" class="lab-btn primary" data-confirm-send hidden>Confirmar y resolver</button>
    </footer>
  </form>`;
