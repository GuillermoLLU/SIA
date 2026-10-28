// «Guardar para después» en Resolver: lo escrito, por issue, en este navegador.
// Es un borrador de quien resuelve, no un dato de la issue: si se pierde (otro
// navegador, datos borrados) se vuelve a empezar con lo que hay en Remedy.
const KEY = 'sia.issues.resolve.';
const FIELDS = ['note', 'what', 'how', 'prevent'];

export const createResolveSaved = (storage = globalThis.localStorage) => ({
  // → { note, what, how, prevent, at } | null
  get(id) {
    try { return JSON.parse(storage.getItem(KEY + id) || 'null'); } catch { return null; }
  },
  // values: los del formulario; at: «2026-10-28 15:20». → false si no se pudo guardar
  set(id, values, at) {
    const out = { at };
    for (const f of FIELDS) if (values[f] !== undefined) out[f] = String(values[f]);
    try { storage.setItem(KEY + id, JSON.stringify(out)); return true; } catch { return false; }
  },
  drop(id) {
    try { storage.removeItem(KEY + id); } catch { /* sin almacenamiento: nada que borrar */ }
  },
});
