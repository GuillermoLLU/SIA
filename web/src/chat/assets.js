// Adjuntos de un chat: cualquier fichero pegado o arrastrado se sube al
// bridge, se registra en la sesión (persiste con ella, recargas incluidas) y
// entra en lo que se está escribiendo como una marca en la caja, para que la
// persona escriba su pregunta alrededor. El panel de la derecha los lista.
import { esc } from '../ui/html.js';
import { msg, sendOn, isOpen } from './protocol.js';
import { toAsset, fileExt } from './sessions.js';

// active(): la sesión activa
export const createAssets = ({ api, apiBase, dialogs, active }) => {
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
          <button class="asset-insert" title="Insertarlo de nuevo en el chat">↩</button>
        </div>`;
      item.querySelector('img, .asset-file').addEventListener('click', () => {
        if (a.isImage) dialogs.open({ title: a.name, bodyHTML: `<img src="${esc(a.url)}" style="max-width:100%" />`, alertOnly: true, okLabel: 'Cerrar' });
        else window.open(a.url, '_blank');
      });
      item.querySelector('.asset-insert').addEventListener('click', () => {
        const sess = active();
        if (sess?.launched) sess.view.attach(a.absPath);
      });
      list.appendChild(item);
    });
  };
  const toggle = (open) => {
    const s = active();
    if (!s) return;
    s.assetsOpen = open ?? !s.assetsOpen;
    render();
  };
  btn.addEventListener('click', () => toggle());
  $('assets-close').addEventListener('click', () => toggle(false));

  const announce = (s, asset) => {
    sendOn(s.ws, msg.asset(asset));
    s.view.attach(asset.absPath);
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
    } catch (err) {
      dialogs.alert('No se pudo adjuntar el fichero', esc(err.message));
    }
  };

  // pegar desde el portapapeles (⌘V: imágenes copiadas o ficheros del Finder)
  // y arrastrar ficheros (de cualquier tipo) encima del chat
  const wire = (viewEl, stackEl) => {
    document.addEventListener('paste', (e) => {
      if (viewEl.hidden) return;
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return; // texto: lo pega la caja como cualquier campo
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
      if (!s || !s.launched) { dialogs.alert('Sin chat activo', 'Abre un chat antes de adjuntar ficheros.'); return; }
      files.forEach((f) => upload(s, f));
    });
  };

  return { render, upload, flushPending, wire };
};
