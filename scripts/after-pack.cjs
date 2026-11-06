// Hook afterPack de electron-builder: lo que cada plataforma hace con la app ya
// copiada, antes de generar el instalador. Cada paso mira su plataforma.
const winPrune = require('./win-prune.cjs').default;
const adhocSign = require('./adhoc-sign.cjs').default;

exports.default = async (ctx) => {
  await winPrune(ctx);
  await adhocSign(ctx);
};
