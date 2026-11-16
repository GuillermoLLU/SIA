// Lanzar el CLI de Copilot para un chat: dónde está (resolve.js), con qué
// argumentos (su modo programable, chats/copilot.js), los servidores MCP de
// la sesión (mcp.js) y su entorno, con la clave de GitHub de los repos aparte
// de su cuenta (repo-key.js: el guion de BASH_ENV, fijo, en el workspace
// porque el directorio de la app empaquetada puede ser de solo lectura).
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_ARGS } from '../chats/copilot.js';
import { mcpEnv, mcpServers } from './mcp.js';
import { BASH_ENV_SCRIPT, repoKeyEnv, applyRepoKey } from './repo-key.js';
import { createResolver, spawnSpec } from './resolve.js';

const CMD = 'copilot';

export const createLaunchers = ({ workspace, mcpServer, execPath = process.execPath, isWin, env = process.env, platform = process.platform }) => {
  const { resolve, which } = createResolver({ isWin, env });
  const bin = { execPath, server: mcpServer };
  // qué ejecutar y con qué argumentos (en Windows, a través de cmd.exe)
  const spec = (args) => spawnSpec(resolve(CMD) || CMD, args, { isWin, comspec: env.COMSPEC });

  // el guion que da a los comandos de Copilot la clave de GitHub (bash lo lee del disco)
  const repoEnvFile = path.join(workspace, '.repo-env.sh');
  let bashEnvFile = null;
  try { fs.mkdirSync(workspace, { recursive: true }); fs.writeFileSync(repoEnvFile, BASH_ENV_SCRIPT); bashEnvFile = repoEnvFile; } catch (e) { console.warn(`[sia] no se pudo escribir ${repoEnvFile}: ${e.message}`); }

  return {
    installed: () => which(CMD),
    // → { cmd, args, mcp }: lo que se lanza y los servidores de la sesión (o null sin base)
    prepare: (allowedProjects, base) => ({ ...spec(RUNTIME_ARGS), mcp: mcpServers(mcpEnv(allowedProjects, base), base, bin) }),
    // El entorno con el que arranca y lo que pide de más: la clave de GitHub
    // de los repos, aparte de su cuenta (repo-key.js).
    envFor(chatEnv) {
      const key = repoKeyEnv({ token: chatEnv.GH_TOKEN || '', platform, bashEnvFile, userBashEnv: chatEnv.BASH_ENV || null });
      return { env: applyRepoKey(chatEnv, key), args: key.args };
    },
    spec,
  };
};
