-- Pruebas de supabase-platform.sql. Cada bloque actúa como lo haría
-- PostgREST: rol authenticated (o anon) y el JWT en request.jwt.claims.
-- Cualquier fallo → exception y se para.
\set ON_ERROR_STOP on

create or replace function public.assert_eq(got anyelement, want anyelement, msg text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALLO %: esperado %, obtenido %', msg, want, got; end if; end $$;
create or replace function public.expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'FALLO %: debía fallar y no falló', msg;
end $$;
grant execute on function public.assert_eq(anyelement, anyelement, text), public.expect_error(text, text) to anon, authenticated;

-- Personas en Supabase Auth (como postgres). El disparador crea su fila en platform.users.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin@Empresa.com', '{"name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'agente.uno@empresa.com', '{"name":"Agente Uno"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'agente.dos@empresa.com', '{}');
select assert_eq((select count(*) from platform.users), 3::bigint, 'el disparador crea las filas de platform.users');
select assert_eq((select count(*) from platform.users where role = 'agent'), 3::bigint, 'toda alta entra como agente');
select assert_eq((select email from platform.users where name = 'Admin'), 'admin@empresa.com', 'email en minúsculas');
select assert_eq((select name from platform.users where email = 'agente.dos@empresa.com'), 'agente.dos', 'sin nombre: la parte local del email');
select platform.grant_admin('ADMIN@empresa.com');

create or replace function public.t_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false)
$$;
grant execute on function public.t_as(text) to anon, authenticated;
\set AD '''00000000-0000-0000-0000-0000000000a1'''
\set U1 '''00000000-0000-0000-0000-0000000000a2'''
\set U2 '''00000000-0000-0000-0000-0000000000a3'''

-- ── 1. anon: ni tablas ni funciones ──
select set_config('request.jwt.claims', '', false);
set role anon;
select expect_error('select count(*) from platform.users', 'anon no lee el esquema privado');
select expect_error('select public.platform_whoami()', 'anon no ejecuta la API');
select expect_error('select platform.grant_admin(''x@y.z'')', 'anon no se hace admin');
reset role;

-- ── 2. authenticated: sin fila, o agente ──
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
select expect_error('select public.platform_whoami()', 'un sub inexistente no tiene sesión');
select t_as(:U1);
select expect_error('select count(*) from platform.users', 'authenticated no lee las tablas directamente');
select expect_error('select platform.grant_admin(''agente.uno@empresa.com'')', 'authenticated no se hace admin');
select assert_eq((public.platform_whoami() ->> 'role'), 'agent', 'el agente se ve como agente');
select expect_error('select count(*) from public.platform_list_users()', 'el agente no lista usuarios');
select expect_error('select count(*) from public.platform_list_bases()', 'el agente no lista bases');
select expect_error('select count(*) from public.platform_list_audit()', 'el agente no ve la auditoría');
select assert_eq(public.platform_can_manage_users(), false, 'el agente no da de alta');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, 'admin')$$, 'el agente no se hace admin');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a3', 'X')$$, 'el agente no renombra a otros');
select public.platform_update_user(:U1, 'Agente 1');
select assert_eq((public.platform_whoami() ->> 'name'), 'Agente 1', 'cada uno cambia su nombre');

-- ── 3. admin: usuarios ──
select t_as(:AD);
select assert_eq((select count(*) from public.platform_list_users()), 3::bigint, 'el admin ve a todos');
select assert_eq(public.platform_can_manage_users(), true, 'el admin da de alta');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a1', null, 'agent')$$, 'nadie cambia su propio rol');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a1', null, null, false)$$, 'nadie se desactiva');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, 'root')$$, 'rol desconocido');
select public.platform_update_user(:U2, null, 'admin');
select t_as(:U2);
select assert_eq((select count(*) from public.platform_list_users()), 3::bigint, 'el nuevo admin ve a todos');
select t_as(:AD);
select public.platform_update_user(:U2, null, 'agent');

-- ── 4. bases y conocimiento ──
select expect_error($$select public.platform_add_base('Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwxyz')$$, 'rechaza la clave secret');
select expect_error($$select public.platform_add_base('Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc')$$, 'rechaza un JWT');
select expect_error($$select public.platform_add_base('Mala', 'https://evil.com', 'sb_publishable_abcdefghijklmnopqrstuvwxyz')$$, 'rechaza URLs que no son de Supabase');
select public.platform_add_base('Soporte', 'https://ABCDEFGHIJKLMNOPQRST.supabase.co/', 'sb_publishable_abcdefghijklmnopqrstuvwxyz');
select expect_error($$select public.platform_add_base('Otra', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz')$$, 'base repetida');
select assert_eq((select url from public.platform_list_bases()), 'https://abcdefghijklmnopqrst.supabase.co', 'URL normalizada');
select public.platform_grant_knowledge(:U1, (select id from public.platform_list_bases()), 'Soporte N1', 'tok-soporte-n1-secreto');
select expect_error($$select public.platform_grant_knowledge('00000000-0000-0000-0000-0000000000a2', (select id from public.platform_list_bases()), 'Soporte N1', 'tok-soporte-n1-secreto')$$, 'acceso repetido');
select expect_error($$select public.platform_grant_knowledge('00000000-0000-0000-0000-0000000000a2', (select id from public.platform_list_bases()), 'X', 'con,coma1')$$, 'token con coma');
select expect_error($$select public.platform_grant_knowledge(gen_random_uuid(), (select id from public.platform_list_bases()), 'X', 'tok-xxxxxxxx')$$, 'usuario inexistente');
select assert_eq((select token_hint from public.platform_list_grants(:U1)), 'tok-…reto', 'el admin ve el token enmascarado');

-- ── 5. agente: solo su conocimiento ──
select t_as(:U1);
select assert_eq((select group_token from public.platform_my_knowledge()), 'tok-soporte-n1-secreto', 'el agente recibe su token entero');
select assert_eq((select publishable_key from public.platform_my_knowledge()), 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'y la clave publishable de la base');
select expect_error('select count(*) from public.platform_list_grants(''00000000-0000-0000-0000-0000000000a2'')', 'el agente no lista accesos');
select expect_error($$select public.platform_add_base('X', 'https://abcdefghijklmnopqrsu.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz')$$, 'el agente no añade bases');
select t_as(:U2);
select assert_eq((select count(*) from public.platform_my_knowledge()), 0::bigint, 'otro agente no ve lo ajeno');

-- ── 6. revocar y desactivar ──
reset role;
create temporary table t_grant as select id from platform.knowledge_grants;
grant select on t_grant to authenticated;
set role authenticated;
select t_as(:U2);
select expect_error('select public.platform_revoke_knowledge((select id from t_grant))', 'un agente no revoca');
select t_as(:AD);
select public.platform_revoke_knowledge((select id from t_grant));
select expect_error('select public.platform_revoke_knowledge((select id from t_grant))', 'revocar lo inexistente');
select t_as(:U1);
select assert_eq((select count(*) from public.platform_my_knowledge()), 0::bigint, 'revocado: ya no lo ve');
select t_as(:AD);
select public.platform_update_user(:U1, null, null, false);
select t_as(:U1);
select expect_error('select public.platform_whoami()', 'un usuario desactivado no entra');

-- ── 7. auditoría ──
select t_as(:AD);
select assert_eq((select count(*) > 0 from public.platform_list_audit()), true, 'el admin ve la auditoría');
select assert_eq((select count(*) from public.platform_list_audit(500) where details::text like '%tok-soporte-n1-secreto%'), 0::bigint, 'la auditoría no guarda tokens enteros');
reset role;
select expect_error('update platform.audit_log set action = ''x''', 'la auditoría no se edita');
select expect_error('delete from platform.audit_log', 'ni se borra');

-- ── 8. privilegios: ninguna función de la API para anon ──
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'platform\_%' and has_function_privilege('anon', p.oid, 'execute')), 0::bigint, 'anon no ejecuta ninguna platform_*');
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'platform\_%' and not p.prosecdef), 0::bigint, 'todas son SECURITY DEFINER');
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'platform' or (n.nspname = 'public' and p.proname like 'platform\_%'))
    and not coalesce('search_path=""' = any (p.proconfig), false)), 0::bigint, 'todas fijan search_path vacío');

\echo 'acceso: todo ok'
