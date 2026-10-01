// Hook afterPack de electron-builder (macOS): firma ad-hoc del .app entero.
// Sin certificado de Apple no se puede firmar "de verdad", pero un bundle sin
// firma coherente descargado de internet (con cuarentena) lo rechaza Gatekeeper
// como "dañado" en vez de ofrecer el diálogo de desarrollador no identificado.
// Con la firma ad-hoc (-) el usuario puede abrirlo con clic derecho → Abrir.
//
// Antes de firmar repara el spawn-helper de node-pty: es el ejecutable con el
// que node-pty lanza cada terminal, y en los prebuilds de npm puede llegar sin
// permiso de ejecución. El bridge empaquetado carga node-pty de la raíz (el
// postinstall de server/ no la cubre) y, sin ese permiso, abrir cualquier chat
// falla con «posix_spawnp failed». Va ANTES de la firma porque cambiar un
// fichero después la invalidaría.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const fixSpawnHelpers = (app) => {
  const pty = path.join(app, 'Contents', 'Resources', 'app', 'node_modules', 'node-pty');
  const helpers = [];
  for (const sub of ['prebuilds', 'build']) {
    const root = path.join(pty, sub);
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const helper = path.join(root, dir, 'spawn-helper');
      if (fs.existsSync(helper)) { fs.chmodSync(helper, 0o755); helpers.push(helper); }
    }
  }
  if (!helpers.length) throw new Error(`no encuentro el spawn-helper de node-pty en ${pty}: la app no podría abrir terminales`);
  console.log(`  • spawn-helper ejecutable  ficheros=${helpers.length}`);
};

exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  fixSpawnHelpers(app);
  console.log(`  • firma ad-hoc  app=${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
