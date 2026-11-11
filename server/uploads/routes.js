// Adjuntos: subir y servir.
//   POST /upload { name, data (base64) } → { ok, name, absPath }
//   GET  /uploads/:name → el fichero
import fs from 'node:fs';
import path from 'node:path';
import { uploadName } from './uploads.js';

export const uploadsRoutes = (dir, { json, readBody, sendFile }) => {
  let seq = 0;
  return async (req, res, [area, name]) => {
    if (area === 'upload' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.data !== 'string' || !body.data) return json(res, 400, { error: 'payload inválido' });
      const fname = uploadName(body.name, ++seq);
      fs.writeFileSync(path.join(dir, fname), Buffer.from(body.data, 'base64'));
      return json(res, 200, { ok: true, name: fname, absPath: path.join(dir, fname) });
    }
    if (area === 'uploads' && req.method === 'GET' && name) {
      const fname = path.basename(decodeURIComponent(name));
      const fp = path.join(dir, fname);
      if (!fs.existsSync(fp)) return json(res, 404, { error: 'no encontrado' });
      return sendFile(res, path.extname(fname), fs.readFileSync(fp));
    }
    return json(res, 404, { error: 'no encontrado' });
  };
};
