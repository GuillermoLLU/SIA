// Vista «Issues»: la mesa de cada persona. Arriba, lo inmediato: la
// siguiente que le toca (la elige la regla; la cola de la base evita que dos
// cojan la misma) y su día. En medio, su histórico medido en SIA (se llena
// con el uso). Abajo, el seguimiento de lo suyo. Al abrir una, la pantalla de
// trabajo; resolver y escalar irán por SIGLO. La mesa se refresca sola.
import './issues.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, LISTS, when, age, stamp } from './format.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const REFRESH_MS = 15000;

export const mountIssuesView = (root, { api, me, toast }) => {
  let data = null, rule = 'basic', now = new Date(), opened = null, onDesk = false;

  const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
  const origin = (i) => `<span class="iss-origin${i.sisu ? ' sisu' : ''}">${i.sisu ? 'SISU' : 'SGA'}</span>`;
  const item = (i, key) => {
    const since = key === 'waiting' ? `sin moverse ${age(i.modified, now)}` : key === 'resolved' ? when(i.resolved) : `hace ${age(i.reported, now)}`;
    return `<button class="iss-item" data-id="${esc(i.id)}">
      <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${key === 'waiting' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}<span class="iss-when">${since}</span></span>
      <span class="iss-text">${esc(i.text)}</span>
    </button>`;
  };
  const kpi = (label, value, hint) => `<div class="iss-kpi"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

  // Cogidas por semana (SGA / SISU), lo medido en SIA.
  const weeksChart = (weeks) => {
    const max = Math.max(5, ...weeks.map((w) => w.sga + w.sisu));
    return `<div class="iss-bars" role="img" aria-label="Issues cogidas por semana, últimas ${weeks.length} semanas">
      ${weeks.map(({ week, sga, sisu }) => `<div class="iss-bar" title="Semana del ${week.slice(8)}/${week.slice(5, 7)}: ${sga + sisu} (SGA ${sga}, SISU ${sisu})">
          <small>${sga + sisu || ''}</small><i class="sisu" style="height:${sisu / max * 100}%"></i><i style="height:${sga / max * 100}%"></i><span>${+week.slice(8)}/${+week.slice(5, 7)}</span></div>`).join('')}
    </div>`;
  };

  const renderDesk = () => {
    onDesk = true;
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Issues</h2>
        <p class="iss-empty">Aún no hay issues. De momento se leen del CSV más reciente que se deje en la carpeta «issues» del workspace de SIA.</p></div>`;
      return;
    }
    const { today, history, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const used = history.weeks.some((w) => w.sga + w.sisu);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Hola, ${esc((me?.name || '').split(' ')[0] || 'equipo')}</h2><span class="iss-snap">Datos de Remedy del ${when(stamp(now))}</span></header>

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
          <div class="iss-items">${l.items.slice(0, 12).map((i) => item(i, l.key)).join('') || `<p class="iss-empty">${l.empty}</p>`}</div>
        </section>`).join('')}
      </div>
    </div>`;
  };

  const renderIssue = ({ issue: i, sameCenter }) => {
    opened = i.id;
    onDesk = false;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    root.innerHTML = `<div class="iss-page iss-narrow">
      <button class="iss-back" data-back>← Mi mesa</button>
      <article class="iss-work">
        <header>
          <div class="iss-meta">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}
            <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.id)} ↗</a></div>
          <h2>${esc(i.text)}</h2>
          <p class="iss-state">${esc(STATUS_ES[i.status] || i.status)}${i.reason ? ` · ${esc(REASON_ES[i.reason] || i.reason)}` : ''} · reportada hace ${age(i.reported, now)}${i.claimedBy ? ` · cogida por ${esc(i.claimedBy.name)}` : ''}</p>
        </header>
        <div class="iss-actions">
          <button class="lab-btn primary" disabled title="Irá por SIGLO">Resolver</button>
          <button class="lab-btn" disabled title="Irá por SIGLO">Escalar</button>
          <button class="lab-btn" disabled title="Irá por SIGLO">Añadir nota</button>
          ${mine ? '<button class="lab-btn" data-release>Devolver a la cola</button>' : ''}
        </div>
        <section><h3>Descripción</h3><div class="iss-notes">${esc(i.notes || 'Sin descripción.')}</div></section>
        ${i.resolution ? `<section><h3>Resolución</h3><div class="iss-notes">${esc(i.resolution)}</div></section>` : ''}
        <section><h3>Datos</h3><dl class="iss-kv">
          <dt>Categoría</dt><dd>${esc(i.category || '—')}</dd>
          <dt>Grupo</dt><dd>${esc(i.group || '—')}</dd>
          <dt>Responsable</dt><dd>${esc(i.assignee || 'Nadie en Remedy')}</dd>
          <dt>Reportada</dt><dd>${when(i.reported)}</dd>
          <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
          ${i.vendorTicket ? `<dt>Ticket proveedor</dt><dd>${esc(i.vendorTicket)}</dd>` : ''}
        </dl></section>
        ${sameCenter.length ? `<section><h3>Otras del mismo centro · ${sameCenter.length}</h3><div class="iss-items">${sameCenter.slice(0, 10).map((x) => item(x, 'doing')).join('')}</div></section>` : ''}
        <section><h3>Historial</h3><ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}${esc(STATUS_ES[b] || b)}</li>`).join('') || '<li>Sin cambios de estado.</li>'}</ol></section>
      </article>
    </div>`;
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
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) { renderDesk(); root.scrollTop = 0; return; }
      const rel = t.closest('[data-release]');
      if (rel) { rel.disabled = true; await api.release(opened); await loadDesk(); return toast?.('Devuelta a la cola.'); }
    } catch (err) { toast?.(err.message); }
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-rule]')) rule = e.target.value; });

  // Refresco: solo con la mesa a la vista (no mientras se trabaja una issue).
  setInterval(() => {
    if (!onDesk || root.hidden || document.visibilityState !== 'visible') return;
    const y = root.scrollTop;
    api.desk().then((d) => { data = d; now = d.taken ? new Date(d.taken) : new Date(); if (onDesk) { renderDesk(); root.scrollTop = y; } }).catch(() => {});
  }, REFRESH_MS);

  return { show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }) };
};
