// Credenciales personales (sin DOM): el acceso a Jira y las claves de GitHub
// (varias guardadas, una activa: la que se inyecta como GH_TOKEN a los chats
// NUEVOS, para saltar de entorno —trabajo ↔ personal— sin repegar el token).

const APPLIES = 'aplica a los chats que abras a partir de ahora';

// La URL base sin barra final, como la espera la skill de Jira.
export const jiraConfig = (baseUrl, token) => ({ baseUrl: baseUrl.trim().replace(/\/+$/, ''), token: token.trim() });

// El token nunca se muestra entero: basta con reconocerlo de un vistazo.
export const ghMask = (t) => (t.length > 12 ? `${t.slice(0, 7)}…${t.slice(-4)}` : '••••');

// Añadir una clave: ni vacía ni repetida; sin nombre, «Clave N»; la primera
// que se guarda entra ya activa. → { keys, activeId, message } | { error }
export const addGithubKey = ({ keys, activeId }, { name, token, id }) => {
  const tok = token.trim();
  if (!tok) return { error: 'pega el token' };
  if (keys.some((k) => k.token === tok)) return { error: 'esa clave ya está guardada' };
  const label = name.trim() || `Clave ${keys.length + 1}`;
  const first = !activeId;
  return { keys: [...keys, { id, name: label, token: tok }], activeId: first ? id : activeId, message: `añadida: ${label}${first ? ` (activa) — ${APPLIES}` : ''}` };
};

// Quitar una clave (si era la activa, no queda ninguna).
export const removeGithubKey = ({ keys, activeId }, id) => {
  const k = keys.find((x) => x.id === id);
  const wasActive = activeId === id;
  return { keys: keys.filter((x) => x.id !== id), activeId: wasActive ? null : activeId, message: wasActive ? `quitada: ${k.name} — no queda ninguna activa` : `quitada: ${k.name}` };
};

// Activar una clave, o desactivar la que lo está.
export const toggleGithubKey = ({ keys, activeId }, id) => {
  const k = keys.find((x) => x.id === id);
  const on = activeId !== id;
  return { keys, activeId: on ? id : null, message: on ? `activa: ${k.name} — ${APPLIES}` : `sin clave activa — ${APPLIES}` };
};
