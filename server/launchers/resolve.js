// Resuelve un comando a su ruta ejecutable REAL. En Windows los CLIs
// instalados por npm (claude, copilot) son shims `.cmd`; buscar el nombre
// pelado encontraba el wrapper sh sin extensión (existe también) y luego
// pty.spawn fallaba con «File not found», porque ConPTY/CreateProcess NO
// aplica PATHEXT. Aquí se prueban las extensiones de PATHEXT, que tienen
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
