// La base de conocimiento en uso en este bridge: la que la plataforma asigna a quien inicia sesión
// en él (una por instancia; la del último que entra). Solo en memoria.
//   deps: auth.context(token) → { user, accessToken } | null, knowledge.mine(jwt) → filas de
//         platform_my_knowledge, knowledge.syncPeople(jwt, null) → avisos, onSwitch(base | null)
//         al cambiar de base (o quedarse sin ella), log
// Los fallos van al registro: sin base, el bridge sigue y la web avisa.
import { toAssignedBase } from './assigned.js';
import { can } from '../auth/views.js';

export const createAssignedBase = ({ auth, knowledge, onSwitch, log = console }) => {
  let assigned = null;   // { id, name, url, key, tokens, powerKey } | null
  let loading = null;    // la carga en curso de ensure

  const switchTo = async (next) => {
    if (JSON.stringify(next) === JSON.stringify(assigned)) return;
    assigned = next;
    await onSwitch(assigned);
  };
  const baseOf = async (ctx) => switchTo(toAssignedBase(await knowledge.mine(ctx.accessToken)));
  // quien gestiona Personas deja al día las claves de todos (por si algo cambió fuera de SIA o
  // quedó a medias), sin esperar
  const syncTeam = (ctx) => {
    if (!can(ctx.user, 'people')) return;
    knowledge.syncPeople(ctx.accessToken, null)
      .then((problems) => problems.forEach((p) => log.warn(`[sia] clave de poder de una persona: ${p}`)))
      .catch((e) => log.warn(`[sia] no se pudieron revisar las claves de las personas: ${e.message}`));
  };
  const withSession = (fn) => async (token) => {
    try {
      const ctx = await auth.context(token);
      if (ctx) await fn(ctx);
    } catch (e) { log.warn(`[sia] no se pudo cargar el conocimiento asignado: ${e.message}`); }
  };
  const reload = withSession(baseOf);

  return {
    current: () => assigned,
    // al iniciar sesión (o abrir la app con la sesión guardada)
    login: withSession(async (ctx) => { syncTeam(ctx); await baseOf(ctx); }),
    // tras cambiar el conocimiento de alguien: el de quien llama puede haber cambiado
    reload,
    // sin base cargada (p. ej. el bridge se reinició con la web abierta): la de quien llama, en una
    // sola carga aunque lleguen varias peticiones a la vez y sin repasar las claves del equipo
    ensure: (token) => (loading ||= reload(token).finally(() => { loading = null; })),
    clear: async () => { assigned = null; await onSwitch(null); },
  };
};
