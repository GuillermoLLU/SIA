-- Emula lo que Supabase da de serie y usa supabase-platform.sql: el esquema
-- auth (users, sessions, refresh_tokens y auth.uid(), que lee el JWT de
-- request.jwt.claims como PostgREST), Vault, los roles anon/authenticated y
-- los privilegios por defecto sobre public, que el SQL tiene que cerrar.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz
);
-- sesiones de Auth (las que se cierran al desactivar o cambiar la contraseña)
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid);
-- Supabase Vault, lo justo: guardar, cambiar y leer descifrado
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null);
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid
language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void
language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
create or replace view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
revoke all on schema vault from public;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
