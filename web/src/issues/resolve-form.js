// Resolver, en cinco pasos y uno solo a la vista: 1) la nota interna (el equipo y la
// auditoría); 2, 3 y 4) el mensaje al centro, una pregunta por paso (qué ocurrió,
// cómo se resolvió, qué se hará para evitarlo), con sus imágenes; y 5) el informe:
// «Generar informe» pide a la IA la redacción limpia, que se revisa antes de resolver. No se pasa de paso sin lo obligatorio. Lo escrito se guarda solo en la BBDD local (/api/issues/:id/draft).
// `r`: lo que manda el bridge al abrir Resolver (resolveDraft, en
// server/issues/resolve.js), que lo vuelve a comprobar todo al confirmar;
// `saved`: el borrador, si lo hay ({ at, note, what, how, prevent, lang, step, images }).
// Las imágenes van numeradas y en el texto como [imagenN]: el técnico las coloca
// donde quiera (pegar, arrastrar la miniatura al texto) y la IA sabrá dónde van.
import { esc } from '../ui/html.js';
import { ACTIONS } from './actions.js';
import { toHtml, imageTag, TAG } from './tag-editor.js';
import { FULL, noteQuality } from './quality.js';

// Los idiomas del mensaje al centro
const LANGS = [{ key: 'es', label: 'Español' }, { key: 'en', label: 'English' }];

export const STEPS = [
  { n: 1, title: 'Nota interna', fields: ['note'] },
  { n: 2, title: 'Causa', fields: ['what'], group: 'Mensaje al centro' },
  { n: 3, title: 'Solución', fields: ['how'], group: 'Mensaje al centro' },
  { n: 4, title: 'Prevención', fields: ['prevent'], group: 'Mensaje al centro' },
  { n: 5, title: 'Informe', fields: [] },
];
export const LAST = STEPS.length;

// Lo que falta para salir del paso n (la etiqueta del primer campo vacío) o null.
export const stepMissing = (n, values) => {
  const need = STEPS[n - 1].fields;
  const f = ACTIONS.resolve.fields.find((x) => need.includes(x.name) && x.required && !String(values[x.name] ?? '').trim());
  return f ? f.label : null;
};

// El paso en el que se retoma un borrador: en el que se quedó, si los de antes
// siguen completos. El último nunca: la redacción se hace al llegar.
export const resumeStep = (r, saved) => {
  if (!saved) return 1;
  const step = Math.min(saved.step || 1, LAST - 1);
  for (let n = 1; n < step; n++) if (stepMissing(n, { ...saved, note: saved.note?.trim() ? saved.note : (r.resolution?.text ?? '') })) return n;
  return step;
};

// «2026-10-27 09:12» → «27/10 09:12», como en el resto de SIA
export const short = (at) => `${at.slice(8, 10)}/${at.slice(5, 7)} ${at.slice(11, 16)}`;

// Las imágenes: hasta MAX_IMAGES por resolución, de hasta MAX_FILE cada una (de momento no salen de SIA).
export const MAX_FILE = 15 * 1024 * 1024;
export const MAX_IMAGES = 10;
const fileSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
// «2026-10-28T14:20:00.000Z» → «28/10 15:20», en la hora de este equipo
export const localShort = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// El muelle de imágenes de un paso, siempre a la derecha del texto: las miniaturas, cada
// una con su [imagenN] (se arrastra al texto para colocarla) y su quitar, y debajo el
// hueco para añadir (pulsar, pegar o arrastrar; al arrastrar se marca como destino).
const ADD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg>';
const thumb = (im) => `<figure class="rv-img" draggable="true" data-img="${im.n}" title="${esc(im.name)} · ${fileSize(im.size)}. Arrástrala al texto para colocarla">${im.url ? `<img src="${esc(im.url)}" alt="" />` : '<span class="rv-img-wait"></span>'}<figcaption>${imageTag(im.n)}</figcaption><button type="button" class="rv-img-x" data-img-drop="${im.n}" aria-label="Quitar ${imageTag(im.n)}">×</button></figure>`;
// `name`: el campo del paso (sus imágenes son las que su texto nombra con [imagenN]); sin
// nombre, todas. `total`: cuántas hay en la resolución, para el tope.
export const imagesDock = (images = [], name = null, total = images.length) => `<aside class="rv-dock" data-images${name ? ` data-for="${name}"` : ''}>
      <p class="rv-dock-hint">Suelta aquí las imágenes</p>
      ${images.map(thumb).join('')}
      ${total < MAX_IMAGES ? `<label class="rv-dock-add"><input type="file" accept="image/*" multiple data-file${name ? ` data-for="${name}"` : ''} />${ADD_ICON}<span>${images.length ? 'Otra imagen' : 'Imágenes'}</span><small>Pulsa, pega o arrastra</small></label>` : ''}
    </aside>`;

// La barra se llena en caliente con lo escrito, y debajo, a la derecha y en pequeño, la palabra; todo del color del estado.
export const noteMeter = (text, name = 'note') => { const q = noteQuality(text, FULL[name]); return `<div class="rv-meter" data-meter="${name}" data-level="${q.level}" aria-hidden="true"><div class="rv-meter-bar"><i style="width:${q.pct}%"></i></div><span>${q.label}</span></div>`; };

// La marca de la nota que ya estaba en Remedy. Mientras no se toca, dice quién y cuándo;
// en cuanto se cambia, pasa a ser el botón que la restaura (el mismo elemento, mismo tono).
const UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.3L3 8"/></svg>';
export const doneMark = ({ at, who, text }, changed = false) => `<button type="button" class="rv-done${changed ? ' changed' : ''}" data-restore-note data-original="${esc(text)}"${changed ? '' : ' disabled'}><span data-done>${CHECK}Se completó el ${short(at)} por ${esc(who)}</span><span data-restore>${UNDO}Restaurar la nota de ${esc(who)}</span></button>`;

// Un campo: el editor (tag-editor.js) y el campo oculto que lleva su texto al formulario.
const area = (name, d, saved) => { const v = saved?.[name] ?? d?.value ?? ''; return `<div class="rv-ed" contenteditable="plaintext-only" id="iss-f-${name}" data-ed="${name}" role="textbox" aria-multiline="true">${toHtml(v)}</div><input type="hidden" name="${name}" value="${esc(v)}" />`; };
// Las imágenes de una sección: las que su texto nombra con [imagenN].
export const sectionImages = (images, text) => images.filter((im) => String(text ?? '').includes(imageTag(im.n)));

// Las tres preguntas del mensaje al centro, un paso cada una: la pregunta como título y el
// campo a todo el alto; a la derecha, las imágenes que ese texto nombra. El idioma se elige al revisar.
const QUESTIONS = [
  { n: 2, name: 'what', label: '¿Qué ha ocurrido?' },
  { n: 3, name: 'how', label: '¿Cómo se ha resuelto?' },
  { n: 4, name: 'prevent', label: '¿Qué se hará para que no se repita?' },
];
// Antes de redactar: lo que decide el técnico (el idioma para el centro, otros archivos que
// acompañen al informe) y el botón que lanza a la IA. Los archivos de más, de momento, solo se
// listan aquí (no salen de SIA).
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>';
// A la izquierda, lo escrito en los cuatro pasos (un extracto y cuánto cuenta cada uno; pulsar
// uno vuelve a su paso); a la derecha, las opciones y el botón. Llena el paso, como los demás.
const EXCERPT = 180;
const IMG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg>';
const summaryItems = (v) => [['note', 1, 'Nota interna'], ['what', 2, 'Causa'], ['how', 3, 'Solución'], ['prevent', 4, 'Prevención']].map(([name, n, title]) => {
  const text = String(v[name] ?? '').replace(TAG, '').replace(/\s+/g, ' ').trim();
  const q = noteQuality(v[name], FULL[name]);
  return { n, title, excerpt: text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1).trimEnd()}…` : text, label: q.label, level: q.level, images: (String(v[name] ?? '').match(TAG) || []).length };
});
export const summaryHtml = (v) => summaryItems(v).map((it) => `<li><button type="button" data-go="${it.n}" title="Volver a ${it.title}"><span class="rv-sum-h"><b>${it.title}</b><em data-level="${it.level}">${it.label}</em>${it.images ? `<small>${IMG_ICON}${it.images} ${it.images === 1 ? 'imagen' : 'imágenes'}</small>` : ''}</span><span class="rv-sum-x">${esc(it.excerpt)}</span></button></li>`).join('');
const generatePanel = (saved) => `<div class="rv-gen" data-gen>
            <section class="rv-gen-sum"><h4>Lo que has escrito</h4><ol data-summary></ol></section>
            <section class="rv-gen-opts">
              <h4 class="rv-gen-title">Preparar el informe</h4>
              <div class="rv-gen-row"><span>Idioma del mensaje al centro</span>${langChips(saved)}</div>
              <div class="rv-gen-row rv-gen-grow"><span>Otros archivos</span>
                <label class="rv-gen-files"><input type="file" multiple data-extra />${FILE_ICON}<b>Añadir archivos</b><small>Opcional · informes, zips…</small></label>
                <ul class="rv-extras" data-extra-list></ul></div>
            </section>
          </div>`;
// Mientras redacta: las fases, que se van marcando (de momento, un simulacro: issues-view.js).
// «Unificando archivos» solo si hay imágenes u otros archivos.
const PHASES = [
  { key: 'read', text: 'Leyendo todo lo que has escrito' },
  { key: 'improve', text: 'Formateando y mejorando respuestas' },
  { key: 'files', text: 'Unificando archivos', ifFiles: true },
  { key: 'draft', text: 'Preparando el borrador' },
];
const phasesFor = (hasFiles) => PHASES.filter((p) => !p.ifFiles || hasFiles);
// Al resolver: lo que hace SIA con el informe (de momento, también un simulacro).
const CLOSE_PHASES = [
  { key: 'upload', text: 'Subiendo el informe' },
  { key: 'rag', text: 'Actualizando el conocimiento' },
  { key: 'close', text: 'Cerrando la incidencia' },
];
export const closePhasesHtml = () => CLOSE_PHASES.map((p) => `<li data-phase="${p.key}"><i></i>${p.text}</li>`).join('');
const loader = () => `<div class="rv-loader" data-loader hidden>
            <h4 class="rv-loader-title" data-loader-title>Redactando el informe</h4>
            <i class="rv-spin"></i>
            <ol class="rv-phases" data-phases></ol>
          </div>`;
export const phasesHtml = (hasFiles) => phasesFor(hasFiles).map((p) => `<li data-phase="${p.key}"><i></i>${p.text}</li>`).join('');

// El borrador: el mensaje al centro que devuelve la IA (de momento, un texto de relleno con la
// forma que tendrá) y «Descargar PDF». `v`: lo escrito; `images`.
const LOREM = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae ligula in nulla fermentum convallis, sed porttitor mauris tincidunt.', 'Praesent ac justo eget lectus elementum facilisis. Donec euismod, nisl at posuere vestibulum, elit urna porta dolor, vel sagittis sapien purus id risus.', 'Curabitur in sem non augue ultrices lacinia. Vivamus efficitur, lorem sit amet varius faucibus, risus purus tempor mauris, non congue metus ipsum sed ante.', 'Sed dictum, massa in luctus venenatis, ligula est hendrerit risus, a interdum velit nibh nec dui. Aliquam erat volutpat.'];
// El mensaje no lleva las imágenes sueltas: la IA las agrupa en un único documento adjunto.
const ZIP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 12h1v1h-1zM11 13h1v1h-1zM10 14h1v1h-1zM11 15h1v1h-1z"/></svg>';
const attachmentName = (issueId) => `adjuntos_${String(issueId || 'informe')}.zip`;
const mockMail = (v, images = [], { lang = 'es', hour = 12, issueId = '' } = {}) => {
  const t = lang === 'en' ? { greet: hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,', bye: 'Kind regards.', what: 'What happened', how: 'How it was solved', prevent: 'What we will do to prevent it', att: 'Attachment', imgs: (n) => `${n} ${n === 1 ? 'image' : 'images'}` }
    : { greet: hour < 14 ? 'Buenos días:' : hour < 21 ? 'Buenas tardes:' : 'Buenas noches:', bye: 'Un saludo.', what: 'Qué ha ocurrido', how: 'Cómo se ha resuelto', prevent: 'Qué se hará para que no se repita', att: 'Adjunto', imgs: (n) => `${n} ${n === 1 ? 'imagen' : 'imágenes'}` };
  const size = images.reduce((a, im) => a + (im.size || 0), 0);
  return `<section class="rv-rep rv-rep-mail">
        <div class="rv-rep-edit" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Mensaje al centro" data-rep-text>
        <p>${t.greet}</p>
        <h5>${t.what}</h5><p>${LOREM[2]}</p>
        <h5>${t.how}</h5><p>${LOREM[3]}</p>
        <h5>${t.prevent}</h5><p>${LOREM[0]}</p>
        <p>${t.bye}</p>
        </div>
        ${images.length ? `<div class="rv-rep-att"><i>${ZIP_ICON}</i><div><b>${esc(attachmentName(issueId))}</b><small>${t.att} · ${t.imgs(images.length)} · ${fileSize(size)}</small></div></div>` : ''}
      </section>`;
};
const PDF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
// El borrador: solo el mensaje al centro, y «Descargar PDF» encima, a la derecha.
export const reportHtml = (v, images, opts) => `<div class="rv-rtools"><small data-rep-hint>Puedes retocar el texto antes de resolver</small><button type="button" class="rv-link" data-rep-restore hidden>${UNDO}Volver al texto de la IA</button><button type="button" class="lab-btn rv-pdf" data-pdf>${PDF_ICON}Descargar PDF</button></div>
        <div class="rv-rpanel" data-rpanel="mail">${mockMail(v, images, opts)}</div>`;

const langChips = (saved) => `<fieldset class="iss-lang"><legend>Idioma del mensaje</legend>${LANGS.map((l) => `<label><input type="radio" name="lang" value="${l.key}"${(saved?.lang || 'es') === l.key ? ' checked' : ''} /><span>${l.label}</span></label>`).join('')}</fieldset>`;
const questionStep = (q, d, saved, images) => { const v = saved?.[q.name] ?? d?.value ?? ''; return `<section class="rv-step" data-rstep="${q.n}" hidden>
        <div class="rv-cap"><b>${q.label}</b></div>
        <div class="rv-text">
          <div class="iss-field rv-grow">${area(q.name, d, saved)}${noteMeter(v, q.name)}</div>
        </div>
        ${imagesDock(sectionImages(images, v), q.name, images.length)}
      </section>`; };

// Con puntos del procedimiento sin cubrir en Remedy no se abre el asistente: un
// aviso con lo que hay y lo que falta, y la IA para ayudar a completarlo.
export const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const MISSING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
// La Resolución no es un punto previo: se escribe en el asistente, así que aquí no sale.
const point = (n) => `<li class="${n.note ? 'ok' : 'no'}"><i>${n.note ? CHECK : MISSING}</i><span>${n.label}</span><small>${n.note ? `${short(n.note.at)} · ${esc(n.note.who)}` : 'Falta'}</small></li>`;
// Escalar enseña el mismo aviso con su título y su botón (`chat`: el atributo que lo distingue).
export const resolveBlocked = (issueId, r, { title = 'Aún no se puede resolver', chat = 'data-resolve-chat' } = {}) => `<div class="rb" role="alertdialog" aria-labelledby="rb-title">
    <div class="rb-head">
      <span class="rb-icon">${ALERT}</span>
      <div>
        <h3 id="rb-title">${title}</h3>
        <p><b>${esc(issueId)}</b></p>
      </div>
    </div>
    <ul class="rb-list">${r.notes.filter((n) => n.key !== 'resolution').map(point).join('')}${r.missing.includes('Categoría') ? `<li class="no"><i>${MISSING}</i><span>Categoría de la issue</span><small>Falta</small></li>` : ''}</ul>
    <footer class="rb-foot">
      <button type="button" class="lab-btn primary" ${chat}>Completar con ayuda de la IA</button>
    </footer>
  </div>`;

// El stepper: los pasos en fila unidos por líneas. Los del mensaje al centro van juntos en un
// grupo (líneas cortas entre ellos y el corchete con la etiqueta debajo); las líneas a los lados
// del grupo se reparten el espacio libre, así el grupo queda centrado.
const stepItem = (s) => `<li data-step-mark="${s.n}"${s.n === LAST ? ' class="last"' : ''}${s.n === 1 ? ' aria-current="step"' : ''}><i>${s.n}</i><span>${s.title}</span></li>`;
const steps = () => {
  const out = [];
  for (let i = 0; i < STEPS.length; i++) {
    const g = STEPS[i].group;
    if (!g) { out.push(stepItem(STEPS[i])); continue; }
    const members = [];
    while (STEPS[i]?.group === g) members.push(STEPS[i++]);
    out.push(`<li class="rv-steps-group"><ol>${members.map(stepItem).join('')}</ol><b>${g}</b></li>`);
    if (i < STEPS.length) out.push('<li class="rv-steps-link"></li>');
    i--;
  }
  return `<ol class="rv-steps">${out.join('')}</ol>`;
};

// El identificador, bajo el título y en pequeño; si la issue tiene enlace, lleva a su ticket.
export const issueRef = (issueId, link) => (link
  ? `<a class="rv-id" href="${esc(link)}" target="_blank" rel="noopener" title="Abrir el ticket">${esc(issueId)}</a>`
  : `<span class="rv-id">${esc(issueId)}</span>`);

export const resolveForm = (issueId, r, saved = null, link = null) => { const images = saved?.images || []; return `<form class="iss-act-form rv" data-act-form="resolve" data-step="1" novalidate>
    <header class="rv-head"><h3>Resolver incidencia</h3>${issueRef(issueId, link)}</header>
    ${steps()}
    <input type="hidden" name="step" value="1" />
    <div class="rv-body">
      <section class="rv-step" data-rstep="1">
        <div class="rv-cap"><b>Nota interna de resolución</b>${r.resolution ? doneMark(r.resolution, (saved?.note ?? r.resolution.text) !== r.resolution.text) : ''}</div>
        <div class="rv-text">
          <div class="iss-field rv-grow">${area('note', r.resolution ? { value: r.resolution.text } : null, saved)}${noteMeter(saved?.note ?? r.resolution?.text)}</div>
        </div>
        ${imagesDock(images)}
      </section>

      ${QUESTIONS.map((q) => questionStep(q, { what: r.draft.what, how: r.draft.how }[q.name] || null, saved, images)).join('\n\n      ')}

      <section class="rv-step rv-step-one" data-rstep="${LAST}" hidden>
        <div class="rv-cap rv-cap-center" data-gen-cap hidden><b data-gen-title></b><em data-gen-state hidden></em></div>
        <div class="rv-text">
          ${generatePanel(saved)}
          ${loader()}
          <div class="rv-review" data-review hidden></div>
          ${r.warnings.length ? `<ul class="rv-warn" data-warn hidden>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        </div>
      </section>
    </div>
    <p class="iss-act-err" hidden></p>
    <footer>
      <small class="iss-autosave" data-autosave>${saved ? `Borrador guardado ${localShort(saved.at)}` : 'El borrador se guarda solo mientras escribes'}</small>
      <button type="button" class="lab-btn rv-back" data-step-back hidden>Atrás</button>
      <button type="button" class="lab-btn primary rv-next" data-step-next>${STEPS[1].title}</button>
      <button type="button" class="lab-btn primary rv-next" data-generate hidden>${SPARK}Generar informe</button>
      <button type="submit" class="lab-btn primary rv-next" data-confirm-send hidden>Resolver incidencia</button>
    </footer>
  </form>`; };
