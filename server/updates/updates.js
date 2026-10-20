// Versión instalada frente a la última publicada (dominio, sin E/S). La
// instancia deja la última en app_version; el bridge la compara con la suya.

// ¿`a` es una versión posterior a `b`? (semver simple major.minor.patch)
export const isNewer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
};

// Lo que se responde en /api/version a partir de la fila de app_version (o null).
export const versionInfo = (current, latest) => ({
  current,
  latest: latest?.version || null,
  url: latest?.url || null,
  notes: latest?.notes || '',
  updateAvailable: !!(latest && isNewer(latest.version, current)),
});
