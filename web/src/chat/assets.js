// Adjuntos de un chat: cualquier fichero pegado o arrastrado se sube al bridge, se registra en la sesión (persiste con ella,
// recargas incluidas) y su ruta va al prompt del CLI sin Enter, para que el
// usuario escriba su pregunta alrededor. El panel de la derecha los lista.
import { esc } from '../ui/html.js';
import { msg, sendOn, isOpen } from './protocol.js';
import { toAsset, fileExt } from './sessions.js';

// active(): la sesión activa · onLayout(): el panel cambió de tamaño (refit)
export const createAssets = ({ api, apiBase, dialogs, active, onLayout }) => {
  const $ = (id) => document.getElementById(id);
  const btn = $('assets-btn'), panel = $('assets-panel'), list = $('assets-list');

  const render = () => {
    const s = active();
    const assets = s?.assets || [];
    btn.hidden = !assets.length;
    if (assets.length) btn.querySelector('.count').textContent = assets.length;
    const open = !!(s && s.assetsOpen && assets.length);
    panel.hidden = !open;
    if (!open) return;
    list.innerHTML = '';
    assets.forEach((a) => {
      const item = document.createElement('div');
      item.className = 'asset-item';
      item.innerHTML = `
        ${a.isImage
          ? `<img src="${esc(a.url)}" alt="${esc(a.name)}" title="Ver grande" />`
          : `<div class="asset-file" title="Abrir"><span class="ext">${esc(fileExt(a.name))}</span></div>`}
        <div class="asset-meta">
          <span class="name" title="${esc(a.name)}">${esc(a.name)}</span>
          <button class="asset-insert" title="Insertar la ruta de nuevo en el chat">↩</button>
        </div>`;
      item.querySelector('img, .asset-file').addEventListener('click', () => {
        if (a.isImage) dialogs.open({ title: a.name, bodyHTML: `<img src="${esc(a.url)}" style="max-width:100%" />`, alertOnly: true, okLabel: 'Cerrar' });
        else window.open(a.url, '_blank');
      });
      item.querySelector('.asset-insert').addEventListener('click', () => {
        const sess = active();
        if (sess?.launched && isOpen(sess.ws)) { sendOn(sess.ws, msg.input(`${a.absPath} `)); sess.term.focus(); }
      });
      list.appendChild(item);
    });
  };
  const toggle = (open) => {
    const s = active();
    if (!s) return;
    s.assetsOpen = open ?? !s.assetsOpen;
    render();
    onLayout();
  };
  btn.addEventListener('click', () => toggle());
  $('assets-close').addEventListener('click', () => toggle(false));

  const announce = (s, asset) => {
    sendOn(s.ws, msg.asset(asset));
    sendOn(s.ws, msg.input(`${asset.absPath} `));
  };
  // adjuntos subidos mientras el socket estaba caído: entran al volver
  const flushPending = (s) => {
    if (!s.pendingAssets.length || !isOpen(s.ws)) return;
    for (const a of s.pendingAssets) announce(s, a);
    s.pendingAssets = [];
  };
  const upload = async (s, file) => {
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('no se pudo leer el fichero'));
        r.readAsDataURL(file);
      });
      const out = await api('/upload', { method: 'POST', body: { name: file.name || 'adjunto', data } });
      const asset = toAsset({ name: out.name, absPath: out.absPath }, apiBase);
      s.assets.push(asset);
      s.assetsOpen = true;
      // la subida es asíncrona: el socket puede haberse caído por el camino. Si no está, el adjunto espera en
      // cola y entra en cuanto el socket vuelva (flushPending).
      if (isOpen(s.ws)) announce(s, asset);
      else s.pendingAssets.push(asset);
      render();
      onLayout();
      s.term.focus();
    } catch (err) {
      dialogs.alert('No se pudo adjuntar el fichero', esc(err.message));
    }
  };

  // Pega en la sesión desde el portapapeles: imagen → se adjunta; texto → se
  // escribe en la terminal. Lo usa el handler de teclado en Windows/Linux, donde
  // xterm intercepta Ctrl+V como ^V y el evento de pegado nativo no llega.
  const pasteFromClipboard = async (s) => {
    if (!s || !s.launched || !s.term) return;
    try {
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            upload(s, new File([blob], `pegado.${imgType.split('/')[1] || 'png'}`, { type: imgType }));
            return;
          }
        }
      }
      const text = await navigator.clipboard?.readText();
      if (text) s.term.paste(text);
    } catch { /* portapapeles vacío o sin permiso */ }
  };

  // pegar desde el portapapeles (⌘V: imágenes copiadas o ficheros del Finder)
  // y arrastrar ficheros (de cualquier tipo) encima de la terminal
  const wire = (viewEl, stackEl) => {
    document.addEventListener('paste', (e) => {
      if (viewEl.hidden) return;
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return; // texto: lo gestiona xterm con normalidad
      const s = active();
      if (!s || !s.launched) return;
      e.preventDefault();
      files.forEach((f) => upload(s, f));
    });
    stackEl.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
    });
    stackEl.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      const s = active();
      if (!s || !s.launched) { dialogs.alert('Sin chat activo', 'Lanza un chat antes de adjuntar ficheros.'); return; }
      files.forEach((f) => upload(s, f));
    });
  };

  return { render, upload, flushPending, pasteFromClipboard, wire };
};
