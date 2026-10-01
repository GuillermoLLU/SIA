-- SIA: esquema de la base de conocimiento.

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

-- ── RPC de búsqueda vectorial ───────────────────────────────────
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
language plpgsql
set search_path = public, extensions
as $$
begin
  return query
  select cc.id, cc.entry_id, cc.chunk_text, cc.chunk_index,
         1 - (cc.embedding <=> query_embedding) as similarity,
         ctx.name as context_name
  from public.context_chunks cc
  join public.context_entries ce on ce.id = cc.entry_id
  join public.contexts ctx on ctx.id = ce.context_id
  where (filter_project_id is null or ctx.project_id = filter_project_id)
    and 1 - (cc.embedding <=> query_embedding) > match_threshold
  order by cc.embedding <=> query_embedding
  limit match_count;
end;
$$;

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
-- Una sola fila. admin_key abre el Laboratorio (skills de grupo);
-- superadmin_key además las skills comunes y el panel de administración.
-- La crea el asistente de montaje de SIA al verificar la base (o a mano:
-- insert into public.instance (id, admin_key, superadmin_key) values (1, '…', '…')).
create table if not exists public.instance (
  id             int primary key default 1 check (id = 1),
  admin_key      text not null,
  superadmin_key text not null,
  created_at     timestamptz not null default now()
);

-- ── Claves de poder con permisos por vista ───────────────────────
-- Varias claves; cada una abre las vistas que diga perms:
--   {"lab":true,"admin":true,"links":true}
-- lab = Laboratorio (skills de grupo), admin = Administración,
-- links = editar enlaces. Las skills comunes las gestiona solo el owner. La fila owner=true es el
-- dueño (todo, no se puede revocar). Si la tabla está vacía, SIA la siembra
-- desde instance (superadmin_key → dueño, admin_key → Laboratorio).
create table if not exists public.power_keys (
  key        text primary key,
  name       text not null,
  owner      boolean not null default false,
  perms      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- refrescar la caché de la API
notify pgrst, 'reload schema';
