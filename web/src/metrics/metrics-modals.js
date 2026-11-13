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
import { REPORTS, MODES, AUDIENCES, SYSTEMS, PICKS, picksOf, modesOf, modeOf, withDates, reportRange, reportsOf, withSystems, withPerson, PARAMS, withParams, SHIFT_PICKS, withShifts, withPeriods, PERIODS_DEFAULT, CUSTOM, datesRange } from './report.js';

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
    back.innerHTML = `<div class="mt-modal ${wide ? 'mt-modal-wide' : ''}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mt-modal-title">
      <header class="mt-modal-head"><h3 id="mt-modal-title">${esc(title)}</h3>${closable ? '<button class="mt-modal-x" data-close aria-label="Cerrar">×</button>' : ''}</header>
      <div class="mt-modal-body">${body}</div>
      <footer class="mt-modal-foot">${foot}</footer></div>`;
    document.body.append(back);
    const off = onEscape(() => close());
    const close = () => { off(); back.remove(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    // si algo falla al montarla, no se deja una ventana vacía abierta
    try { setup(back, close); } catch (e) { close(); throw e; }
    back.querySelector('.mt-modal').focus();   // el modal recibe el foco (tabindex -1): Escape y el teclado, dentro
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

  // La primera carga, con la base vacía: el periodo a traer (por defecto, desde el 1 de enero de 2025 hasta hoy, para comparar con el año anterior).
  const firstLoad = () => {
    // desde 2020, como el constructor de SQL; al abrir, el 1 de enero de 2025 (el año anterior al servicio, para comparar: #14)
    const model = calendarModel(SQL_FROM_YEAR, { openYear: 2025 });
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

  // Exportar informe (#15): dos pestañas arriba, los mismos informes solo de Indra o de Indra frente a T-Systems
  // (report.js, AUDIENCES); en cada una, de qué sistemas (dos casillas, SGA y SISU, marcadas de partida: SYSTEMS), qué
  // informe, en un desplegable, con lo que contiene debajo; con los que admiten los dos, Actual o Histórico (modesOf);
  // y las fechas, solo si se hace con ellas (withDates); y, en los que las llevan, las listas de casillas (picksOf: módulos y centros, o equipos de Jira), con un
  // buscador y «Todos» / «Ninguno» (sobre lo que se ve). current: { range, from, to } del periodo de arriba y asOf, la
  // última carga (texto); bounds: { min, max } de lo cargado (reportBounds); base: m.BASE; lists: { pestaña → { dim →
  // [[clave, nombre, incidencias]] } } de cada lista, de más a menos (cada pestaña, lo suyo: solo Indra, o Indra y
  // T-Systems); al cambiar de pestaña se rehacen y lo desmarcado sigue desmarcado; onExport({ key, mode, audience, systems, picks, range,
  // preview, choice }): mode, 'now' o 'dates'; audience, la pestaña; systems, las casillas marcadas; picks, { dim →
  // claves marcadas } (sin listas, {}); preview, si se pidió la vista previa en lugar del PDF; choice, lo elegido, para volver a abrirla igual
  // (initial).
  // people: [[clave, nombre]] de los técnicos de Indra, para Equipo soporte (withPerson): un desplegable, de partida
  // «Todo el equipo»; onExport recibe person (la clave o null).
  // periods: [[clave, nombre, desde, hasta]] (period.js, cmpOptions; «AAAA-MM-DD»): el periodo del informe se elige en un
  // desplegable («Personalizado», arriba, con sus fechas; si no, no se ven); una casilla «Comparar con otro periodo»,
  // marcada, despliega el otro, igual. onExport recibe cmp ({ a, b }: { label, range } de cada uno; o null).
  const report = ({ current, bounds, base, lists = {}, people = [], periods = [], initial = {}, onExport }) => {
    const pick = { cmp: false, period: PERIODS_DEFAULT.a, cmpB: PERIODS_DEFAULT.b, cmpDates: {}, key: REPORTS[0][0], mode: null, audience: AUDIENCES[0][0], systems: SYSTEMS.map(([k]) => k), off: {}, person: null, params: PARAMS.map(([k]) => k), shifts: SHIFT_PICKS.map(([k]) => k), from: bounds.min > current.from ? bounds.min : current.from, to: current.to, ...initial };
    // lo desmarcado de cada lista (claves): se guarda al cambiar de pestaña y al volver de la vista previa
    const off = Object.fromEntries(PICKS.map(([dim]) => [dim, new Set(pick.off[dim] || [])]));
    // una lista de casillas, la de una pestaña: todo marcado menos lo desmarcado
    const pickList = (audience) => ([dim, label]) => {
      const items = lists[audience]?.[dim] || [];
      return `<div class="mt-rep-pick" data-pick="${dim}"><div class="mt-rep-pick-head"><b>${esc(label)}</b><span class="mt-mut" data-pick-count></span>
        <button type="button" class="mt-go" data-pick-all>Todos</button><button type="button" class="mt-go" data-pick-none>Ninguno</button></div>
        <input type="search" class="mt-rep-pick-q" data-pick-q placeholder="Buscar…" aria-label="Buscar en ${esc(label.toLowerCase())}">
        <div class="mt-rep-pick-list">${items.map(([k, l, n]) => `<label data-name="${esc(l.toLowerCase())}"><input type="checkbox" name="pick-${dim}" value="${k}" ${off[dim].has(k) ? '' : 'checked'}><span>${esc(l)}</span><small>${n}</small></label>`).join('') || '<p class="mt-mut mt-small">Nada cargado.</p>'}</div></div>`;
    };
    // lo que contiene: el texto del informe; sin fechas, además, de cuándo es lo abierto
    const about = (key, mode) => esc(REPORTS.find(([k]) => k === key)[3]) + (withDates(key, mode) ? '' : ` <span class="mt-rep-when">Última carga: ${esc(current.asOf)}.</span>`);
    // los informes de una pestaña (reportsOf), con el elegido marcado; si no lo tiene, el primero
    const options = (audience, key) => {
      const list = reportsOf(audience), on = list.some(([k]) => k === key) ? key : list[0][0];
      return list.map(([k, l]) => `<option value="${k}" ${k === on ? 'selected' : ''}>${esc(l)}</option>`).join('');
    };
    if (!reportsOf(pick.audience).some(([k]) => k === pick.key)) pick.key = reportsOf(pick.audience)[0][0];
    // las listas de un informe en una pestaña (picksOf: módulos y centros, o los equipos de Jira)
    const picksHtml = (audience, key) => picksOf(key).map(pickList(audience)).join('');
    const startMode = modeOf(pick.key, pick.mode);
    // un periodo: su desplegable («Personalizado», arriba del todo, y los de «Comparar») y, con «Personalizado», sus
    // fechas; si no, no se ven. s: 'a', el del informe (sus fechas, from y to); 'b', el otro de la comparación
    const names = { a: ['period', 'from', 'to'], b: ['cmp-b', 'cmp-b-from', 'cmp-b-to'] };
    const periodSide = (s, label) => {
      const [nk, nf, nt] = names[s], key = s === 'a' ? pick.period : pick.cmpB, d = s === 'a' ? pick : pick.cmpDates.b || pick;
      return `<span class="mt-rep-cmp-side"><select name="${nk}" aria-label="${label}">${[CUSTOM, ...periods].map(([k, l]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <span class="mt-rep-cmp-dates" data-cmp-dates="${s}"><input type="date" name="${nf}" value="${d.from}" min="${bounds.min}" max="${bounds.max}" aria-label="Desde"> – <input type="date" name="${nt}" value="${d.to}" min="${bounds.min}" max="${bounds.max}" aria-label="Hasta"></span></span>`;
    };
    // las fechas de un periodo: las escritas con «Personalizado»; si no, las suyas
    const datesOf = (key, f, t) => (key === CUSTOM[0] ? [f, t] : (periods.find(([k]) => k === key) || []).slice(2, 4));
    const labelOf = (key) => (key === CUSTOM[0] ? null : periods.find(([k]) => k === key)?.[1] ?? null);
    return open({
      title: 'Exportar informe',
      body: `<div class="mt-rep-tabs" role="tablist" aria-label="Qué se mira">${AUDIENCES.map(([k, l]) => `<button type="button" role="tab" class="mt-rep-tab" data-audience="${k}" aria-selected="${k === pick.audience}">${esc(l)}</button>`).join('')}</div>
        <fieldset class="mt-rep-systems" data-systems><legend>Sistemas</legend>${SYSTEMS.map(([k, l]) => `<label><input type="checkbox" name="system" value="${k}" ${pick.systems.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>
        <label class="mt-rep-field"><span>Informe</span>
          <select name="report" data-report>${options(pick.audience, pick.key)}</select></label>
        <p class="mt-rep-about" data-about>${about(pick.key, startMode)}</p>
        <fieldset class="mt-rep-systems" data-modes><legend>Datos</legend>${MODES.map(([k, l, tip]) => `<label title="${esc(tip)}"><input type="radio" name="mode" value="${k}" ${k === startMode ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>
        <fieldset class="mt-rep-systems mt-rep-params" data-params><legend>Parámetros</legend>${PARAMS.map(([k, l]) => `<label><input type="checkbox" name="param" value="${k}" ${pick.params.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>
        <fieldset class="mt-rep-systems mt-rep-params" data-shifts><legend>Turnos</legend>${SHIFT_PICKS.map(([k, l]) => `<label><input type="checkbox" name="shift" value="${k}" ${pick.shifts.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>
        <label class="mt-rep-field" data-person><span>Técnico</span>
          <select name="person"><option value="">Todo el equipo</option>${people.map(([k, l]) => `<option value="${k}" ${k === pick.person ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <div class="mt-rep-picks" data-picks>${picksHtml(pick.audience, pick.key)}</div>
        <div class="mt-rep-period" data-dates><span>Periodo</span>${periodSide('a', 'Periodo')}</div>
        <div class="mt-rep-cmp" data-cmp-box>
          <label class="mt-rep-check"><input type="checkbox" name="cmp" ${pick.cmp ? 'checked' : ''}> Comparar con otro periodo</label>
          <div class="mt-rep-cmp-pick" data-cmp-pick>
            <span>Frente a</span>${periodSide('b', 'Frente a')}
            <p class="mt-modal-hint">Sale arriba del informe: las cifras de los dos y la diferencia. Si uno dura más, sus incidencias, en su media para la duración del otro (este mes frente a la media del año).</p>
          </div>
        </div>
        <p class="mt-modal-hint">Con los filtros de arriba; lo que se mira, el de la pestaña. «Vista previa» lo enseña aquí tal y como saldrá; «Exportar PDF» abre el diálogo de impresión: elige «Guardar como PDF» (o «Microsoft Print to PDF»).</p>
        <p class="mt-modal-err" data-err hidden></p>`,
      foot: '<button class="mt-btn" data-close>Cancelar</button><button class="mt-btn" data-preview>Vista previa</button><button class="mt-btn mt-primary" data-go>Exportar PDF</button>',
      setup: (back, close) => {
        const q = (s) => back.querySelector(s), err = q('[data-err]'), sel = q('[data-report]'), from = q('[name="from"]'), to = q('[name="to"]');
        q('.mt-modal').classList.add('mt-modal-report');   // algo más ancha: las dos listas, módulos y centros, lado a lado
        let audience = pick.audience;
        // el modo elegido en el selector; el que vale, el que admita el informe (modeOf)
        const mode = () => modeOf(sel.value, q('[name="mode"]:checked')?.value);
        // las pestañas: la elegida, marcada, con sus informes (si el elegido no está en ella, el primero); las fechas,
        // las mismas en las dos
        back.addEventListener('click', (e) => {
          const tab = e.target.closest('[data-audience]');
          if (!tab) return;
          audience = tab.dataset.audience;
          back.querySelectorAll('[data-audience]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
          sel.innerHTML = options(audience, sel.value);
          sync();
        });
        // al cambiar de informe o de modo, su texto, el selector de modo (si admite los dos) y, si se hace con ellas,
        // las fechas; la de fin no antes de la de inicio
        // las listas se rehacen al cambiar de pestaña o de informe (lo desmarcado sigue desmarcado), no con cada casilla
        let shownPicks = `${pick.audience}:${picksOf(pick.key).map(([d]) => d)}`;
        const sync = () => {
          const want = `${audience}:${picksOf(sel.value).map(([d]) => d)}`;
          if (want !== shownPicks) { q('[data-picks]').innerHTML = picksHtml(audience, sel.value); shownPicks = want; }
          q('[data-about]').innerHTML = about(sel.value, mode());
          q('[data-modes]').hidden = modesOf(sel.value).length < 2;

          q('[data-picks]').hidden = !picksOf(sel.value).length;
          q('[data-systems]').hidden = !withSystems(sel.value);
          q('[data-person]').hidden = !withPerson(sel.value);
          q('[data-params]').hidden = !withParams(sel.value);
          q('[data-shifts]').hidden = !withShifts(sel.value);
          q('[data-cmp-box]').hidden = !withPeriods(sel.value);
          const comparing = !q('[data-cmp-box]').hidden && q('[name="cmp"]').checked;
          q('[data-cmp-pick]').hidden = !comparing;
          // el periodo: con fechas o comparando (el primero de los dos)
          q('[data-dates]').hidden = !withDates(sel.value, mode()) && !comparing;
          q('[data-cmp-dates="a"]').hidden = q('[name="period"]').value !== CUSTOM[0];
          q('[data-cmp-dates="b"]').hidden = q('[name="cmp-b"]').value !== CUSTOM[0];
          back.querySelectorAll('[data-pick]').forEach((box) => {
            const all = box.querySelectorAll('input[type="checkbox"]'), on = [...all].filter((c) => c.checked).length;
            box.querySelector('[data-pick-count]').textContent = on === all.length ? 'todos' : `${on} de ${all.length}`;
          });
          from.max = to.value || bounds.max;
          to.min = from.value || bounds.min;
          err.hidden = true;
        };
        // cada casilla de una lista que se marca o desmarca, en lo desmarcado (también con «Todos» y «Ninguno»)
        const remember = (c) => { const dim = c.name.slice(5); if (c.checked) off[dim].delete(Number(c.value)); else off[dim].add(Number(c.value)); };
        back.addEventListener('change', (e) => { if (e.target.name?.startsWith('pick-')) remember(e.target); });
        back.addEventListener('change', sync);
        back.addEventListener('input', sync);
        // las listas: el buscador enseña solo lo que coincide; «Todos» y «Ninguno», sobre lo que se ve
        back.addEventListener('input', (e) => {
          const box = e.target.closest('[data-pick-q]') && e.target.closest('[data-pick]');
          if (!box) return;
          const text = e.target.value.trim().toLowerCase();
          box.querySelectorAll('label[data-name]').forEach((l) => { l.hidden = !!text && !l.dataset.name.includes(text); });
        });
        back.addEventListener('click', (e) => {
          const all = e.target.closest('[data-pick-all]'), none = e.target.closest('[data-pick-none]');
          if (!all && !none) return;
          e.target.closest('[data-pick]').querySelectorAll('label[data-name]:not([hidden]) input').forEach((c) => { c.checked = !!all; remember(c); });
          sync();
        });
        const go = (preview) => {
          const key = sel.value, m = mode(), systems = [...back.querySelectorAll('[name="system"]:checked')].map((c) => c.value);
          const params = [...back.querySelectorAll('[name="param"]:checked')].map((c) => c.value);
          const shifts = [...back.querySelectorAll('[name="shift"]:checked')].map((c) => Number(c.value));
          const personValue = q('[name="person"]').value, person = withPerson(key) && personValue ? Number(personValue) : null;
          // lo marcado en cada lista del informe (las claves, números)
          const picks = Object.fromEntries(picksOf(key).map(([dim]) => [dim, [...back.querySelectorAll(`[name="pick-${dim}"]:checked`)].map((c) => Number(c.value))]));
          const picked = Object.fromEntries(Object.entries(picks).map(([dim, l]) => [dim, l.length]));
          const period = q('[name="period"]').value, [fromA, toA] = datesOf(period, from.value, to.value);
          const { range, error } = reportRange({ key, mode: m, current: current.range, from: fromA, to: toA, bounds, base, systems, picked, params, shifts });
          // comparando: el periodo del informe frente al otro (cada uno, su nombre o, personalizado, null: sus fechas)
          const cmpOn = q('[name="cmp"]').checked, cmpB = q('[name="cmp-b"]').value;
          const cmpDates = { b: { from: q('[name="cmp-b-from"]').value, to: q('[name="cmp-b-to"]').value } };
          const [fromB, toB] = datesOf(cmpB, cmpDates.b.from, cmpDates.b.to);
          const comparing = withPeriods(key) && cmpOn;
          const ra = comparing ? datesRange({ from: fromA, to: toA, bounds, base, what: 'del periodo' }) : {};
          const rb = comparing ? datesRange({ from: fromB, to: toB, bounds, base, what: 'del otro periodo' }) : {};
          const cmp = comparing ? { a: { label: labelOf(period), range: ra.range }, b: { label: labelOf(cmpB), range: rb.range } } : null;
          const same = comparing && fromA === fromB && toA === toB;
          const fail = error || ra.error || rb.error || (same ? 'Elige dos periodos distintos.' : null);
          if (fail) { err.textContent = fail; err.hidden = false; return; }
          close();
          // sin sus casillas (Equipo soporte), de los dos sistemas: sin ese filtro
          onExport({ key, mode: m, audience, systems: withSystems(key) ? systems : SYSTEMS.map(([k]) => k), picks, person, params, shifts, cmp, range, preview, choice: { key, params, shifts, cmp: cmpOn, period, cmpB, cmpDates, mode: q('[name="mode"]:checked')?.value, audience, systems, person: personValue ? Number(personValue) : null, off: Object.fromEntries(Object.entries(off).map(([d, set]) => [d, [...set]])), from: from.value, to: to.value } });
        };
        q('[data-go]').addEventListener('click', () => go(false));
        q('[data-preview]').addEventListener('click', () => go(true));
        sync();
        sel.focus();
      },
    });
  };

  return { csv, sql, firstLoad, clear, report };
};
