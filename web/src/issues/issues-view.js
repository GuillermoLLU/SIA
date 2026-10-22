// Vista «Issues»: la mesa de cada persona. Arriba, lo inmediato: la
// siguiente que le toca (la elige la regla; la cola de la base evita que dos
// cojan la misma) y su día. En medio, su histórico medido en SIA (se llena
// con el uso). Abajo, el seguimiento de lo suyo. Al abrir una, la pantalla de
// trabajo (work-screen.js). La mesa se refresca sola.
import './issues.css';
import { esc } from '../ui/html.js';
import { LISTS, when, age, stamp, weekBars } from './format.js';
import { sev, origin, item } from './parts.js';
import { workScreen } from './work-screen.js';
import { ACTIONS, actionForm, readAction } from './actions.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const REFRESH_MS = 15000;

// openChat(host, issueId) → { dispose }: el chat de la issue (lo pone main.js).
export const mountIssuesView = (root, { api, me, toast, openChat }) => {
  let data = null, rule = 'basic', now = new Date(), opened = null, onDesk = false, workTab = 'ai', chat = null, loading = false;
  const closeChat = () => { chat?.dispose(); chat = null; };

  // Cargar la foto (el CSV de la consulta de Remedy, hasta leer de Remedy).
  const loadButton = (label) => `<label class="iss-load ${loading ? 'iss-busy' : ''}">${loading ? 'Cargando…' : label}<input type="file" accept=".csv,text/csv" data-csv hidden ${loading ? 'disabled' : ''}></label>`;

  const kpi = (label, value, hint) => `<div class="iss-kpi"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

  // Cogidas por semana (SGA / SISU), lo medido en SIA.
  const weeksChart = (weeks) => `<div class="iss-bars" role="img" aria-label="Issues cogidas por semana, últimas ${weeks.length} semanas">
      ${weekBars(weeks).map(({ week, sga, sisu, total, sgaPct, sisuPct }) => `<div class="iss-bar" title="Semana del ${week.slice(8)}/${week.slice(5, 7)}: ${total} (SGA ${sga}, SISU ${sisu})">
          <small>${total || ''}</small><i class="sisu" style="height:${sisuPct}%"></i><i style="height:${sgaPct}%"></i><span>${+week.slice(8)}/${+week.slice(5, 7)}</span></div>`).join('')}
    </div>`;

  const renderDesk = () => {
    closeChat();
    onDesk = true;
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Issues</h2>
        <p class="iss-empty">Aún no hay issues. De momento se cargan con el CSV de la consulta de Remedy (vale el mismo que el de Métricas); cuando SIA lea de Remedy, saldrán de ahí.</p>
        ${loadButton('Cargar CSV')}</div>`;
      return;
    }
    const { today, history, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const used = history.weeks.some((w) => w.sga + w.sisu);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Hola, ${esc((me?.name || '').split(' ')[0] || 'equipo')}</h2><span class="iss-snap">Datos de Remedy del ${when(stamp(now))}</span>${loadButton('Cargar otro CSV')}</header>

      <div class="iss-row1">
        <section class="iss-card iss-next">
          <h3>La siguiente que te toca</h3>
          ${next ? `<div class="iss-preview">
              <span class="iss-line">${sev(next.priority)}<span class="iss-code">${esc(next.center || '—')}</span>${origin(next)}${next.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(next.reported, now)}</span></span>
              <p>${esc(next.text)}</p>
            </div>` : '<p class="iss-empty">No queda ninguna sin coger.</p>'}
          <div class="iss-go">
            <button class="iss-take" data-take ${next ? '' : 'disabled'}>Coger la siguiente</button>
            <label class="iss-rule">Regla <select data-rule>${data.rules.map((r) => `<option value="${esc(r.id)}"${r.id === rule ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
            <span class="iss-queue">${data.free} sin coger en la cola</span>
          </div>
        </section>
        <section class="iss-card iss-today">
          <h3>Hoy</h3>
          <div class="iss-big"><b>${today.resolved}</b><span>resueltas · objetivo ${GOAL.min}–${GOAL.max}<br>${today.sga} de SGA · ${today.sisu} de SISU</span></div>
          <div class="iss-progress" role="img" aria-label="${today.resolved} de ${GOAL.max}"><i style="width:${Math.min(100, today.resolved / GOAL.max * 100)}%"></i><em style="left:${GOAL.min / GOAL.max * 100}%"></em></div>
          <dl><dt>Cogidas en SIA</dt><dd>${history.claimedToday}</dd><dt>En curso</dt><dd>${count('doing')}</dd><dt>Pendientes de terceros</dt><dd>${count('waiting')}</dd></dl>
        </section>
      </div>

      <div class="iss-row2">
        <section class="iss-card">
          <div class="iss-card-h"><h3>Mi histórico en SIA · cogidas por semana</h3><span class="iss-legend"><i></i>SGA <i class="sisu"></i>SISU</span></div>
          ${weeksChart(history.weeks)}
          <p class="iss-foot">${used ? 'Medido con el uso de SIA.' : 'Se irá llenando con el uso de SIA: cada issue que cojas cuenta.'} Las resueltas se sumarán cuando se resuelva desde SIA.</p>
        </section>
        <div class="iss-kpis">
          ${kpi('Cogidas por semana', history.perWeek, `media de las últimas ${history.weeks.length} semanas`)}
          ${kpi('Cogidas a tiempo', history.onTimePct == null ? '—' : `${history.onTimePct} %`, 'críticas en 15 min, altas en 2 h')}
          ${kpi('Tiempo típico de resolución', '—', 'cuando se resuelva desde SIA')}
        </div>
      </div>

      <div class="iss-cols">
        ${lists.map((l) => `<section class="iss-card iss-col">
          <div class="iss-card-h"><h3>${l.label}</h3><span>${l.items.length}</span></div>
          <div class="iss-items">${l.items.slice(0, 12).map((i) => item(i, l.key, now)).join('') || `<p class="iss-empty">${l.empty}</p>`}</div>
        </section>`).join('')}
      </div>
    </div>`;
  };

  const renderIssue = ({ issue: i, sameCenter }) => {
    onDesk = false;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    if (opened !== i.id) workTab = 'ai';
    opened = i.id;
    closeChat();
    closeAction();
    root.innerHTML = workScreen({ issue: i, sameCenter, now, mine, tab: workTab });
    chat = openChat?.(root.querySelector('.iss-chat-body'), i.id) || null;
    root.scrollTop = 0;
  };

  const loadDesk = async () => {
    data = await api.desk();
    now = data.taken ? new Date(data.taken) : new Date();
    renderDesk();
  };
  const openIssue = async (id) => renderIssue(await api.get(id));

  root.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      const take = t.closest('[data-take]');
      if (take) {
        take.disabled = true;
        const seen = data.next?.id;
        const { id } = await api.next(rule);
        await loadDesk();
        if (!id) return toast?.('No queda ninguna sin coger.');
        if (seen && id !== seen) toast?.('La que veías ya la había cogido otra persona: te toca la siguiente.');
        return openIssue(id);
      }
      const wt = t.closest('[data-wtab]');
      if (wt) {
        workTab = wt.dataset.wtab;
        root.querySelectorAll('[data-wtab]').forEach((b) => b.setAttribute('aria-selected', String(b === wt)));
        root.querySelectorAll('[data-wpanel]').forEach((p) => { p.hidden = p.dataset.wpanel !== workTab; });
        return;
      }
      const act = t.closest('[data-act]');
      if (act) return openAction(act.dataset.act);
      if (t.closest('[data-act-cancel]') || t.classList.contains('iss-modal')) return closeAction();
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) { renderDesk(); root.scrollTop = 0; return; }
      const rel = t.closest('[data-release]');
      if (rel) { rel.disabled = true; await api.release(opened); await loadDesk(); return toast?.('Devuelta a la cola.'); }
    } catch (err) { toast?.(err.message); }
  });
  // Acciones: su formulario encima de la pantalla de trabajo. De momento se
  // valida y se avisa: nada sale hacia Remedy hasta conectar SIGLO.
  let people = [];
  const closeAction = () => root.querySelector('.iss-modal')?.remove();
  const openAction = async (key) => {
    closeAction();
    if (key === 'transfer') people = await api.teammates();
    root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${actionForm(key, opened, people)}</div>`);
    root.querySelector('.iss-act-form [name]')?.focus();
  };
  root.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-act-form]');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.actForm;
    const { missing, values } = readAction(key, Object.fromEntries(new FormData(form)));
    const err = form.querySelector('.iss-act-err');
    if (missing) { err.textContent = `Falta: ${missing}.`; err.hidden = false; return; }
    closeAction();
    const who = key === 'transfer' ? people.find((p) => p.id === values.to)?.name : null;
    toast?.(`${ACTIONS[key].label}${who ? ` a ${who}` : ''}: preparado, pero aún no se envía a Remedy (falta conectar SIGLO).`);
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.querySelector('.iss-modal')) closeAction(); });

  const upload = async (file) => {
    if (!file) return;
    loading = true;
    renderDesk();
    try {
      const { meta } = await api.upload(file);
      toast?.(`Foto cargada: ${meta.issues} issues.`);
    } catch (e) {
      toast?.(e.message);
    }
    loading = false;
    await loadDesk();
  };

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-rule]')) rule = e.target.value;
    if (e.target.matches('[data-csv]')) upload(e.target.files[0]);
  });

  // Refresco: solo con la mesa a la vista (no mientras se trabaja una issue).
  const refresher = setInterval(() => {
    if (!onDesk || root.hidden || document.visibilityState !== 'visible') return;
    const y = root.scrollTop;
    api.desk().then((d) => { data = d; now = d.taken ? new Date(d.taken) : new Date(); if (onDesk) { renderDesk(); root.scrollTop = y; } }).catch(() => {});
  }, REFRESH_MS);

  return {
    show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }),
    dispose: () => { clearInterval(refresher); closeChat(); },
  };
};
