-- ════════════════════════════════════════════════════════════════════════
--  SIA · Base de la INSTANCIA (usuarios, roles y acceso al conocimiento)
-- ════════════════════════════════════════════════════════════════════════
--  Una instancia de SIA = un cliente = un proyecto Supabase propio, con UNA
--  base de conocimiento contra la que trabaja todo el mundo. Se
--  ejecuta entero en el SQL Editor de ese proyecto. Es re-ejecutable: no
--  borra datos (salvo la estructura multicliente anterior, ver paso 0).
--
--  Modelo
--    roles              perfiles de vistas con nombre (Administrador, Agente y los
--                       que se creen): asignar uno pone sus vistas; editarlo las
--                       cambia a todos los que lo tienen
--    users              las personas (1:1 con auth.users de Supabase Auth), su rol
--                       (o ninguno: vistas personalizadas) y sus vistas
--    knowledge_bases    la base de conocimiento de la instancia (otro proyecto
--                       Supabase): una sola, y la ven todas las personas. Se
--                       fija desde el SQL Editor (platform.set_knowledge_base)
--    knowledge_grants   qué grupos (tokens) de la base tiene cada usuario: el RAG que ve
--    person_keys        la clave de poder de cada persona en la base (en Vault),
--                       con solo los permisos de sus vistas (Laboratorio,
--                       Enlaces). La crea en la base el bridge de quien gestiona
--                       Personas; el de la persona la usa. Quien tiene
--                       Administración usa la del dueño de la base.
--    audit_log          registro de todo cambio (solo se añade, nunca se edita)
--    issue_claims       quién tiene cada issue en SIA (una fila por issue: la cola)
--    issue_events       histórico de cada issue: cogida, devuelta a la cola,
--                       traspasada o asignada desde el Backlog, quién lo hizo y de quién a quién
--    issue_notes        notas internas del equipo sobre una issue (editables por
--                       quien las escribió); el comentario de un traspaso queda
--                       como nota etiquetada «transfer»
--    priority_rules     reglas de priorización del backlog: un nombre y una lista
--                       ordenada de criterios (el catálogo, en platform.known_criteria()).
--                       La básica viene de serie (builtin): se ajusta, no se borra
--
--  Vistas: lo que cada persona puede ver y hacer en SIA (el Chat, siempre).
--  La lista está en platform.known_views().
--    issues     Issues: el gestor de incidencias de soporte
--    backlog    Backlog: la cola del equipo (lo que nadie tiene aún), para quien reparte
--    work       Panel de trabajo: métricas de los empleados
--    metrics    Métricas: OKRs, KPIs y otros indicadores
--    links      Enlaces rápidos
--    lab        Laboratorio de skills
--    admin      Administración del contenido de las bases (grupos, proyectos, enlaces)
--    people     Personas: altas, bajas, vistas y conocimiento de cada una
--  Roles: un nombre y unas vistas. Asignar uno pone sus vistas; editarlo las
--  cambia a todos los que lo tienen; tocar una vista de alguien lo deja con
--  vistas personalizadas (sin rol). Dos vienen de serie:
--    Administrador  todas, fijo. El primero se nombra desde el SQL Editor
--                   (platform.grant_admin).
--    Agente         Enlaces (editable, no se borra). Es el rol de toda alta.
--
--  Seguridad
--    · Las tablas viven en el esquema privado `platform`, que la Data API NO
--      expone: ni anon ni authenticated pueden leerlas ni escribirlas.
--      Además tienen RLS activado sin políticas (denegar todo).
--    · La app solo llama a funciones public.platform_* (RPC). Son SECURITY
--      DEFINER con search_path vacío y nombres cualificados, comprueban quién
--      llama (auth.uid()) y sus vistas antes de nada, y solo las puede ejecutar
--      el rol authenticated (anon, no).
--    · Nadie cambia su propio rol ni sus vistas, ni edita el rol que tiene, ni
--      se desactiva: siempre queda alguien con Personas.
--    · Un usuario desactivado no pasa ninguna comprobación.
--    · Los tokens de grupo solo se devuelven enteros a su titular; a los
--      admins, como huella (sha256). Las claves secret de Supabase se rechazan.
--    · La clave del dueño de la base (para leer sus grupos y dar claves) se
--      guarda cifrada en Supabase Vault y solo la recibe el bridge de quien
--      gestiona Personas o tiene Administración.
--    · Desactivar a alguien o ponerle contraseña nueva cierra sus sesiones; una
--      contraseña puesta por otro hay que cambiarla al entrar.
--    · El alta, la baja y el cambio de contraseña de personas en Supabase Auth
--      NO se hacen aquí: los hace la Edge Function sia-users (necesita la
--      clave secret, que SIA no tiene nunca), que antes pregunta a
--      platform_can_manage_users y después lo apunta con platform_record_user_event.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Esquema privado ───────────────────────────────────────────────────────
create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;

-- Las vistas que existen (una más = añadirla aquí, en server/auth/views.js y
-- en web/src/users/views.js). Administrador las tiene siempre todas.
create or replace function platform.known_views() returns text[]
language sql immutable set search_path = '' as $$
  select array['issues', 'backlog', 'metrics', 'service', 'links', 'lab', 'admin', 'people']
$$;

-- Los criterios con que se ordena el backlog. Una regla de priorización es una
-- lista ordenada de ellos; qué hace cada uno, en server/issues/queue.js.
create or replace function platform.known_criteria() returns text[]
language sql immutable set search_path = '' as $$
  select array['recent', 'prio', 'month', 'severity', 'critical', 'high', 'medium', 'low', 'age', 'sisu', 'sga']
$$;

-- ── Tablas ────────────────────────────────────────────────────────────────
create table if not exists platform.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  views       text[] not null default '{}' constraint roles_views_known check (views <@ platform.known_views()),
  builtin     text unique check (builtin in ('admin', 'agent')),  -- los de serie
  created_at  timestamptz not null default now()
);
create unique index if not exists roles_name on platform.roles (lower(name));
insert into platform.roles (name, views, builtin) values
  ('Administrador', platform.known_views(), 'admin'),
  ('Agente', array['links'], 'agent')
on conflict (builtin) do nothing;

create table if not exists platform.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  role_id     uuid references platform.roles (id) on delete set null,  -- null: vistas personalizadas
  views       text[] not null default array['links'] constraint users_views_known check (views <@ platform.known_views()),
  active      boolean not null default true,
  must_change_password boolean not null default false,  -- la puso otra persona: cambiarla al entrar
  created_at  timestamptz not null default now()
);
create unique index if not exists users_email on platform.users (email);

create table if not exists platform.knowledge_bases (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  -- solo proyectos Supabase: https://<ref de 20 letras>.supabase.co
  url              text not null unique check (url ~ '^https://[a-z]{20}\.supabase\.co$'),
  -- solo la clave publishable; la secret (sb_secret_…, service_role) nunca
  publishable_key  text not null check (publishable_key ~ '^sb_publishable_[A-Za-z0-9_-]{16,200}$'),
  power_secret     uuid,  -- la clave del dueño, en Supabase Vault
  created_at       timestamptz not null default now()
);

create table if not exists platform.knowledge_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references platform.users (id) on delete cascade,
  base_id      uuid not null references platform.knowledge_bases (id) on delete cascade,
  group_name   text not null check (char_length(btrim(group_name)) between 1 and 80),
  -- viaja en la cabecera x-sia-tokens: ASCII visible y sin comas
  group_token  text not null check (group_token ~ '^[\x21-\x7e]{8,200}$' and strpos(group_token, ',') = 0),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  unique (user_id, base_id, group_token)
);
create index if not exists grants_base on platform.knowledge_grants (base_id);
-- Una sola base de conocimiento por instancia.
create unique index if not exists knowledge_bases_single on platform.knowledge_bases ((true));

create table if not exists platform.person_keys (
  user_id       uuid not null references platform.users (id) on delete cascade,
  base_id       uuid not null references platform.knowledge_bases (id) on delete cascade,
  power_secret  uuid not null,
  primary key (user_id, base_id)
);

create table if not exists platform.audit_log (
  id           bigint generated always as identity primary key,
  happened_at  timestamptz not null default now(),
  actor        uuid,                 -- null: hecho desde el SQL Editor
  action       text not null,
  target_user  uuid,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists audit_happened on platform.audit_log (happened_at desc);

-- Issues cogidas desde SIA: una issue, una persona. La clave primaria es la
-- cola: si dos piden a la vez, solo una se la lleva.
create table if not exists platform.issue_claims (
  issue_id    text primary key check (issue_id ~ '^INC[0-9]+$'),
  user_id     uuid not null references platform.users (id) on delete cascade,
  claimed_at  timestamptz not null default now()
);

-- Histórico de cada issue en SIA: quién la cogió, la devolvió a la cola o la
-- traspasó, y a quién. Solo se añade. Si se borra a una persona, sus
-- movimientos se quedan (sin nombre).
create table if not exists platform.issue_events (
  id           bigint generated always as identity primary key,
  issue_id     text not null check (issue_id ~ '^INC[0-9]+$'),
  action       text not null check (action in ('claimed', 'released', 'transferred', 'assigned')),
  actor        uuid references platform.users (id) on delete set null,      -- quién lo hizo
  from_user    uuid references platform.users (id) on delete set null,      -- quién la tenía
  to_user      uuid references platform.users (id) on delete set null,      -- quién la tiene ahora
  note_id      bigint,                                                        -- en un traspaso, la nota con el motivo
  happened_at  timestamptz not null default now()
);
create index if not exists issue_events_issue on platform.issue_events (issue_id, happened_at);
alter table platform.issue_events add column if not exists note_id bigint;

-- Notas internas del equipo sobre una issue. Las ve todo Issues; las edita
-- quien las escribió (el plazo para editarlas lo pone la web). `kind` las
-- etiqueta: 'note' (escrita a mano) o 'transfer' (el motivo de un traspaso).
create table if not exists platform.issue_notes (
  id          bigint generated always as identity primary key,
  issue_id    text not null check (issue_id ~ '^INC[0-9]+$'),
  author      uuid references platform.users (id) on delete set null,
  kind        text not null default 'note' check (kind in ('note', 'transfer')),
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
alter table platform.issue_events drop constraint if exists issue_events_note_fk;
alter table platform.issue_events add constraint issue_events_note_fk foreign key (note_id) references platform.issue_notes (id) on delete set null;
-- traspasos anteriores a note_id: su nota es la 'transfer' del mismo autor e instante
update platform.issue_events e set note_id = n.id from platform.issue_notes n
  where e.action = 'transferred' and e.note_id is null and n.issue_id = e.issue_id and n.kind = 'transfer' and n.author is not distinct from e.actor and n.created_at = e.happened_at;
create index if not exists issue_notes_issue on platform.issue_notes (issue_id, created_at);

create table if not exists platform.priority_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 1 and 60),
  criteria    text[] not null constraint rules_criteria_known check (criteria <@ platform.known_criteria() and cardinality(criteria) >= 1),
  builtin     boolean not null default false,  -- la regla básica: se ajusta, no se borra
  created_by  uuid references platform.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table platform.priority_rules add column if not exists builtin boolean not null default false; -- bases montadas antes de la básica de serie
create unique index if not exists priority_rules_builtin on platform.priority_rules (builtin) where builtin;

-- la acción 'assigned' llegó después: la restricción de las bases ya montadas se renueva
alter table platform.issue_events drop constraint if exists issue_events_action_check;
alter table platform.issue_events add constraint issue_events_action_check check (action in ('claimed', 'released', 'transferred', 'assigned'));
-- La regla básica, la del equipo, de serie (si no está ya)
insert into platform.priority_rules (name, criteria, builtin)
  select 'Regla básica', array['recent', 'prio', 'month', 'severity', 'age'], true
  where not exists (select 1 from platform.priority_rules where builtin);

-- Administrador, con todas las vistas que haya (también las que se añadan)
-- Equipo soporte pasó a ser una pestaña de Métricas: su vista («work») ya no existe y no da acceso a nada.
update platform.roles set views = array_remove(views, 'work') where 'work' = any (views);
update platform.users set views = array_remove(views, 'work') where 'work' = any (views);
update platform.roles set views = platform.known_views() where builtin = 'admin' and views is distinct from platform.known_views();
update platform.users u set views = r.views from platform.roles r where r.builtin = 'admin' and u.role_id = r.id and u.views is distinct from r.views;

-- RLS activado y sin políticas en todas: nadie fuera de las funciones.
alter table platform.users            enable row level security;
alter table platform.knowledge_bases  enable row level security;
alter table platform.knowledge_grants enable row level security;
alter table platform.audit_log        enable row level security;
alter table platform.person_keys      enable row level security;
alter table platform.roles            enable row level security;
alter table platform.issue_claims     enable row level security;
alter table platform.issue_events     enable row level security;
alter table platform.issue_notes      enable row level security;
alter table platform.priority_rules  enable row level security;
revoke all on all tables in schema platform from public, anon, authenticated;
revoke all on all sequences in schema platform from public, anon, authenticated;

-- El registro de auditoría no se edita ni se borra.
create or replace function platform.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El registro de auditoría no se puede modificar.' using errcode = '42501';
end $$;
drop trigger if exists audit_log_immutable on platform.audit_log;
create trigger audit_log_immutable before update or delete on platform.audit_log
  for each row execute function platform.audit_log_immutable();

-- La clave de una persona sale de Vault con su fila (también al borrar a la
-- persona o la base).
create or replace function platform.person_key_forget() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.power_secret;
  return old;
end $$;
drop trigger if exists person_key_forget on platform.person_keys;
create trigger person_key_forget after delete on platform.person_keys
  for each row execute function platform.person_key_forget();

-- ── Alta en Supabase Auth → fila en platform.users (siempre con el rol Agente) ──
-- El nombre llega en user_metadata.name (lo pone la Edge Function de alta).
create or replace function platform.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    raise exception 'Los usuarios de SIA necesitan email.' using errcode = '23502';
  end if;
  insert into platform.users (id, email, name, role_id, views)
  select new.id, lower(new.email),
         left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80),
         r.id, r.views
  from platform.roles r where r.builtin = 'agent'
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists sia_on_auth_user_created on auth.users;
create trigger sia_on_auth_user_created after insert on auth.users
  for each row execute function platform.on_auth_user_created();

create or replace function platform.on_auth_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update platform.users set email = lower(new.email) where id = new.id;
  return new;
end $$;
drop trigger if exists sia_on_auth_user_email on auth.users;
create trigger sia_on_auth_user_email after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function platform.on_auth_user_email();

-- Personas que ya estaban en Authentication antes de este SQL: su fila.
insert into platform.users (id, email, name, role_id, views)
select a.id, lower(a.email),
       left(coalesce(nullif(btrim(a.raw_user_meta_data ->> 'name'), ''), split_part(a.email, '@', 1)), 80),
       r.id, r.views
from auth.users a cross join platform.roles r
where a.email is not null and r.builtin = 'agent'
on conflict (id) do nothing;

-- ── Comprobaciones internas (no expuestas) ────────────────────────────────
-- Quién llama, si existe y está activo; si no, null.
create or replace function platform.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select u.id from platform.users u where u.id = auth.uid() and u.active
$$;

create or replace function platform.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare v_me uuid := platform.current_user_id();
begin
  if v_me is null then
    raise exception 'Sesión no válida o cuenta desactivada.' using errcode = '42501';
  end if;
  return v_me;
end $$;

-- ¿Tiene alguna de esas vistas? (y está activo)
create or replace function platform.can(p_user uuid, p_views text[]) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select u.views && p_views from platform.users u where u.id = p_user and u.active), false)
$$;

create or replace function platform.require_view(variadic p_views text[]) returns uuid
language plpgsql stable set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  if not platform.can(v_me, p_views) then
    raise exception 'No tienes acceso a esto.' using errcode = '42501';
  end if;
  return v_me;
end $$;

create or replace function platform.audit(p_actor uuid, p_action text, p_target uuid, p_details jsonb default '{}'::jsonb) returns void
language sql set search_path = '' as $$
  insert into platform.audit_log (actor, action, target_user, details)
  values (p_actor, p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;

-- Huella de un token de grupo: identifica el grupo ante la web sin enseñar el token.
create or replace function platform.token_id(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Cierra todas las sesiones de alguien (al desactivarlo o ponerle contraseña nueva).
create or replace function platform.revoke_sessions(p_user uuid) returns void
language sql set search_path = '' as $$
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
$$;

-- Guarda (o cambia) en Vault la clave de poder de una base.
create or replace function platform.store_power(p_base uuid, p_key text) returns void
language plpgsql set search_path = '' as $$
declare v_secret uuid;
begin
  if p_key is null or p_key !~ '^[\x21-\x7e]{8,200}$' or strpos(p_key, ',') > 0 then
    raise exception 'Clave de poder no válida (8-200 caracteres visibles, sin comas).' using errcode = '22023';
  end if;
  select b.power_secret into v_secret from platform.knowledge_bases b where b.id = p_base;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, 'sia-base-' || p_base::text, 'Clave de poder (Administración) de una base de conocimiento de SIA');
    update platform.knowledge_bases set power_secret = v_secret where id = p_base;
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
end $$;

-- Primer administrador: SOLO desde el SQL Editor (este esquema no es accesible desde la API).
create or replace function platform.grant_admin(p_email text) returns void
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update platform.users u set role_id = r.id, views = r.views, active = true
    from platform.roles r where r.builtin = 'admin' and u.email = lower(btrim(p_email)) returning u.id into v_id;
  if v_id is null then
    raise exception 'No hay ningún usuario con email %. Créalo antes en Authentication → Users.', p_email;
  end if;
  perform platform.audit(null, 'admin.grant', v_id);
end $$;

-- La base de conocimiento de la instancia: SOLO desde el SQL Editor. Con la
-- clave publishable del proyecto y la clave del dueño (la que va en su SQL).
-- Otra URL es otra base: la anterior se va con lo asignado y las claves.
create or replace function platform.set_knowledge_base(p_name text, p_url text, p_publishable_key text, p_owner_key text) returns uuid
language plpgsql set search_path = '' as $$
declare v_key text := btrim(p_publishable_key);
        v_url text := rtrim(lower(btrim(p_url)), '/');
        v_id uuid;
begin
  -- la secret salta todas las políticas de la base: ni se acepta ni se guarda
  if v_key ~* '^sb_secret_' or v_key ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Esa no es la clave publishable. SIA solo admite sb_publishable_… (Project Settings → API Keys).' using errcode = '22023';
  end if;
  delete from platform.knowledge_bases where url <> v_url; -- su clave sale de Vault con ella
  insert into platform.knowledge_bases (name, url, publishable_key)
  values (btrim(p_name), v_url, v_key)
  on conflict (url) do update set name = excluded.name, publishable_key = excluded.publishable_key
  returning id into v_id;
  perform platform.store_power(v_id, btrim(p_owner_key));
  perform platform.audit(null, 'base.set', null, jsonb_build_object('base', v_id, 'name', btrim(p_name), 'url', v_url));
  return v_id;
exception
  when check_violation then raise exception 'Datos no válidos: nombre (1-60), URL https://<ref>.supabase.co y clave sb_publishable_….' using errcode = '23514';
end $$;

-- La clave de una base sale de Vault con ella.
create or replace function platform.base_forget() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.power_secret;
  return old;
end $$;
drop trigger if exists base_forget on platform.knowledge_bases;
create trigger base_forget after delete on platform.knowledge_bases
  for each row execute function platform.base_forget();

revoke all on all functions in schema platform from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  API para la app (RPC). Todas exigen sesión; anon no puede llamarlas.
-- ════════════════════════════════════════════════════════════════════════

-- Quién soy (y si tengo que cambiar la contraseña antes de seguir).
create or replace function public.platform_whoami() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  return (select jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', coalesce(r.name, 'Personalizado'), 'views', to_jsonb(u.views), 'must_change_password', u.must_change_password)
          from platform.users u left join platform.roles r on r.id = u.role_id where u.id = v_me);
end $$;

-- Ya he cambiado la contraseña que me puso un admin.
create or replace function public.platform_password_changed() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  update platform.users set must_change_password = false where id = v_me;
  perform platform.audit(v_me, 'user.password_changed', v_me);
end $$;

-- Mi conocimiento: bases y tokens de grupo asignados (con el token entero:
-- es lo que SIA manda a la base) y mi clave de poder en ella: con
-- Administración, la del dueño; si no, la mía (si tengo). La base la ve todo
-- el mundo: sin grupos, una fila con el grupo vacío.
drop function if exists public.platform_my_knowledge();
create function public.platform_my_knowledge()
returns table (base_id uuid, base_name text, url text, publishable_key text, group_name text, group_token text, power_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_user();
begin
  return query
    select b.id, b.name, b.url, b.publishable_key, g.group_name, g.group_token,
           case when platform.can(v_me, array['admin']) then o.decrypted_secret else d.decrypted_secret end
    from platform.knowledge_bases b
    left join platform.knowledge_grants g on g.base_id = b.id and g.user_id = v_me
    left join platform.person_keys k on k.user_id = v_me and k.base_id = b.id
    left join vault.decrypted_secrets d on d.id = k.power_secret
    left join vault.decrypted_secrets o on o.id = b.power_secret
    order by b.name, g.group_name;
end $$;

-- ── Usuarios ──────────────────────────────────────────────────────────────
-- Con su último acceso y su conocimiento: por base, sus grupos (nombre y
-- huella del token, nunca el token).
drop function if exists public.platform_list_users();
create function public.platform_list_users()
returns table (id uuid, email text, name text, role_id uuid, role_name text, views text[], active boolean, must_change_password boolean,
               last_sign_in_at timestamptz, created_at timestamptz, knowledge jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select u.id, u.email, u.name, u.role_id, r.name, u.views, u.active, u.must_change_password, a.last_sign_in_at, u.created_at,
           coalesce((select jsonb_agg(jsonb_build_object('base_id', k.base_id, 'groups', k.groups) order by k.base_id)
                     from (select g.base_id,
                                  jsonb_agg(jsonb_build_object('id', platform.token_id(g.group_token), 'name', g.group_name) order by g.group_name) as groups
                           from platform.knowledge_grants g where g.user_id = u.id group by g.base_id) k), '[]'::jsonb)
    from platform.users u left join auth.users a on a.id = u.id left join platform.roles r on r.id = u.role_id
    order by u.name;
end $$;

-- ¿Puedo dar de alta o de baja personas? (lo usa la Edge Function antes de
-- tocar Supabase Auth)
create or replace function public.platform_can_manage_users() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return platform.can(platform.require_user(), array['people']);
end $$;

-- Cada uno cambia su nombre. Quien tiene Personas cambia además el nombre,
-- el rol, las vistas y si está activo de los demás, pero nunca lo suyo
-- (siempre queda alguien con Personas). Un rol pone sus vistas; unas vistas
-- sueltas dejan a la persona sin rol (personalizado). Desactivar cierra sus
-- sesiones.
create or replace function public.platform_update_user(p_user uuid, p_name text default null, p_role uuid default null,
                                                       p_active boolean default null, p_views text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
        v_people boolean := platform.can(v_me, array['people']);
        v_views text[];
begin
  if p_user <> v_me and not v_people then
    raise exception 'Solo quien gestiona Personas cambia los datos de otros.' using errcode = '42501';
  end if;
  if (p_role is not null or p_active is not null or p_views is not null) and not v_people then
    raise exception 'Solo quien gestiona Personas cambia roles, vistas o activa y desactiva.' using errcode = '42501';
  end if;
  if p_user = v_me and (p_role is not null or p_active is not null or p_views is not null) then
    raise exception 'No puedes cambiar tu propio rol ni tus vistas ni desactivarte.' using errcode = '42501';
  end if;
  if p_role is not null then
    select r.views into v_views from platform.roles r where r.id = p_role;
    if v_views is null then raise exception 'Ese rol no existe.' using errcode = 'P0002'; end if;
  elsif p_views is not null then
    v_views := array(select distinct v from unnest(p_views) v order by v);
    if not (v_views <@ platform.known_views()) then raise exception 'Vista desconocida.' using errcode = '22023'; end if;
  end if;
  update platform.users
     set name = coalesce(nullif(btrim(p_name), ''), name),
         role_id = case when p_role is not null then p_role when p_views is not null then null else role_id end,
         views = coalesce(v_views, views),
         active = coalesce(p_active, active)
   where id = p_user;
  if not found then raise exception 'Ese usuario no existe.' using errcode = 'P0002'; end if;
  if p_active = false then perform platform.revoke_sessions(p_user); end if;
  perform platform.audit(v_me, 'user.update', p_user,
    jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(p_name), ''), 'role', p_role, 'views', to_jsonb(v_views), 'active', p_active)));
exception
  when check_violation then raise exception 'Nombre no válido (1-80 caracteres).' using errcode = '23514';
end $$;

-- ── Roles ─────────────────────────────────────────────────────────────────
-- Con cuántas personas lo tienen. Primero los de serie.
create or replace function public.platform_list_roles()
returns table (id uuid, name text, views text[], builtin text, people bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select r.id, r.name, r.views, r.builtin, (select count(*) from platform.users u where u.role_id = r.id)
    from platform.roles r
    order by r.builtin nulls last, r.builtin, lower(r.name);
end $$;

-- Crear (p_role null) o cambiar un rol. Cambiarlo cambia las vistas de todos
-- los que lo tienen. Administrador no se toca, ni el rol que tiene uno mismo.
create or replace function public.platform_save_role(p_role uuid, p_name text, p_views text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
        v_views text[] := array(select distinct v from unnest(coalesce(p_views, '{}')) v order by v);
        v_builtin text;
        v_id uuid;
begin
  if not (v_views <@ platform.known_views()) then raise exception 'Vista desconocida.' using errcode = '22023'; end if;
  if p_role is null then
    insert into platform.roles (name, views) values (btrim(p_name), v_views) returning id into v_id;
    perform platform.audit(v_me, 'role.create', null, jsonb_build_object('role', v_id, 'name', btrim(p_name), 'views', to_jsonb(v_views)));
    return v_id;
  end if;
  select r.builtin into v_builtin from platform.roles r where r.id = p_role;
  if not found then raise exception 'Ese rol no existe.' using errcode = 'P0002'; end if;
  if v_builtin = 'admin' then raise exception 'Administrador tiene todas las vistas y no se cambia.' using errcode = '42501'; end if;
  if exists (select 1 from platform.users u where u.id = v_me and u.role_id = p_role) then
    raise exception 'No puedes cambiar el rol que tienes tú.' using errcode = '42501';
  end if;
  update platform.roles set name = btrim(p_name), views = v_views where id = p_role;
  update platform.users set views = v_views where role_id = p_role;
  perform platform.audit(v_me, 'role.update', null, jsonb_build_object('role', p_role, 'name', btrim(p_name), 'views', to_jsonb(v_views)));
  return p_role;
exception
  when unique_violation then raise exception 'Ya hay un rol con ese nombre.' using errcode = '23505';
  when check_violation then raise exception 'Nombre no válido (1-40 caracteres).' using errcode = '23514';
end $$;

-- Borrar un rol: quien lo tenía se queda con sus vistas, ya personalizadas.
-- Los de serie no se borran.
create or replace function public.platform_delete_role(p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
        v_builtin text;
begin
  select r.builtin into v_builtin from platform.roles r where r.id = p_role;
  if not found then raise exception 'Ese rol no existe.' using errcode = 'P0002'; end if;
  if v_builtin is not null then raise exception 'Administrador y Agente no se borran.' using errcode = '42501'; end if;
  delete from platform.roles where id = p_role;
  perform platform.audit(v_me, 'role.delete', null, jsonb_build_object('role', p_role));
end $$;

-- Altas, bajas y cambios de contraseña los hace la Edge Function sia-users
-- (con la clave secret, en Supabase Auth); aquí queda constancia en la
-- auditoría, a nombre de quien los pidió. Una contraseña puesta por otro
-- (alta o cambio) hay que cambiarla al entrar; un cambio cierra además
-- sus sesiones abiertas.
create or replace function public.platform_record_user_event(p_action text, p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
begin
  if p_action not in ('user.create', 'user.delete', 'user.password') then
    raise exception 'Evento desconocido.' using errcode = '22023';
  end if;
  if p_action in ('user.create', 'user.password') then
    update platform.users set must_change_password = true where id = p_user;
  end if;
  if p_action = 'user.password' then perform platform.revoke_sessions(p_user); end if;
  perform platform.audit(v_me, p_action, p_user, jsonb_build_object('email', lower(btrim(p_email))));
end $$;

-- ── Base de conocimiento ──────────────────────────────────────────────────
-- La de la instancia (una sola; ninguna si aún no se ha fijado).
drop function if exists public.platform_list_bases();
create function public.platform_list_bases()
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select b.id, b.name from platform.knowledge_bases b;
end $$;

-- Para el bridge de quien gestiona Personas: con qué leer los grupos de la
-- base y dar claves (la del dueño, descifrada). Nunca llega a la web.
create or replace function public.platform_base_access()
returns table (id uuid, url text, publishable_key text, power_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select b.id, b.url, b.publishable_key, d.decrypted_secret
    from platform.knowledge_bases b join vault.decrypted_secrets d on d.id = b.power_secret;
end $$;

-- ── Conocimiento de cada persona ──────────────────────────────────────────
-- Fija qué grupos de una base ve alguien: p_groups = [{ name, token }]; los
-- que no vengan se le quitan. Lista vacía: deja de ver la base.
create or replace function public.platform_set_knowledge(p_user uuid, p_base uuid, p_groups jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
        v_groups jsonb := coalesce(p_groups, '[]'::jsonb);
        v_tokens text[];
begin
  if jsonb_typeof(v_groups) <> 'array' then raise exception 'Grupos no válidos.' using errcode = '22023'; end if;
  if not exists (select 1 from platform.users u where u.id = p_user) then raise exception 'Ese usuario no existe.' using errcode = 'P0002'; end if;
  if not exists (select 1 from platform.knowledge_bases b where b.id = p_base) then raise exception 'Esa base no existe.' using errcode = 'P0002'; end if;
  select coalesce(array_agg(btrim(x ->> 'token')), '{}') into v_tokens from jsonb_array_elements(v_groups) x;
  delete from platform.knowledge_grants
   where user_id = p_user and base_id = p_base and not (group_token = any (v_tokens));
  insert into platform.knowledge_grants (user_id, base_id, group_name, group_token, created_by)
  select p_user, p_base, btrim(x ->> 'name'), btrim(x ->> 'token'), v_me from jsonb_array_elements(v_groups) x
  on conflict (user_id, base_id, group_token) do update set group_name = excluded.group_name;
  perform platform.audit(v_me, 'knowledge.set', p_user, jsonb_build_object('base', p_base,
    'groups', (select coalesce(jsonb_agg(btrim(x ->> 'name')), '[]'::jsonb) from jsonb_array_elements(v_groups) x)));
exception
  when check_violation or not_null_violation then raise exception 'Grupo no válido: nombre (1-80) y token (8-200 caracteres visibles, sin comas).' using errcode = '23514';
end $$;

-- «Igual que otra persona»: le quita su conocimiento y le copia el de p_from.
create or replace function public.platform_copy_knowledge(p_user uuid, p_from uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
begin
  if p_user = p_from then raise exception 'Elige a otra persona.' using errcode = '22023'; end if;
  if not exists (select 1 from platform.users u where u.id = p_user)
     or not exists (select 1 from platform.users u where u.id = p_from) then
    raise exception 'Ese usuario no existe.' using errcode = 'P0002';
  end if;
  delete from platform.knowledge_grants where user_id = p_user;
  insert into platform.knowledge_grants (user_id, base_id, group_name, group_token, created_by)
  select p_user, g.base_id, g.group_name, g.group_token, v_me from platform.knowledge_grants g where g.user_id = p_from;
  perform platform.audit(v_me, 'knowledge.copy', p_user, jsonb_build_object('from', p_from));
end $$;

-- ── Claves de poder de cada persona ───────────────────────────────────────
-- Las que hay (para ponerlas al día o quitarlas de las bases): de una persona,
-- de una base o todas.
create or replace function public.platform_person_keys(p_user uuid default null, p_base uuid default null)
returns table (user_id uuid, base_id uuid, power_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select k.user_id, k.base_id, d.decrypted_secret
    from platform.person_keys k join vault.decrypted_secrets d on d.id = k.power_secret
    where (p_user is null or k.user_id = p_user) and (p_base is null or k.base_id = p_base);
end $$;

-- Guarda la clave que se acaba de crear en la base para alguien; null, la olvida.
create or replace function public.platform_set_person_key(p_user uuid, p_base uuid, p_power_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people');
        v_secret uuid;
begin
  if p_power_key is null then
    delete from platform.person_keys where user_id = p_user and base_id = p_base;
  else
    if p_power_key !~ '^[\x21-\x7e]{8,200}$' or strpos(p_power_key, ',') > 0 then
      raise exception 'Clave de poder no válida.' using errcode = '22023';
    end if;
    select k.power_secret into v_secret from platform.person_keys k where k.user_id = p_user and k.base_id = p_base;
    if v_secret is null then
      v_secret := vault.create_secret(p_power_key, 'sia-person-' || p_user::text || '-' || p_base::text, 'Clave de poder de una persona en una base de SIA');
      insert into platform.person_keys (user_id, base_id, power_secret) values (p_user, p_base, v_secret);
    else
      perform vault.update_secret(v_secret, p_power_key);
    end if;
  end if;
  perform platform.audit(v_me, 'person_key.' || case when p_power_key is null then 'remove' else 'set' end, p_user, jsonb_build_object('base', p_base));
exception
  when foreign_key_violation then raise exception 'Esa persona o esa base no existe.' using errcode = 'P0002';
end $$;

-- ── Issues ────────────────────────────────────────────────────────────────
-- Quién ha cogido cada issue desde SIA.
drop function if exists public.platform_issue_claims();
create function public.platform_issue_claims()
returns table (issue_id text, user_id uuid, user_name text, claimed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('issues', 'backlog'); -- el Backlog también mira qué está cogido
  return query
    select c.issue_id, c.user_id, u.name, c.claimed_at
    from platform.issue_claims c join platform.users u on u.id = c.user_id
    order by c.claimed_at;
end $$;

-- Coger la siguiente: la primera de la lista (ya en el orden de la regla)
-- que nadie tenga. Devuelve cuál, o null si no queda ninguna libre.
create or replace function public.platform_claim_next_issue(p_candidates text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('issues'); v_id text; v_got text;
begin
  foreach v_id in array coalesce(p_candidates[1:500], array[]::text[]) loop
    insert into platform.issue_claims (issue_id, user_id) values (v_id, v_me)
      on conflict (issue_id) do nothing returning issue_id into v_got;
    if v_got is not null then
      insert into platform.issue_events (issue_id, action, actor, to_user) values (v_got, 'claimed', v_me, v_me);
      return v_got;
    end if;
  end loop;
  return null;
end $$;

-- Devolverla a la cola (solo la propia).
create or replace function public.platform_release_issue(p_issue text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('issues');
begin
  delete from platform.issue_claims where issue_id = p_issue and user_id = v_me;
  if not found then raise exception 'Esa issue no es tuya.' using errcode = '42501'; end if;
  insert into platform.issue_events (issue_id, action, actor, from_user) values (p_issue, 'released', v_me, v_me);
end $$;

-- Traspasarla a un compañero (solo la propia, y solo a alguien activo con la
-- vista Issues). Pasa a ser suya desde ahora. Un traspaso se justifica: el
-- motivo es obligatorio y queda como nota de la issue etiquetada 'transfer'.
drop function if exists public.platform_transfer_issue(text, uuid, text);
create function public.platform_transfer_issue(p_issue text, p_to uuid, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('issues'); v_note bigint;
begin
  if p_to is null then raise exception 'Elige a qué compañero traspasarla.' using errcode = '22023'; end if;
  if p_to = v_me then raise exception 'No puedes traspasarte una issue a ti mismo.' using errcode = '22023'; end if;
  if nullif(btrim(p_comment), '') is null then raise exception 'Escribe el motivo del traspaso.' using errcode = '22023'; end if;
  if char_length(btrim(p_comment)) > 4000 then raise exception 'El motivo admite hasta 4.000 caracteres.' using errcode = '22023'; end if;
  if not exists (select 1 from platform.users u where u.id = p_to and u.active and 'issues' = any (u.views)) then
    raise exception 'Esa persona no está en Issues.' using errcode = 'P0002';
  end if;
  update platform.issue_claims set user_id = p_to, claimed_at = now() where issue_id = p_issue and user_id = v_me;
  if not found then raise exception 'Esa issue no es tuya.' using errcode = '42501'; end if;
  insert into platform.issue_notes (issue_id, author, kind, body) values (p_issue, v_me, 'transfer', btrim(p_comment)) returning id into v_note;
  insert into platform.issue_events (issue_id, action, actor, from_user, to_user, note_id) values (p_issue, 'transferred', v_me, v_me, p_to, v_note);
end $$;

-- Lo que me han traspasado y aún tengo: de quién viene, cuándo y el motivo
-- (la nota 'transfer' que se escribió en el mismo instante). Para marcarlas
-- en la mesa. Una issue devuelta o traspasada de nuevo ya no sale.
drop function if exists public.platform_my_transfers();
create function public.platform_my_transfers()
returns table (issue_id text, from_name text, happened_at timestamptz, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_view('issues');
begin
  return query
    select e.issue_id, uf.name, e.happened_at, n.body
    from platform.issue_claims c
    join lateral (select * from platform.issue_events x where x.issue_id = c.issue_id order by x.happened_at desc, x.id desc limit 1) e on true
    left join platform.users uf on uf.id = e.from_user
    left join platform.issue_notes n on n.id = e.note_id
    where c.user_id = v_me and e.action = 'transferred' and e.to_user = v_me
    order by e.happened_at;
end $$;

-- El histórico de una issue en SIA: cada movimiento con quién lo hizo y de
-- quién a quién, del más antiguo al más reciente.
drop function if exists public.platform_issue_events(text);
create function public.platform_issue_events(p_issue text)
returns table (id bigint, action text, actor_name text, from_name text, to_name text, happened_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('issues');
  return query
    select e.id, e.action, ua.name, uf.name, ut.name, e.happened_at
    from platform.issue_events e
    left join platform.users ua on ua.id = e.actor
    left join platform.users uf on uf.id = e.from_user
    left join platform.users ut on ut.id = e.to_user
    where e.issue_id = p_issue
    order by e.happened_at, e.id;
end $$;

-- ── Notas internas de una issue ───────────────────────────────────────────
-- Las notas de una issue, de la más antigua a la más reciente.
drop function if exists public.platform_issue_notes(text);
create function public.platform_issue_notes(p_issue text)
returns table (id bigint, author_id uuid, author_name text, kind text, body text, created_at timestamptz, edited_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('issues');
  return query
    select n.id, n.author, u.name, n.kind, n.body, n.created_at, n.edited_at
    from platform.issue_notes n left join platform.users u on u.id = n.author
    where n.issue_id = p_issue
    order by n.created_at, n.id;
end $$;

-- Añadir una nota → su id.
create or replace function public.platform_add_issue_note(p_issue text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('issues'); v_id bigint;
begin
  if p_issue !~ '^INC[0-9]+$' then raise exception 'Esa issue no existe.' using errcode = 'P0002'; end if;
  insert into platform.issue_notes (issue_id, author, body) values (p_issue, v_me, btrim(p_body)) returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'La nota necesita texto, hasta 4.000 caracteres.' using errcode = '22023';
end $$;

-- Editar una nota propia.
create or replace function public.platform_edit_issue_note(p_note bigint, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('issues');
begin
  update platform.issue_notes set body = btrim(p_body), edited_at = now() where id = p_note and author = v_me;
  if not found then raise exception 'Esa nota no es tuya.' using errcode = '42501'; end if;
exception
  when check_violation then raise exception 'La nota necesita texto, hasta 4.000 caracteres.' using errcode = '22023';
end $$;

-- El equipo de Issues: las personas activas con la vista Issues (para
-- traspasar una issue a un compañero).
-- ── Asignar desde el Backlog ──────────────────────────────────────────────
-- La prioridad de una issue es la etiqueta PRIO de Remedy (la pone negocio);
-- SIA no lleva una lista propia. Hubo una (issue_priorities) en una versión
-- intermedia: se retira de las bases que la montaron.
drop function if exists public.platform_issue_priorities();
drop function if exists public.platform_prioritize_issue(text, uuid[]);
drop function if exists public.platform_prioritize_issue(text);
drop function if exists public.platform_unprioritize_issue(text);
drop table if exists platform.issue_priorities;

-- Asignarla a alguien del equipo de Issues: pasa a su mesa como cogida, y en
-- el histórico queda quién la asignó. Si ya la tiene alguien, no.
create or replace function public.platform_assign_issue(p_issue text, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('backlog'); v_holder text;
begin
  if not exists (select 1 from platform.users u where u.id = p_to and u.active and 'issues' = any (u.views)) then
    raise exception 'Solo se asigna a alguien activo con la vista Issues.' using errcode = '22023';
  end if;
  select u.name into v_holder from platform.issue_claims c join platform.users u on u.id = c.user_id where c.issue_id = p_issue;
  if found then raise exception 'Esa issue ya la tiene %.', v_holder using errcode = '23505'; end if;
  insert into platform.issue_claims (issue_id, user_id) values (p_issue, p_to);
  insert into platform.issue_events (issue_id, action, actor, to_user) values (p_issue, 'assigned', v_me, p_to);
exception
  when check_violation then raise exception 'Esa issue no vale.' using errcode = '23514';
end $$;

-- ── Reglas de priorización del backlog ────────────────────────────────────
-- Las ven quienes cogen issues o reparten (Issues, Backlog): un nombre y sus
-- criterios en orden. Las crean, cambian y borran quienes reparten (Backlog).
-- La básica (builtin) va primero; se ajusta como las demás, pero no se borra.
drop function if exists public.platform_list_rules();
create function public.platform_list_rules()
returns table (id uuid, name text, criteria text[], builtin boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('issues', 'backlog');
  return query
    select r.id, r.name, r.criteria, r.builtin
    from platform.priority_rules r
    order by r.builtin desc, lower(r.name);
end $$;

-- Crear (p_rule null) o cambiar una regla. Los criterios, del catálogo y sin repetir.
create or replace function public.platform_save_rule(p_rule uuid, p_name text, p_criteria text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('backlog'); v_id uuid;
begin
  if coalesce(cardinality(p_criteria), 0) = 0 then raise exception 'Una regla necesita al menos un criterio.' using errcode = '22023'; end if;
  if not (p_criteria <@ platform.known_criteria()) then raise exception 'Criterio desconocido.' using errcode = '22023'; end if;
  if (select count(distinct c) from unnest(p_criteria) c) <> cardinality(p_criteria) then raise exception 'Un criterio no se repite.' using errcode = '22023'; end if;
  if p_rule is null then
    insert into platform.priority_rules (name, criteria, created_by) values (btrim(p_name), p_criteria, v_me) returning id into v_id;
    perform platform.audit(v_me, 'rule.create', null, jsonb_build_object('rule', v_id, 'name', btrim(p_name), 'criteria', to_jsonb(p_criteria)));
    return v_id;
  end if;
  update platform.priority_rules set name = btrim(p_name), criteria = p_criteria, updated_at = now() where id = p_rule;
  if not found then raise exception 'Esa regla no existe.' using errcode = 'P0002'; end if;
  perform platform.audit(v_me, 'rule.update', null, jsonb_build_object('rule', p_rule, 'name', btrim(p_name), 'criteria', to_jsonb(p_criteria)));
  return p_rule;
exception
  when unique_violation then raise exception 'Ya hay una regla con ese nombre.' using errcode = '23505';
  when check_violation then raise exception 'Nombre no válido (1-60 caracteres).' using errcode = '23514';
end $$;

create or replace function public.platform_delete_rule(p_rule uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('backlog');
begin
  if exists (select 1 from platform.priority_rules r where r.id = p_rule and r.builtin) then
    raise exception 'La regla básica no se borra; ajústala.' using errcode = '42501';
  end if;
  delete from platform.priority_rules where id = p_rule;
  if not found then raise exception 'Esa regla no existe.' using errcode = 'P0002'; end if;
  perform platform.audit(v_me, 'rule.delete', null, jsonb_build_object('rule', p_rule));
end $$;

drop function if exists public.platform_issue_teammates();
create function public.platform_issue_teammates()
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('issues', 'backlog'); -- el Backlog también, para asignar
  return query select u.id, u.name from platform.users u where u.active and 'issues' = any (u.views) order by u.name;
end $$;

-- Mi historial en SIA desde una fecha (con él se miden las métricas de cada
-- persona): claimed (la cogí), released (la devolví), received (me la
-- traspasaron: desde entonces es mía) y handed (la traspasé: dejó de serlo).
drop function if exists public.platform_my_issue_events(timestamptz);
create function public.platform_my_issue_events(p_since timestamptz)
returns table (issue_id text, action text, happened_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_view('issues');
begin
  return query
    select e.issue_id,
      case when e.action = 'assigned' then 'received'  -- asignada desde el Backlog: mía desde entonces, como un traspaso recibido
           when e.action <> 'transferred' then e.action when e.to_user = v_me then 'received' else 'handed' end,
      e.happened_at
    from platform.issue_events e
    where e.happened_at >= p_since
      and ((e.action = 'claimed' and e.to_user = v_me) or (e.action = 'released' and e.from_user = v_me)
        or (e.action = 'assigned' and e.to_user = v_me)
        or (e.action = 'transferred' and (e.to_user = v_me or e.from_user = v_me)))
    order by e.happened_at, e.id;
end $$;

-- Los movimientos de issues que se apuntaron en la auditoría antes de existir
-- issue_events pasan al histórico, una sola vez: solo los anteriores al primer
-- movimiento ya registrado (los posteriores están en las dos y no se repiten).
-- Si quien lo hizo ya no existe en users, el movimiento queda sin persona.
insert into platform.issue_events (issue_id, action, actor, from_user, to_user, happened_at)
select a.details ->> 'issue', substr(a.action, 7), u.id,
  case when a.action = 'issue.released' then u.id end, case when a.action = 'issue.claimed' then u.id end, a.happened_at
from platform.audit_log a
left join platform.users u on u.id = a.actor
where a.action in ('issue.claimed', 'issue.released') and (a.details ->> 'issue') ~ '^INC[0-9]+$'
  and a.happened_at < coalesce((select min(e.happened_at) from platform.issue_events e), 'infinity'::timestamptz)
order by a.happened_at, a.id;

-- ── Auditoría ─────────────────────────────────────────────────────────────
create or replace function public.platform_list_audit(p_limit int default 100)
returns table (happened_at timestamptz, actor_name text, action text, target_name text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select a.happened_at, ua.name, a.action, ut.name, a.details
    from platform.audit_log a
    left join platform.users ua on ua.id = a.actor
    left join platform.users ut on ut.id = a.target_user
    order by a.happened_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- ── Permisos de ejecución ─────────────────────────────────────────────────
-- Supabase da EXECUTE por defecto a anon en public: se quita a todo y se
-- concede solo a authenticated, función a función.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'platform\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════
--  Base de conocimiento (una sola vez, o para cambiarla), con el SQL de SIA ya
--  ejecutado en ese otro proyecto:
--       select platform.set_knowledge_base('Nombre', 'https://<ref>.supabase.co',
--                                          'sb_publishable_…', '<clave del dueño>');
--
--  Primer administrador (una sola vez):
--    1. Si aún no existe: Authentication → Users → Add user → email +
--       contraseña robusta, marcando «Auto Confirm User».
--    2. Aquí mismo, en el SQL Editor:
--         select platform.grant_admin('tu-email@empresa.com');
-- ════════════════════════════════════════════════════════════════════════
