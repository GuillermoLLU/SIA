// Adjuntos de un chat: una imagen o un fichero pegado, arrastrado o elegido
// con «Adjuntar» se sube al bridge y entra en la caja de escribir como una
// ficha con su miniatura (conversation/composer.js); al enviar, su ruta va con
// el mensaje y Copilot ve la imagen (server/chats/copilot.js: sendParams). El
// bridge sirve los adjuntos (/uploads), así la burbuja los enseña desde
// cualquier dispositivo.
//
// deps: api · active() → la sesión activa ({ launched, view }) · dialogs
import { esc } from '../ui/html.js';
import { isImageName } from './conversation/compose.js';

const IMAGE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5-8 8"/><path d="M12 20l-4-4-5 5"/></svg>';

export const createUploads = ({ api, active, dialogs }) => {
  const upload = async (s, file) => {
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('no se pudo leer el fichero'));
        r.readAsDataURL(file);
      });
      const out = await api('/upload', { method: 'POST', body: { name: file.name || 'adjunto', data } });
      // la ficha enseña el fichero de aquí (al momento); la burbuja, después, el del bridge
      s.view?.attachFile({ name: out.name, absPath: out.absPath, url: URL.createObjectURL(file), isImage: isImageName(file.name) });
    } catch (err) {
      dialogs.alert('No se pudo adjuntar el fichero', esc(err.message));
    }
  };

  // «Adjuntar»: el selector de ficheros del sistema, para la sesión que lo pide
  const pick = (s) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.addEventListener('change', () => { for (const f of picker.files) upload(s, f); });
    picker.click();
  };

  // pegar desde el portapapeles (⌘V: imágenes copiadas o ficheros del Finder)
  // y arrastrar ficheros (de cualquier tipo) encima del chat: mientras se
  // arrastra sale la zona de «suelta aquí», centrada sobre el panel. root: el
  // panel que recibe los ficheros; solo cuenta mientras se ve. → cómo soltarse
  const wire = (root) => {
    const onPaste = (e) => {
      if (!root.getClientRects().length) return;
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return; // texto: lo pega la caja como cualquier campo
      const s = active();
      if (!s?.launched) return;
      e.preventDefault();
      files.forEach((f) => upload(s, f));
    };
    document.addEventListener('paste', onPaste);
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.hidden = true;
    zone.innerHTML = `<div class="drop-zone-box">${IMAGE_ICON}<b>Suelta aquí para adjuntar</b><span>Imágenes y archivos</span></div>`;
    root.appendChild(zone);
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    // dragenter/dragleave saltan al pasar por cada hijo: se cuentan para saber cuándo se ha salido del todo
    let depth = 0;
    const show = (on) => { zone.hidden = !on; if (!on) depth = 0; };
    root.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !active()?.launched) return; e.preventDefault(); depth++; show(true); });
    root.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    root.addEventListener('dragleave', () => { if (depth > 0 && --depth === 0) show(false); });
    root.addEventListener('drop', (e) => {
      show(false);
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      const s = active();
      if (!s?.launched) { dialogs.alert('Sin chat activo', 'Abre un chat antes de adjuntar ficheros.'); return; }
      files.forEach((f) => upload(s, f));
    });
    return () => { document.removeEventListener('paste', onPaste); zone.remove(); };
  };

  return { upload, pick, wire };
};
