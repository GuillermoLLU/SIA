-- ════════════════════════════════════════════════════════════════════════
--  SIA · Base de PLATAFORMA (clientes, usuarios, perfiles y acceso al RAG)
-- ════════════════════════════════════════════════════════════════════════
--  Se ejecuta entero en el SQL Editor de un proyecto Supabase NUEVO, dedicado
--  solo a la plataforma. Es re-ejecutable: no borra datos.
--
--  Modelo
--    clients            los clientes de la plataforma
--    users              las personas (1:1 con auth.users de Supabase Auth)
--    memberships        usuario × cliente × perfil (admin | agent)
--    knowledge_bases    bases de conocimiento (otros proyectos Supabase) de cada cliente
--    knowledge_grants   qué grupos (tokens) de qué base tiene cada usuario: el RAG que ve
--    audit_log          registro de todo cambio (solo se añade, nunca se edita)
--
--  Perfiles
--    superadmin (users.is_superadmin)  crea clientes, nombra admins, lo ve todo.
--                                      Solo se concede desde el SQL Editor.
--    admin  (de un cliente)            gestiona los agentes de su cliente, sus
--                                      bases y el conocimiento que ve cada uno.
--    agent  (de un cliente)            usa el conocimiento que le han asignado.
--
--  Seguridad
--    · Las tablas viven en el esquema privado `platform`, que la Data API NO
--      expone: ni anon ni authenticated pueden leerlas ni escribirlas.
--      Además tienen RLS activado sin políticas (denegar todo).
--    · La app solo llama a funciones public.platform_* (RPC). Son SECURITY
--      DEFINER con search_path vacío y nombres cualificados, comprueban quién
--      llama (auth.uid()) y su perfil antes de nada, y solo las puede ejecutar
--      el rol authenticated (anon, no).
--    · Un usuario desactivado no pasa ninguna comprobación.
--    · Los tokens de grupo solo se devuelven enteros a su titular; a los
--      admins, enmascarados. Las claves secret de Supabase se rechazan.
--    · El alta de personas en Supabase Auth NO se hace aquí: la hace una Edge
--      Function (necesita la clave secret, que SIA no tiene nunca), que antes
--      pregunta a platform_can_add_member si quien llama puede.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Esquema privado ───────────────────────────────────────────────────────
create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;

-- ── Tablas ────────────────────────────────────────────────────────────────
create table if not exists platform.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
create unique index if not exists clients_name_ci on platform.clients (lower(btrim(name)));

create table if not exists platform.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  is_superadmin  boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index if not exists users_email_ci on platform.users (email);

create table if not exists platform.memberships (
  user_id     uuid not null references platform.users (id) on delete cascade,
  client_id   uuid not null references platform.clients (id) on delete cascade,
  profile     text not null check (profile in ('admin', 'agent')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  primary key (user_id, client_id)
);
create index if not exists memberships_client on platform.memberships (client_id);

create table if not exists platform.knowledge_bases (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references platform.clients (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  -- solo proyectos Supabase: https://<ref de 20 letras>.supabase.co
  url              text not null check (url ~ '^https://[a-z]{20}\.supabase\.co$'),
  -- solo la clave publishable; la secret (sb_secret_…, service_role) nunca
  publishable_key  text not null check (publishable_key ~ '^sb_publishable_[A-Za-z0-9_-]{16,200}$'),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  unique (client_id, url),
  unique (id, client_id)
);

create table if not exists platform.knowledge_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  client_id   uuid not null,
  base_id     uuid not null,
  group_name  text not null check (char_length(btrim(group_name)) between 1 and 80),
  -- viaja en la cabecera x-sia-tokens: ASCII visible y sin comas
  group_token text not null check (group_token ~ '^[\x21-\x7e]{8,200}$' and strpos(group_token, ',') = 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  -- el usuario es miembro del cliente y la base es de ese mismo cliente
  foreign key (user_id, client_id) references platform.memberships (user_id, client_id) on delete cascade,
  foreign key (base_id, client_id) references platform.knowledge_bases (id, client_id) on delete cascade,
  unique (user_id, base_id, group_token)
);
create index if not exists grants_client on platform.knowledge_grants (client_id);
create index if not exists grants_base on platform.knowledge_grants (base_id);

create table if not exists platform.audit_log (
  id           bigint generated always as identity primary key,
  happened_at  timestamptz not null default now(),
  actor        uuid,                 -- null: hecho desde el SQL Editor
  action       text not null,
  client_id    uuid,
  target_user  uuid,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists audit_client_at on platform.audit_log (client_id, happened_at desc);

-- RLS activado y sin políticas en todas: nadie fuera de las funciones.
alter table platform.clients          enable row level security;
alter table platform.users            enable row level security;
alter table platform.memberships      enable row level security;
alter table platform.knowledge_bases  enable row level security;
alter table platform.knowledge_grants enable row level security;
alter table platform.audit_log        enable row level security;
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

-- ── Alta en Supabase Auth → fila en platform.users ────────────────────────
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

create or replace function platform.is_superadmin(p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select u.is_superadmin from platform.users u where u.id = p_user and u.active), false)
$$;

-- Admin de un cliente activo (o superadmin, que lo es de todos).
create or replace function platform.is_client_admin(p_user uuid, p_client uuid) returns boolean
language sql stable set search_path = '' as $$
  select platform.is_superadmin(p_user) or exists (
    select 1 from platform.memberships m
    join platform.clients c on c.id = m.client_id
    join platform.users u on u.id = m.user_id
    where m.user_id = p_user and m.client_id = p_client and m.profile = 'admin' and c.active and u.active)
$$;

create or replace function platform.require_superadmin() returns uuid
language plpgsql stable set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  if not platform.is_superadmin(v_me) then
    raise exception 'Solo el superadministrador puede hacer esto.' using errcode = '42501';
  end if;
  return v_me;
end $$;

create or replace function platform.require_client_admin(p_client uuid) returns uuid
language plpgsql stable set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  if p_client is null or not platform.is_client_admin(v_me, p_client) then
    raise exception 'No administras ese cliente.' using errcode = '42501';
  end if;
  return v_me;
end $$;

-- Un admin de cliente solo actúa sobre agentes (y sobre sí mismo cuando se
-- permite); a otros admins los gestiona el superadmin.
create or replace function platform.require_can_manage_member(p_actor uuid, p_client uuid, p_user uuid) returns void
language plpgsql stable set search_path = '' as $$
declare v_profile text;
begin
  select m.profile into v_profile from platform.memberships m where m.user_id = p_user and m.client_id = p_client;
  if v_profile is null then
    raise exception 'Ese usuario no pertenece al cliente.' using errcode = 'P0002';
  end if;
  if v_profile = 'admin' and p_user <> p_actor and not platform.is_superadmin(p_actor) then
    raise exception 'Solo el superadministrador gestiona a otros administradores.' using errcode = '42501';
  end if;
end $$;

create or replace function platform.audit(p_actor uuid, p_action text, p_client uuid, p_target uuid, p_details jsonb default '{}'::jsonb) returns void
language sql set search_path = '' as $$
  insert into platform.audit_log (actor, action, client_id, target_user, details)
  values (p_actor, p_action, p_client, p_target, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function platform.mask(p_token text) returns text
language sql immutable set search_path = '' as $$
  select left(p_token, 4) || '…' || right(p_token, 4)
$$;

-- Superadmin: SOLO desde el SQL Editor (este esquema no es accesible desde la API).
create or replace function platform.grant_superadmin(p_email text) returns void
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update platform.users set is_superadmin = true, active = true where email = lower(btrim(p_email)) returning id into v_id;
  if v_id is null then
    raise exception 'No hay ningún usuario con email %. Créalo antes en Authentication → Users.', p_email;
  end if;
  perform platform.audit(null, 'superadmin.grant', null, v_id);
end $$;

revoke all on all functions in schema platform from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  API para la app (RPC). Todas exigen sesión; anon no puede llamarlas.
-- ════════════════════════════════════════════════════════════════════════

-- Quién soy y en qué clientes estoy (con qué perfil).
create or replace function public.platform_whoami() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  return (
    select jsonb_build_object(
      'id', u.id, 'email', u.email, 'name', u.name, 'is_superadmin', u.is_superadmin,
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object('client_id', c.id, 'client_name', c.name, 'client_slug', c.slug, 'profile', m.profile) order by c.name)
        from platform.memberships m join platform.clients c on c.id = m.client_id
        where m.user_id = u.id and c.active), '[]'::jsonb))
    from platform.users u where u.id = v_me);
end $$;

-- Mi conocimiento: bases y tokens de grupo asignados (con el token entero:
-- es lo que SIA manda a cada base). Solo de clientes activos.
create or replace function public.platform_my_knowledge()
returns table (client_id uuid, client_name text, base_id uuid, base_name text, url text, publishable_key text, group_name text, group_token text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_user();
begin
  return query
    select c.id, c.name, b.id, b.name, b.url, b.publishable_key, g.group_name, g.group_token
    from platform.knowledge_grants g
    join platform.knowledge_bases b on b.id = g.base_id
    join platform.clients c on c.id = g.client_id
    where g.user_id = v_me and c.active
    order by c.name, b.name, g.group_name;
end $$;

-- Cambiar mi nombre. Activar/desactivar y renombrar a otros: superadmin.
create or replace function public.platform_update_user(p_user uuid, p_name text default null, p_active boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
        v_super boolean := platform.is_superadmin(v_me);
begin
  if p_user <> v_me and not v_super then
    raise exception 'Solo el superadministrador cambia los datos de otros usuarios.' using errcode = '42501';
  end if;
  if p_active is not null and not v_super then
    raise exception 'Solo el superadministrador activa o desactiva usuarios.' using errcode = '42501';
  end if;
  if p_active = false and p_user = v_me then
    raise exception 'No puedes desactivar tu propio usuario.' using errcode = '42501';
  end if;
  update platform.users
     set name = coalesce(nullif(btrim(p_name), ''), name),
         active = coalesce(p_active, active)
   where id = p_user;
  if not found then raise exception 'Ese usuario no existe.' using errcode = 'P0002'; end if;
  perform platform.audit(v_me, 'user.update', null, p_user,
    jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(p_name), ''), 'active', p_active)));
end $$;

-- ── Clientes ──────────────────────────────────────────────────────────────
-- Superadmin: todos. Admin: los que administra. Con su número de miembros.
create or replace function public.platform_list_clients()
returns table (id uuid, name text, slug text, active boolean, created_at timestamptz, members bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_user();
        v_super boolean := platform.is_superadmin(v_me);
begin
  return query
    select c.id, c.name, c.slug, c.active, c.created_at,
           (select count(*) from platform.memberships m where m.client_id = c.id)
    from platform.clients c
    where v_super or platform.is_client_admin(v_me, c.id)
    order by c.name;
end $$;

create or replace function public.platform_create_client(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_superadmin();
        v_id uuid;
begin
  insert into platform.clients (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_me)
  returning id into v_id;
  perform platform.audit(v_me, 'client.create', v_id, null, jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug))));
  return v_id;
exception
  when unique_violation then raise exception 'Ya hay un cliente con ese nombre o identificador.' using errcode = '23505';
  when check_violation then raise exception 'Nombre (1-80 caracteres) o identificador (minúsculas, números y guiones) no válidos.' using errcode = '23514';
end $$;

create or replace function public.platform_update_client(p_client uuid, p_name text default null, p_active boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_superadmin();
begin
  update platform.clients
     set name = coalesce(nullif(btrim(p_name), ''), name),
         active = coalesce(p_active, active)
   where id = p_client;
  if not found then raise exception 'Ese cliente no existe.' using errcode = 'P0002'; end if;
  perform platform.audit(v_me, 'client.update', p_client, null,
    jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(p_name), ''), 'active', p_active)));
exception
  when unique_violation then raise exception 'Ya hay un cliente con ese nombre.' using errcode = '23505';
end $$;

-- ── Miembros de un cliente ────────────────────────────────────────────────
create or replace function public.platform_list_members(p_client uuid)
returns table (user_id uuid, email text, name text, profile text, active boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_client_admin(p_client);
  return query
    select u.id, u.email, u.name, m.profile, u.active, m.created_at
    from platform.memberships m join platform.users u on u.id = m.user_id
    where m.client_id = p_client
    order by m.profile, u.name;
end $$;

-- ¿Puedo dar de alta a alguien con este perfil en este cliente? (lo usa la
-- Edge Function de alta antes de crear la persona en Supabase Auth)
create or replace function public.platform_can_add_member(p_client uuid, p_profile text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := platform.require_user();
begin
  if p_profile not in ('admin', 'agent') then return false; end if;
  if platform.is_superadmin(v_me) then return exists (select 1 from platform.clients where id = p_client); end if;
  return p_profile = 'agent' and platform.is_client_admin(v_me, p_client);
end $$;

-- Añade (o cambia de perfil) a un usuario ya existente, por su email.
-- Admin de cliente: solo agentes. Nombrar o tocar admins: superadmin.
create or replace function public.platform_set_member(p_client uuid, p_email text, p_profile text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_client_admin(p_client);
        v_super boolean := platform.is_superadmin(v_me);
        v_user uuid;
        v_prev text;
begin
  if p_profile not in ('admin', 'agent') then
    raise exception 'Perfil desconocido.' using errcode = '22023';
  end if;
  if p_profile = 'admin' and not v_super then
    raise exception 'Solo el superadministrador nombra administradores.' using errcode = '42501';
  end if;
  select u.id into v_user from platform.users u where u.email = lower(btrim(p_email)) and u.active;
  if v_user is null then
    raise exception 'No hay ningún usuario activo con ese email.' using errcode = 'P0002';
  end if;
  select m.profile into v_prev from platform.memberships m where m.user_id = v_user and m.client_id = p_client;
  if v_prev = 'admin' and not v_super then
    raise exception 'Solo el superadministrador gestiona a otros administradores.' using errcode = '42501';
  end if;
  insert into platform.memberships (user_id, client_id, profile, created_by)
  values (v_user, p_client, p_profile, v_me)
  on conflict (user_id, client_id) do update set profile = excluded.profile;
  perform platform.audit(v_me, case when v_prev is null then 'member.add' else 'member.profile' end, p_client, v_user,
    jsonb_build_object('profile', p_profile, 'previous', v_prev));
  return v_user;
end $$;

-- Saca a un usuario de un cliente (se lleva sus accesos al conocimiento de ese cliente).
create or replace function public.platform_remove_member(p_client uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_client_admin(p_client);
begin
  if p_user = v_me then
    raise exception 'No puedes quitarte a ti mismo de un cliente.' using errcode = '42501';
  end if;
  perform platform.require_can_manage_member(v_me, p_client, p_user);
  delete from platform.memberships where user_id = p_user and client_id = p_client;
  perform platform.audit(v_me, 'member.remove', p_client, p_user);
end $$;

-- ── Bases de conocimiento de un cliente ───────────────────────────────────
create or replace function public.platform_list_bases(p_client uuid)
returns table (id uuid, name text, url text, publishable_key text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_client_admin(p_client);
  return query
    select b.id, b.name, b.url, b.publishable_key, b.created_at
    from platform.knowledge_bases b where b.client_id = p_client order by b.name;
end $$;

create or replace function public.platform_add_base(p_client uuid, p_name text, p_url text, p_publishable_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_client_admin(p_client);
        v_key text := btrim(p_publishable_key);
        v_url text := rtrim(lower(btrim(p_url)), '/');
        v_id uuid;
begin
  -- la secret salta todas las políticas de la base: ni se acepta ni se guarda
  if v_key ~* '^sb_secret_' or v_key ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Esa no es la clave publishable. SIA solo admite sb_publishable_… (Project Settings → API Keys).' using errcode = '22023';
  end if;
  insert into platform.knowledge_bases (client_id, name, url, publishable_key, created_by)
  values (p_client, btrim(p_name), v_url, v_key, v_me)
  returning id into v_id;
  perform platform.audit(v_me, 'base.add', p_client, null, jsonb_build_object('base', v_id, 'name', btrim(p_name), 'url', v_url));
  return v_id;
exception
  when unique_violation then raise exception 'Esa base ya está dada de alta en el cliente.' using errcode = '23505';
  when check_violation then raise exception 'Datos no válidos: nombre (1-60), URL https://<ref>.supabase.co y clave sb_publishable_….' using errcode = '23514';
end $$;

create or replace function public.platform_remove_base(p_base uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
        v_me uuid;
begin
  perform platform.require_user();
  select b.client_id into v_client from platform.knowledge_bases b where b.id = p_base;
  v_me := platform.require_client_admin(v_client); -- base inexistente → sin permiso (no revela nada)
  delete from platform.knowledge_bases where id = p_base;
  perform platform.audit(v_me, 'base.remove', v_client, null, jsonb_build_object('base', p_base));
end $$;

-- ── Conocimiento de cada usuario (grupos de cada base) ────────────────────
-- Para los admins, el token sale enmascarado.
create or replace function public.platform_list_grants(p_client uuid, p_user uuid)
returns table (id uuid, base_id uuid, base_name text, group_name text, token_hint text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform platform.require_client_admin(p_client);
  return query
    select g.id, b.id, b.name, g.group_name, platform.mask(g.group_token), g.created_at
    from platform.knowledge_grants g join platform.knowledge_bases b on b.id = g.base_id
    where g.client_id = p_client and g.user_id = p_user
    order by b.name, g.group_name;
end $$;

create or replace function public.platform_grant_knowledge(p_client uuid, p_user uuid, p_base uuid, p_group_name text, p_group_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := platform.require_client_admin(p_client);
        v_id uuid;
begin
  perform platform.require_can_manage_member(v_me, p_client, p_user);
  if not exists (select 1 from platform.knowledge_bases b where b.id = p_base and b.client_id = p_client) then
    raise exception 'Esa base no es de este cliente.' using errcode = 'P0002';
  end if;
  insert into platform.knowledge_grants (user_id, client_id, base_id, group_name, group_token, created_by)
  values (p_user, p_client, p_base, btrim(p_group_name), btrim(p_group_token), v_me)
  returning id into v_id;
  perform platform.audit(v_me, 'knowledge.grant', p_client, p_user,
    jsonb_build_object('grant', v_id, 'base', p_base, 'group', btrim(p_group_name), 'token', platform.mask(btrim(p_group_token))));
  return v_id;
exception
  when unique_violation then raise exception 'Ese usuario ya tiene ese grupo en esa base.' using errcode = '23505';
  when check_violation then raise exception 'Nombre de grupo (1-80) o token (8-200 caracteres visibles, sin comas) no válidos.' using errcode = '23514';
end $$;

create or replace function public.platform_revoke_knowledge(p_grant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
        v_user uuid;
        v_me uuid;
begin
  perform platform.require_user();
  select g.client_id, g.user_id into v_client, v_user from platform.knowledge_grants g where g.id = p_grant;
  v_me := platform.require_client_admin(v_client); -- acceso inexistente → sin permiso (no revela nada)
  perform platform.require_can_manage_member(v_me, v_client, v_user);
  delete from platform.knowledge_grants where id = p_grant;
  perform platform.audit(v_me, 'knowledge.revoke', v_client, v_user, jsonb_build_object('grant', p_grant));
end $$;

-- ── Auditoría ─────────────────────────────────────────────────────────────
-- Admin: lo de su cliente. Superadmin: todo (p_client null) o un cliente.
create or replace function public.platform_list_audit(p_client uuid default null, p_limit int default 100)
returns table (happened_at timestamptz, actor_name text, action text, client_id uuid, target_name text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := platform.require_user();
begin
  if p_client is null then perform platform.require_superadmin();
  else perform platform.require_client_admin(p_client);
  end if;
  return query
    select a.happened_at, ua.name, a.action, a.client_id, ut.name, a.details
    from platform.audit_log a
    left join platform.users ua on ua.id = a.actor
    left join platform.users ut on ut.id = a.target_user
    where p_client is null or a.client_id = p_client
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
--  Primer superadministrador (una sola vez, tras crearlo en el panel):
--    1. Authentication → Users → Add user → email + contraseña robusta,
--       marcando «Auto Confirm User».
--    2. Aquí mismo, en el SQL Editor:
--         select platform.grant_superadmin('tu-email@empresa.com');
-- ════════════════════════════════════════════════════════════════════════
