// Vista «Issues»: la mesa de cada persona. Un botón para coger la siguiente
// (la elige la regla; la cola de la base evita que dos cojan la misma), la
// issue a pantalla para trabajarla, y debajo lo suyo: en curso, pendiente de
// terceros y resuelto. Resolver y escalar irán por SIGLO (aún desactivadas).
import './issues.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, TABS, when, age, stamp } from './format.js';

export const mountIssuesView = (root, { api, toast }) => {
  let data = null, tab = 'doing', rule = 'basic', now = new Date(), opened = null;

  const sev = (p) => `<span class="iss-sev ${esc(p)}">${esc(SEVERITY_ES[p] || p)}</span>`;
  const row = (i) => `<button class="iss-row" data-id="${esc(i.id)}">
      ${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>
      <span class="iss-text">${esc(i.text)}</span>
      ${i.status === 'PENDING' && i.reason ? `<span class="iss-reason">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}
      <span class="iss-age">${age(i.status === 'RESOLVED' ? i.resolved || i.modified : i.reported, now)}</span>
    </button>`;

  const renderDesk = () => {
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Issues</h2>
        <p class="iss-empty">Aún no hay issues. De momento se leen del CSV más reciente que se deje en la carpeta «issues» del workspace de SIA.</p></div>`;
      return;
    }
    const groups = TABS.map((t) => ({ ...t, items: data.desk.filter(t.test) }));
    const current = groups.find((g) => g.key === tab);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Issues</h2><span class="iss-snap">Datos del ${when(stamp(now))}</span></header>
      <section class="iss-next">
        <button class="iss-take" data-take ${data.free ? '' : 'disabled'}>Coger la siguiente issue</button>
        <label class="iss-rule">Regla
          <select data-rule>${data.rules.map((r) => `<option value="${esc(r.id)}"${r.id === rule ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
        </label>
        <p>${data.free ? `${data.free} sin coger en la cola` : 'No queda ninguna sin coger.'}</p>
      </section>
      <section class="iss-desk">
        <h3>Mi mesa</h3>
        <div class="iss-tabs" role="tablist">${groups.map((g) => `<button role="tab" data-tab="${g.key}" aria-selected="${g.key === tab}">${g.label}<span>${g.items.length}</span></button>`).join('')}</div>
        <div class="iss-list">${current.items.map(row).join('') || `<p class="iss-empty">${current.empty}</p>`}</div>
      </section>
    </div>`;
  };

  const renderIssue = ({ issue: i, sameCenter }) => {
    opened = i.id;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    root.innerHTML = `<div class="iss-page">
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
        ${sameCenter.length ? `<section><h3>Otras del mismo centro · ${sameCenter.length}</h3><div class="iss-list">${sameCenter.slice(0, 10).map(row).join('')}</div></section>` : ''}
        <section><h3>Historial</h3><ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}${esc(STATUS_ES[b] || b)}</li>`).join('') || '<li>Sin cambios de estado.</li>'}</ol></section>
      </article>
    </div>`;
    root.scrollTop = 0;
  };

  const fail = (e) => toast?.(e.message);
  const loadDesk = async () => {
    data = await api.desk();
    now = data.taken ? new Date(data.taken) : new Date();
    renderDesk();
  };
  const openIssue = async (id) => renderIssue(await api.get(id));

  root.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-take]')) {
        t.closest('[data-take]').disabled = true;
        const { id } = await api.next(rule);
        await loadDesk();
        if (id) { tab = 'doing'; return openIssue(id); }
        return toast?.('No queda ninguna sin coger.');
      }
      const tb = t.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; return renderDesk(); }
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) return renderDesk();
      const rel = t.closest('[data-release]');
      if (rel) { rel.disabled = true; await api.release(opened); await loadDesk(); return toast?.('Devuelta a la cola.'); }
    } catch (err) { fail(err); }
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-rule]')) rule = e.target.value; });

  return { show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }) };
};
