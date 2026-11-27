// SIA: lo poco que la web puede pedirle a Electron (con contextIsolation, por un puente con nombre: window.sia).
// En el navegador (desarrollo) no existe, y la web sigue con lo suyo (p. ej. el diálogo de impresión).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sia', {
  // Guardar un informe como PDF (web/src/metrics/print.js): html, el documento entero; name, el nombre que se propone.
  // Devuelve { path } donde se guardó, { canceled: true } o { error }.
  savePdf: (html, name) => ipcRenderer.invoke('sia:save-pdf', { html, name }),
});
