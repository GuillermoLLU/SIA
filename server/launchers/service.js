// Arrancar un CLI para un chat: deja escritos los ficheros de MCP de la sesión
// (en el workspace, porque el directorio de la app empaquetada puede ser de
// solo lectura; el perfil de Codex en $CODEX_HOME) y dice qué ejecutar y con
// qué argumentos. Al terminar la sesión se borran; los huérfanos de arranques
// anteriores (cierres bruscos), al arrancar. Copilot no necesita fichero: el
// MCP va al crear la sesión (mcp), y su clave de GitHub de los repos, aparte
// de su cuenta (repo-key.js: el guion de BASH_ENV, fijo, en el workspace).
import fs from 'node:fs';
import path from 'node:path';
import { LAUNCHERS, launcherById, launcherArgs, promptArgs, spawnSpec } from './launchers.js';
import { mcpEnv, mcpConfig, mcpServers, codexProfile, codexProfileToml } from './mcp.js';
import { BASH_ENV_SCRIPT, repoKeyEnv, applyRepoKey } from './repo-key.js';
import { createResolver } from './resolve.js';

export const createLaunchers = ({ workspace, codexHome, mcpServer, execPath = process.execPath, isWin, env = process.env, platform = process.platform }) => {
  const { resolve, which } = createResolver({ isWin, env });
  const mcpFile = (sessionId) => path.join(workspace, `.mcp-claude-${sessionId}.json`);
  const profileFile = (sessionId) => path.join(codexHome, `${codexProfile(sessionId)}.config.toml`);
  const bin = { execPath, server: mcpServer };
  const spec = (cmd, args) => spawnSpec(resolve(cmd) || cmd, args, { isWin, comspec: env.COMSPEC });

  try { for (const f of fs.readdirSync(codexHome)) if (/^sia-s\d+\.config\.toml$/.test(f)) fs.unlinkSync(path.join(codexHome, f)); } catch { /* sin perfiles */ }
  // el guion que da a los comandos de Copilot la clave de GitHub (bash lo lee del disco)
  const repoEnvFile = path.join(workspace, '.repo-env.sh');
  let bashEnvFile = null;
  try { fs.mkdirSync(workspace, { recursive: true }); fs.writeFileSync(repoEnvFile, BASH_ENV_SCRIPT); bashEnvFile = repoEnvFile; } catch (e) { console.warn(`[sia] no se pudo escribir ${repoEnvFile}: ${e.message}`); }

  return {
    list: () => LAUNCHERS.map((l) => ({ id: l.id, label: l.label, available: which(l.cmd), native: !!l.native })),
    byId: launcherById,
    installed: (def) => which(def.cmd),
    // → { cmd, args } listos para lanzar; con Copilot, además mcp (los servidores de la sesión, o null).
    // `prompt`: el primer mensaje de un chat de terminal, si lo hay (el de Copilot va por la sesión).
    prepare(def, sessionId, allowedProjects, base, prompt = null) {
      const env = mcpEnv(allowedProjects, base);
      if (def.native) return { ...spec(def.cmd, launcherArgs(def.id, {})), mcp: mcpServers(env, base, bin) };
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
        const file = mcpFile(sessionId);
        fs.writeFileSync(file, JSON.stringify(mcpConfig(env, base, bin), null, 2));
        args = launcherArgs(def.id, { mcpFile: file });
      }
      if (prompt) args = [...promptArgs(prompt), ...args];
      return spec(def.cmd, args);
    },
    // El entorno con el que arranca un CLI y lo que pide de más: con Copilot,
    // la clave de GitHub de los repos va aparte de su cuenta (repo-key.js).
    envFor(def, chatEnv) {
      if (!def.native) return { env: chatEnv, args: [] };
      const key = repoKeyEnv({ token: chatEnv.GH_TOKEN || '', platform, bashEnvFile, userBashEnv: chatEnv.BASH_ENV || null });
      return { env: applyRepoKey(chatEnv, key), args: key.args };
    },
    cleanup(sessionId) {
      try { fs.rmSync(mcpFile(sessionId)); } catch { /* no era de Claude */ }
      try { fs.unlinkSync(profileFile(sessionId)); } catch { /* no era Codex */ }
    },
    resolve,
    spec,
  };
};
