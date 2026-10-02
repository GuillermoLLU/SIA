-- SIA: esquema de la base de conocimiento (esquema 2, blindado con RLS).
--
-- Idempotente: se puede volver a ejecutar sobre una base ya montada; crea lo
-- que falte y deja las políticas de acceso al día.
--
-- CÓMO FUNCIONA EL ACCESO (lo hace cumplir Postgres, no la aplicación):
--   * SIA se conecta SIEMPRE con la clave publishable del proyecto (rol
--     anon). Nunca pide ni guarda la clave secret / service_role.
--   * En cada petición manda dos cabeceras HTTP:
--       x-sia-tokens : tokens de grupo del usuario, separados por coma
--       x-sia-power  : su clave de poder en esta base (si tiene)
--   * Row Level Security está activado en todas las tablas y SIN políticas
--     abiertas: con la clave publishable a secas no se lee ni se escribe nada.
--   * Las políticas leen esas cabeceras: los tokens dan los proyectos que
--     conceden (access_grants); la clave de poder da permisos (power_keys).
--   * La clave del dueño la genera SIA al copiar este SQL desde el
--     asistente (⚙️ Configuración → Conocimiento) y la guarda en tu equipo al
--     verificar. Ejecutarlo de nuevo desde el asistente genera otra, que es
--     la forma de recuperar una clave perdida.

-- ── Guarda: este fichero no se ejecuta tal cual ──────────────────
-- La clave del dueño es un marcador que SIA sustituye al generar el SQL.
do $$ begin
  if '__SIA_OWNER_KEY__' like '\_\_SIA\_%' then
    raise exception 'SIA: copia el SQL desde el asistente de la app (ahí se genera la clave del dueño).';
  end if;
end $$;

create extension if not exists vector with schema extensions;

-- ── RAG: proyectos / contextos / entries / chunks ───────────────
create table if not exists public.projects (
  id          bigint primary key generated always as identity,
  name        text not null,
  description text default '',
  created_at  timestamptz default now()
);

create table if not exists public.contexts (
  id          bigint primary key generated always as identity,
  project_id  bigint not null references public.projects(id) on delete cascade,
  name        text not null,
  description text default '',
  created_at  timestamptz default now()
);

create table if not exists public.context_entries (
  id           bigint primary key generated always as identity,
  context_id   bigint not null references public.contexts(id) on delete cascade,
  content      text not null,
  source_type  text,
  source_agent text,
  created_by   text,
  created_at   timestamptz default now()
);

create table if not exists public.context_chunks (
  id          bigint primary key generated always as identity,
  entry_id    bigint not null references public.context_entries(id) on delete cascade,
  chunk_text  text not null,
  chunk_index int  not null,
  embedding   extensions.vector(384)
);

create index if not exists idx_chunks_entry on public.context_chunks(entry_id);
create index if not exists idx_entries_context on public.context_entries(context_id);
create index if not exists idx_contexts_project on public.contexts(project_id);

-- ── Skills (catálogo central) ───────────────────────────────────
create table if not exists public.skills (
  id          text primary key,
  label       text not null,
  description text not null default '',
  category    text not null default '',
  version     text not null default '1.0.0',
  enabled     boolean not null default true,
  scope       text,               -- vacío = común (todos); token de grupo = solo ese grupo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- bases montadas antes de que existiera scope
alter table public.skills add column if not exists scope text;

create table if not exists public.skill_files (
  id       bigint generated always as identity primary key,
  skill_id text not null references public.skills(id) on delete cascade,
  path     text not null,
  content  text not null,
  unique (skill_id, path)
);

-- ── Control de acceso (tokens de grupo → proyectos) ─────────────
create table if not exists public.access_groups (
  token text primary key,
  name  text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.access_grants (
  token      text not null references public.access_groups(token) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  primary key (token, project_id)
);

create index if not exists idx_grants_project on public.access_grants(project_id);

-- ── Enlaces rápidos por proyecto (panel de atajos) ──────────────
-- Compartidos por todo el equipo: quien tiene acceso al proyecto los ve.
-- La imagen se guarda como data URI (base64) para que sea permanente y no
-- dependa de que un servidor ajeno la siga sirviendo.
create table if not exists public.project_links (
  id         bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  title      text not null,
  url        text not null,
  image      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_links_project on public.project_links(project_id);

-- ── Claves de poder de ESTA base ─────────────────────────────────
-- Varias claves; cada una abre las vistas que diga perms:
--   {"lab":true,"admin":true,"links":true,"invite":true}
-- lab = Laboratorio (skills de grupo), admin = Administración,
-- links = editar enlaces, invite = invitar a otros a los grupos a los que
-- uno tiene token (lo aplica la app: un token que uno ya tiene siempre se
-- puede copiar; la base no lo puede impedir). Las skills comunes las
-- gestiona solo el dueño.
-- La fila owner=true es el dueño (todo; no se puede editar ni revocar desde
-- la app: solo cambia volviendo a ejecutar este SQL).
create table if not exists public.power_keys (
  key        text primary key,
  name       text not null,
  owner      boolean not null default false,
  perms      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- La tabla `instance` del esquema 1 guardaba dos claves fijas que la app leía
-- con la clave secret. Ya no se usa: fuera, y con ella esas claves.
drop table if exists public.instance;

-- Las políticas de una base montada con los nombres anteriores de este mismo
-- esquema (kaios_*) se retiran aquí, antes de crear las de SIA: si quedaran,
-- seguirían abriendo lo que abrían. Sus funciones se retiran al final, cuando
-- ya nada las usa. No se pierde ningún dato.
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'kaios\_%' loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ── Funciones de acceso: leen las cabeceras de la petición ───────
-- Son la única puerta: las políticas de abajo y la búsqueda vectorial se
-- apoyan en ellas. Devuelven solo lo que el propio llamante ya sabe (sus
-- tokens, sus proyectos, sus permisos), así que exponerlas como RPC no
-- revela nada. `security definer` porque leen tablas cerradas a anon;
-- search_path fijo para que nadie pueda colar un objeto homónimo.

-- una cabecera de la petición en curso (PostgREST las deja en request.headers)
create or replace function public.sia_header(name text)
returns text
language sql stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> name), '')
$$;

-- tokens de grupo que manda el usuario (x-sia-tokens, separados por coma)
create or replace function public.sia_tokens()
returns text[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(t), '{}'::text[])
  from (select btrim(x) as t from unnest(string_to_array(coalesce(public.sia_header('x-sia-tokens'), ''), ',')) as x) s
  where t <> ''
$$;

-- proyectos a los que dan acceso esos tokens (unión de lo que concede cada uno)
create or replace function public.sia_projects()
returns bigint[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct project_id), '{}'::bigint[])
  from public.access_grants
  where token = any(public.sia_tokens())
$$;

-- ¿la clave de poder que viaja (x-sia-power) es la del dueño?
create or replace function public.sia_is_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select owner from public.power_keys where key = public.sia_header('x-sia-power')), false)
$$;

-- ¿esa clave abre el permiso dado ('lab' | 'admin' | 'links')? El dueño, todo.
create or replace function public.sia_can(perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select owner or (perms ->> perm) = 'true' from public.power_keys where key = public.sia_header('x-sia-power')), false)
$$;

-- ¿puede esta petición crear/editar/borrar una skill con ese scope?
-- Comunes (scope nulo): solo el dueño. De grupo: dueño, o permiso «lab» con
-- token de ese grupo.
create or replace function public.sia_skill_writable(scope text)
returns boolean
language sql stable
set search_path = ''
as $$
  select public.sia_is_owner()
      or (scope is not null and scope = any(public.sia_tokens()) and public.sia_can('lab'))
$$;

-- Estado de la base para la app: versión del esquema, si tiene dueño, qué
-- abre la clave de poder que viaja y qué proyectos dan los tokens.
create or replace function public.sia_status()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 2,
    'owner', exists (select 1 from public.power_keys where owner),
    'me', (select jsonb_build_object('name', name, 'owner', owner, 'perms', perms)
           from public.power_keys where key = public.sia_header('x-sia-power')),
    'projects', to_jsonb(public.sia_projects())
  )
$$;

-- ── RPC de búsqueda vectorial ───────────────────────────────────
-- security definer: lee los chunks sin pasar fila a fila por las políticas
-- (sería lento en una búsqueda por similitud) y acota ELLA MISMA a los
-- proyectos que dan los tokens de la petición. Sin tokens válidos no
-- devuelve nada.
create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  match_threshold float default 0.7,
  match_count int default 10,
  filter_project_id bigint default null
)
returns table (
  id bigint, entry_id bigint, chunk_text text, chunk_index int,
  similarity float, context_name text
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  allowed bigint[] := public.sia_projects(); -- una vez, no por fila
begin
  return query
  select cc.id, cc.entry_id, cc.chunk_text, cc.chunk_index,
         1 - (cc.embedding <=> query_embedding) as similarity,
         ctx.name as context_name
  from public.context_chunks cc
  join public.context_entries ce on ce.id = cc.entry_id
  join public.contexts ctx on ctx.id = ce.context_id
  where ctx.project_id = any(allowed)
    and (filter_project_id is null or ctx.project_id = filter_project_id)
    and 1 - (cc.embedding <=> query_embedding) > match_threshold
  order by cc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ── Borrado en cascada ──────────────────────────────────────────
-- Las claves ajenas de arriba llevan ON DELETE CASCADE, pero una base montada
-- con un esquema anterior puede tenerlas sin él (create table if not exists
-- no las toca): aquí se recrean con cascada las que no la tengan, para que
-- borrar un proyecto arrastre contextos, entradas, chunks, accesos y enlaces.
do $$
declare r record;
begin
  for r in
    select con.conname, cls.relname as tbl, att.attname as col, ref.relname as reftbl, ratt.attname as refcol
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    join pg_attribute ratt on ratt.attrelid = con.confrelid and ratt.attnum = con.confkey[1]
    where con.contype = 'f' and ns.nspname = 'public' and con.confdeltype <> 'c'
      and cls.relname in ('contexts', 'context_entries', 'context_chunks', 'skill_files', 'access_grants', 'project_links')
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on delete cascade', r.tbl, r.conname, r.col, r.reftbl, r.refcol);
  end loop;
end $$;

-- Borrar un grupo es borrar lo suyo: sus skills (scope no es clave ajena:
-- admite nulo = común y valores de grupos ya borrados en bases antiguas) y
-- los proyectos a los que SOLO él daba acceso, con todo su conocimiento. Los
-- proyectos compartidos con otro grupo se quedan. Va ANTES del borrado para
-- mirar los accesos del grupo mientras existen.
create or replace function public.sia_group_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.skills where scope = old.token;
  delete from public.projects p
  where p.id in (select project_id from public.access_grants where token = old.token)
    and not exists (select 1 from public.access_grants g where g.project_id = p.id and g.token <> old.token);
  return old;
end;
$$;
drop trigger if exists sia_group_deleted on public.access_groups;
create trigger sia_group_deleted before delete on public.access_groups
  for each row execute function public.sia_group_deleted();

-- ── Row Level Security ──────────────────────────────────────────
-- Activado en todo. Sin política que lo permita, anon no ve ni toca nada.
-- Las políticas escriben las funciones como subconsulta — (select fn()) y
-- `in (select unnest(fn()))` — para que Postgres las evalúe una vez por
-- consulta y no una por fila.
alter table public.projects        enable row level security;
alter table public.contexts        enable row level security;
alter table public.context_entries enable row level security;
alter table public.context_chunks  enable row level security;
alter table public.skills          enable row level security;
alter table public.skill_files     enable row level security;
alter table public.access_groups   enable row level security;
alter table public.access_grants   enable row level security;
alter table public.project_links   enable row level security;
alter table public.power_keys      enable row level security;

-- projects: se ven los que dan los tokens; los gestiona «admin»
drop policy if exists sia_projects_read  on public.projects;
drop policy if exists sia_projects_admin on public.projects;
create policy sia_projects_read on public.projects for select to anon
  using (id in (select unnest(public.sia_projects())) or (select public.sia_can('admin')));
create policy sia_projects_admin on public.projects for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

-- contexts: los de proyectos permitidos; los gestiona «admin»
drop policy if exists sia_contexts_read  on public.contexts;
drop policy if exists sia_contexts_admin on public.contexts;
create policy sia_contexts_read on public.contexts for select to anon
  using (project_id in (select unnest(public.sia_projects())) or (select public.sia_can('admin')));
create policy sia_contexts_admin on public.contexts for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

-- context_entries: con token se leen, se guardan y se borran las de sus
-- proyectos (lo que hace el MCP del chat); «admin» además lo demás
drop policy if exists sia_entries_read   on public.context_entries;
drop policy if exists sia_entries_insert on public.context_entries;
drop policy if exists sia_entries_delete on public.context_entries;
drop policy if exists sia_entries_admin  on public.context_entries;
create policy sia_entries_read on public.context_entries for select to anon
  using (context_id in (select id from public.contexts where project_id in (select unnest(public.sia_projects()))));
create policy sia_entries_insert on public.context_entries for insert to anon
  with check (context_id in (select id from public.contexts where project_id in (select unnest(public.sia_projects()))));
create policy sia_entries_delete on public.context_entries for delete to anon
  using (context_id in (select id from public.contexts where project_id in (select unnest(public.sia_projects()))));
create policy sia_entries_admin on public.context_entries for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

-- context_chunks: igual que sus entries (la búsqueda va por match_chunks)
drop policy if exists sia_chunks_read   on public.context_chunks;
drop policy if exists sia_chunks_insert on public.context_chunks;
drop policy if exists sia_chunks_delete on public.context_chunks;
drop policy if exists sia_chunks_admin  on public.context_chunks;
create policy sia_chunks_read on public.context_chunks for select to anon
  using (entry_id in (select ce.id from public.context_entries ce join public.contexts c on c.id = ce.context_id
                      where c.project_id in (select unnest(public.sia_projects()))));
create policy sia_chunks_insert on public.context_chunks for insert to anon
  with check (entry_id in (select ce.id from public.context_entries ce join public.contexts c on c.id = ce.context_id
                           where c.project_id in (select unnest(public.sia_projects()))));
create policy sia_chunks_delete on public.context_chunks for delete to anon
  using (entry_id in (select ce.id from public.context_entries ce join public.contexts c on c.id = ce.context_id
                      where c.project_id in (select unnest(public.sia_projects()))));
create policy sia_chunks_admin on public.context_chunks for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

-- skills: se ven las comunes y las de mis grupos (el dueño, todas);
-- se escriben según sia_skill_writable
drop policy if exists sia_skills_read   on public.skills;
drop policy if exists sia_skills_insert on public.skills;
drop policy if exists sia_skills_update on public.skills;
drop policy if exists sia_skills_delete on public.skills;
create policy sia_skills_read on public.skills for select to anon
  using (scope is null or scope in (select unnest(public.sia_tokens())) or (select public.sia_is_owner()));
create policy sia_skills_insert on public.skills for insert to anon
  with check (public.sia_skill_writable(scope));
create policy sia_skills_update on public.skills for update to anon
  using (public.sia_skill_writable(scope)) with check (public.sia_skill_writable(scope));
create policy sia_skills_delete on public.skills for delete to anon
  using (public.sia_skill_writable(scope));

-- skill_files: siguen a su skill
drop policy if exists sia_skill_files_read  on public.skill_files;
drop policy if exists sia_skill_files_write on public.skill_files;
create policy sia_skill_files_read on public.skill_files for select to anon
  using (skill_id in (select id from public.skills));
create policy sia_skill_files_write on public.skill_files for all to anon
  using (skill_id in (select id from public.skills where public.sia_skill_writable(scope)))
  with check (skill_id in (select id from public.skills where public.sia_skill_writable(scope)));

-- access_groups / access_grants: cada uno ve sus grupos (para ponerles
-- nombre en la app); los gestiona «admin»
drop policy if exists sia_groups_read  on public.access_groups;
drop policy if exists sia_groups_admin on public.access_groups;
create policy sia_groups_read on public.access_groups for select to anon
  using (token in (select unnest(public.sia_tokens())) or (select public.sia_can('admin')));
create policy sia_groups_admin on public.access_groups for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

drop policy if exists sia_grants_read  on public.access_grants;
drop policy if exists sia_grants_admin on public.access_grants;
create policy sia_grants_read on public.access_grants for select to anon
  using (token in (select unnest(public.sia_tokens())) or (select public.sia_can('admin')));
create policy sia_grants_admin on public.access_grants for all to anon
  using ((select public.sia_can('admin'))) with check ((select public.sia_can('admin')));

-- project_links: se ven los de proyectos permitidos; se editan con permiso
-- «links», y solo dentro de esos mismos proyectos
drop policy if exists sia_links_read  on public.project_links;
drop policy if exists sia_links_write on public.project_links;
create policy sia_links_read on public.project_links for select to anon
  using (project_id in (select unnest(public.sia_projects())));
create policy sia_links_write on public.project_links for all to anon
  using ((select public.sia_can('links')) and project_id in (select unnest(public.sia_projects())))
  with check ((select public.sia_can('links')) and project_id in (select unnest(public.sia_projects())));

-- power_keys: solo el dueño las ve y gestiona, y la suya no se toca
drop policy if exists sia_keys_read   on public.power_keys;
drop policy if exists sia_keys_insert on public.power_keys;
drop policy if exists sia_keys_update on public.power_keys;
drop policy if exists sia_keys_delete on public.power_keys;
create policy sia_keys_read on public.power_keys for select to anon
  using ((select public.sia_is_owner()));
create policy sia_keys_insert on public.power_keys for insert to anon
  with check ((select public.sia_is_owner()) and not owner);
create policy sia_keys_update on public.power_keys for update to anon
  using ((select public.sia_is_owner()) and not owner) with check ((select public.sia_is_owner()) and not owner);
create policy sia_keys_delete on public.power_keys for delete to anon
  using ((select public.sia_is_owner()) and not owner);

-- app_version (opcional, la crea quien publica SIA para avisar de versiones
-- nuevas): si existe, se cierra y se deja solo lectura
do $$ begin
  if to_regclass('public.app_version') is not null then
    execute 'alter table public.app_version enable row level security';
    execute 'drop policy if exists sia_app_version_read on public.app_version';
    execute 'create policy sia_app_version_read on public.app_version for select to anon using (true)';
  end if;
end $$;

-- Funciones de los nombres anteriores (kaios_*): sus políticas ya no existen
-- y las de SIA usan las suyas, así que fuera.
drop function if exists public.kaios_header(text);
drop function if exists public.kaios_tokens();
drop function if exists public.kaios_projects();
drop function if exists public.kaios_is_owner();
drop function if exists public.kaios_can(text);
drop function if exists public.kaios_skill_writable(text);
drop function if exists public.kaios_status();

-- ── Clave del dueño ──────────────────────────────────────────────
-- Generada por SIA al copiar este SQL. Sustituye a la anterior: ejecutar
-- el SQL es cosa de quien tiene el proyecto de Supabase, que es el dueño.
delete from public.power_keys where owner;
insert into public.power_keys (key, name, owner, perms)
values ('__SIA_OWNER_KEY__', 'Owner', true, '{"lab":true,"admin":true,"links":true}'::jsonb);

-- refrescar la caché de la API
notify pgrst, 'reload schema';
