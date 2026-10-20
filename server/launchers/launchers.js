// Los CLIs que SIA lanza en un chat (dominio, sin E/S): cuáles son, con qué
// argumentos arranca cada uno y cómo se le pasa el primer mensaje. La web los
// enseña (los que no están instalados, apagados) y pide el modo de
// conocimiento (auto/demand).
export const LAUNCHERS = [
  { id: 'claude', label: 'Claude', cmd: 'claude' },
  { id: 'copilot', label: 'Copilot', cmd: 'copilot' },
  { id: 'codex', label: 'Codex', cmd: 'codex' }, // el CLI de OpenAI
];

export const launcherById = (id) => LAUNCHERS.find((l) => l.id === id) || LAUNCHERS[0];

// Los argumentos de arranque. Todos van sin confirmaciones (la persona ya
// decidió abrir el chat) y con el servidor MCP de conocimiento de la sesión:
// Claude y Copilot por un fichero de config (mcpFile), Codex por un perfil
// apilado sobre su config (profile; sin base no hay MCP ni perfil).
export const launcherArgs = (id, { mcpFile, profile }) => {
  if (id === 'codex') return ['--dangerously-bypass-approvals-and-sandbox', ...(profile ? ['-p', profile] : [])];
  if (id === 'copilot') return ['--allow-all', '--additional-mcp-config', `@${mcpFile}`];
  // bypassPermissions = bypass sin el prompt de «¿seguro?»; setting-sources ''
  // ignora el settings.json global del usuario (hooks de otra versión que
  // rompen el 2.1.47) sin tocar el login (vive en el Keychain de macOS).
  return ['--permission-mode', 'bypassPermissions', '--setting-sources', '', '--mcp-config', mcpFile];
};

// El primer mensaje del chat, delante del resto de opciones: detrás,
// `--mcp-config` (admite varios) se lo tragaría.
export const promptArgs = (id, prompt) => (id === 'copilot' ? ['-i', prompt] : [prompt]);

// Qué se lanza de verdad. En Windows un shim .cmd/.bat no lo ejecuta ConPTY
// por sí solo (CreateProcess no corre batch), así que va a través de
// cmd.exe /c, igual que hace la terminal de VS Code.
export const spawnSpec = (exe, args, { isWin, comspec = 'cmd.exe' }) =>
  (isWin && /\.(cmd|bat)$/i.test(exe) ? { cmd: comspec, args: ['/c', exe, ...args] } : { cmd: exe, args });
