// Piezas de HTML que comparten varias tablas de las Métricas (sin DOM).
import { esc } from '../ui/html.js';

// La celda del título de un bloque de filas: va en la primera fila del bloque y abarca todas las suyas.
export const blockHead = (head, note, n) => `<th class="mt-gl" rowspan="${n}">${esc(head)}${note ? `<small>${esc(note)}</small>` : ''}</th>`;

// Filas sueltas donde cada { head, note } abre un bloque → [{ head, note, rows }]; las de antes del primero, sin bloque.
export const blocksOf = (rowsDef) => {
  const blocks = [];
  for (const r of rowsDef) {
    if (r.head) blocks.push({ head: r.head, note: r.note, rows: [] });
    else { if (!blocks.length) blocks.push({ rows: [] }); blocks[blocks.length - 1].rows.push(r); }
  }
  return blocks;
};
