// La ventana real de SIA Setup (../ui/app.js) sin Rust: responde a sus órdenes como lo haría
// src-tauri/src/main.rs, con las mismas líneas «SIA-…» que dan las comprobaciones de verdad, según
// el escenario de la dirección (?escenario=…&modo=…&abierto=…&sistema=…). Así la maqueta enseña
// exactamente los avisos, textos y reglas de producción. Tras «Volver a comprobar» o «Iniciar
// sesión», lo que fallaba sale bien: se ve cómo se resuelve.
(() => {
  const q = new URLSearchParams(location.search);
  const esc = q.get('escenario') || 'ok', update = q.get('modo') === 'update', mac = q.get('sistema') === 'mac';
  const aviso = (t) => parent.postMessage({ sia: 'aviso', texto: t }, '*');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const veces = {};

  // Lo que contesta cada comprobación en cada escenario, la primera vez; las siguientes, bien
  const MAL = {
    'cert': { certs: 'SIA-FALTAN:ITX Root CA' },
    'cert-unk': { certs: 'SIA-ERROR' },
    'copilot-instala': { copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:ok' },
    'sin-winget': { copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:sin-winget' },
    'politica': { copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:politica' },
    'descarga': { copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:descarga' },
    'error': { copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:error:8A150011' },
    'tiempo': { copilot: 'SIA-COPILOT:falta', 'copilot-install': '@tarde' },
    'copilot-unk': { copilot: '' },
    'cert-descarga': { certs: 'SIA-FALTAN:ITX Root CA', copilot: 'SIA-COPILOT:falta', 'copilot-install': 'SIA-COPILOT:descarga' },
    'sin-sesion': { session: 'SIA-SESION:sin-sesion' },
    'sesion-unk': { session: '' },
  }[esc] || {};
  const BIEN = { certs: 'SIA-OK', copilot: 'SIA-COPILOT:ok', 'copilot-install': 'SIA-COPILOT:ok', session: 'SIA-SESION:ok:tecnico-itx', login: '' };
  const TARDA = { certs: 1200, copilot: 1100, 'copilot-install': 3200, session: 700, login: 3000 };

  let sesionIniciada = false;
  const comprobar = async ({ paso }) => {
    veces[paso] = (veces[paso] || 0) + 1;
    if (paso === 'login') { aviso('Se abriría el inicio de sesión de Copilot en el navegador'); await wait(TARDA.login); sesionIniciada = true; return { respuesta: '', tarde: false }; }
    await wait(TARDA[paso]);
    const primera = veces[paso] === 1 && !(paso === 'session' && sesionIniciada);
    const r = primera && paso in MAL ? MAL[paso] : BIEN[paso];
    return r === '@tarde' ? { respuesta: '', tarde: true } : { respuesta: r, tarde: false };
  };

  const oyentes = {};
  const emit = (ev, payload) => (oyentes[ev] || []).forEach((f) => f({ payload }));
  // las fases de la barra, como las manda instalar en main.rs, en unos segundos
  const instalar = async () => {
    const fases = update
      ? [[0, 'quitando'], [15, 'preparando'], [45, 'copiando'], [97, 'terminando']]
      : [[0, 'preparando'], [45, 'copiando'], [97, 'terminando']];
    const total = update ? 6500 : 5500, t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / total), pct = Math.round(99 * k);
      emit('progreso', { pct, fase: fases.filter(([at]) => pct >= at).pop()[1] });
      if (k >= 1) break;
      await wait(400);
    }
  };

  const RUTAS = mac ? ['/Applications/SIA.app', '/Users/tecnico/Applications/SIA.app'] : ['C:\\Users\\tecnico\\AppData\\Local\\Programs\\SIA', 'D:\\Herramientas\\SIA'];
  let ruta = 0;
  const ORDENES = {
    estado: async () => ({
      sistema: mac ? 'mac' : 'win', version: '1.2.0', bytes: 447660845,
      instalado: update ? { version: '1.1.0', carpeta: RUTAS[0] } : null,
      abierto: update && q.get('abierto') === '1', carpeta: RUTAS[0],
      certs: { guia: 'https://lde.docs.inditex.dev/lde/latest/tooling/security/import-certificates.html#2-import-the-certificates', requeridos: ['ITX Root CA'] },
      guia_gestor: mac ? 'https://brew.sh/es/' : 'https://learn.microsoft.com/es-es/windows/package-manager/winget/#install-winget',
    }),
    anotar: async () => {},
    abrir_registro: async () => aviso('Se abriría el registro de la instalación'),
    comprobar,
    cortar: async () => {},
    elegir_carpeta: async () => RUTAS[(ruta = (ruta + 1) % 2)],
    instalar,
    abrir_sia: async () => aviso('Se abriría SIA 1.2.0'),
    abrir_guia: async ({ url }) => aviso(`Se abriría en el navegador ${url}`),
  };

  window.__TAURI__ = {
    core: { invoke: (cmd, args = {}) => (ORDENES[cmd] ? ORDENES[cmd](args) : Promise.reject(`sin simular: ${cmd}`)) },
    event: { listen: async (ev, f) => { (oyentes[ev] ||= []).push(f); return () => { oyentes[ev] = oyentes[ev].filter((x) => x !== f); }; } },
    window: { getCurrentWindow: () => ({ minimize: () => aviso('Se minimizaría la ventana'), close: () => parent.postMessage({ sia: 'cerrar' }, '*') }) },
  };
})();
