-- Emula lo que Supabase da de serie: esquema extensions, rol anon y los
-- privilegios por defecto sobre public (RLS es lo que luego restringe).
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
grant usage on schema public, extensions to anon;
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;
