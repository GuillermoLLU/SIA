// La pestaña Seguimiento de una issue (dominio, sin E/S): las notas de trabajo de
// Remedy, las notas del equipo en SIA y sus movimientos (cogida, traspasada…),
// en una sola conversación de la más antigua a la más reciente.
//
// Cada nota de SIA dice quién la ve (privada: solo quien la escribió; interna:
// el equipo; pública: también el centro, cuando SIA envíe por SIGLO) y puede
// llevar una etiqueta del método del equipo, la misma que se pone en Remedy
// delante de la nota («[ANALISIS] …»). Las de Remedy traen su etiqueta en el
// texto; su visibilidad no viene en la foto, así que no se dice.

// Quién ve una nota, con su nombre y para quién es (el menú de la caja de escribir).
export const VISIBILITY = {
  private: { label: 'Privada', hint: 'Solo tú' },
  internal: { label: 'Interna', hint: 'El equipo' },
  public: { label: 'Pública', hint: 'También el centro' },
};
export const VISIBILITIES = ['private', 'internal', 'public'];

// Las etiquetas que se pueden poner desde la barra de Seguimiento (el bridge
// valida estas y las de llamada, server/issues/notes.js), con su nombre.
export const NOTE_TAGS = [
  { code: 'SITUACION INICIAL', label: 'Situación inicial' },
  { code: 'ANTECEDENTES', label: 'Antecedentes' },
  { code: 'ANALISIS', label: 'Análisis' },
  { code: 'DIAGNOSTICO', label: 'Diagnóstico' },
  { code: 'ACT', label: 'Actuación' },
  { code: 'INF', label: 'Información' },
  { code: 'ESCALADO', label: 'Escalado' },
  { code: 'SERVREST', label: 'Servicio restablecido' },
  { code: 'RESOLUCION', label: 'Resolución' },
];
// las que no se ofrecen en la barra, pero se leen: las de llamada (se registran
// con el botón «Llamada» de la issue, call.js) y otras de Remedy
const READ_ONLY = { CALLOK: 'Llamada atendida', CALLKO: 'Llamada sin respuesta', RESOLUTION: 'Resolución', REAP: 'Reapertura', TOOLS: 'Herramientas', 'MAJOR INCIDENT': 'Incidente mayor' };

// La etiqueta como se guarda: en mayúsculas y sin tildes («Análisis» → «ANALISIS»).
const code = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// Su nombre; una que no se conoce, tal cual venga.
export const tagLabel = (tag) => {
  if (!tag) return '';
  const c = code(tag);
  return NOTE_TAGS.find((t) => t.code === c)?.label || READ_ONLY[c] || String(tag).trim();
};

// La etiqueta que Remedy lleva delante del texto («[ANALISIS] El usuario…») → { tag, text }.
export const splitTag = (text) => {
  const t = String(text || '');
  const m = t.match(/^\s*\[([^\]\n]{2,40})\]\s*/);
  return m ? { tag: code(m[1]), text: t.slice(m[0].length) } : { tag: null, text: t.trim() };
};

// La nota plegada: su primera frase (hasta el primer punto, o la primera línea)
// y, si sigue, con «…» en lugar de su punto final.
export const firstSentence = (text) => {
  const t = String(text || '').trim();
  const line = t.split('\n')[0];
  const head = (line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line).trim();
  const more = t.slice(t.indexOf(head) + head.length).trim().length > 0;
  return more ? `${head.replace(/[\s.!?:;,]+$/, '')}…` : head;
};
// ¿Queda algo después de su primera frase? Si no, plegada ya se lee entera (y no se despliega
// si además cabe en su línea: eso solo se sabe en pantalla, notes-fit.js).
export const hasMore = (text) => firstSentence(text) !== String(text || '').trim();

// Cuándo, en milisegundos: vale para la fecha ISO de la base y para la «YYYY-MM-DD HH:MM» de Remedy.
const ms = (at) => new Date(String(at || '').replace(' ', 'T')).getTime() || 0;

// Las notas de Remedy (worklog de la foto; null si la foto no las trae) y el
// histórico de SIA (timeline: movimientos y notas) → la conversación, de la
// más antigua a la más reciente. Cada entrada lleva su clave (key) para
// recordar si está abierta.
//   nota       → { key, kind: 'note', src: 'remedy' | 'sia', at, by, text, tag, visibility, id?, byId?, edited? }
//   movimiento → { key, kind: 'move', type, at, by, to, text? }  (text: el motivo de un traspaso)
export const notesFeed = ({ worklog = [], timeline = [] } = {}) => {
  const remedy = (worklog || []).map((w, k) => ({ key: `r${k}`, kind: 'note', src: 'remedy', at: w.at, by: w.who, visibility: null, ...splitTag(w.text) }));
  const sia = timeline.map((t, k) => (t.type === 'note'
    ? { key: `n${t.id}`, kind: 'note', src: 'sia', at: t.at, by: t.by, byId: t.byId, id: t.id, text: t.text, tag: t.tag ?? null, visibility: t.visibility || 'internal', edited: t.edited ?? null }
    : { key: `m${k}`, kind: 'move', type: t.type, at: t.at, by: t.by, to: t.to ?? null, text: t.text ?? null }));
  return [...remedy, ...sia].map((e, i) => [e, i]).sort(([a, i], [b, j]) => ms(a.at) - ms(b.at) || i - j).map(([e]) => e);
};
export const noteCount = (feed) => feed.filter((e) => e.kind === 'note').length;

// Una llamada al centro es una nota con su etiqueta (CALLOK: atendida; CALLKO:
// sin respuesta), como la marca el equipo en Remedy. Delante va el teléfono
// («+90 212 555 0143», «49890x3»…) y después, lo que se habló.
// → { answered, phone, said } o null si no es una llamada.
const CALLS = { CALLOK: true, CALLKO: false };
// un teléfono: al menos cinco cifras, con prefijo, espacios, guiones o una extensión
export const PHONE = String.raw`\+?\d[\d\s().-]{3,}\d(?:\s?x\s?\d+)?`;
const LEADING_PHONE = new RegExp(`^\\s*(${PHONE})(?=\\s|$)`);
const WHOLE_PHONE = new RegExp(`^${PHONE}$`);
export const isPhone = (s) => WHOLE_PHONE.test(String(s ?? '').trim());
export const callOf = (e) => {
  if (e?.kind !== 'note' || !(e.tag in CALLS)) return null;
  const m = String(e.text || '').match(LEADING_PHONE);
  return { answered: CALLS[e.tag], phone: m ? m[1].trim() : null, said: (m ? e.text.slice(m[0].length) : e.text || '').trim() };
};

// Una nota la edita quien la escribió, durante las 24 h siguientes (la misma
// regla que el bridge, server/issues/notes.js; aquí solo decide si se enseña el botón).
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const canEditNote = (e, meId, now) => e.kind === 'note' && e.src === 'sia' && !!meId && e.byId === meId && now.getTime() - ms(e.at) <= EDIT_WINDOW_MS;

// En la caja de escribir, Intro envía; Mayús+Intro salta de línea.
export const sendsNote = (e) => e.key === 'Enter' && !e.shiftKey;
