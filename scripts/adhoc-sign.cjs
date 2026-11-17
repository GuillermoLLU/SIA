// Hook afterPack de electron-builder (macOS): firma ad-hoc del .app entero.
// Sin certificado de Apple no se puede firmar "de verdad", pero un bundle sin
// firma coherente descargado de internet (con cuarentena) lo rechaza Gatekeeper
// como "dañado" en vez de ofrecer el diálogo de desarrollador no identificado.
// Con la firma ad-hoc (-) el usuario puede abrirlo con clic derecho → Abrir.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  console.log(`  • firma ad-hoc  app=${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
