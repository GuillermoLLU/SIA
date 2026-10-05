-- ════════════════════════════════════════════════════════════════════════
--  SIA · Base de la INSTANCIA (usuarios, roles y acceso al conocimiento)
-- ════════════════════════════════════════════════════════════════════════
--  Una instancia de SIA = un cliente = un proyecto Supabase propio. Se
--  ejecuta entero en el SQL Editor de ese proyecto. Es re-ejecutable: no
--  borra datos (salvo la estructura multicliente anterior, ver paso 0).
--
--  Modelo
--    users              las personas (1:1 con auth.users de Supabase Auth), su rol y sus vistas
--    knowledge_bases    las bases de conocimiento (otros proyectos Supabase)
--    knowledge_grants   qué grupos (tokens) de qué base tiene cada usuario: el RAG que ve
--    person_keys        la clave de poder de cada persona en cada base que ve (en
--                       Vault), con solo los permisos de sus vistas (Laboratorio,
--                       Administración, Enlaces). La crea en la base el bridge de
--                       quien gestiona Personas; el de la persona la usa.
--    audit_log          registro de todo cambio (solo se añade, nunca se edita)
--
--  Vistas: lo que cada persona puede ver y hacer en SIA (el Chat, siempre)
--    links      Enlaces rápidos
--    lab        Laboratorio de skills
--    admin      Administración del contenido de las bases (grupos, proyectos, enlaces)
--    people     Personas: altas, bajas, vistas y conocimiento de cada una
--    knowledge  Configuración → Conocimiento: las bases de la instancia
--  Roles: punto de partida de las vistas. Al poner un rol se le dan las
--  suyas; después se ajustan una a una.
--    admin   todas. El primero se nombra desde el SQL Editor (platform.grant_admin).
--    agent   Enlaces. Es el rol de toda alta.
--
--  Seguridad
--    · Las tablas viven en el esquema privado `platform`, que la Data API NO
--      expone: ni anon ni authenticated pueden leerlas ni escribirlas.
--      Además tienen RLS activado sin políticas (denegar todo).
--    · La app solo llama a funciones public.platform_* (RPC). Son SECURITY
--      DEFINER con search_path vacío y nombres cualificados, comprueban quién
--      llama (auth.uid()) y sus vistas antes de nada, y solo las puede ejecutar
--      el rol authenticated (anon, no).
--    · Nadie cambia su propio rol ni sus vistas ni se desactiva: siempre queda
--      alguien con Personas.
--    · Un usuario desactivado no pasa ninguna comprobación.
--    · Los tokens de grupo solo se devuelven enteros a su titular; a los
--      admins, como huella (sha256). Las claves secret de Supabase se rechazan.
--    · La clave de poder de cada base (para leer sus grupos) se guarda cifrada
--      en Supabase Vault y solo la recibe el bridge de quien gestiona bases o personas.
--    · Desactivar a alguien o ponerle contraseña nueva cierra sus sesiones; una
--      contraseña puesta por otro hay que cambiarla al entrar.
--    · El alta, la baja y el cambio de contraseña de personas en Supabase Auth
--      NO se hacen aquí: los hace la Edge Function sia-users (necesita la
--      clave secret, que SIA no tiene nunca), que antes pregunta a
--      platform_can_manage_users y después lo apunta con platform_record_user_event.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Estructura multicliente anterior (clients/memberships) ─────────────
-- Si está, se retira entera (su esquema, sus funciones y sus disparadores).
-- Las personas de Authentication no se tocan. En una base nueva o ya
-- migrada no hace nada.
do $$
declare f record;
begin
  if to_regclass('platform.clients') is not null then
    drop schema platform cascade;
    for f in
      select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'platform\_%'
    loop
      execute format('drop function %s', f.sig);
    end loop;
    raise notice 'Estructura multicliente retirada.';
  end if;
end $$;

-- ── Esquema privado ───────────────────────────────────────────────────────
create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;

-- ── Tablas ────────────────────────────────────────────────────────────────
create table if not exists platform.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  role        text not null default 'agent' check (role in ('admin', 'agent')),
  active      boolean not null default true,
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
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null
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

-- Añadidos (se aplican también a bases ya montadas):
--   must_change_password  la contraseña la puso un admin: cambiarla al entrar
--   power_secret          la clave de poder (Administración) de la base, en
--                         Supabase Vault: con ella SIA lee los grupos de la base
alter table platform.users add column if not exists must_change_password boolean not null default false;
alter table platform.knowledge_bases add column if not exists power_secret uuid;

-- Vistas de cada rol (punto de partida) y de cada persona.
create or replace function platform.role_views(p_role text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_role when 'admin' then array['links', 'lab', 'admin', 'people', 'knowledge'] else array['links'] end
$$;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'platform' and table_name = 'users' and column_name = 'views') then
    alter table platform.users add column views text[];
    update platform.users set views = platform.role_views(role);
    alter table platform.users alter column views set not null;
    alter table platform.users alter column views set default array['links'];
    alter table platform.users add constraint users_views_known
      check (views <@ array['links', 'lab', 'admin', 'people', 'knowledge']);
  end if;
end $$;

-- RLS activado y sin políticas en todas: nadie fuera de las funciones.
alter table platform.users            enable row level security;
alter table platform.knowledge_bases  enable row level security;
alter table platform.knowledge_grants enable row level security;
alter table platform.audit_log        enable row level security;
alter table platform.person_keys      enable row level security;
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

-- ── Alta en Supabase Auth → fila en platform.users (siempre como agente) ──
-- El nombre llega en user_metadata.name (lo pone la Edge Function de alta).
create or replace function platform.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    raise exception 'Los usuarios de SIA necesitan email.' using errcode = '23502';
  end if;
  insert into platform.users (id, email, name)
  values (new.id, lower(new.email),
          left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80))
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
insert into platform.users (id, email, name)
select a.id, lower(a.email),
       left(coalesce(nullif(btrim(a.raw_user_meta_data ->> 'name'), ''), split_part(a.email, '@', 1)), 80)
from auth.users a
where a.email is not null
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
  update platform.users set role = 'admin', views = platform.role_views('admin'), active = true where email = lower(btrim(p_email)) returning id into v_id;
  if v_id is null then
    raise exception 'No hay ningún usuario con email %. Créalo antes en Authentication → Users.', p_email;
  end if;
  perform platform.audit(null, 'admin.grant', v_id);
end $$;

revoke all on all functions in schema platform from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  API para la app (RPC). Todas exigen sesión; anon no puede llamarlas.
-- ════════════════════════════════════════════════════════════════════════

-- Funciones retiradas (la asignación token a token la sustituye platform_set_knowledge).
drop function if exists public.platform_list_grants(uuid);
drop function if exists public.platform_grant_knowledge(uuid, uuid, text, text);
drop function if exists public.platform_revoke_knowledge(uuid);
drop function if exists public.platform_add_base(text, text, text);
drop function if exists platform.mask(text);
drop function if exists platform.require_admin();
drop function if exists platform.is_admin(uuid);
drop function if exists public.platform_update_user(uuid, text, text, boolean);

-- Quién soy (y si tengo que cambiar la contraseña antes de seguir).
create or replace function public.platform_whoami() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  return (select jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', u.role, 'views', to_jsonb(u.views), 'must_change_password', u.must_change_password)
          from platform.users u where u.id = v_me);
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
-- es lo que SIA manda a cada base) y mi clave de poder en cada una, si tengo.
drop function if exists public.platform_my_knowledge();
create function public.platform_my_knowledge()
returns table (base_id uuid, base_name text, url text, publishable_key text, group_name text, group_token text, power_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_user();
begin
  return query
    select b.id, b.name, b.url, b.publishable_key, g.group_name, g.group_token, d.decrypted_secret
    from platform.knowledge_grants g join platform.knowledge_bases b on b.id = g.base_id
    left join platform.person_keys k on k.user_id = v_me and k.base_id = b.id
    left join vault.decrypted_secrets d on d.id = k.power_secret
    where g.user_id = v_me
    order by b.name, g.group_name;
end $$;

-- ── Usuarios ──────────────────────────────────────────────────────────────
-- Con su último acceso y su conocimiento: por base, sus grupos (nombre y
-- huella del token, nunca el token).
drop function if exists public.platform_list_users();
create function public.platform_list_users()
returns table (id uuid, email text, name text, role text, views text[], active boolean, must_change_password boolean,
               last_sign_in_at timestamptz, created_at timestamptz, knowledge jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people');
  return query
    select u.id, u.email, u.name, u.role, u.views, u.active, u.must_change_password, a.last_sign_in_at, u.created_at,
           coalesce((select jsonb_agg(jsonb_build_object('base_id', k.base_id, 'groups', k.groups) order by k.base_id)
                     from (select g.base_id,
                                  jsonb_agg(jsonb_build_object('id', platform.token_id(g.group_token), 'name', g.group_name) order by g.group_name) as groups
                           from platform.knowledge_grants g where g.user_id = u.id group by g.base_id) k), '[]'::jsonb)
    from platform.users u left join auth.users a on a.id = u.id
    order by u.role, u.name;
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
-- (siempre queda alguien con Personas). Un rol nuevo sin vistas trae las de
-- ese rol. Desactivar cierra sus sesiones.
create or replace function public.platform_update_user(p_user uuid, p_name text default null, p_role text default null,
                                                       p_active boolean default null, p_views text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
        v_people boolean := platform.can(v_me, array['people']);
        v_views text[] := coalesce(p_views, case when p_role is not null then platform.role_views(p_role) end);
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
  if p_role is not null and p_role not in ('admin', 'agent') then
    raise exception 'Rol desconocido.' using errcode = '22023';
  end if;
  if v_views is not null and not (v_views <@ array['links', 'lab', 'admin', 'people', 'knowledge']) then
    raise exception 'Vista desconocida.' using errcode = '22023';
  end if;
  update platform.users
     set name = coalesce(nullif(btrim(p_name), ''), name),
         role = coalesce(p_role, role),
         views = case when v_views is null then views else array(select distinct v from unnest(v_views) v order by v) end,
         active = coalesce(p_active, active)
   where id = p_user;
  if not found then raise exception 'Ese usuario no existe.' using errcode = 'P0002'; end if;
  if p_active = false then perform platform.revoke_sessions(p_user); end if;
  perform platform.audit(v_me, 'user.update', p_user,
    jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(p_name), ''), 'role', p_role, 'views', to_jsonb(v_views), 'active', p_active)));
exception
  when check_violation then raise exception 'Nombre no válido (1-80 caracteres).' using errcode = '23514';
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

-- ── Bases de conocimiento ─────────────────────────────────────────────────
-- Con si tienen clave de poder (sin ella no se leen sus grupos) y cuántas
-- personas ven cada una.
drop function if exists public.platform_list_bases();
create function public.platform_list_bases()
returns table (id uuid, name text, url text, publishable_key text, has_power_key boolean, people bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people', 'knowledge');
  return query
    select b.id, b.name, b.url, b.publishable_key, b.power_secret is not null,
           (select count(distinct g.user_id) from platform.knowledge_grants g where g.base_id = b.id), b.created_at
    from platform.knowledge_bases b order by b.name;
end $$;

create or replace function public.platform_add_base(p_name text, p_url text, p_publishable_key text, p_power_key text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('knowledge');
        v_key text := btrim(p_publishable_key);
        v_url text := rtrim(lower(btrim(p_url)), '/');
        v_id uuid;
begin
  -- la secret salta todas las políticas de la base: ni se acepta ni se guarda
  if v_key ~* '^sb_secret_' or v_key ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Esa no es la clave publishable. SIA solo admite sb_publishable_… (Project Settings → API Keys).' using errcode = '22023';
  end if;
  insert into platform.knowledge_bases (name, url, publishable_key, created_by)
  values (btrim(p_name), v_url, v_key, v_me)
  returning id into v_id;
  if nullif(btrim(p_power_key), '') is not null then perform platform.store_power(v_id, btrim(p_power_key)); end if;
  perform platform.audit(v_me, 'base.add', null, jsonb_build_object('base', v_id, 'name', btrim(p_name), 'url', v_url));
  return v_id;
exception
  when unique_violation then raise exception 'Esa base ya está dada de alta.' using errcode = '23505';
  when check_violation then raise exception 'Datos no válidos: nombre (1-60), URL https://<ref>.supabase.co y clave sb_publishable_….' using errcode = '23514';
end $$;

-- Renombra una base (la mantiene en sintonía con Configuración → Conocimiento).
create or replace function public.platform_rename_base(p_base uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('knowledge');
begin
  update platform.knowledge_bases set name = btrim(p_name) where id = p_base;
  if not found then raise exception 'Esa base no existe.' using errcode = 'P0002'; end if;
  perform platform.audit(v_me, 'base.rename', null, jsonb_build_object('base', p_base, 'name', btrim(p_name)));
exception
  when check_violation then raise exception 'Nombre no válido (1-60 caracteres).' using errcode = '23514';
end $$;

-- Pone o cambia la clave de poder de una base (en Vault).
create or replace function public.platform_set_base_power(p_base uuid, p_power_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('knowledge');
begin
  if not exists (select 1 from platform.knowledge_bases b where b.id = p_base) then
    raise exception 'Esa base no existe.' using errcode = 'P0002';
  end if;
  perform platform.store_power(p_base, btrim(p_power_key));
  perform platform.audit(v_me, 'base.power_key', null, jsonb_build_object('base', p_base));
end $$;

-- Quitar una base se lleva lo asignado de ella y su clave de Vault.
create or replace function public.platform_remove_base(p_base uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('knowledge');
        v_secret uuid;
begin
  delete from platform.knowledge_bases where id = p_base returning power_secret into v_secret;
  if not found then raise exception 'Esa base no existe.' using errcode = 'P0002'; end if;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  perform platform.audit(v_me, 'base.remove', null, jsonb_build_object('base', p_base));
end $$;

-- Para el bridge de quien gestiona bases o personas: con qué leer los grupos de cada base (su
-- clave de poder, descifrada). Nunca llega a la web.
create or replace function public.platform_base_access()
returns table (id uuid, url text, publishable_key text, power_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_view('people', 'knowledge');
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
  perform platform.require_view('people', 'knowledge');
  return query
    select k.user_id, k.base_id, d.decrypted_secret
    from platform.person_keys k join vault.decrypted_secrets d on d.id = k.power_secret
    where (p_user is null or k.user_id = p_user) and (p_base is null or k.base_id = p_base);
end $$;

-- Guarda la clave que se acaba de crear en la base para alguien; null, la olvida.
create or replace function public.platform_set_person_key(p_user uuid, p_base uuid, p_power_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_view('people', 'knowledge');
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
--  Primer administrador (una sola vez):
--    1. Si aún no existe: Authentication → Users → Add user → email +
--       contraseña robusta, marcando «Auto Confirm User».
--    2. Aquí mismo, en el SQL Editor:
--         select platform.grant_admin('tu-email@empresa.com');
-- ════════════════════════════════════════════════════════════════════════
