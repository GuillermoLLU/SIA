// Enlaces rápidos, sus reglas (sin DOM): el nombre del conocimiento de un
// enlace, los filtros, el Markdown de las notas, lo que se guarda y cómo se
// encoge la imagen.
import { esc } from '../ui/html.js';

export const projectName = (projects, id) => projects.find((p) => p.id === id)?.name || 'Sin conocimiento';

// Filtros: solo los conocimientos que TIENEN enlaces. Listar los que están
// vacíos llena la barra de chips a cero que no llevan a ninguna parte; para
// dar de alta en uno vacío ya está el desplegable del formulario. Con uno
// solo no hay chips. Si el filtrado se ha quedado sin enlaces, vuelve «Todos».
export const linkFilters = (projects, links, filter) => {
  const withLinks = projects.map((p) => ({ id: p.id, name: p.name, n: links.filter((l) => l.project_id === p.id).length })).filter((p) => p.n > 0);
  const current = filter !== null && withLinks.some((p) => p.id === filter) ? filter : null;
  const chips = withLinks.length > 1 ? [{ label: 'Todos', value: null, n: links.length }, ...withLinks.map((p) => ({ label: p.name, value: p.id, n: p.n }))] : [];
  return { chips, filter: current, list: current === null ? links : links.filter((l) => l.project_id === current) };
};

/* Markdown mínimo y seguro: se escapa TODO primero y solo después se
   reconocen unos pocos patrones. Nada de innerHTML con texto del usuario. */
export const miniMarkdown = (src) => esc(String(src || ''))
  .replace(/^### (.*)$/gm, '<h4>$1</h4>')
  .replace(/^## (.*)$/gm, '<h3>$1</h3>')
  .replace(/^# (.*)$/gm, '<h3>$1</h3>')
  .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
  .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
  .replace(/\n{2,}/g, '</p><p>')
  .replace(/\n/g, '<br>');

// Lo que se manda al bridge desde el formulario.
export const linkPayload = ({ project, title, url, image, notes }) => ({
  project_id: Number(project), title: title.trim(), url: url.trim(), image: image || null, notes: notes.trim() || null,
});

// La imagen viaja dentro del listado, así que se encoge antes de guardarla
// (la card la pinta a 38 px): el lado mayor a LINK_IMAGE_SIDE, nunca más grande.
const LINK_IMAGE_SIDE = 256;
export const shrinkTo = (w, h, side = LINK_IMAGE_SIDE) => {
  const scale = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
};
// el data URI es base64: los bytes reales son ~3/4 de su longitud
export const dataUriKb = (uri) => Math.round((uri.length * 0.75) / 1024);
