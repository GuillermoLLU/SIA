// Vista «Issues»: la mesa de cada persona. Arriba, la siguiente que le toca
// (la elige la regla; la cola de la base evita que dos cojan la misma) y su
// día; después sus números, su ritmo y el seguimiento de lo suyo. Al abrir
// una, la pantalla de trabajo. Resolver y escalar irán por SIGLO.
import './issues.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, LISTS, when, age, stamp, duration } from './format.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const WEEKDAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export const mountIssuesView = (root, { api, me, toast }) => {
  let data = null, rule = 'basic', now = new Date(), opened = null;

  const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
  const item = (i, key) => {
    const since = key === 'waiting' ? `sin moverse ${age(i.modified, now)}` : key === 'resolved' ? when(i.resolved) : `hace ${age(i.reported, now)}`;
    return `<button class="iss-item" data-id="${esc(i.id)}">
      <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${key === 'waiting' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}<span class="iss-when">${since}</span></span>
      <span class="iss-text">${esc(i.text)}</span>
    </button>`;
  };
  const tile = (label, value, hint = '') => `<div class="iss-tile"><span>${label}</span><b>${value}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;

  const rhythm = (perDay) => {
    const max = Math.max(GOAL.max, ...perDay.map((d) => d.count));
    return `<div class="iss-bars" role="img" aria-label="Resueltas por día, últimos ${perDay.length} días">
      <i class="iss-goal-line" style="bottom:calc(30px + (100% - 30px) * ${GOAL.min / max})" title="Objetivo por turno: ${GOAL.min}–${GOAL.max}"></i>
      ${perDay.map(({ day, count }) => {
        const d = new Date(`${day}T12:00:00`);
        return `<div class="iss-bar" title="${day.slice(8)}/${day.slice(5, 7)}: ${count}">
          <small>${count || ''}</small><i style="height:${count / max * 100}%"></i><span>${WEEKDAY[d.getDay()]}<br>${+day.slice(8)}</span></div>`;
      }).join('')}
    </div>`;
  };

  const renderDesk = () => {
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Issues</h2>
        <p class="iss-empty">Aún no hay issues. De momento se leen del CSV más reciente que se deje en la carpeta «issues» del workspace de SIA.</p></div>`;
      return;
    }
    const { stats, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const progress = Math.min(100, stats.resolvedToday / GOAL.max * 100);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Hola, ${esc((me?.name || '').split(' ')[0] || 'equipo')}</h2><span class="iss-snap">Datos de Remedy del ${when(stamp(now))}</span></header>

      <div class="iss-hero">
        <section class="iss-card iss-next">
          <h3>La siguiente que te toca</h3>
          ${next ? `<div class="iss-preview">
              <span class="iss-line">${sev(next.priority)}<span class="iss-code">${esc(next.center || '—')}</span><span>${next.sisu ? 'SISU' : 'SGA'}</span>${next.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(next.reported, now)}</span></span>
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
          <div class="iss-big"><b>${stats.resolvedToday}</b><span>resueltas · objetivo ${GOAL.min}–${GOAL.max}</span></div>
          <div class="iss-progress" role="img" aria-label="${stats.resolvedToday} de ${GOAL.max}"><i style="width:${progress}%"></i><em style="left:${GOAL.min / GOAL.max * 100}%"></em></div>
          <dl><dt>Cogidas en SIA</dt><dd>${stats.claimedToday}</dd><dt>En curso ahora</dt><dd>${count('doing')}</dd></dl>
        </section>
      </div>

      <div class="iss-tiles">
        ${tile('En curso', count('doing'))}
        ${tile('Pendientes de terceros', count('waiting'), count('waiting') ? `la más parada, ${age(lists[1].items[0].modified, now)} sin moverse` : '')}
        ${tile('Resueltas · 7 días', stats.resolvedWeek)}
        ${tile('Tiempo típico de resolución', stats.medianResolutionMin == null ? '—' : duration(stats.medianResolutionMin), 'mediana, de reportada a resuelta')}
      </div>

      <section class="iss-card">
        <div class="iss-card-h"><h3>Mi ritmo · resueltas por día</h3><span>últimos ${stats.perDay.length} días · la línea es el objetivo mínimo por turno</span></div>
        ${rhythm(stats.perDay)}
        <p class="iss-foot">Solo cuenta las resueltas que Remedy aún no ha cerrado; el histórico completo llegará al leer de Snowflake.</p>
      </section>

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
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    root.innerHTML = `<div class="iss-page iss-narrow">
      <button class="iss-back" data-back>← Mi mesa</button>
      <article class="iss-work">
        <header>
          <div class="iss-meta">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span><span>${i.sisu ? 'SISU' : 'SGA'}</span>${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}
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
        const { id } = await api.next(rule);
        await loadDesk();
        return id ? openIssue(id) : toast?.('No queda ninguna sin coger.');
      }
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) { renderDesk(); root.scrollTop = 0; return; }
      const rel = t.closest('[data-release]');
      if (rel) { rel.disabled = true; await api.release(opened); await loadDesk(); return toast?.('Devuelta a la cola.'); }
    } catch (err) { toast?.(err.message); }
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-rule]')) rule = e.target.value; });

  return { show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }) };
};
