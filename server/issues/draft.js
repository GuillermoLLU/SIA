// El borrador de Resolver (dominio, sin E/S): lo que el técnico lleva escrito y
// el adjunto del mensaje al centro, mientras no se envía. Aquí, cómo se valida
// lo que llega de la web: no se fía del navegador (se puede tocar en devtools),
// así que lo que no cuadra se rechaza en vez de arreglarlo. Se guarda en la BBDD
// local (drafts.js).

export const FIELDS = ['note', 'what', 'how', 'prevent'];
export const MAX_TEXT = 20_000;               // el mismo maxlength que tiene la web
export const MAX_FILE = 15 * 1024 * 1024;     // el mismo límite que enseña la web (en base64 cabe en BODY_MAX)
const LANGS = ['es', 'en'];                   // el idioma de la nota externa
const STEPS = [1, 2, 3];                      // los pasos de Resolver (resolve-form.js)
// Lo que se puede ejecutar no va como adjunto al centro.
const RUNNABLE = /\.(exe|com|bat|cmd|msi|scr|pif|ps1|vbs|vbe|js|jse|wsf|wsh|hta|jar|sh|lnk|reg|cpl|dll)$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MIME = /^[\w.+-]+\/[\w.+-]+$/;

export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// { note, what, how, prevent, lang, step } → los cuatro textos, el idioma y el
// paso en el que se quedó (para volver a él). Un campo que falta, vacío; uno
// que no es texto o pasa de MAX_TEXT, fuera.
export const cleanFields = (body) => {
  if (!isObject(body)) throw fail('El borrador no es válido.');
  const out = {};
  for (const f of FIELDS) {
    const v = body[f] ?? '';
    if (typeof v !== 'string') throw fail('El borrador no es válido.');
    if (v.length > MAX_TEXT) throw fail(`Un texto pasa de ${MAX_TEXT.toLocaleString('es-ES')} caracteres.`);
    out[f] = v;
  }
  const lang = body.lang ?? 'es';
  if (!LANGS.includes(lang)) throw fail('Ese idioma no está.');
  const step = Number(body.step ?? 1);   // llega como texto del formulario
  if (!STEPS.includes(step)) throw fail('El borrador no es válido.');
  return { ...out, lang, step };
};

// { name, type, data (base64) } → { name, type, data: Buffer }; un solo adjunto, de hasta MAX_FILE
export const cleanFile = (body) => {
  if (!isObject(body)) throw fail('Falta el archivo.');
  // sin rutas; con caracteres de control o invisibles (como el que da la vuelta
  // al texto para que «gpj.exe» parezca «exe.jpg»), fuera
  const raw = String(body.name ?? '');
  if (/[\p{Cc}\p{Cf}]/u.test(raw)) throw fail('El nombre del archivo tiene caracteres ocultos: cámbialo.');
  const name = raw.replace(/[\\/]/g, '_').trim().slice(0, 200);
  if (!name || typeof body.data !== 'string' || !body.data) throw fail('Falta el archivo.');
  if (RUNNABLE.test(name)) throw fail('Ese tipo de archivo no se puede adjuntar: es un ejecutable.');
  if (body.data.length % 4 || !BASE64.test(body.data)) throw fail('El archivo no ha llegado bien.');
  const data = Buffer.from(body.data, 'base64');
  if (!data.length) throw fail('El archivo está vacío.');
  if (data.length > MAX_FILE) throw fail('El adjunto pasa de 15 MB: elige otro más pequeño.');
  const type = typeof body.type === 'string' && MIME.test(body.type) ? body.type.slice(0, 100) : '';
  return { name, type, data };
};
