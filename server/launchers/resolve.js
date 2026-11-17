// Dónde está el CLI y cómo se lanza. Resuelve un comando a su ruta ejecutable
// REAL: en Windows los CLIs instalados por npm (copilot) son shims `.cmd`;
// buscar el nombre pelado encontraba el wrapper sh sin extensión (existe
// también) y luego lanzarlo fallaba con «File not found», porque CreateProcess
// NO aplica PATHEXT. Aquí se prueban las extensiones de PATHEXT, que tienen
// PRIORIDAD sobre el fichero sin extensión; fuera de Windows solo vale la
// forma literal. Devuelve la ruta completa o null.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

export const createResolver = ({ isWin, env = process.env, isFile = (p) => fs.statSync(p).isFile() }) => {
  const P = isWin ? path.win32 : path.posix;
  const exts = isWin ? [...(env.PATHEXT || DEFAULT_PATHEXT).split(';').filter(Boolean), ''] : [''];
  const firstFile = (base) => {
    for (const ext of exts) {
      const full = base + ext;
      try { if (isFile(full)) return full; } catch { /* siguiente */ }
    }
    return null;
  };
  const resolve = (cmd) => {
    if (cmd.includes('/') || cmd.includes('\\') || P.isAbsolute(cmd)) return firstFile(cmd);
    for (const d of (env.PATH || '').split(P.delimiter)) {
      if (!d) continue;
      const hit = firstFile(P.join(d, cmd));
      if (hit) return hit;
    }
    return null;
  };
  return { resolve, which: (cmd) => !!resolve(cmd) };
};

// Qué se lanza de verdad. En Windows un shim .cmd/.bat no lo ejecuta
// CreateProcess por sí solo (no corre batch), así que va a través de
// cmd.exe /c, igual que hace la terminal de VS Code.
export const spawnSpec = (exe, args, { isWin, comspec = 'cmd.exe' }) =>
  (isWin && /\.(cmd|bat)$/i.test(exe) ? { cmd: comspec, args: ['/c', exe, ...args] } : { cmd: exe, args });
