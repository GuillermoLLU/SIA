// El Markdown de las respuestas, a HTML para la conversación (marked, con lo
// que trae GitHub: tablas, listas de tareas, saltos de línea). Seguro: el
// HTML que venga en el texto se enseña como texto, no se interpreta, y los
// enlaces solo pueden ser http(s) o mailto (y se abren fuera).
import { Marked } from 'marked';
import { esc } from '../../ui/html.js';

const SAFE_LINK = /^(https?:|mailto:)/i;

// breaks: un salto de línea es un salto (en Markdown estricto sería un
// espacio y las líneas se juntarían)
const md = new Marked({ gfm: true, breaks: true });
md.use({
  renderer: {
    html: (html) => esc(typeof html === 'string' ? html : html.text),
    link(href, title, text) {
      if (!SAFE_LINK.test(href || '')) return text;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
    },
    image: (href, title, text) => esc(text || ''), // sin imágenes remotas: su texto
  },
});

export const renderMarkdown = (text) => md.parse(String(text ?? ''));
