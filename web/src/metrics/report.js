// Exportar informe (#15; sin DOM): qué informes hay, de qué periodo sale cada uno y su cabecera. Se eligen en un
// desplegable desde los tres puntos de Métricas (metrics-modals.js, report) y se imprimen a PDF (print.js).
//
//   Backlog actual  solo lo abierto ahora (a fecha de la última carga, sea cual sea el periodo de arriba): la corona
//                   del Resumen y el resto de Foto de hoy, que es lo mismo sin repetirlo, con la sábana entera.
//   Histórico       un rango a mano dentro de lo cargado: los KPIs del periodo y la evolución del backlog del
//                   Resumen. Del pasado solo se sabe cuánto había abierto cada día, no en qué estado estaba: no lleva
//                   la corona.
// Los dos, con lo que se compara y los filtros de arriba.
import { esc } from '../ui/html.js';
import { dmy } from './format.js';
import { DAY } from './rules.js';

// [clave, nombre, si se eligen fechas, lo que contiene (el texto de debajo del desplegable)]
export const REPORTS = [
  ['backlog', 'Backlog actual', false, 'Lo abierto ahora, a fecha de la última carga: en qué estado está, en qué punto y qué conviene vigilar, el detalle por situación, prioridad, módulo, escalado y centro, quién tiene qué y la sábana con todas las incidencias abiertas.'],
  ['history', 'Histórico', true, 'Lo de las fechas que elijas, dentro de lo cargado: los KPIs del periodo (entrantes, MTTR, % dentro de SLA, %IQA y uso de la IA) y la evolución del backlog día a día.'],
];
const reportOf = (key) => REPORTS.find(([k]) => k === key) || REPORTS[0];
// si el informe se hace con las fechas que se eligen (Histórico) o con lo de ahora (Backlog actual)
export const withDates = (key) => reportOf(key)[2];
export const reportLabel = (key) => reportOf(key)[1];

const DAY_MS = 864e5;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// «2026-10-16» → ms de sus 00:00 UTC; null si no es una fecha real (2026-02-30)
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) || isoOf(ms) !== s ? null : ms;
};

// Los días que se pueden elegir con fechas: de lo cargado ({ min, max }, «AAAA-MM-DD», los dos incluidos).
// m: el modelo (model.js): del primer día cargado (MIN_D) al de la foto (END_D, excluido).
export const reportBounds = (m) => ({ min: isoOf(m.BASE + m.MIN_D * 6e4), max: isoOf(m.BASE + (m.END_D - DAY) * 6e4) });

// De qué periodo sale el informe: { range: [d0, d1) en minutos desde BASE } o { error }. Sin fechas, current (el de
// arriba, que no se usa para lo abierto ahora); con ellas, from y to («AAAA-MM-DD», los dos incluidos), dentro de bounds.
export const reportRange = ({ key, current, from, to, bounds, base }) => {
  if (!withDates(key)) return { range: current };
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

// El nombre del PDF: el título del documento, que es lo que propone «Guardar como PDF». Sin fechas, el día de la
// última carga (asOf, ms); con ellas, el rango.
export const reportName = (key, [d0, d1], base, asOf = null) => (withDates(key)
  ? `${reportLabel(key)} ${isoOf(base + d0 * 6e4)} a ${isoOf(base + (d1 - DAY) * 6e4)}`
  : `${reportLabel(key)} ${isoOf(asOf)}`);

// La cabecera del informe: qué es, de cuándo (sin fechas, asOf: el texto de la última carga; con ellas, el periodo),
// qué se mira (sides: los nombres de los lados), con qué filtros (filters: textos) y cuándo se generó (generatedAt:
// Date, en el reloj de quien lo genera). coverage: hasta dónde llegan los datos del periodo (con fechas).
export const reportHead = ({ key, range, base, asOf = '', sides = [], filters = [], coverage = '', generatedAt = new Date() }) => {
  const two = (n) => String(n).padStart(2, '0'), g = generatedAt;
  const stamp = `${two(g.getDate())}/${two(g.getMonth() + 1)}/${g.getFullYear()} ${two(g.getHours())}:${two(g.getMinutes())}`;
  const dated = withDates(key);
  const rows = [
    dated ? ['Periodo', rangeText(range, base)] : ['A fecha de', asOf],
    ['Datos', dated ? coverage : 'Lo abierto ahora, se abriera cuando se abriera'],
    [sides.length > 1 ? 'Comparando' : 'Qué se mira', sides.join(' frente a ')],
    ...(filters.length ? [['Filtros', filters.join(' · ')]] : []),
    ['Generado', stamp],
  ].filter(([, v]) => v);
  const note = dated ? '<p class="mt-rep-note">Del pasado no hay estado del backlog por situación (solo se conoce el de ahora): su evolución día a día está en la última tarjeta.</p>' : '';
  return `<header class="mt-rep-head"><h1>${esc(reportLabel(key))} · Métricas</h1>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${note}</header>`;
};
