// Las ventanas de Métricas, para lo que se hace pocas veces: cargar un CSV de Remedy (arrastrarlo o elegirlo),
// construir la consulta de un periodo para copiarla a Snowflake, elegir el periodo de la primera carga y borrar el
// histórico (con confirmación). Son modales encima de la app: se cierran con Escape, con la × o con Cancelar, y lo
// largo (la consulta) se desplaza dentro de la ventana, sin desbordarla. `api`: metrics-api.js; `onUpload(file)`:
// la vista sube el CSV con su avance.
import { esc } from '../ui/html.js';
import { onEscape } from '../ui/dialog.js';
import { mountPeriodPanel } from './period-panel.js';
import { calendarModel } from './calendar-model.js';
import { DAY } from './rules.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const UPLOAD = svg('<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>');
const SQL_FROM_YEAR = 2020;   // el constructor de SQL deja elegir desde este año

// Un instante del modelo (minutos desde BASE) como día AAAA-MM-DD.
const dayOf = (min, base) => new Date(base + min * 6e4).toISOString().slice(0, 10);

export const mountMetricsModals = ({ api, toast, onUpload, onFirstLoad, onClear }) => {
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

  // Cargar un CSV: se arrastra o se elige; solo .csv. Al pulsar, la vista muestra el avance de la subida.
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

  // Un periodo elegido con el panel de Métricas (period-panel.js) dentro de la ventana. Los días: desde su primer día
  // hasta el último incluido (d1 es el día siguiente, excluido). `onChange` se llama al cambiar el periodo.
  const periodPanelIn = (el, model, onChange) => {
    const panel = mountPeriodPanel(el, { model: () => model, onPick: onChange });
    panel.open();
    return () => ({ from: dayOf(model.S.d0, model.BASE), to: dayOf(model.S.d1 - DAY, model.BASE) });
  };

  // Construir la consulta de un periodo: el panel de Métricas, con el año en curso al abrir y se puede cambiar de año.
  // Solo texto: se copia para ejecutarlo en Snowflake; SIA no la ejecuta.
  const sql = () => {
    const model = calendarModel(SQL_FROM_YEAR);
    open({
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
        const period = periodPanelIn(back.querySelector('[data-cal]'), model, () => { out.hidden = true; copy.hidden = true; err.hidden = true; });
        build.addEventListener('click', async () => {
          err.hidden = true;
          const { from, to } = period();
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
  };

  // La primera carga, con la base vacía: el periodo a traer (por defecto, desde el 1 de enero de 2026 hasta hoy).
  const firstLoad = () => {
    // desde 2020, como el constructor de SQL; al abrir, el 1 de enero de 2026 (la primera carga de siempre)
    const model = calendarModel(SQL_FROM_YEAR, { openYear: 2026 });
    open({
      title: 'Primera carga',
      wide: true,
      body: `<div class="mt-sql-cal" data-cal></div>
        <p class="mt-modal-hint">Se traen de Snowflake las incidencias abiertas en el periodo elegido, con sus notas, hijas e historial. Lo que llegue después de ese periodo se traerá en las próximas actualizaciones.</p>
        <p class="mt-modal-err" data-err hidden></p>`,
      foot: `<button class="mt-btn" data-close>Cancelar</button><button class="mt-btn mt-primary" data-go>Cargar datos</button>`,
      setup: (back, close) => {
        const go = back.querySelector('[data-go]'), err = back.querySelector('[data-err]');
        const period = periodPanelIn(back.querySelector('[data-cal]'), model, () => { err.hidden = true; });
        go.addEventListener('click', () => {
          close();   // la vista muestra el avance de la carga
          onFirstLoad(period());
        });
      },
    });
  };

  // Borrar el histórico: un switch que hay que encender para que se pueda aceptar. Snowflake no se toca.
  const clear = () => open({
    title: 'Eliminar el histórico',
    body: `<div class="mt-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>
        <div><b>Esta acción no se puede deshacer</b>
          <span>Se borran en este ordenador las incidencias guardadas, sus cambios y sus notas, y las métricas calculadas. Para recuperarlo hay que volver a cargarlo desde Snowflake o desde un CSV. Snowflake no se toca.</span></div>
      </div>
      <label class="mt-switch"><input type="checkbox" data-switch><i></i><span><b>Sí, quiero borrar el histórico</b><small data-switch-hint>Enciende el interruptor para activar el botón.</small></span></label>`,
    foot: `<button class="mt-btn" data-close>Cancelar</button><button class="mt-btn mt-danger" data-go disabled>Eliminar histórico</button>`,
    setup: (back, close) => {
      const sw = back.querySelector('[data-switch]'), go = back.querySelector('[data-go]'), hint = back.querySelector('[data-switch-hint]');
      sw.addEventListener('change', () => {
        go.disabled = !sw.checked;
        hint.textContent = sw.checked ? 'Listo: ya puedes eliminarlo.' : 'Enciende el interruptor para activar el botón.';
      });
      go.addEventListener('click', () => {
        if (!sw.checked) return;
        close();
        onClear();
      });
    },
  });

  return { csv, sql, firstLoad, clear };
};
