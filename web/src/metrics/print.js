// Imprimir un informe de Métricas (#15), o verlo antes (previewReport), sin salir de la vista: un marco con los
// mismos estilos que la app y lo que pinta la pestaña (las mismas tarjetas, gráficas y colores), y su diálogo de
// impresión, que deja guardarlo como PDF. La ventana de Electron no abre otras (electron/main.js), por eso un marco y
// no una ventana nueva. Siempre en el tema claro, aunque se esté usando el oscuro: es para imprimir o enviar.
import { esc } from '../ui/html.js';
import { onEscape } from '../ui/dialog.js';
import { uiVars } from '../theme/apply.js';
import { themeById, toggledTheme } from '../theme/themes.js';

// Lo que no es para papel: enlaces a otras pestañas, botones y desplegables; las tarjetas, sin partirse.
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  html, body { margin: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* a una escala algo menor: la hoja es más estrecha que la pantalla y así se compone igual que en la vista */
  .mt-view.mt-print { overflow: visible; padding: 0 4px; zoom: .8; }
  /* un informe hecho de varias pestañas (Resumen básico, Estado de SLAs): entre una y otra, el mismo hueco que entre tarjetas */
  .mt-print .mt-grid + .mt-grid { margin-top: 16px; }
  /* la vista previa: sin barra propia (el marco ya es tan alto como el informe); el margen lo pone la hoja de fuera */
  @media screen { html { overflow: hidden; } }
  .mt-print button, .mt-print .mt-go, .mt-print .mt-kpi-go, .mt-print .mt-dn-go, .mt-print .mt-evo-picks, .mt-print .mt-ask { display: none !important; }
  .mt-print .mt-card { break-inside: avoid; }
  /* la sábana, entera y sin su caja con barra: puede ocupar varias hojas, sin partir una fila y con la cabecera en cada una */
  .mt-print .mt-card:has(.mt-sheet-bar) { break-inside: auto; }
  .mt-print .mt-tablewrap, .mt-print .mt-scroll { max-height: none !important; overflow: visible !important; }
  .mt-print .mt-list tr { break-inside: avoid; }
  .mt-print .mt-list thead { display: table-header-group; }
  .mt-print .mt-hoy-picks { display: none !important; }
  /* las tres evoluciones de Histórico, en tres columnas como en la app: el ancho de la hoja cae justo por debajo del
     corte de pantalla estrecha de metrics.css (1100 px), que las apilaría y cada una ocuparía media hoja */
  .mt-print .mt-trio { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* los títulos de sección, sin break-after: avoid: junto al break-inside: avoid de la tarjeta de debajo, Chrome acaba
     partiendo la tarjeta. Mejor un título al pie de una hoja que una tabla cortada */
  .mt-rep-head { margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--mt-line); color: var(--text); }
  .mt-rep-head h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
  .mt-rep-head dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; font-size: 12px; }
  .mt-rep-head dt { color: var(--mt-low); }
  .mt-rep-head dd { margin: 0; }
  .mt-rep-note { margin: 8px 0 0; font-size: 11.5px; color: var(--mt-low); }
`;

// Las variables del tema claro que corresponde a themeId (el mismo, si ya es claro).
export const lightVars = (themeId) => {
  const current = themeById(themeId);
  const light = current.dark ? toggledTheme(current.id) : current;
  return Object.entries(uiVars(light.ui)).map(([k, v]) => `${k}: ${v}`).join('; ');
};

// El documento que se imprime (sin DOM). title: el del documento (el nombre que propone el PDF); head y body: HTML;
// sideStyle: las variables de los colores de cada lado (el style de la vista: --mt-base0 y --mt-base1); styles: las
// etiquetas de estilo de la app; vars: las del tema (lightVars); baseURI: de dónde salen los .css enlazados. Con la
// clase styled: la app esconde el body hasta tenerla (index.html), y sus estilos se copian tal cual.
export const reportHtml = ({ title, head, body, sideStyle = '', styles = '', vars = '', baseURI = '' }) =>
  `<!doctype html><html lang="es" class="styled" data-mode="light" style="${esc(vars)}"><head><meta charset="utf-8">
    ${baseURI ? `<base href="${esc(baseURI)}">` : ''}<title>${esc(title)}</title>${styles}<style>${PRINT_CSS}</style></head>
    <body><div class="mt-view mt-print" style="${esc(sideStyle)}">${head}${body}</div></body></html>`;

// El documento de un informe con los estilos de la app en marcha: en desarrollo, <style> de Vite; empaquetada, el .css
// enlazado. parts: { title, head, body, sideStyle } (reportHtml).
const documentOf = (parts) => reportHtml({
  ...parts,
  styles: [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('\n'),
  vars: lightVars(localStorage.getItem('sia-theme')),
  baseURI: document.baseURI,
});

// Un marco con el documento; ready(frame) cuando ha cargado (y se han aplicado sus estilos).
const frameWith = (html, style, ready) => {
  const frame = document.createElement('iframe');
  frame.style.cssText = style;
  frame.addEventListener('load', () => setTimeout(() => ready(frame), 300), { once: true });
  frame.srcdoc = html;
  return frame;
};

// Imprimir sin enseñar nada: un marco oculto que se quita al acabar.
export const printReport = (parts) => {
  const frame = frameWith(documentOf(parts), 'position:fixed;right:0;bottom:0;width:1123px;height:794px;border:0;visibility:hidden;pointer-events:none', (f) => {
    const w = f.contentWindow;
    let gone = false;
    const done = () => { if (!gone) { gone = true; setTimeout(() => f.remove(), 500); } };
    w.addEventListener('afterprint', done, { once: true });
    w.focus();
    w.print();
    setTimeout(done, 60e3);
  });
  frame.setAttribute('aria-hidden', 'true');
  document.body.append(frame);
};

// Exportar a PDF: en la app de escritorio, directamente (Electron lo genera y pregunta dónde guardarlo, de partida en
// Descargas con su nombre: electron/main.js, por window.sia); en el navegador, con el diálogo de impresión (printReport).
// toast: para decir dónde quedó o qué falló. Devuelve si se guardó.
export const canSavePdf = () => typeof window !== 'undefined' && !!window.sia?.savePdf;
export const exportPdf = async (parts, { toast } = {}) => {
  if (!canSavePdf()) { printReport(parts); return false; }
  const res = await window.sia.savePdf(documentOf(parts), parts.title);
  if (res?.path) toast?.(`Informe guardado en ${res.path}.`);
  else if (res?.error) toast?.(`No se pudo guardar el PDF: ${res.error}`);
  return !!res?.path;
};

// La vista previa: el informe en pantalla, tal y como sale en el PDF (el marco, del ancho útil de un A4 apaisado, para
// que se componga igual; los márgenes, alrededor, en la hoja), con «Exportar PDF», que imprime ese mismo marco, y
// «Cambiar opciones» (onBack: vuelve a la ventana de exportar). Se cierra con la ×, con Escape o con un clic fuera.
export const previewReport = (parts, { onBack, toast } = {}) => {
  const back = document.createElement('div');
  back.className = 'mt-modal-back';
  back.innerHTML = `<div class="mt-modal mt-modal-preview" role="dialog" aria-modal="true" aria-labelledby="mt-preview-title" tabindex="-1">
    <header class="mt-modal-head"><h3 id="mt-preview-title">Vista previa · ${esc(parts.title)}</h3><button class="mt-modal-x" data-close aria-label="Cerrar">×</button></header>
    <div class="mt-preview-body"><p class="mt-preview-wait">Preparando la vista previa…</p><div class="mt-preview-page" data-sheet></div></div>
    <footer class="mt-modal-foot">${onBack ? '<button class="mt-btn" data-back>Cambiar opciones</button>' : ''}<button class="mt-btn mt-primary" data-print disabled>Exportar PDF</button></footer></div>`;
  document.body.append(back);
  const off = onEscape(() => close());
  const close = () => { off(); back.remove(); };
  const frame = frameWith(documentOf(parts), '', (f) => {
    back.querySelector('.mt-preview-wait')?.remove();
    f.classList.remove('mt-preview-loading');
    // la hoja, tan alta como su contenido: se desplaza la vista previa, no el marco
    f.style.height = `${f.contentDocument.documentElement.scrollHeight}px`;
    back.querySelector('[data-print]').disabled = false;
  });
  frame.title = parts.title;
  frame.className = 'mt-preview-sheet mt-preview-loading';
  back.querySelector('[data-sheet]').append(frame);
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-back]')) { close(); return onBack(); }
    // en la app de escritorio, el PDF directamente (y se cierra al guardarlo); en el navegador, el diálogo de imprimir
    if (e.target.closest('[data-print]')) {
      if (canSavePdf()) exportPdf(parts, { toast }).then((saved) => { if (saved) close(); });
      else { frame.contentWindow.focus(); frame.contentWindow.print(); }
    }
  });
  back.querySelector('.mt-modal').focus();
  return close;
};
