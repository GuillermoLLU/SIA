// Un chat cuyo Copilot no tiene sesión iniciada (o no puede usarla): en vez
// del error crudo del CLI («Please run /login», imposible sin terminal), en la
// conversación va una tarjeta que lleva a Configuración → Proveedores IA, donde
// se inicia la sesión (providers/copilot-auth.js). Aquí, sus piezas; quién las
// pone y cuándo, session.js (wireNative). Dominio puro.
//   { kind: 'auth', id, detail, retry }   falta la sesión. detail: lo que dijo
//        el CLI, sin su «run /login»; retry: lo último que se le mandó y no llegó, o null
//   { kind: 'auth-state', id, state }     qué ha pasado después con ella:
//        'logged' → en el equipo sí hay sesión: el chat no la ha podido usar
//                   (caducada, o iniciada después de abrirlo)
//        'ready'  → la sesión ya está: se puede seguir (y reenviar `retry`)

// un error que habla de la sesión, lo diga quien lo diga
const AUTH_TEXT = /please run \/login|not logged in|authentication_failed|authentication (?:failed|required)|(?:error|status|http|code)\D{0,12}401\b|unauthori[sz]ed|invalid (?:api key|credentials)|token (?:has |is )?(?:expired|revoked)|(?:log|sign) ?in again/i;
export const looksLikeAuth = (text) => AUTH_TEXT.test(String(text || ''));
// lo que dijo, sin mandar a un terminal que aquí no hay
export const authDetail = (text) => String(text || '').replace(/\s*[·.:-]?\s*(?:please )?run \/login.*$/i, '').trim().slice(0, 200);
export const authItem = ({ id, detail = '', retry = null }) => ({ kind: 'auth', id, detail: authDetail(detail), retry: retry || null, ts: null });
export const authStateItem = (id, state) => ({ kind: 'auth-state', id, state });
