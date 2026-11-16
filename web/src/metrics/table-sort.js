// Ordenar cualquier tabla de las Métricas pinchando en la cabecera de una columna (metrics-view.js, tras pintar cada
// pestaña). Es genérico: trabaja sobre la tabla ya pintada, sin que cada pestaña tenga que hacer nada.
//   - Clic: de mayor a menor (texto, de la A a la Z); otra vez, al revés; la tercera, el orden de partida.
//   - Se ordenan filas sueltas o, comparando, la pareja de filas de cada cosa (la que lleva la celda con rowspan); en
//     las tablas por bloques (la celda .mt-gl a la izquierda), cada bloque por su lado. Los totales (.mt-tot, .mt-tot2)
//     se quedan abajo, donde estaban.
//   - Lo vacío o «—», siempre al final. Las cifras se leen como se pintan: «1.234», «12,5 %», «+3 pts», «−2,1 h», «ene 2026»,
//     «03/09/2026 14:05» (por fecha y hora, no como texto).
//   - Las tablas que ya se ordenan solas (con th[data-sort]) no se tocan.
// ui.colSort: { clave de la tabla: [columna, 1 | -1] }, para que el orden siga al repintar (filtros, periodo…).
import { MONTHS } from './format.js';

const UNIT = { '': 1, '%': 1, pts: 1, min: 1, h: 60, d: 1440 };
// el valor con el que se ordena una celda: un número, un texto o null (vacía)
export const cellValue = (raw) => {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/[↑↓*]$/u, '').trim();
  if (!s || s === '—' || s === '-') return null;
  const dt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?$/);
  if (dt) return Date.UTC(+dt[3], +dt[2] - 1, +dt[1], +(dt[4] || 0), +(dt[5] || 0)) / 6e4;
  const n = s.replace(/−/g, '-').replace(/^\+/, '').match(/^(-?[\d.]+(?:,\d+)?)\s*(%|pts|min|h|d)?$/);
  if (n) return Number(n[1].replace(/\./g, '').replace(',', '.')) * UNIT[n[2] || ''];
  const mo = s.toLowerCase().match(/^([a-zé]{3})\.?(?: (\d{4}))?$/);
  if (mo && MONTHS.includes(mo[1])) return (Number(mo[2] || 0)) * 12 + MONTHS.indexOf(mo[1]);
  return s;
};
// el orden de unas filas (o grupos) por sus valores: los números como números (si la mayoría lo son), el resto como
// texto; los vacíos al final. dir 0: como venían. Devuelve los índices.
export const orderOf = (values, dir) => {
  const idx = values.map((_, i) => i);
  if (!dir) return idx;
  const full = values.filter((v) => v != null), numeric = full.filter((v) => typeof v === 'number').length * 2 >= full.length;
  const key = (v) => (v == null ? null : numeric ? (typeof v === 'number' ? v : null) : String(v));
  const cmp = (a, b) => {
    const x = key(values[a]), y = key(values[b]);
    if (x == null || y == null) return x == null && y == null ? a - b : x == null ? 1 : -1;
    const c = numeric ? x - y : x.localeCompare(y, 'es', { numeric: true, sensitivity: 'base' });
    return c ? c * dir : a - b;
  };
  return idx.sort(cmp);
};
// el primer clic: de mayor a menor (texto, de la A a la Z); luego, al revés; luego, nada
export const nextDir = (cur, numeric) => {
  const first = numeric ? -1 : 1;
  return cur == null || cur === 0 ? first : cur === first ? -first : 0;
};

// --- DOM
// la rejilla de unas filas: en cada fila, la celda de cada columna (con rowspan y colspan resueltos)
const gridOf = (rows) => {
  const g = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const td of tr.cells) {
      while (g[r][c]) c++;
      for (let i = 0; i < (td.rowSpan || 1) && r + i < rows.length; i++) for (let j = 0; j < (td.colSpan || 1); j++) g[r + i][c + j] = td;
      c += td.colSpan || 1;
    }
  });
  return g;
};
const OWN = 'table:has(th[data-sort])';
// las cabeceras por las que se ordena: las de las columnas (no las de grupo, .mt-cgrp) y su columna
const heads = (table) => {
  const rows = [...(table.tHead?.rows || [])];
  if (!rows.length || table.matches(OWN)) return [];
  const g = gridOf(rows), out = [];
  rows.forEach((tr, r) => {
    if (tr.classList.contains('mt-cgrp')) return;
    for (const th of tr.cells) out.push([th, g[r].indexOf(th)]);
  });
  return out;
};
// la clave de una tabla en su pestaña: el título de su tarjeta y cuántas van antes con ese título
const keysOf = (main, tab) => {
  const seen = {};
  return [...main.querySelectorAll('table')].map((t) => {
    const card = t.closest('.mt-card'), title = card?.querySelector('h3')?.textContent || card?.querySelector('.mt-sc-title')?.textContent || '';
    const k = `${tab}|${title}`; seen[k] = (seen[k] || 0) + 1;
    return [t, `${k}|${seen[k]}`];
  });
};
// ordenar el cuerpo de una tabla por la columna col
const sortBody = (table, col, dir) => {
  for (const body of table.tBodies) {
    const rows = [...body.rows], g = gridOf(rows);
    if (!rows.length || !g.some((r) => r.length > col)) continue;
    // los tramos que se ordenan por separado: un bloque (.mt-gl) o lo que hay entre totales
    const spans = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].classList.contains('mt-tot') || rows[i].classList.contains('mt-tot2')) { i++; continue; }
      const gl = [...rows[i].cells].find((c) => c.classList.contains('mt-gl'));
      if (gl) { spans.push({ from: i, to: i + gl.rowSpan, gl }); i += gl.rowSpan; continue; }
      let j = i;
      while (j < rows.length && !rows[j].classList.contains('mt-tot') && !rows[j].classList.contains('mt-tot2') && ![...rows[j].cells].some((c) => c.classList.contains('mt-gl'))) j++;
      spans.push({ from: i, to: j }); i = j;
    }
    for (const sp of spans) {
      // los grupos: cada fila, o la que lleva una celda con rowspan (que no sea el bloque) y las que abarca
      const groups = [];
      for (let r = sp.from; r < sp.to;) {
        const span = Math.max(1, ...[...rows[r].cells].filter((c) => c !== sp.gl).map((c) => c.rowSpan || 1));
        groups.push(rows.slice(r, Math.min(r + span, sp.to)).map((tr) => [tr, rows.indexOf(tr)])); r += span;
      }
      if (groups.length < 2) continue;
      const vals = groups.map((gr) => { const c = g[gr[0][1]][col]; return c && c !== sp.gl ? cellValue(c.textContent) : null; });
      const order = orderOf(vals, dir), anchor = rows[sp.to] || null;
      if (sp.gl) sp.gl.remove();
      for (const k of order) for (const [tr] of groups[k]) body.insertBefore(tr, anchor);
      if (sp.gl) { const first = groups[order[0]][0][0]; first.insertBefore(sp.gl, first.firstChild); }
    }
  }
};

// tras pintar: marcar las cabeceras que ordenan y aplicar el orden guardado de cada tabla
export const applyTableSorts = (main, tab, sorts) => {
  for (const [table, key] of keysOf(main, tab)) {
    const hs = heads(table);
    for (const [th, col] of hs) { th.dataset.colsort = `${key}¦${col}`; th.classList.add('mt-colsort'); }
    const s = sorts[key];
    if (!s?.[1]) continue;
    const th = hs.find(([, c]) => c === s[0])?.[0];
    if (!th) continue;
    sortBody(table, s[0], s[1]);
    th.classList.add('mt-srt'); th.setAttribute('aria-sort', s[1] < 0 ? 'descending' : 'ascending');
    th.insertAdjacentHTML('beforeend', `<span class="mt-srt-a">${s[1] < 0 ? ' ↓' : ' ↑'}</span>`);
  }
};
// clic en una cabecera (th[data-colsort]): el siguiente orden de esa columna
export const toggleTableSort = (th, sorts) => {
  const [key, c] = th.dataset.colsort.split('¦'), col = Number(c), cur = sorts[key];
  const table = th.closest('table'), rows = [...table.tBodies].flatMap((b) => [...b.rows]), g = gridOf(rows);
  const vals = g.map((r) => (r[col] ? cellValue(r[col].textContent) : null)).filter((v) => v != null);
  const numeric = vals.filter((v) => typeof v === 'number').length * 2 >= vals.length;
  const dir = nextDir(cur && cur[0] === col ? cur[1] : null, numeric);
  if (dir) sorts[key] = [col, dir]; else delete sorts[key];
};
