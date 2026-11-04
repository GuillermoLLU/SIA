// El transporte HTTP que comparten las rutas: responder JSON, leer un cuerpo
// JSON, servir un fichero y el cierre de errores de cada ruta. Un error con `status` sale con su
// texto (los de la base, de 5xx, como 503: la instancia no responde); uno sin
// estado es un fallo nuestro y sale como 500 sin detalles.
export const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

// Un cuerpo roto o demasiado grande es un error de quien llama (400 / 413), no
// nuestro. Pasado el tope se deja de guardar, pero sin cortar la conexión: así
// la ruta todavía puede responder el 413.
const BODY_MAX = 40_000_000;
const bad = (message, status) => Object.assign(new Error(message), { status });
export const readBody = (req) => new Promise((resolve, reject) => {
  let b = '', over = false;
  req.on('data', (c) => {
    if (over) return;
    b += c;
    if (b.length > BODY_MAX) { over = true; b = ''; reject(bad('Lo enviado es demasiado grande.', 413)); }
  });
  req.on('end', () => { if (over) return; try { resolve(b ? JSON.parse(b) : {}); } catch { reject(bad('Lo enviado no es JSON válido.', 400)); } });
});

export const failed = (json, res, e) => {
  // Sin estado, es un fallo nuestro: se responde genérico, pero el log dice qué pasó.
  if (!e.status) {
    console.error(`[sia] error interno en la API: ${e.stack || e}`);
    return json(res, 500, { error: 'Error interno.' });
  }
  return json(res, e.status >= 500 ? 503 : e.status, { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.help ? { help: e.help } : {}) });
};

// Tipos de los ficheros que se sirven (la web compilada y los adjuntos).
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};
export const mimeOf = (ext) => MIME[String(ext).toLowerCase()] || 'application/octet-stream';
export const sendFile = (res, ext, content) => {
  res.writeHead(200, { 'Content-Type': mimeOf(ext) });
  res.end(content);
};
