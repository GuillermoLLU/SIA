// El formulario de Resolver: lo que ya hay en Remedy arriba, y después las dos
// cosas que se escriben al resolver, separadas porque las lee gente distinta:
// la nota interna (el equipo y la auditoría) y el mensaje al centro (por correo).
// Cada bloque lleva su «?» con lo que se hace con él. `r`: resolveDraft(issue).
import { esc } from '../ui/html.js';
import { short } from './resolve-draft.js';

let tips = 0;
// Una ayuda: un botón «?» que enseña el texto al pasar o al enfocarlo con el teclado.
const tip = (text) => {
  const id = `iss-tip-${++tips}`;
  return `<span class="iss-tip"><button type="button" aria-describedby="${id}" aria-label="Qué es esto">?</button><span role="tooltip" id="${id}">${text}</span></span>`;
};

const area = (name, rows, d, empty) => `<textarea id="iss-f-${name}" name="${name}" rows="${rows}">${esc(d?.value || '')}</textarea>
      <small>${d ? `Sale de tu nota de ${esc(d.from)}. Cuéntalo sin jerga: lo lee el centro.` : empty}</small>`;

// El resumen de lo que se va a enviar, con lo escrito hasta ahora (se repinta
// al escribir). `v`: { note, what, how, prevent }, los valores del formulario.
const POINTS = [['what', 'Qué ocurrió'], ['how', 'Cómo se resolvió'], ['prevent', 'Qué se hará para evitarlo']];
const text = (v) => String(v || '').trim();
const missing = (label) => `<span class="iss-sum-miss">Falta: ${label.toLowerCase()}</span>`;
export const resolveSummary = (v) => `<h4>Así se enviará ${tip('Lo que saldrá al pulsar Resolver, con lo que has escrito arriba. Si algo está mal, cámbialo arriba: el resumen se actualiza solo.')}</h4>
      <div class="iss-sum">
        <div class="iss-sum-b"><b>Nota interna en Remedy</b><small>Solo el equipo</small>
          <p>${text(v.note) ? `[RESOLUCION] ${esc(text(v.note))}` : missing('Nota interna de resolución')}</p></div>
        <div class="iss-sum-b"><b>Correo de resolución</b><small>Al centro y a quien haya participado</small>
          ${POINTS.map(([k, label]) => `<p><i>${label}</i>${text(v[k]) ? esc(text(v[k])) : missing(label)}</p>`).join('')}</div>
      </div>
      <p class="iss-sum-state">La issue pasa a <b>Resuelta</b>. Si el centro no la reabre, se cierra sola a los 5 días.</p>`;

const done = (n) => `<li class="${n.note ? 'ok' : 'no'}"><i>${n.note ? '✓' : '—'}</i><span>${n.label}</span><small>${n.note ? `${short(n.note.at)} · ${esc(n.note.who)}` : n.key === 'resolution' ? 'la escribes ahora' : 'no está'}</small></li>`;

export const resolveForm = (issueId, r) => `<form class="iss-act-form iss-resolve" data-act-form="resolve" novalidate>
    <header><h3>Resolver la issue</h3><span>${esc(issueId)}</span></header>

    <section class="iss-rs">
      <h4>Lo que ya hay en Remedy ${tip('Las notas internas que pide el procedimiento, leídas del historial de la issue. Te lo enseñamos para que no tengas que ir a buscarlo: lo que ya está escrito se aprovecha abajo.')}</h4>
      <ul class="iss-done">${r.notes.map(done).join('')}</ul>
      ${r.warnings.length ? `<ul class="iss-warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    </section>

    <section class="iss-rs">
      <h4><span class="iss-rs-n">1</span>Nota interna de resolución <em>Solo la ve el equipo</em> ${tip('Se guarda en el historial de Remedy como <b>[RESOLUCION]</b>. No le llega al centro. La leen la auditoría de calidad y quien coja la issue si se reabre: cuenta qué se hizo, con el detalle técnico que haga falta.')}</h4>
      ${r.resolution
        ? `<p class="iss-rs-have">Ya la escribiste en Remedy (${short(r.resolution.at)}, ${esc(r.resolution.who)}): no hace falta repetirla.</p>
      <blockquote>${esc(r.resolution.text)}</blockquote><input type="hidden" name="note" value="${esc(r.resolution.text)}" />`
        : `<label class="iss-field" for="iss-f-note"><span>Qué se ha hecho</span>
      <textarea id="iss-f-note" name="note" rows="3"></textarea>
      <small>Técnico y concreto: la query, el script o el cambio aplicado.</small></label>`}
    </section>

    <section class="iss-rs">
      <h4><span class="iss-rs-n">2</span>Mensaje al centro <em>Lo reciben el centro y quien haya participado</em> ${tip('Es el mensaje público de resolución, por correo. Le llega a quien abrió la issue y a todos los que han participado (proveedor, desarrollo…). Lo lee gente que no es técnica, así que va sin jerga. La auditoría comprueba que trae los tres puntos y que «Qué ocurrió» coincide con tu nota de diagnóstico.')}</h4>
      <label class="iss-field" for="iss-f-what"><span>Qué ocurrió</span>
      ${area('what', 3, r.draft.what, 'Lo que pasó, contado para el centro. Tiene que coincidir con tu diagnóstico.')}</label>
      <label class="iss-field" for="iss-f-how"><span>Cómo se resolvió</span>
      ${area('how', 3, r.draft.how, 'Lo que se hizo, en palabras del centro. Si es temporal, dilo: puede volver a pasar.')}</label>
      <label class="iss-field" for="iss-f-prevent"><span>Qué se hará para evitarlo</span>
      ${area('prevent', 2, null, 'Si es un fallo del sistema, basta con decir que se ha pedido su corrección: la gestiona A&S Proyectos. Si no, una pauta para el centro.')}</label>
    </section>

    <section class="iss-rs" data-resolve-summary>
      ${resolveSummary({ note: r.resolution?.text, what: r.draft.what?.value, how: r.draft.how?.value })}
    </section>

    <p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary">Resolver</button></footer>
  </form>`;
