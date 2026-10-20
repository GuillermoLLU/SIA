// Acceso público: quick tunnel de Cloudflare. `cloudflared tunnel --url` sin
// cuenta ni credenciales da una URL https://xxx.trycloudflare.com aleatoria
// que muere con el proceso. Encima va el mismo emparejamiento QR+PIN de la red
// local, más el candado del móvil. El binario: el del PATH si existe; si no,
// uno descargado al workspace (escribible también en la app empaquetada) la
// primera vez.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// El fichero publicado para esta máquina (no hay build arm64 de Windows).
export const cfAsset = ({ platform, arch }) => {
  const a = arch === 'arm64' ? 'arm64' : 'amd64';
  if (platform === 'win32') return 'cloudflared-windows-amd64.exe';
  if (platform === 'darwin') return `cloudflared-darwin-${a}.tgz`;
  return `cloudflared-linux-${a}`;
};

// `resolve`: busca un ejecutable en el PATH; `fetch`/`insecureFetch`: la
// descarga va con TLS validado y, si el proxy corporativo lo rompe, con el
// agente tolerante.
export const createTunnel = ({ binDir, apiPort, resolve, fetch, insecureFetch, isWin = os.platform() === 'win32' }) => {
  const local = path.join(binDir, isWin ? 'cloudflared.exe' : 'cloudflared');
  const state = {
    proc: null,     // proceso cloudflared vivo, o null
    url: null,      // https://xxx.trycloudflare.com
    phase: 'off',   // off | preparing | download | starting | ready
    error: null,    // último fallo, para enseñarlo en la UI
  };
  const binary = () => resolve('cloudflared') || (fs.existsSync(local) ? local : null);

  const ensure = async () => {
    const found = binary();
    if (found) return found;
    state.phase = 'download';
    console.log('[sia] descargando cloudflared (primera vez)…');
    fs.mkdirSync(binDir, { recursive: true });
    const asset = cfAsset({ platform: os.platform(), arch: os.arch() });
    const dlUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
    let r;
    try { r = await fetch(dlUrl); } catch { r = await insecureFetch(dlUrl); }
    if (!r.ok) throw new Error(`no se pudo descargar cloudflared (HTTP ${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (asset.endsWith('.tgz')) { // macOS lo publica empaquetado: extraer con el tar del sistema
      const tmp = path.join(binDir, asset);
      fs.writeFileSync(tmp, buf);
      await new Promise((res, rej) => {
        const p = spawn('tar', ['-xzf', tmp, '-C', binDir]);
        p.on('exit', (c) => (c === 0 ? res() : rej(new Error('no se pudo extraer cloudflared'))));
        p.on('error', rej);
      });
      fs.rmSync(tmp, { force: true });
    } else {
      fs.writeFileSync(local, buf);
    }
    if (!isWin) fs.chmodSync(local, 0o755);
    console.log('[sia] cloudflared listo en', local);
    return local;
  };

  const run = (bin) => new Promise((res, rej) => {
    state.phase = 'starting';
    const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${apiPort}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    state.proc = proc;
    let out = '';
    const sniff = (d) => { // cloudflared imprime la URL asignada en su log de arranque
      out += d.toString();
      const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { state.url = m[0]; res(m[0]); }
    };
    proc.stdout.on('data', sniff);
    proc.stderr.on('data', sniff);
    proc.on('error', rej);
    proc.on('exit', () => {
      if (state.proc === proc) { // muerte no pedida (red caída, kill externo…)
        state.proc = null; state.url = null;
        if (state.phase === 'ready') { state.phase = 'off'; state.error = 'el túnel se cerró — vuelve a generar el acceso'; }
        console.warn('[sia] cloudflared terminó');
      }
      rej(new Error('cloudflared terminó sin dar URL'));
    });
    setTimeout(() => rej(new Error('el túnel tardó demasiado en arrancar')), 45_000);
  });

  // La URL de un túnel recién creado tarda unos segundos en resolver (DNS en
  // propagación): si el QR sale antes, el primer escaneo puede dar error. Se
  // sondea hasta que responde; si no llega, se sigue igual, que el QR vive
  // cinco minutos y para entonces ya resolverá.
  const warm = async (url) => {
    for (let i = 0; i < 6; i++) {
      try { if ((await fetch(`${url}/api/ping`, { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* aún propagando */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  const stop = () => {
    const proc = state.proc;
    state.proc = null; state.url = null; state.phase = 'off'; state.error = null;
    if (proc) { try { proc.kill(); } catch { /* ya muerto */ } }
  };

  return {
    state,
    installed: () => !!binary(),
    live: () => !!(state.proc && state.url),
    // Arranque asíncrono (la descarga puede tardar): quien llama sigue las
    // fases por state.phase; onReady(url) cuando ya se puede emparejar.
    start(onReady) {
      state.error = null;
      state.phase = 'preparing';
      (async () => {
        try {
          await run(await ensure());
          await warm(state.url);
          state.phase = 'ready';
          console.log(`[sia] acceso público listo: ${state.url}`);
          onReady(state.url);
        } catch (err) {
          const proc = state.proc;
          state.proc = null; state.url = null; state.phase = 'off'; state.error = err.message;
          if (proc) { try { proc.kill(); } catch { /* ya muerto */ } }
          console.warn('[sia] acceso público fallido:', err.message);
        }
      })();
    },
    stop,
    // que no quede un túnel huérfano apuntando a este equipo al salir
    kill: () => { try { state.proc?.kill(); } catch { /* ya muerto */ } },
  };
};
