// Edge Function «sia-users»: alta, baja y cambio de contraseña de personas en
// Supabase Auth. Es lo único que necesita la clave secret, y por eso vive
// aquí, en Supabase, y no en SIA.
//
// La llama el bridge de SIA con el JWT de quien está usando la app. Antes de
// nada pregunta a la base, CON ESE JWT, si está activo y tiene la vista
// Personas (platform_can_manage_users): la autorización la decide el SQL, no esta
// función. Después de cada cambio lo apunta en la auditoría a su nombre
// (platform_record_user_event).
//
//   POST { action: 'create', email, name, password, role }  → { user }
//   POST { action: 'delete', id }                           → { ok }
//   POST { action: 'set_password', id, password }           → { ok }
//
// Secretos de la función (Project Settings → Edge Functions → Secrets):
//   SIA_PUBLISHABLE_KEY   clave publishable del proyecto
//   SIA_SECRET_KEY        clave secret del proyecto (solo aquí)
// SUPABASE_URL lo pone Supabase.

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const PUBLISHABLE = Deno.env.get('SIA_PUBLISHABLE_KEY') ?? '';
const SECRET = Deno.env.get('SIA_SECRET_KEY') ?? '';

const ROLES = ['admin', 'agent'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Json = Record<string, unknown>;

class Fail extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const reply = (status: number, body: Json) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Misma política que Authentication → Passwords: 6 caracteres o más.
const passwordProblem = (p: unknown): string | null =>
  typeof p !== 'string' || p.length < 6 ? 'La contraseña necesita 6 caracteres o más.' : null;

// Llamada a la API del proyecto. `as`: el JWT del usuario (actúa como él) o
// 'secret' (actúa con la clave secret, solo para la API de administración de Auth).
const call = async (path: string, as: string, init: RequestInit = {}): Promise<unknown> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (as === 'secret') headers.apikey = SECRET;
  else {
    headers.apikey = PUBLISHABLE;
    headers.Authorization = `Bearer ${as}`;
  }
  const r = await fetch(`${URL_BASE}${path}`, { ...init, headers });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `HTTP ${r.status}`;
    throw new Fail(r.status >= 500 ? 502 : r.status, String(msg));
  }
  return data;
};
const rpc = (jwt: string, fn: string, args: Json) => call(`/rest/v1/rpc/${fn}`, jwt, { method: 'POST', body: JSON.stringify(args) });

const create = async (jwt: string, body: Json) => {
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const role = String(body.role ?? 'agent');
  if (!EMAIL.test(email) || email.length > 254) throw new Fail(400, 'Email no válido.');
  if (!name || name.length > 80) throw new Fail(400, 'El nombre necesita de 1 a 80 caracteres.');
  if (!ROLES.includes(role)) throw new Fail(400, 'Rol desconocido.');
  const pw = passwordProblem(body.password);
  if (pw) throw new Fail(400, pw);

  let created: { id: string };
  try {
    created = await call('/auth/v1/admin/users', 'secret', {
      method: 'POST',
      body: JSON.stringify({ email, password: body.password, email_confirm: true, user_metadata: { name } }),
    }) as { id: string };
  } catch (e) {
    if (e instanceof Fail && e.status === 422 && /already/i.test(e.message)) throw new Fail(409, 'Ya hay un usuario con ese email.');
    throw e;
  }
  // El alta entra como agente (disparador de la base). El rol admin (con sus vistas) y el
  // apunte en la auditoría van con el JWT de quien la pide; si algo falla, se
  // deshace el alta para no dejar a medias a nadie.
  try {
    if (role === 'admin') await rpc(jwt, 'platform_update_user', { p_user: created.id, p_role: 'admin' });
    await rpc(jwt, 'platform_record_user_event', { p_action: 'user.create', p_user: created.id, p_email: email });
  } catch (e) {
    await call(`/auth/v1/admin/users/${created.id}`, 'secret', { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return { user: { id: created.id, email, name, role } };
};

const targetOf = async (body: Json, meId: string, verb: string) => {
  const id = String(body.id ?? '');
  if (!UUID.test(id)) throw new Fail(400, 'Usuario no válido.');
  if (id === meId && verb === 'delete') throw new Fail(403, 'No puedes borrar tu propio usuario.');
  const u = await call(`/auth/v1/admin/users/${id}`, 'secret').catch((e) => {
    throw e instanceof Fail && e.status === 404 ? new Fail(404, 'Ese usuario no existe.') : e;
  }) as { id: string; email?: string };
  return { id, email: u.email ?? '' };
};

const remove = async (jwt: string, meId: string, body: Json) => {
  const t = await targetOf(body, meId, 'delete');
  await call(`/auth/v1/admin/users/${t.id}`, 'secret', { method: 'DELETE' });
  await rpc(jwt, 'platform_record_user_event', { p_action: 'user.delete', p_user: t.id, p_email: t.email });
  return { ok: true };
};

const setPassword = async (jwt: string, meId: string, body: Json) => {
  const pw = passwordProblem(body.password);
  if (pw) throw new Fail(400, pw);
  const t = await targetOf(body, meId, 'set_password');
  await call(`/auth/v1/admin/users/${t.id}`, 'secret', { method: 'PUT', body: JSON.stringify({ password: body.password }) });
  await rpc(jwt, 'platform_record_user_event', { p_action: 'user.password', p_user: t.id, p_email: t.email });
  return { ok: true };
};

Deno.serve(async (req) => {
  try {
    if (!URL_BASE || !PUBLISHABLE || !SECRET) throw new Fail(500, 'Función sin configurar (faltan secretos).');
    if (req.method !== 'POST') throw new Fail(405, 'Método no permitido.');
    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!jwt) throw new Fail(401, 'Inicia sesión.');
    let body: Json;
    try {
      body = await req.json();
    } catch {
      throw new Fail(400, 'Petición no válida.');
    }

    // quién llama (su JWT) y si gestiona Personas (lo decide la base)
    const me = await call('/auth/v1/user', jwt).catch(() => {
      throw new Fail(401, 'Sesión no válida.');
    }) as { id: string };
    const allowed = await rpc(jwt, 'platform_can_manage_users', {}).catch(() => false);
    if (allowed !== true) throw new Fail(403, 'Solo quien gestiona Personas puede hacer esto.');

    switch (body.action) {
      case 'create':
        return reply(200, await create(jwt, body));
      case 'delete':
        return reply(200, await remove(jwt, me.id, body));
      case 'set_password':
        return reply(200, await setPassword(jwt, me.id, body));
      default:
        throw new Fail(400, 'Acción desconocida.');
    }
  } catch (e) {
    if (e instanceof Fail) return reply(e.status, { error: e.message });
    console.error('sia-users:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'Error interno.' });
  }
});
