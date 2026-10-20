// La tabla de comparar (sin DOM): cada dato en dos columnas, una por lado, con su valor (no la diferencia). Es la
// misma en todas las pestañas: los nombres en una leyenda encima y, en la cabecera, solo el color de cada lado.
//  - defs: [nombre, valor (x), formato (v, x), mejor, nota, cuántas cuentan para marcar (x; si no, base)].
//    mejor: 'high' o 'low' (en verde, el lado que va mejor) o 'warn' (en ocre, el más alto: un aviso); sin él, sin color.
//  - rows: filas { label, x: [lado 0, lado 1], cls, attrs } y bloques { head, note, rows } (como en Qué recibe cada
//    uno: el título del bloque a la izquierda). Las filas sueltas tras los bloques (el total) ocupan las dos columnas.
//  - groups: [título, nº de datos], una fila encima que agrupa los datos por concepto.
// Se marca un lado si los dos tienen al menos BETTER_MIN en lo que cuenta ese dato y no se ven iguales al redondeo.
import { esc } from '../ui/html.js';

export const BETTER_MIN = 10;

// el lado marcado de un dato en una fila (0, 1) o -1
const pairMark = (d, x, base) => {
  if (!d[3]) return -1;
  const v = x.map((s) => d[1](s));
  if (v.some((y) => y == null) || x.some((s) => (d[5] || base)(s) < BETTER_MIN)) return -1;
  if (d[2](v[0], x[0]) === d[2](v[1], x[1])) return -1;
  return (d[3] === 'low') === (v[0] < v[1]) ? 0 : 1;
};

// la línea a la izquierda de cada dato: continua al empezar un grupo (o cada dato, sin grupos), discontinua entre los
// datos de un mismo grupo
const seps = (defs, groups) => {
  if (!groups) return defs.map(() => 'mt-gsep');
  const starts = new Set(groups.reduce((a, [, n]) => [...a, a[a.length - 1] + n], [0]));
  return defs.map((_, c) => (starts.has(c) ? 'mt-gsep' : 'mt-msep'));
};

export const pairTable = ({ names, first, defs, rows, base = () => Infinity, groups = null }) => {
  const sep = seps(defs, groups), blocks = rows.some((r) => r.head);
  const cells = (r) => defs.map((d, c) => {
    const mark = pairMark(d, r.x, base), cls = d[3] === 'warn' ? 'mt-warn' : 'mt-better';
    return [0, 1].map((k) => { const v = d[1](r.x[k]); return `<td class="mt-num ${k ? '' : sep[c]} ${mark === k ? cls : ''}">${v == null ? '—' : d[2](v, r.x[k])}</td>`; }).join('');
  }).join('');
  // head: la celda del título del bloque, en su primera fila; inBlock: las demás filas del bloque
  const row = (r, head = '', inBlock = false) => `<tr class="${r.cls || ''}" ${r.attrs || ''}>${head}<td class="mt-r" ${blocks && !head && !inBlock ? 'colspan="2"' : ''} data-tip="${esc(r.label)}">${esc(r.label)}</td>${cells(r)}</tr>`;
  const block = (b) => b.rows.map((x, j) => row({ ...x, cls: `${x.cls || ''} ${j ? '' : 'mt-gfirst'}` },
    j ? '' : `<th class="mt-gl" rowspan="${b.rows.length}">${esc(b.head)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</th>`, true)).join('');
  const body = rows.map((r) => (r.head ? block(r) : row(r))).join('');
  const lead = blocks ? 2 : 1;
  const side = (k, cls = '') => `<th class="mt-led-side ${cls}" data-tip="${esc(names[k])}"><i class="mt-c${k}"></i></th>`;
  return `<div class="mt-legend">${[0, 1].map((k) => `<span><i class="mt-c${k}"></i>${esc(names[k])}</span>`).join('')}</div><div class="mt-tablewrap"><table class="mt-fixed mt-led2 mt-pair ${blocks ? 'mt-pair-b' : ''}"><colgroup>${'<col class="mt-first">'.repeat(lead)}${'<col>'.repeat(defs.length * 2)}</colgroup><thead>
    ${groups ? `<tr class="mt-cgrp"><th colspan="${lead}"></th>${groups.map(([g, n]) => `<th colspan="${n * 2}">${g}</th>`).join('')}</tr>` : ''}
    <tr><th rowspan="2" colspan="${lead}">${first}</th>${defs.map((d, c) => `<th class="mt-num mt-led-m ${sep[c]}" colspan="2" ${d[4] ? `data-tip="${esc(d[4])}"` : ''}>${d[0]}</th>`).join('')}</tr>
    <tr>${defs.map((_, c) => side(0, sep[c]) + side(1)).join('')}</tr></thead><tbody>
    ${body}</tbody></table></div>`;
};
