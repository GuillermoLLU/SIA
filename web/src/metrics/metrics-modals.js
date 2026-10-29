// Las dos ventanas de Métricas, para lo que se hace pocas veces: cargar un CSV de Remedy (arrastrarlo o elegirlo)
// y construir la consulta de un periodo para copiarla a Snowflake. Son modales encima de la app: se cierran con
// Escape, con la × o con Cancelar, y el contenido largo (la consulta) se desplaza dentro de la ventana, sin
// desbordarla. `api`: metrics-api.js; `onLoaded(counts)`: la vista vuelve a leer los datos.
import { esc } from '../ui/html.js';
import { onEscape } from '../ui/dialog.js';
import { mountPeriodPanel } from './period-panel.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const UPLOAD = svg('<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>');
const DAY = 1440;   // un día en minutos, como en el modelo de Métricas (model.js)

// Un instante del modelo (minutos desde BASE) como día AAAA-MM-DD.
const dayOf = (min, base) => new Date(base + min * 6e4).toISOString().slice(0, 10);

export const mountMetricsModals = ({ api, toast, onUpload }) => {
  // Una ventana: título, cuerpo, pie y lo que se engancha a sus controles (setup). Devuelve cómo cerrarla.
  // closable: si lleva la × (con Escape o un clic fuera se cierra igual).
  const open = ({ title, body, foot, setup, wide = false, closable = true }) => {
    const back = document.createElement('div');
    back.className = 'mt-modal-back';
    back.innerHTML = `<div class="mt-modal ${wide ? 'mt-modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt-modal-title">
      <header class="mt-modal-head"><h3 id="mt-modal-title">${esc(title)}</h3>${closable ? '<button class="mt-modal-x" data-close aria-label="Cerrar">×</button>' : ''}</header>
      <div class="mt-modal-body">${body}</div>
      <footer class="mt-modal-foot">${foot}</footer></div>`;
    document.body.append(back);
    const off = onEscape(() => close());
    const close = () => { off(); back.remove(); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    // si algo falla al montarla, no se deja una ventana vacía abierta
    try { setup(back, close); } catch (e) { close(); throw e; }
    back.querySelector('.mt-modal').focus?.();
    return close;
  };

  // Cargar un CSV: se arrastra o se elige; solo .csv. Mientras sube, el botón dice que carga y no se puede volver a pulsar.
  const csv = () => open({
    title: 'Cargar un CSV de Remedy',
    body: `<label class="mt-drop" data-drop tabindex="0">
        <input type="file" accept=".csv,text/csv" hidden data-file>
        ${UPLOAD}<b data-drop-title>Arrastra aquí el CSV</b><span>o <u>elígelo en tu equipo</u></span>
      </label>
      <p class="mt-modal-hint">La consulta completa de Remedy, con notas e historial. Se suma al repositorio local: lo más reciente que ya esté guardado no se pisa.</p>
      <p class="mt-modal-err" data-err hidden></p>`,
    foot: `<button class="mt-btn" data-close>Cancelar</button><button class="mt-btn mt-primary" data-go disabled>Cargar CSV</button>`,
    setup: (back, close) => {
      const drop = back.querySelector('[data-drop]'), input = back.querySelector('[data-file]');
      const go = back.querySelector('[data-go]'), err = back.querySelector('[data-err]');
      let file = null;
      const fail = (text) => { err.textContent = text; err.hidden = false; };
      const pick = (f) => {
        err.hidden = true;
        if (!f) return;
        if (!/\.csv$/i.test(f.name)) { file = null; go.disabled = true; fail('Elige un fichero .csv.'); return; }
        file = f;
        go.disabled = false;
        back.querySelector('[data-drop-title]').textContent = f.name;
      };
      input.addEventListener('change', () => pick(input.files[0]));
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('mt-drop-on'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('mt-drop-on'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('mt-drop-on'); pick(e.dataTransfer.files[0]); });
      go.addEventListener('click', () => {
        if (!file) return;
        close();   // la vista muestra el avance de la subida, con su porcentaje
        onUpload(file);
      });
    },
  });

  // Construir la consulta de un periodo: el mismo panel de periodo que Métricas (period-panel.js), en la propia
  // ventana. `model`: un modelo con su propio periodo (lo prepara la vista), así que elegirlo aquí no cambia el de
  // Métricas. El texto se copia tal cual para ejecutarlo en Snowflake; SIA no lo ejecuta.
  const sql = (model) => open({
    title: 'Construir la consulta de un periodo',
    wide: true,
    closable: false,   // sin la ×; se cierra con Escape o con un clic fuera
    body: `<div class="mt-sql-cal" data-cal></div>
      <p class="mt-modal-hint">Las incidencias del grupo AYS SOPORTE abiertas en ese periodo, con sus notas, hijas e historial. Se copia y se ejecuta en Snowflake con tu cuenta; SIA no la ejecuta.</p>
      <p class="mt-modal-err" data-err hidden></p>
      <pre class="mt-sql" data-out hidden></pre>`,
    foot: `<button class="mt-btn" data-copy hidden>Copiar</button><button class="mt-btn mt-primary" data-build>Construir</button>`,
    setup: (back) => {
      const build = back.querySelector('[data-build]'), copy = back.querySelector('[data-copy]');
      const out = back.querySelector('[data-out]'), err = back.querySelector('[data-err]');
      // cambiar el periodo invalida la consulta que se enseña
      const panel = mountPeriodPanel(back.querySelector('[data-cal]'), {
        model: () => model,
        onPick: () => { out.hidden = true; copy.hidden = true; err.hidden = true; },
      });
      panel.open();
      build.addEventListener('click', async () => {
        err.hidden = true;
        // el periodo va en días: desde su primer día hasta el último (d1 es el día siguiente, excluido)
        const from = dayOf(model.S.d0, model.BASE), to = dayOf(model.S.d1 - DAY, model.BASE);
        build.disabled = true;
        try {
          out.textContent = await api.sql(from, to);
          out.hidden = false;
          copy.hidden = false;
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
        } finally {
          build.disabled = false;
        }
      });
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(out.textContent);
        toast?.('Consulta copiada.');
      });
    },
  });

  return { csv, sql };
};
