// El borrador de Resolver (dominio, sin E/S): lo que el técnico lleva escrito y
// el adjunto del mensaje al centro, mientras no se envía. Aquí, cómo se sanea lo
// que llega de la web; se guarda en la BBDD local (drafts.js).

export const FIELDS = ['note', 'what', 'how', 'prevent'];
const MAX_TEXT = 20_000;
export const MAX_FILE = 10 * 1024 * 1024;   // el mismo límite que enseña la web

const fail = (message) => Object.assign(new Error(message), { status: 400 });

// { note, what, how, prevent } → los cuatro, como texto y recortados
export const cleanFields = (body) => Object.fromEntries(FIELDS.map((f) => [f, String(body?.[f] ?? '').slice(0, MAX_TEXT)]));

// { name, type, data (base64) } → { name, type, data: Buffer }; un solo adjunto, de hasta MAX_FILE
export const cleanFile = (body) => {
  const name = String(body?.name ?? '').replace(/[\\/]/g, '_').trim().slice(0, 200);
  if (!name || typeof body?.data !== 'string' || !body.data) throw fail('Falta el archivo.');
  const data = Buffer.from(body.data, 'base64');
  if (!data.length) throw fail('El archivo está vacío.');
  if (data.length > MAX_FILE) throw fail('El adjunto pasa de 10 MB: elige otro más pequeño.');
  return { name, type: String(body.type ?? '').slice(0, 100), data };
};
