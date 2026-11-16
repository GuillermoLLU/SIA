// La clave de GitHub de un chat es para los REPOS (git, gh, las skills): no es
// la cuenta de quien usa la IA. Llega al chat en GH_TOKEN/GITHUB_TOKEN
// (config/config.js: userEnv), pero el CLI de Copilot toma como cuenta SUYA
// cualquier GH_TOKEN, GITHUB_TOKEN o COPILOT_GITHUB_TOKEN que vea en su
// entorno, por delante del login (lo dice su ayuda: «takes precedence over
// previously stored credentials»). Así que un chat con la clave de repos de la
// persona gastaría, o fallaría, con esa clave en vez de con la cuenta de
// Copilot (Configuración → Proveedores IA).
//
// Por eso su proceso nunca ve esas variables. La clave del chat le
// llega con otro nombre (SIA_GH_TOKEN, que Copilot no mira) y solo el shell de
// lo que ejecuta la convierte en GH_TOKEN: bash lee BASH_ENV antes de cada
// comando (su CLI lo permite con --bash-env on) y ese guion, fijo y sin
// secretos, hace el cambio. En Windows su shell es PowerShell y no hay nada
// equivalente: ahí los comandos de un chat de Copilot van con la sesión de gh
// que tenga el equipo. Dominio puro: el entorno y los argumentos de más; el
// guion lo escribe el bridge (service.js).

export const REPO_KEY_VAR = 'SIA_GH_TOKEN';
// lo que Copilot tomaría como su cuenta (en su orden): nunca en su entorno
export const COPILOT_IDENTITY_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

// el guion de BASH_ENV: fijo (la clave no está en él: llega por el entorno)
export const BASH_ENV_SCRIPT = [
  '# SIA: la clave de GitHub del chat, solo para lo que el agente ejecuta (git, gh).',
  '# Copilot no la ve como suya: en su entorno se llama SIA_GH_TOKEN (server/launchers/repo-key.js).',
  'if [ -n "$SIA_GH_TOKEN" ]; then export GH_TOKEN="$SIA_GH_TOKEN" GITHUB_TOKEN="$SIA_GH_TOKEN"; fi',
  '# el BASH_ENV que ya tuviera la persona sigue valiendo',
  'if [ -n "$SIA_USER_BASH_ENV" ] && [ -r "$SIA_USER_BASH_ENV" ]; then . "$SIA_USER_BASH_ENV"; fi',
  '',
].join('\n');

// token: la clave de repos del chat ('' si no hay) · bashEnvFile: dónde está el
// guion · userBashEnv: el BASH_ENV que traía el entorno
// → { env (lo que se añade), drop (lo que se quita del entorno), args (para el CLI) }
export const repoKeyEnv = ({ token = '', platform = process.platform, bashEnvFile = null, userBashEnv = null } = {}) => {
  const drop = [...COPILOT_IDENTITY_VARS];
  if (!token || platform === 'win32' || !bashEnvFile) return { env: {}, drop, args: [] };
  return {
    env: { [REPO_KEY_VAR]: token, BASH_ENV: bashEnvFile, ...(userBashEnv && userBashEnv !== bashEnvFile ? { SIA_USER_BASH_ENV: userBashEnv } : {}) },
    drop, args: ['--bash-env', 'on'],
  };
};

// el entorno final del proceso de Copilot: el del chat, sin lo que sobra, con lo que se añade
export const applyRepoKey = (base, { env, drop }) => {
  const e = { ...base };
  for (const k of drop) delete e[k];
  return { ...e, ...env };
};
