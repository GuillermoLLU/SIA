// El transporte HTTP que comparten las rutas: responder JSON, leer un cuerpo
// JSON, servir un fichero y el cierre de errores de cada ruta. Un error con `status` sale con su
// texto (los de la base, de 5xx, como 503: la instancia no responde); uno sin
// estado es un fallo nuestro y sale como 500 sin detalles.
export const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const BODY_MAX = 40_000_000;
export const readBody = (req) => new Promise((resolve, reject) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > BODY_MAX) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
});

export const failed = (json, res, e) => {
  if (!e.status) return json(res, 500, { error: 'Error interno.' });
  return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
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
