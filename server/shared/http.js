// El transporte HTTP que comparten las rutas: responder JSON, leer un cuerpo
// JSON y el cierre de errores de cada ruta. Un error con `status` sale con su
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
