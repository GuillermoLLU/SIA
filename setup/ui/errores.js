// Los errores del instalador, con un código para encontrarlos rápido: INS-1xx certificados, 2xx
// Copilot CLI, 3xx su sesión, 4xx instalar, 5xx desinstalar y 9xx lo que no conocemos. Quien
// instala ve el texto de siempre y, debajo, el código; «Copiar el error» lo da con la versión, el
// sistema y el registro. Lo usan la ventana (app.js) y la maqueta. Los de instalar y desinstalar
// llegan ya con su código desde Rust («INS-401 · …», src-tauri).
const ERRORES = {
  'INS-101': 'Faltan certificados del cliente',
  'INS-102': 'No se han podido comprobar los certificados del cliente',
  'INS-201': 'Falta el gestor para instalar Copilot CLI (WinGet o Homebrew)',
  'INS-202': 'Una política del equipo no permite instalar Copilot CLI',
  'INS-203': 'No se ha podido descargar Copilot CLI',
  'INS-204': 'Copilot CLI no termina de instalarse',
  'INS-205': 'No se ha podido instalar Copilot CLI',
  'INS-206': 'No se ha podido comprobar Copilot CLI',
  'INS-301': 'Falta iniciar sesión en Copilot',
  'INS-302': 'No se ha podido comprobar la sesión de Copilot',
  'INS-401': 'La instalación no ha terminado',
  'INS-402': 'No se ha podido preparar la instalación',
  'INS-403': 'No se ha podido lanzar la instalación',
  'INS-404': 'No se ha podido copiar SIA',
  'INS-405': 'No se encuentra lo que hay que instalar',
  'INS-501': 'La desinstalación no ha terminado',
  'INS-502': 'No se ha podido lanzar la desinstalación',
  'INS-900': 'Una respuesta que el instalador no conoce',
  'INS-901': 'Un fallo inesperado del instalador',
};

// El código de una comprobación, según su estado (app.js: K); el detalle, lo que ayuda a soporte
const CODIGO_COPILOT = { 'sin-winget': 'INS-201', politica: 'INS-202', descarga: 'INS-203', tiempo: 'INS-204', error: 'INS-205', unknown: 'INS-206' };

// Un error de Rust, «INS-401 · La instalación no ha terminado (código 2).»: su código y su texto.
// Sin código, INS-901 con el texto tal cual.
function leerError(err) {
  const m = /^(INS-\d{3}) · (.*)$/s.exec(String(err));
  return m ? { codigo: m[1], texto: m[2] } : { codigo: 'INS-901', texto: String(err) };
}
