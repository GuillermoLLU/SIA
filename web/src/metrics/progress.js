// La pantalla de carga de «Actualizar y generar informe» y de «Cargar CSV» (dominio puro): del avance que da el bridge
// ({ phase, done, total, unit }, server/metrics/store.js) a cuánto queda, el porcentaje, el texto y los pasos.
import { esc } from '../ui/html.js';
import { num } from './format.js';

// Las fases de cada tarea y lo que suelen tardar (s), medido. Actualizar: cargar el conector unos segundos (con poca
// memoria, 25–35 s; solo la primera vez tras arrancar SIA), conectar ~5 s, traer unas 3.000 incidencias ~10 s,
// recalcular 30–40 s. Cargar un CSV: leerlo y guardarlo, unos segundos por cada 30.000 incidencias, y recalcular.
export const PHASES = [
  { id: 'prepare', label: 'Preparar el conector de Snowflake', usual: 5 },
  { id: 'connect', label: 'Conectar con Snowflake', usual: 5 },
  { id: 'download', label: 'Traer lo nuevo y lo cambiado', usual: 10 },
  { id: 'compute', label: 'Recalcular el informe', usual: 35 },
];
export const CSV_PHASES = [
  { id: 'download', label: 'Leer el CSV y guardar sus incidencias', usual: 5 },
  { id: 'compute', label: 'Recalcular el informe', usual: 35 },
];
// Antes de esto, el ritmo de una fase aún no dice nada.
const SETTLE_MS = 2000;

const phaseOf = (phases, p) => Math.max(0, phases.findIndex((x) => x.id === p?.phase));
// Lo que suelen tardar las fases que vienen detrás.
const ahead = (phases, phase) => phases.slice(phase + 1).reduce((s, x) => s + x.usual, 0);
// Lo que le queda a una fase sin cifras: lo habitual menos lo que lleva; si se alarga, nunca menos de un poco.
const guess = (usual, ms) => Math.max(usual - ms / 1000, usual * 0.15);

// Los segundos que quedan y si son de fiar (known: false mientras solo es lo habitual). Con cifras (leer o recalcular),
// lo que falta de la fase en curso a su ritmo desde que empezó (phaseMs); sin ellas, lo habitual.
export const estimate = (p, phaseMs, phases = PHASES) => {
  const phase = phaseOf(phases, p), rest = ahead(phases, phase), id = phases[phase].id;
  if (id === 'download' && !p.total) return { s: rest, known: true };
  const msEach = (id === 'download' || id === 'compute') && p.done && phaseMs >= SETTLE_MS ? phaseMs / p.done : null;
  if (msEach !== null) return { s: ((p.total - p.done) * msEach) / 1000 + rest, known: true };
  return { s: guess(phases[phase].usual, phaseMs) + rest, known: id === 'compute' };
};

export const leftLabel = (s) => {
  if (s < 10) return 'Casi está';
  if (s < 60) return `Quedan unos ${Math.ceil(s / 5) * 5} s`;
  const min = Math.round(s / 60);
  return min === 1 ? 'Queda un minuto, más o menos' : `Quedan unos ${min} min`;
};

const DETAIL = {
  prepare: 'Cargando el conector: la primera vez tras arrancar SIA puede tardar un poco.',
  connect: 'Si se abre el navegador, entra con tu cuenta de Inditex.',
};
const MB = (bytes) => `${(bytes / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

// p: el avance del bridge (null: aún no ha llegado); elapsed: ms desde que se pulsó; phaseMs: desde que empezó la
// fase en curso. El porcentaje es de tiempo: lo que lleva frente a lo que llevará; avanza desde el primer momento,
// aunque al principio lo que queda solo sea una estimación. phases: las de la tarea (PHASES o CSV_PHASES).
export const progressOf = (last, { elapsed, phaseMs }, phases = PHASES) => {
  const p = last ?? {};   // sin avance aún (null), la primera pintura
  const phase = phaseOf(phases, p), id = phases[phase].id;
  const { s, known } = estimate(p, phaseMs, phases);
  const percent = Math.min(99, Math.floor((100 * elapsed) / (elapsed + s * 1000)));
  const detail = DETAIL[id]
    ?? (p.unit === 'bytes' ? (p.total ? `${MB(p.done)} de ${MB(p.total)}` : `${MB(p.done)} leídos`)
      : id === 'download' && !p.total ? 'Sin cambios desde la última actualización.'
        : `${num(p.done)} de ${num(p.total)} incidencias`);
  return { phase, percent, detail, left: known ? leftLabel(s) : 'Calculando cuánto queda…' };
};

// La tarjeta: el porcentaje, la barra, la fase con lo que queda y su detalle, y los pasos (hechos, el de ahora, los que faltan).
export const progressHtml = ({ phase, percent, detail, left }, phases = PHASES) => `
  <div class="mt-load-card" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Actualizando las métricas">
    <p class="mt-load-eyebrow">Actualizando las métricas</p>
    <div class="mt-load-figure"><b>${percent}</b><span>%</span></div>
    <div class="mt-load-bar"><i style="width:${percent}%"></i></div>
    <div class="mt-load-now"><b>${esc(phases[phase].label)}</b><span>${esc(left)}</span></div>
    <p class="mt-load-detail">${esc(detail)}</p>
    <ol class="mt-load-steps">${phases.map((x, i) => `<li class="${i < phase ? 'mt-done' : i === phase ? 'mt-now' : ''}"><i></i>${esc(x.label)}</li>`).join('')}</ol>
    <p class="mt-load-note">Mientras tanto, las métricas no se pueden usar: al acabar se abren con los datos nuevos.</p>
  </div>`;
