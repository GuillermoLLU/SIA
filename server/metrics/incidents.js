// Qué hacer con una fila de Remedy frente a la incidencia que ya está guardada
// (la fila es una foto del origen, no manda sobre lo más nuevo), y cómo
// se abren AUDIT_DETAIL y WORKLOG_DETAIL para consultarlos por fecha. Dominio puro.
import { entries } from './remedy.js';

const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/;
// «2026-02-01 10:00:00.000» y «2026-02-01 10:00:00» son el mismo instante; sin fecha, la más antigua
const stampOf = (s) => STAMP.exec(s || '')?.[0] ?? '';

// stored: la incidencia guardada (undefined si no existe); row: la que llega.
//   insert: no existía · update: la que llega es más reciente, o igual de reciente pero con otro contenido
//   keep: lo guardado es más reciente · same: idéntica
// A igual fecha de modificación se compara todo: hay campos agregados que cambian sin tocar la fecha.
export const decide = (stored, row) => {
  if (!stored) return 'insert';
  const incoming = stampOf(row.LASTMODIFIEDDATE), current = stampOf(stored.LASTMODIFIEDDATE);
  if (incoming > current) return 'update';
  if (incoming < current) return 'keep';
  return Object.keys(row).some((c) => (stored[c] ?? '') !== row[c]) ? 'update' : 'same';
};

// «Campo: antes → después» (los cambios de AUDIT_DETAIL); sin flecha, todo el texto va en new_value.
export const auditEvents = (text) => entries(text).map(({ at, who, text: change }) => {
  const arrow = change.indexOf(' → ');
  const colon = change.indexOf(': ');
  if (arrow < 0 || colon < 0 || colon > arrow) return { at, who, field: '', before: '', after: change };
  return { at, who, field: change.slice(0, colon), before: change.slice(colon + 2, arrow), after: change.slice(arrow + 3) };
});

export const worklogEntries = (text) => entries(text);
