// Arrancar un CLI para un chat: deja escritos los ficheros de MCP de la sesión
// (en el workspace, porque el directorio de la app empaquetada puede ser de
// solo lectura; el perfil de Codex en $CODEX_HOME) y dice qué ejecutar y con
// qué argumentos. Al terminar la sesión se borran; los huérfanos de arranques
// anteriores (cierres bruscos), al arrancar.
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCHERS, launcherById, launcherArgs, promptArgs, spawnSpec } from './launchers.js';
import { mcpEnv, mcpConfig, codexProfile, codexProfileToml } from './mcp.js';
import { createResolver } from './resolve.js';

export const createLaunchers = ({ workspace, codexHome, mcpServer, execPath = process.execPath, isWin, env = process.env }) => {
  const { resolve, which } = createResolver({ isWin, env });
  const mcpFile = (kind, sessionId) => path.join(workspace, `.mcp-${kind}-${sessionId}.json`);
  const profileFile = (sessionId) => path.join(codexHome, `${codexProfile(sessionId)}.config.toml`);
  const bin = { execPath, server: mcpServer };

  try { for (const f of fs.readdirSync(codexHome)) if (/^sia-s\d+\.config\.toml$/.test(f)) fs.unlinkSync(path.join(codexHome, f)); } catch { /* sin perfiles */ }

  return {
    list: () => LAUNCHERS.map((l) => ({ id: l.id, label: l.label, available: which(l.cmd) })),
    byId: launcherById,
    installed: (def) => which(def.cmd),
    // → { cmd, args } listos para el PTY. `prompt`: el primer mensaje, si lo hay.
    prepare(def, sessionId, allowedProjects, base, prompt = null) {
      const env = mcpEnv(allowedProjects, base);
      let args;
      if (def.id === 'codex') {
        let profile = null;
        if (base) {
          profile = codexProfile(sessionId);
          fs.mkdirSync(codexHome, { recursive: true });
          fs.writeFileSync(profileFile(sessionId), codexProfileToml(env, bin), { mode: 0o600 });
        }
        args = launcherArgs(def.id, { profile });
      } else {
        const file = mcpFile(def.id, sessionId);
        fs.writeFileSync(file, JSON.stringify(mcpConfig(def.id, env, base, bin), null, 2));
        args = launcherArgs(def.id, { mcpFile: file });
      }
      if (prompt) args = [...promptArgs(def.id, prompt), ...args];
      return spawnSpec(resolve(def.cmd) || def.cmd, args, { isWin, comspec: env.COMSPEC });
    },
    cleanup(sessionId) {
      for (const k of ['claude', 'copilot']) { try { fs.rmSync(mcpFile(k, sessionId)); } catch { /* no era de ese CLI */ } }
      try { fs.unlinkSync(profileFile(sessionId)); } catch { /* no era Codex */ }
    },
    resolve,
  };
};
