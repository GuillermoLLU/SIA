// Al resolver: lo que el técnico ya escribió en las notas de Remedy, para no
// pedírselo dos veces, y lo que la auditoría de calidad mira y aún falta (sin DOM).
//
// Al resolver se escriben dos cosas distintas (procedimiento de ECOM):
// - la nota interna de resolución, `[RESOLUCION]`, que solo ve el equipo;
// - la nota externa para el centro en Remedy, con tres puntos: qué ocurrió (lo dice la
//   nota de diagnóstico), cómo se resolvió y qué se hará para evitarlo. Lo
//   reciben el interlocutor y todos los que han participado (paso 2.8 del
//   proceso de resolución de soporte).

// Las notas internas que pide la auditoría, por orden. La etiqueta, con o sin
// tilde (en el CSV a veces llega rota).
export const NOTES = [
  { key: 'initial', label: 'Situación inicial', tag: /^SITUACI.?N INICIAL$/ },
  { key: 'background', label: 'Antecedentes', tag: /^ANTECEDENTES$/ },
  { key: 'analysis', label: 'Análisis', tag: /^AN.?LISIS$/ },
  { key: 'diagnosis', label: 'Diagnóstico', tag: /^DIAGN.?STICO$/ },
  { key: 'resolution', label: 'Resolución', tag: /^RESOLUCI.?N$/ },
];
// Las de una crítica.
const CRITICAL = [
  { key: 'major', label: '¿Es mayor incidente?', tag: /^MAJOR INCIDENT$/ },
  { key: 'restored', label: 'Servicio restablecido', tag: /^SERVREST$/ },
];
const TAG = /^\s*\[([^\]]+)\]\s*/;

const keyOf = (text) => {
  const m = String(text).match(TAG);
  if (!m) return null;
  const t = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  return [...NOTES, ...CRITICAL].find((n) => n.tag.test(t))?.key || null;
};

// La última nota de cada etiqueta: { diagnosis: { at, who, text }, … }
const lastByKey = (worklog = []) => {
  const out = {};
  for (const n of worklog) {
    const k = keyOf(n.text);
    if (k) out[k] = { ...n, text: n.text.replace(TAG, '').trim() };
  }
  return out;
};

// «2026-10-27 09:12» → «27/10 09:12», como en el resto de SIA
export const short = (at) => `${at.slice(8, 10)}/${at.slice(5, 7)} ${at.slice(11, 16)}`;
const from = (n, label) => n ? { value: n.text, from: `${label.toLowerCase()} (${short(n.at)}, ${n.who})` } : null;

// → { notes: [{ key, label, note }], missing, draft: { what, how }, resolution, warnings }
// missing: las notas que faltan en Remedy (sin ellas no se escribe la de cierre);
// draft: lo que empieza cada punto del mensaje ({ value, from }); resolution:
// la nota [RESOLUCION] si ya está escrita (entonces no se vuelve a pedir).
export const resolveDraft = (issue) => {
  const last = lastByKey(issue.worklog);
  const critical = issue.priority === 'CRITICAL';
  const notes = [...NOTES, ...(critical ? CRITICAL : [])].map(({ key, label }) => ({ key, label, note: last[key] || null }));
  const missing = notes.filter((n) => !n.note && n.key !== 'resolution').map((n) => n.label);

  const warnings = [];
  if (!issue.category) warnings.push('La issue no tiene categoría en Remedy: ponla antes de resolver.');
  // paso 3.5: avisar al proveedor o al equipo escalado de que está resuelta
  if (issue.vendorTicket) warnings.push(`Tiene el ticket de proveedor ${issue.vendorTicket}: avisa de que se ha resuelto.`);

  return {
    notes,
    missing,
    draft: { what: from(last.diagnosis, 'Diagnóstico'), how: from(last.resolution, 'Resolución') },
    resolution: last.resolution || null,
    warnings,
  };
};
