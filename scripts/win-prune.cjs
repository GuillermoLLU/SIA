// Hook afterPack de electron-builder (Windows): quita de las dependencias de la app
// empaquetada lo que SIA no usa al ejecutarse, para que el instalador copie menos
// ficheros (#96). Va aquí y no en build.win.files porque, con una lista files propia
// de Windows, electron-builder deja de aplicar la general y sus exclusiones por
// defecto. macOS no se toca.
const fs = require('node:fs');
const path = require('node:path');

// Ruta dentro de node_modules (con /) → ¿sobra en Windows x64?
const UNNEEDED = [
  /\.map$/,                                                              // mapas de código
  /\.[mc]?ts$/,                                                          // fuentes y tipos de TypeScript
  /^@xenova\/transformers\/dist\//,                                      // build de navegador: Node usa src/
  /^onnxruntime-web\/dist\/(.+\.wasm|.+\.min\.js|ort\.js|ort-web\.js)$/, // transformers solo importa ort-web.node.js
  /^onnxruntime-node\/bin\/napi-v3\/(darwin|linux|win32\/arm64)\//,      // binarios de otras plataformas
  /^node-pty\/prebuilds\/(darwin|linux|win32-arm64)/,
  /^(node-pty|sharp)\/(src|deps)\//,                                     // fuentes C/C++ ya compiladas
  /^@azure\/msal-browser\//,                                             // Snowflake usa msal-node
];
const unneeded = (rel) => UNNEEDED.some((r) => r.test(rel));

// Borra lo que sobra bajo dir. → { files, bytes } quitados
const prune = (dir, base = dir, out = { files: 0, bytes: 0 }) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) { prune(file, base, out); continue; }
    if (!unneeded(path.relative(base, file).split(path.sep).join('/'))) continue;
    out.bytes += fs.statSync(file).size;
    fs.rmSync(file);
    out.files++;
  }
  return out;
};

exports.unneeded = unneeded;
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'win32') return;
  const { files, bytes } = prune(path.join(ctx.appOutDir, 'resources', 'app', 'node_modules'));
  console.log(`  • dependencias sin uso fuera  ficheros=${files} MB=${Math.round(bytes / 1048576)}`);
};
