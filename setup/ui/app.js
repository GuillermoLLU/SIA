// SIA Setup: los pasos del instalador. El aspecto sale de la maqueta (setup/maqueta) y lo que se
// instala lo hace Rust (src-tauri/src/main.rs): este fichero solo pinta y pide.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWin = window.__TAURI__.window.getCurrentWindow();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NEXT_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Al actualizar solo aparecen los pasos que tocan (TC-02 de la #143)
const FLOWS = { install: ['welcome', 'checks', 'folder', 'install', 'done'], update: ['welcome', 'install', 'done'] };
const TITLE = { welcome: 'Bienvenida', checks: 'Comprobaciones', folder: 'Carpeta', install: () => (S.mode === 'update' ? 'Actualización' : 'Instalación'), done: 'Listo' };
const title = (id) => (typeof TITLE[id] === 'function' ? TITLE[id]() : TITLE[id]);
const FASE = { cerrando: 'Cerrando SIA', preparando: 'Preparando', copiando: 'Copiando archivos', terminando: 'Terminando' };

// S: lo que dice Rust al abrir (estado) más lo que elige la persona
let S, flow, cur, ck, timers = [], busy = false;
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };

const stage = $('.stage'), stepsEl = $('.steps'), next = $('[data-next]'), back = $('[data-back]'), cancel = $('[data-cancel]');

const VIEWS = {
  welcome: () => `
    <div class="hello">
      <div class="hello-mark">SIA</div>
      <div class="hello-ver">${S.mode === 'update' ? `${esc(S.instalado.version)} → <em>${esc(S.version)}</em>` : `Versión ${esc(S.version)}`}</div>
      ${S.mode === 'update' && S.abierto ? '<div class="hello-note">SIA está abierto: se cerrará para actualizarlo.</div>' : ''}
    </div>`,
  checks: () => `
    <h2 class="cap">Comprobaciones</h2>
    <ul class="cks">
      ${ck.map((c) => `<li class="ck" data-ck="${c.id}" data-state="${c.state}"><i class="ck-ic" aria-hidden="true"></i><div class="ck-txt"><b>${c.name}</b></div><div class="ck-act"></div></li>`).join('')}
    </ul>
    <div class="cks-foot" data-cks-foot></div>`,
  folder: () => `
    <h2 class="cap">Carpeta</h2>
    <div class="dir">${FOLDER}<code data-path>${esc(S.carpeta)}</code><button class="btn sm" data-pick>Cambiar</button></div>
    <div class="dir-hint">Ocupa unos ${Math.round(S.bytes / 1e6 / 10) * 10} MB.</div>`,
  install: () => `
    <h2 class="cap">${S.mode === 'update' ? 'Actualizando' : 'Instalando'}</h2>
    <div class="prog">
      <div class="prog-top"><span>SIA ${esc(S.version)}</span><b data-pct>0 %</b></div>
      <div class="prog-bar"><i data-bar></i></div>
      <div class="prog-now" data-now></div>
    </div>`,
  done: () => `
    <div class="end">
      <svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="34"/><path d="M24 39l10 10 19-21"/></svg>
      <b>${S.mode === 'update' ? 'SIA actualizado' : 'SIA instalado'}</b>
      <span>Versión ${esc(S.version)}</span>
      <label><input type="checkbox" data-launch checked> Abrir SIA</label>
    </div>`,
};

function renderSteps() {
  stepsEl.innerHTML = flow.map((id, i) => `<li${i === cur ? ' aria-current="step"' : ''}${i < cur ? ' class="done"' : ''}><i>${i + 1}</i><span>${title(id)}</span></li>`).join('');
  stepsEl.setAttribute('aria-label', `Paso ${cur + 1} de ${flow.length}`);
}

// El paso nuevo entra por un lado mientras el anterior sale por el otro, como en Resolver
function slide(prevEl, el, fwd) {
  for (const s of $$('.step', stage)) s.classList.remove('in-fwd', 'in-back', 'out-fwd', 'out-back');
  if (!prevEl) return;
  if (reduced()) { prevEl.remove(); return; }
  void el.offsetWidth;
  el.classList.add(fwd ? 'in-fwd' : 'in-back');
  prevEl.classList.add(fwd ? 'out-fwd' : 'out-back');
  prevEl.addEventListener('animationend', () => prevEl.remove(), { once: true });
  setTimeout(() => prevEl.remove(), 700);   // por si no llega animationend (ventana minimizada, por ejemplo)
}

function go(i) {
  const prev = cur, prevEl = $('.step:not(.out-fwd):not(.out-back)', stage);
  stopTimers();
  cur = i;
  const id = flow[cur], el = document.createElement('section');
  el.className = 'step'; el.dataset.step = id; el.innerHTML = VIEWS[id]();
  stage.append(el);
  slide(prevEl, el, prev == null || i > prev);
  renderSteps();
  renderFoot();
  ENTER[id]?.(el);
}

function renderFoot() {
  const id = flow[cur], nid = flow[cur + 1];
  back.hidden = cur === 0 || id === 'install' || id === 'done';
  $('[data-spacer]').hidden = !back.hidden;
  cancel.hidden = id === 'install' || id === 'done';
  next.hidden = id === 'install';
  next.disabled = id === 'checks' && !ck.every((c) => c.state === 'ok');
  next.innerHTML = id === 'done' ? 'Terminar'
    : nid === 'install' ? (S.mode === 'update' ? 'Actualizar' : 'Instalar')
    : `${title(nid)}${NEXT_ARROW}`;
}

const ENTER = {
  checks(el) {
    for (const c of ck) paintCheck(el, c);
    const todo = ck.filter((c) => c.state !== 'ok');
    if (todo.length) runChecks(el, todo);
  },
  folder(el) {
    $('[data-pick]', el).onclick = async () => {
      const dir = await invoke('elegir_carpeta', { actual: S.carpeta });
      if (!dir || dir === S.carpeta) return;
      S.carpeta = dir;
      const code = $('[data-path]', el);
      code.classList.remove('changed'); void code.offsetWidth;
      code.textContent = dir; code.classList.add('changed');
    };
  },
  async install(el) {
    const bar = $('[data-bar]', el), pct = $('[data-pct]', el), now = $('[data-now]', el);
    let shown = '', top = 0;
    const paint = (p, fase) => {
      top = Math.max(top, p);   // nunca hacia atrás: al actualizar, la carpeta primero se vacía
      bar.style.width = `${top}%`; pct.textContent = `${top} %`;
      const label = FASE[fase] || fase;
      if (label && label !== shown) { shown = label; now.innerHTML = `<span>${esc(label)}</span>`; }
    };
    paint(0, S.mode === 'update' && S.abierto ? 'cerrando' : 'preparando');
    const off = await listen('progreso', (e) => paint(e.payload.pct, e.payload.fase));
    busy = true;
    try {
      await invoke('instalar', { carpeta: S.carpeta });
      paint(100, 'terminando');
      later(() => go(cur + 1), 500);
    } catch (err) {
      now.innerHTML = `<span class="prog-err">${esc(err)}</span>`;
      next.hidden = false; next.disabled = false; next.textContent = 'Reintentar';
      next.onclick = () => { next.onclick = onNext; go(cur); };
      cancel.hidden = false;
    } finally {
      busy = false;
      off();
    }
  },
};

// ── Comprobaciones ───────────────────────────────────────────────────────
// Aún simuladas: el siguiente paso es llamar a las de la #118 (certificados y Copilot CLI).
function newChecks() {
  return [
    { id: 'certs', name: 'Certificados del cliente', state: 'wait' },
    { id: 'copilot', name: 'Copilot CLI', state: 'wait' },
  ];
}

function paintCheck(el, c) {
  const row = $(`[data-ck="${c.id}"]`, el);
  if (!row) return;
  row.dataset.state = c.state;
  const txt = $('.ck-txt', row);
  txt.querySelector('.ck-sub')?.remove();
  if (c.sub) txt.insertAdjacentHTML('beforeend', `<span class="ck-sub">${esc(c.sub)}</span>`);
  renderFoot();
}

function runChecks(el, list) {
  const set = (c, patch) => { Object.assign(c, patch); paintCheck(el, c); };
  let at = 0;
  for (const c of list) {
    later(() => set(c, { state: 'run', sub: 'Comprobando…' }), at);
    at += 700;
    later(() => set(c, { state: 'ok', sub: 'Simulada' }), at);
    at += 150;
  }
}

// ── Botones de la ventana ────────────────────────────────────────────────
async function onNext() {
  if (flow[cur] === 'done') {
    if ($('[data-launch]').checked) await invoke('abrir_sia', { carpeta: S.carpeta }).catch(() => {});
    closeWin();
    return;
  }
  go(cur + 1);
}
next.onclick = onNext;
back.onclick = () => go(cur - 1);
cancel.onclick = () => ask();
$$('[data-min]').forEach((b) => { b.onclick = () => appWin.minimize(); });
$$('[data-close]').forEach((b) => { b.onclick = () => (busy ? null : flow[cur] === 'done' ? closeWin() : ask()); });

function ask() {
  $('[data-ask-text]').textContent = S.mode === 'update' ? `Se queda la versión ${S.instalado.version}.` : 'SIA no quedará instalado.';
  $('[data-veil]').hidden = false;
  $('[data-stay]').focus();
}
$('[data-stay]').onclick = () => { $('[data-veil]').hidden = true; };
$('[data-leave]').onclick = () => closeWin();

function closeWin() {
  stopTimers();
  $('.win').classList.add('closing');
  setTimeout(() => appWin.close(), reduced() ? 0 : 250);
}

(async () => {
  S = await invoke('estado');
  S.mode = S.instalado ? 'update' : 'install';
  if (S.instalado) S.carpeta = S.instalado.carpeta;
  $('.win').dataset.os = S.sistema;
  $('[data-tb-title]').textContent = S.mode === 'update' ? 'Actualización' : 'Instalación';
  flow = FLOWS[S.mode]; ck = newChecks();
  go(0);
})();
