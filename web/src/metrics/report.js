// Exportar informe (#15; sin DOM): qué informes hay, de qué periodo sale cada uno y su cabecera. Se piden desde los
// tres puntos de Métricas (metrics-modals.js, report) y se imprimen a PDF (print.js). De momento, el básico: lo que
// enseña el Resumen.
//
// Con los datos actuales, lo que se ve ahora arriba: el periodo, lo que se compara y los filtros. Con los históricos,
// un rango a mano dentro de lo cargado, con lo mismo que se compara y los mismos filtros. Del pasado solo se sabe
// cuánto había abierto cada día, no en qué estado estaba: el informe histórico no lleva la corona del estado de ahora.
import { esc } from '../ui/html.js';
import { dmy } from './format.js';
import { DAY } from './rules.js';

export const REPORTS = [['basic', 'Básico', 'Lo que enseña el Resumen: en qué estado está lo abierto, los KPIs del periodo y la evolución del backlog.']];
export const SOURCES = [['now', 'Datos actuales'], ['history', 'Datos históricos']];
export const SOURCE_NAME = Object.fromEntries(SOURCES);

const DAY_MS = 864e5;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// «2026-10-16» → ms de sus 00:00 UTC; null si no es una fecha real (2026-02-30)
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) || isoOf(ms) !== s ? null : ms;
};

// Los días que se pueden elegir con los históricos: de lo cargado ({ min, max }, «AAAA-MM-DD», los dos incluidos).
// m: el modelo (model.js): del primer día cargado (MIN_D) al de la foto (END_D, excluido).
export const reportBounds = (m) => ({ min: isoOf(m.BASE + m.MIN_D * 6e4), max: isoOf(m.BASE + (m.END_D - DAY) * 6e4) });

// De qué periodo sale el informe: { range: [d0, d1) en minutos desde BASE } o { error }. Con los actuales, current
// (el de arriba); con los históricos, from y to («AAAA-MM-DD», los dos incluidos), dentro de bounds.
export const reportRange = ({ source, current, from, to, bounds, base }) => {
  if (source === 'now') return { range: current };
  const a = parseDay(from), b = parseDay(to);
  if (a == null || b == null) return { error: 'Elige la fecha de inicio y la de fin.' };
  if (a > b) return { error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  if (from < bounds.min || to > bounds.max) return { error: `Solo hay datos del ${dmy(parseDay(bounds.min))} al ${dmy(parseDay(bounds.max))}.` };
  return { range: [(a - base) / 6e4, (b + DAY_MS - base) / 6e4] };
};

// «01/10/2026 – 31/10/2026 · 31 días», de un rango [d0, d1) en minutos desde base
export const rangeText = ([d0, d1], base) => {
  const n = Math.round((d1 - d0) / DAY);
  return `${dmy(base + d0 * 6e4)} – ${dmy(base + (d1 - DAY) * 6e4)} · ${n} ${n === 1 ? 'día' : 'días'}`;
};

// El nombre del PDF: el título del documento, que es lo que propone «Guardar como PDF».
export const reportName = (key, [d0, d1], base) =>
  `Informe ${REPORTS.find(([k]) => k === key)[1].toLowerCase()} ${isoOf(base + d0 * 6e4)} a ${isoOf(base + (d1 - DAY) * 6e4)}`;

// La cabecera del informe: qué es, de qué periodo, de dónde salen los datos, qué se mira (sides: los nombres de los
// lados), con qué filtros (filters: textos) y cuándo se generó (generatedAt: Date, en el reloj de quien lo genera).
export const reportHead = ({ key, source, range, base, sides = [], filters = [], coverage = '', generatedAt = new Date() }) => {
  const two = (n) => String(n).padStart(2, '0'), g = generatedAt;
  const stamp = `${two(g.getDate())}/${two(g.getMonth() + 1)}/${g.getFullYear()} ${two(g.getHours())}:${two(g.getMinutes())}`;
  const label = REPORTS.find(([k]) => k === key)[1];
  const rows = [
    ['Periodo', rangeText(range, base)],
    ['Datos', SOURCE_NAME[source] + (coverage ? ` · ${coverage}` : '')],
    [sides.length > 1 ? 'Comparando' : 'Qué se mira', sides.join(' frente a ')],
    ...(filters.length ? [['Filtros', filters.join(' · ')]] : []),
    ['Generado', stamp],
  ];
  const note = source === 'history' ? '<p class="mt-rep-note">Con datos históricos no hay estado del backlog por situación (solo se conoce el de ahora): su evolución día a día está en la última tarjeta.</p>' : '';
  return `<header class="mt-rep-head"><h1>Informe ${esc(label.toLowerCase())} · Métricas</h1>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${note}</header>`;
};
