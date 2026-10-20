// Cómo se normaliza el texto que viene de Remedy (dominio, sin E/S): un solo sitio para todo lo que compara o
// agrupa por texto (remedy.js, themes.js, companies.js).
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Mn}/gu, '');   // sin tildes
export const norm = (s) => fold(String(s ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();   // para buscar palabras
export const key = (s) => fold(s).toUpperCase().replace(/\s+/g, ' ').trim();                  // para agrupar
// El código de un estado o motivo tal como lo escribe Remedy en el historial («Third Party Vendor Action Reqd») →
// como viene en la fila (THIRD_PARTY_VENDOR_ACTION_REQD).
export const toCode = (s) => key(s).replace(/[^A-Z0-9]+/g, '_');
