// Los CLIs que SIA lanza en un chat (dominio, sin E/S): cuáles son, con qué
// argumentos arranca cada uno y cómo se le pasa el primer mensaje. La web los
// enseña (los que no están instalados, apagados) y pide el modo de
// conocimiento (auto/demand). Copilot va sin terminal (native): el bridge le
// habla por el protocolo de su SDK (chats/copilot.js) y el primer mensaje y el
// MCP de conocimiento van por ahí, no por argumentos.
import { RUNTIME_ARGS } from '../chats/copilot.js';

export const LAUNCHERS = [
  { id: 'claude', label: 'Claude', cmd: 'claude' },
  { id: 'copilot', label: 'Copilot', cmd: 'copilot', native: true },
  { id: 'codex', label: 'Codex', cmd: 'codex' }, // el CLI de OpenAI
];

export const launcherById = (id) => LAUNCHERS.find((l) => l.id === id) || LAUNCHERS[0];

// Los argumentos de arranque. Todos van sin confirmaciones (la persona ya
// decidió abrir el chat) y con el servidor MCP de conocimiento de la sesión:
// Claude por un fichero de config (mcpFile), Codex por un perfil apilado sobre
// su config (profile; sin base no hay MCP ni perfil), Copilot al crear la sesión.
export const launcherArgs = (id, { mcpFile, profile }) => {
  if (id === 'codex') return ['--dangerously-bypass-approvals-and-sandbox', ...(profile ? ['-p', profile] : [])];
  if (id === 'copilot') return [...RUNTIME_ARGS];
  // bypassPermissions = bypass sin el prompt de «¿seguro?»; setting-sources ''
  // ignora el settings.json global del usuario (hooks de otra versión que
  // rompen el 2.1.47) sin tocar el login (vive en el Keychain de macOS).
  return ['--permission-mode', 'bypassPermissions', '--setting-sources', '', '--mcp-config', mcpFile];
};

// El primer mensaje de un chat de terminal, delante del resto de opciones:
// detrás, `--mcp-config` (admite varios) se lo tragaría.
export const promptArgs = (prompt) => [prompt];

// Qué se lanza de verdad. En Windows un shim .cmd/.bat no lo ejecuta ConPTY
// por sí solo (CreateProcess no corre batch), así que va a través de
// cmd.exe /c, igual que hace la terminal de VS Code.
export const spawnSpec = (exe, args, { isWin, comspec = 'cmd.exe' }) =>
  (isWin && /\.(cmd|bat)$/i.test(exe) ? { cmd: comspec, args: ['/c', exe, ...args] } : { cmd: exe, args });
