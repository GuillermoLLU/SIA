// SIA Setup: los pasos del instalador. El aspecto sale de la maqueta (setup/maqueta) y lo que se
// instala y se comprueba lo hace Rust (src-tauri/src/main.rs): este fichero solo pinta y pide.
// Las comprobaciones previas siguen las del NSIS (build/installer.nsh): mismos pasos, textos y reglas.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWin = window.__TAURI__.window.getCurrentWindow();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NEXT_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TITLE = { welcome: 'Bienvenida', checks: 'Comprobaciones', folder: 'Carpeta', install: () => (S.mode === 'update' ? 'Actualización' : 'Instalación'), done: 'Listo' };
const title = (id) => (typeof TITLE[id] === 'function' ? TITLE[id]() : TITLE[id]);
const FASE = { cerrando: 'Cerrando SIA', quitando: 'Quitando la versión anterior', preparando: 'Preparando', copiando: 'Copiando archivos', terminando: 'Terminando' };
const CAP = { cerrando: 15, quitando: 15, preparando: 45, copiando: 97, terminando: 99 };   // hasta dónde llega cada fase (src-tauri: instalar)

// S: lo que dice Rust al abrir (estado) más lo que elige la persona
let S, flow, cur, timers = [], busy = false;
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };
const hasCerts = () => S.certs.requeridos.length > 0;
const mac = () => S.sistema === 'mac';
const GESTOR = () => (mac() ? 'Homebrew' : 'WinGet');   // con qué se instala Copilot CLI
// Que conste en el registro de la instalación (src-tauri: Registro)
const anotar = (texto) => invoke('anotar', { texto }).catch(() => {});

const stage = $('.stage'), stepsEl = $('.steps'), next = $('[data-next]');

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
      ${rows().map((id) => `<li class="ck" data-ck="${id}" data-state="wait"><i class="ck-ic" aria-hidden="true"></i><div class="ck-txt"><b>${ROW[id]}</b></div><div class="ck-act"></div></li>`).join('')}
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

// Sin «Atrás» ni «Cancelar» (para salir, la X): se vuelve pulsando un paso ya hecho del indicador,
// como en Resolver. No mientras comprueba ni una vez empezada la instalación.
const canGoBack = () => !busy && !['install', 'done'].includes(flow[cur]) && !(flow[cur] === 'checks' && K.step !== 'done');
function renderSteps() {
  const open = canGoBack();
  stepsEl.innerHTML = flow.map((id, i) => {
    const back = open && i < cur;
    return `<li${i === cur ? ' aria-current="step"' : ''}${i < cur ? ` class="done${back ? ' can-go' : ''}"` : ''}${back ? ` data-go="${i}" role="button" tabindex="0" aria-label="Volver a ${title(id)}"` : ''}><i>${i + 1}</i><span>${title(id)}</span></li>`;
  }).join('');
  stepsEl.setAttribute('aria-label', `Paso ${cur + 1} de ${flow.length}`);
}
stepsEl.addEventListener('click', (e) => { const li = e.target.closest('[data-go]'); if (li && canGoBack()) go(Number(li.dataset.go)); });
stepsEl.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.go) { e.preventDefault(); e.target.click(); } });

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
  K.run++;   // lo que siga llegando de unas comprobaciones anteriores ya no se pinta
  cur = i;
  const id = flow[cur], el = document.createElement('section');
  anotar(`Paso ${cur + 1} de ${flow.length}: ${title(id)}`);
  el.className = 'step'; el.dataset.step = id; el.innerHTML = VIEWS[id]();
  stage.append(el);
  slide(prevEl, el, prev == null || i > prev);
  renderFoot();
  ENTER[id]?.(el);
}

function renderFoot() {
  const id = flow[cur], nid = flow[cur + 1];
  renderSteps();
  next.hidden = id === 'install';
  next.disabled = id === 'checks' && !canGoOn();
  next.innerHTML = id === 'done' ? 'Terminar'
    : nid === 'install' ? (S.mode === 'update' ? 'Actualizar' : 'Instalar')
    : `${title(nid)}${NEXT_ARROW}`;
}

const ENTER = {
  checks() {
    // como el NSIS: cada vez que se entra en la página se comprueba todo de nuevo
    Object.assign(K, { certs: 'ok', missing: '', certsOk: false, copilot: 'ok', code: '', copilotOk: false, session: 'ok', who: '', sessionOk: false });
    later(refresh, 50);
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
    let shown = '', top = 0, cap = 0;
    const paint = (p, fase) => {
      top = Math.max(top, p);   // nunca hacia atrás
      bar.style.width = `${top}%`; pct.textContent = `${Math.floor(top)} %`;
      if (CAP[fase]) cap = CAP[fase];
      const label = FASE[fase] || fase;
      if (label && label !== shown) { shown = label; now.innerHTML = `<span>${esc(label)}</span>`; }
    };
    paint(0, S.mode === 'update' ? (S.abierto ? 'cerrando' : 'quitando') : 'preparando');
    const off = await listen('progreso', (e) => paint(e.payload.pct, e.payload.fase));
    // en los tramos lentos (el antivirus revisando, la versión anterior borrándose) la barra sigue
    // avanzando poco a poco dentro de su fase, sin pasarse de ella
    const creep = setInterval(() => { if (top < cap - 0.5) paint(top + 0.06, ''); }, 250);
    timers.push(creep);
    busy = true;
    try {
      await invoke('instalar', { carpeta: S.carpeta });
      paint(100, 'terminando');
      later(() => go(cur + 1), 500);
    } catch (err) {
      now.innerHTML = `<span class="prog-err">${esc(err)}</span> <button class="btn link" data-log>Ver el registro</button>`;
      $('[data-log]', now).onclick = verRegistro;
      next.hidden = false; next.disabled = false; next.textContent = 'Reintentar';
      next.onclick = () => { next.onclick = onNext; go(cur); };
    } finally {
      busy = false;
      clearInterval(creep);
      off();
    }
  },
};

// ── Comprobaciones previas ───────────────────────────────────────────────
// Certificados del cliente (si sia-instance.json exige alguno) y, en la primera instalación,
// Copilot CLI (si falta, se instala con WinGet) y su sesión. Al volver a comprobar, lo que ya
// salió bien se queda con su ✔ y no se repite. Lo que no se ha podido comprobar deja seguir
// con confirmación; lo que falta, no.
const ROW = { certs: 'Certificados del cliente', copilot: 'Copilot CLI', session: 'Sesión de Copilot' };
const rows = () => [...(hasCerts() ? ['certs'] : []), ...(S.mode === 'install' ? ['copilot', 'session'] : [])];
const K = { run: 0, step: 'done' };

const check = (paso) => invoke('comprobar', { paso }).catch(() => ({ respuesta: '', tarde: false }));
const rowEl = (id) => $(`.step[data-step="checks"]:not(.out-fwd):not(.out-back) [data-ck="${id}"]`);

// state: wait (gris), run (girando), ok (✔ verde), warn (falta: rojo, no deja seguir), unk (no se sabe: ámbar)
function setRow(id, state, sub = '') {
  const row = rowEl(id);
  if (!row) return;
  row.dataset.state = state;
  const txt = $('.ck-txt', row);
  txt.querySelector('.ck-sub')?.remove();
  if (sub) txt.insertAdjacentHTML('beforeend', `<span class="ck-sub">${esc(sub)}</span>`);
  $('.ck-act', row).innerHTML = '';
}

async function refresh() {
  const run = K.run;
  K.step = 'running';
  for (const r of $$('.ck-act')) r.innerHTML = '';
  const foot = $('[data-cks-foot]'); if (foot) foot.textContent = '';
  renderFoot();
  if (hasCerts() && !K.certsOk) {
    K.missing = '';
    setRow('certs', 'run', 'Comprobando…');
    const { respuesta } = await check('certs');
    if (run !== K.run) return;
    K.certs = 'unknown';
    if (respuesta === 'SIA-OK') {
      K.certs = 'ok'; K.certsOk = true;
      setRow('certs', 'ok', 'Instalados');
    } else if (respuesta.startsWith('SIA-FALTAN:')) {
      K.missing = respuesta.slice(11); K.certs = 'missing';
      setRow('certs', 'warn', `Faltan: ${K.missing}`);
    } else {
      setRow('certs', 'unk', 'No se han podido comprobar');
    }
  }
  await copilotStart(run);
}

// K.copilot ← ok | falta | sin-winget | politica | descarga | tiempo | error | unknown, y K.code
// ← el código de WinGet si es otro fallo
function readCopilot({ respuesta, tarde }, installing) {
  K.copilot = installing && tarde ? 'tiempo' : 'unknown';   // no termina de instalarse: casi siempre, la red
  K.code = '';
  if (respuesta.startsWith('SIA-COPILOT:')) {
    K.copilot = respuesta.slice(12);
    if (K.copilot.startsWith('error:')) { K.code = K.copilot.slice(6); K.copilot = 'error'; }
  }
}

const COPILOT_TEXT = {
  ok: ['ok', 'Instalado'],
  'sin-winget': ['warn', () => `Falta ${GESTOR()} para instalarlo`],
  politica: ['warn', 'El equipo no permite instalarlo'],
  descarga: ['warn', 'No se ha podido descargar'],
  tiempo: ['warn', 'No termina de instalarse'],
  error: ['warn', 'No se ha podido instalar'],
};

async function copilotStart(run) {
  if (K.copilotOk) return sessionStart(run);
  K.copilot = 'ok'; K.code = '';
  if (S.mode !== 'install') return finish();
  setRow('copilot', 'run', 'Comprobando…');
  readCopilot(await check('copilot'), false);
  if (run !== K.run) return;
  if (K.copilot === 'falta') {
    setRow('copilot', 'run', `Instalando con ${GESTOR()}…`);
    readCopilot(await check('copilot-install'), true);
    if (run !== K.run) return;
  }
  if (K.copilot === 'ok') K.copilotOk = true;
  const [state, sub] = COPILOT_TEXT[K.copilot] || ['unk', 'No se ha podido comprobar'];
  if (!COPILOT_TEXT[K.copilot]) K.copilot = 'unknown';
  setRow('copilot', state, typeof sub === 'function' ? sub() : sub);
  await sessionStart(run);
}

// La sesión de Copilot: en la primera instalación, con Copilot CLI ya bien. Si Copilot CLI no
// está, no hay sesión que mirar.
async function sessionStart(run) {
  K.session = 'ok';
  if (S.mode !== 'install' || K.copilot !== 'ok' || K.sessionOk) {
    if (S.mode === 'install' && !K.sessionOk) setRow('session', 'wait');
    return finish();
  }
  setRow('session', 'run', 'Comprobando…');
  const { respuesta } = await check('session');
  if (run !== K.run) return;
  let v = respuesta.startsWith('SIA-SESION:') ? respuesta.slice(11) : 'unknown';
  if (v.startsWith('ok:')) { K.who = v.slice(3); v = 'ok'; }   // se dice cuál, para que se vea si es la de Inditex
  K.session = v;
  if (v === 'ok') {
    K.sessionOk = true;
    setRow('session', 'ok', K.who ? `Iniciada: ${K.who}` : 'Iniciada');
  } else if (v === 'sin-sesion') {
    setRow('session', 'warn', 'Falta iniciar sesión');
  } else {
    K.session = 'unknown';
    setRow('session', 'unk', 'No se ha podido comprobar');
  }
  finish();
}

// Siguiente: sin certificados no; en la primera instalación, tampoco si Copilot CLI no está y no
// se ha podido instalar, ni sin sesión de Copilot (lo que no se ha podido comprobar, sí)
function canGoOn() {
  if (K.step !== 'done') return false;
  if (K.certs === 'missing') return false;
  if (S.mode === 'install' && K.copilot !== 'ok' && K.copilot !== 'unknown') return false;
  if (S.mode === 'install' && K.session !== 'ok' && K.session !== 'unknown') return false;
  return true;
}

// Todo comprobado. Falta algo (o no se sabe): qué hacer, en la fila que toca, con la guía o el
// inicio de sesión si sirven y «Volver a comprobar». Lo de los certificados primero.
function finish() {
  K.step = 'done';
  const dl = K.copilot === 'tiempo' ? 'descarga' : K.copilot;
  let help = '', kind = 'retry', at = null;
  if (K.certs !== 'ok') {
    at = 'certs';
    const conn = S.mode === 'install' && dl === 'descarga' ? ', revisa la conexión' : '';   // si Copilot CLI tampoco se ha podido descargar
    if (S.certs.guia) { help = `Instálalos con la guía${conn} y pulsa «Volver a comprobar».`; kind = 'guide'; }
    else help = `Pide a soporte la guía, instálalos${conn} y pulsa «Volver a comprobar».`;
  } else if (S.mode === 'install' && K.copilot !== 'ok') {
    at = 'copilot';
    if (K.copilot === 'sin-winget') kind = 'guide';
    help = K.copilot === 'sin-winget' ? (mac() ? 'Instala Homebrew con su guía y pulsa «Volver a comprobar».' : 'Actívalo o instálalo con la guía de Microsoft y pulsa «Volver a comprobar».')
      : K.copilot === 'politica' ? 'Pide a soporte que lo instale y pulsa «Volver a comprobar».'
      : dl === 'descarga' ? 'Revisa la conexión y la VPN y pulsa «Volver a comprobar».'
      : K.copilot === 'unknown' ? 'Pulsa «Volver a comprobar» o sigue sin él.'
      : K.code ? `Vuelve a comprobar o pide ayuda a soporte (código ${K.code}).`
      : 'Pulsa «Volver a comprobar» y, si sigue, pide ayuda a soporte.';
  } else if (S.mode === 'install' && K.session !== 'ok') {
    at = 'session';
    if (K.session === 'unknown') help = 'Pulsa «Volver a comprobar» o sigue sin ella.';
    else { help = 'Inicia sesión con tu cuenta de Inditex.'; kind = 'login'; }
  }
  const foot = $('.step[data-step="checks"]:not(.out-fwd):not(.out-back) [data-cks-foot]');
  if (foot) {
    foot.textContent = help;
    // con un aviso, el registro, para pasárselo a quien ayude
    if (help) {
      foot.insertAdjacentHTML('beforeend', ' <button class="btn link" data-log>Ver el registro</button>');
      $('[data-log]', foot).onclick = verRegistro;
    }
  }
  if (help) anotar(`Aviso en ${ROW[at]}: ${rowEl(at)?.querySelector('.ck-sub')?.textContent || ''} · ${help}`);
  const act = at && rowEl(at) && $('.ck-act', rowEl(at));
  if (act) {
    act.innerHTML = (kind === 'guide' ? '<button class="btn link" data-guide>Abrir la guía ↗</button>' : '')
      + (kind === 'login' ? '<button class="btn sm primary" data-login>Iniciar sesión ↗</button>' : '')
      + (kind === 'login' ? '' : '<button class="btn sm" data-recheck>Volver a comprobar</button>');   // tras iniciar sesión se comprueba sola
    const guia = at === 'certs' ? S.certs.guia : S.guia_gestor;
    $('[data-guide]', act)?.addEventListener('click', () => invoke('abrir_guia', { url: guia }).catch(() => {}));
    $('[data-login]', act)?.addEventListener('click', login);
    $('[data-recheck]', act)?.addEventListener('click', refresh);
  }
  renderFoot();
}

// El inicio de sesión de Copilot, en su propia ventana: abre el navegador y se cierra al
// completarlo. Mientras, la página espera; después, comprueba la sesión sin pulsar nada.
async function login() {
  const run = K.run;
  K.step = 'login';
  const foot = $('[data-cks-foot]'); if (foot) foot.textContent = '';
  setRow('session', 'run', 'Esperando el inicio de sesión en el navegador…');
  renderFoot();
  await check('login');
  if (run !== K.run) return;
  await sessionStart(run);
}

// Lo que no se ha podido comprobar se avisa (en un solo aviso) y se sigue si se acepta
function unknownsText() {
  const t = [];
  if (K.certs === 'unknown') t.push('No se han podido comprobar los certificados del cliente. Si faltan, con la VPN no podrás iniciar sesión hasta instalarlos.');
  if (S.mode === 'install' && K.copilot === 'unknown') t.push('No se ha podido comprobar Copilot CLI. Sin él, el chat de Copilot de SIA no funcionará hasta instalarlo.');
  if (S.mode === 'install' && K.session === 'unknown') t.push('No se ha podido comprobar la sesión de Copilot. Sin ella, el chat de Copilot de SIA no funcionará hasta iniciarla.');
  return t.join('\n\n');
}

// ── Botones de la ventana ────────────────────────────────────────────────
async function onNext() {
  const id = flow[cur];
  if (id === 'install') return;   // instalando no hay botón: termina sola
  if (id === 'done') {
    if ($('[data-launch]').checked) await invoke('abrir_sia', { carpeta: S.carpeta }).catch(() => {});
    closeWin();
    return;
  }
  if (id === 'checks') {
    if (!canGoOn()) return;
    const warn = unknownsText();
    if (warn) { ask('¿Seguir sin comprobarlo?', warn, 'Seguir', () => { anotar(`Sigue sin comprobarlo: ${warn}`); go(cur + 1); }); return; }
  }
  go(cur + 1);
}
next.onclick = onNext;
$$('[data-min]').forEach((b) => { b.onclick = () => appWin.minimize(); });
$$('[data-close]').forEach((b) => { b.onclick = () => (busy ? null : flow[cur] === 'done' ? closeWin() : askLeave()); });

let onLeave = null;
function ask(head, text, ok, fn, stay = 'Volver') {
  $('#ask-t').textContent = head;
  $('[data-stay]').textContent = stay;
  $('[data-ask-text]').textContent = text;
  $('[data-leave]').textContent = ok;
  onLeave = fn;
  $('[data-veil]').hidden = false;
  $('[data-stay]').focus();
}
const askLeave = () => ask('¿Salir de la instalación?', S.mode === 'update' ? `Se queda la versión ${S.instalado.version}.` : 'SIA no quedará instalado.', 'Salir', closeWin, 'Seguir');
$('[data-stay]').onclick = () => { $('[data-veil]').hidden = true; };
$('[data-leave]').onclick = () => { $('[data-veil]').hidden = true; onLeave?.(); };

function verRegistro() { invoke('abrir_registro').catch(() => {}); }

async function closeWin() {
  anotar(`Se cierra en el paso ${cur + 1}: ${title(flow[cur])}`);
  stopTimers();
  await invoke('cortar').catch(() => {});
  $('.win').classList.add('closing');
  setTimeout(() => appWin.close(), reduced() ? 0 : 250);
}

(async () => {
  S = await invoke('estado');
  S.mode = S.instalado ? 'update' : 'install';
  if (S.instalado) S.carpeta = S.instalado.carpeta;
  $('.win').dataset.os = S.sistema;
  $('[data-tb-title]').textContent = S.mode === 'update' ? 'Actualización' : 'Instalación';
  // solo los pasos que tocan (TC-02 de la #143): al actualizar, las comprobaciones solo si hay
  // certificados que mirar, y sin carpeta
  flow = S.mode === 'update'
    ? ['welcome', ...(hasCerts() ? ['checks'] : []), 'install', 'done']
    : ['welcome', 'checks', 'folder', 'install', 'done'];
  go(0);
})();
