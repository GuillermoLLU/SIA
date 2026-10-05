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
  ('00000000-0000-0000-0000-00000000000a', 'Super@Empresa.com', '{"name":"Super"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin.a@empresa.com', '{"name":"Admin A"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'agente.a@empresa.com', '{"name":"Agente A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin.b@empresa.com', '{"name":"Admin B"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'agente.b@empresa.com', '{}'),
  ('00000000-0000-0000-0000-0000000000f0', 'fuera@empresa.com', '{"name":"Fuera"}');
select assert_eq((select count(*) from platform.users), 6::bigint, 'el disparador crea las filas de platform.users');
select assert_eq((select email from platform.users where name = 'Super'), 'super@empresa.com', 'email en minúsculas');
select assert_eq((select name from platform.users where email = 'agente.b@empresa.com'), 'agente.b', 'sin nombre: la parte local del email');
select platform.grant_superadmin('super@empresa.com');

create or replace function public.t_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false)
$$;
grant execute on function public.t_as(text) to anon, authenticated;
\set S  '''00000000-0000-0000-0000-00000000000a'''
\set A1 '''00000000-0000-0000-0000-0000000000a1'''
\set A2 '''00000000-0000-0000-0000-0000000000a2'''
\set B1 '''00000000-0000-0000-0000-0000000000b1'''
\set B2 '''00000000-0000-0000-0000-0000000000b2'''
\set F0 '''00000000-0000-0000-0000-0000000000f0'''

-- ── 1. anon: ni tablas ni funciones ──
select set_config('request.jwt.claims', '', false);
set role anon;
select expect_error('select count(*) from platform.users', 'anon no lee el esquema privado');
select expect_error('select public.platform_whoami()', 'anon no ejecuta la API');
select expect_error('select platform.grant_superadmin(''x@y.z'')', 'anon no se hace superadmin');
reset role;

-- ── 2. authenticated sin JWT válido o de alguien ajeno ──
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
select expect_error('select public.platform_whoami()', 'un sub inexistente no tiene sesión');
select t_as(:F0);
select expect_error('select count(*) from platform.clients', 'authenticated no lee las tablas directamente');
select expect_error('select platform.grant_superadmin(''fuera@empresa.com'')', 'authenticated no se hace superadmin');
select assert_eq((public.platform_whoami() -> 'memberships'), '[]'::jsonb, 'sin clientes');
select assert_eq((select count(*) from public.platform_list_clients()), 0::bigint, 'no ve clientes');
select expect_error('select public.platform_create_client(''X'', ''x'')', 'solo el superadmin crea clientes');

-- ── 3. superadmin: clientes y sus administradores ──
select t_as(:S);
select assert_eq((public.platform_whoami() ->> 'is_superadmin')::boolean, true, 'superadmin');
select public.platform_create_client('Inditex', 'inditex');
select public.platform_create_client('Cliente B', 'cliente-b');
select expect_error('select public.platform_create_client(''inditex'', ''otro'')', 'nombre de cliente repetido');
select expect_error('select public.platform_create_client(''Malo'', ''Con Espacios'')', 'identificador no válido');
select public.platform_set_member((select id from platform_list_clients() where slug = 'inditex'), 'ADMIN.A@empresa.com', 'admin');
select public.platform_set_member((select id from platform_list_clients() where slug = 'cliente-b'), 'admin.b@empresa.com', 'admin');
select assert_eq((select count(*) from public.platform_list_clients()), 2::bigint, 'el superadmin ve todos');
reset role;
create temporary table t_ids as select
  (select id from platform.clients where slug = 'inditex') as ca,
  (select id from platform.clients where slug = 'cliente-b') as cb;
grant select on t_ids to authenticated;
set role authenticated;

-- ── 4. admin A: solo su cliente y solo agentes ──
select t_as(:A1);
select assert_eq((select count(*) from public.platform_list_clients()), 1::bigint, 'admin A ve solo su cliente');
select public.platform_set_member((select ca from t_ids), 'agente.a@empresa.com', 'agent');
select assert_eq((select count(*) from public.platform_list_members((select ca from t_ids))), 2::bigint, 'admin A ve a los de su cliente');
select expect_error('select public.platform_list_members((select cb from t_ids))', 'admin A no ve los usuarios de B');
select expect_error('select public.platform_set_member((select ca from t_ids), ''fuera@empresa.com'', ''admin'')', 'admin A no nombra admins');
select expect_error('select public.platform_set_member((select cb from t_ids), ''fuera@empresa.com'', ''agent'')', 'admin A no da de alta en B');
select expect_error('select public.platform_set_member((select ca from t_ids), ''noexiste@empresa.com'', ''agent'')', 'email inexistente');
select assert_eq(public.platform_can_add_member((select ca from t_ids), 'agent'), true, 'admin A puede dar de alta agentes en A');
select assert_eq(public.platform_can_add_member((select ca from t_ids), 'admin'), false, 'admin A no puede dar de alta admins');
select assert_eq(public.platform_can_add_member((select cb from t_ids), 'agent'), false, 'admin A no puede dar de alta en B');
select expect_error('select public.platform_create_client(''Y'', ''y'')', 'un admin no crea clientes');

-- ── 5. bases y conocimiento ──
select expect_error($$select public.platform_add_base((select ca from t_ids), 'Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwxyz')$$, 'rechaza la clave secret');
select expect_error($$select public.platform_add_base((select ca from t_ids), 'Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc')$$, 'rechaza un JWT');
select expect_error($$select public.platform_add_base((select ca from t_ids), 'Mala', 'https://evil.com', 'sb_publishable_abcdefghijklmnopqrstuvwxyz')$$, 'rechaza URLs que no son de Supabase');
select public.platform_add_base((select ca from t_ids), 'Soporte', 'https://ABCDEFGHIJKLMNOPQRST.supabase.co/', 'sb_publishable_abcdefghijklmnopqrstuvwxyz');
select assert_eq((select url from public.platform_list_bases((select ca from t_ids))), 'https://abcdefghijklmnopqrst.supabase.co', 'URL normalizada');
select public.platform_grant_knowledge((select ca from t_ids), :A2, (select id from public.platform_list_bases((select ca from t_ids))), 'Soporte N1', 'tok-soporte-n1-secreto');
select expect_error($$select public.platform_grant_knowledge((select ca from t_ids), '00000000-0000-0000-0000-0000000000b2', (select id from public.platform_list_bases((select ca from t_ids))), 'X', 'tok-xxxxxxxx')$$, 'no se asigna a quien no es del cliente');
select expect_error($$select public.platform_grant_knowledge((select ca from t_ids), '00000000-0000-0000-0000-0000000000a2', (select id from public.platform_list_bases((select ca from t_ids))), 'X', 'con,coma1')$$, 'token con coma');
select assert_eq((select token_hint from public.platform_list_grants((select ca from t_ids), :A2)), 'tok-…reto', 'el admin ve el token enmascarado');

-- ── 6. agente A: solo su conocimiento ──
select t_as(:A2);
select assert_eq((select group_token from public.platform_my_knowledge()), 'tok-soporte-n1-secreto', 'el agente recibe su token entero');
select assert_eq((select publishable_key from public.platform_my_knowledge()), 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'y la clave publishable de la base');
select assert_eq((public.platform_whoami() -> 'memberships' -> 0 ->> 'profile'), 'agent', 'perfil agente');
select expect_error('select public.platform_list_members((select ca from t_ids))', 'el agente no lista usuarios');
select expect_error('select public.platform_list_bases((select ca from t_ids))', 'el agente no lista bases');
select expect_error($$select public.platform_add_base((select ca from t_ids), 'X', 'https://abcdefghijklmnopqrsu.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz')$$, 'el agente no añade bases');
select assert_eq(public.platform_can_add_member((select ca from t_ids), 'agent'), false, 'el agente no da de alta');
select expect_error('select public.platform_list_audit((select ca from t_ids))', 'el agente no ve la auditoría');

-- ── 7. admin B: nada de A ──
reset role;
create temporary table t_grant as select id from platform.knowledge_grants;
grant select on t_grant to authenticated;
set role authenticated;
select t_as(:B1);
select public.platform_set_member((select cb from t_ids), 'agente.b@empresa.com', 'agent');
select expect_error('select * from public.platform_list_grants((select ca from t_ids), ''00000000-0000-0000-0000-0000000000a2'')', 'admin B no ve accesos de A');
select expect_error('select public.platform_revoke_knowledge((select id from t_grant))', 'admin B no revoca en A');
select expect_error('select public.platform_remove_base(gen_random_uuid())', 'base inexistente: sin permiso');
select assert_eq((select count(*) from public.platform_my_knowledge()), 0::bigint, 'admin B no tiene conocimiento');

-- ── 8. admins entre sí y a sí mismos ──
select t_as(:S);
select public.platform_set_member((select ca from t_ids), 'admin.b@empresa.com', 'admin');
select t_as(:A1);
select expect_error('select public.platform_remove_member((select ca from t_ids), ''00000000-0000-0000-0000-0000000000b1'')', 'un admin no saca a otro admin');
select expect_error('select public.platform_set_member((select ca from t_ids), ''admin.b@empresa.com'', ''agent'')', 'un admin no degrada a otro admin');
select expect_error('select public.platform_remove_member((select ca from t_ids), ''00000000-0000-0000-0000-0000000000a1'')', 'nadie se saca a sí mismo');
select public.platform_remove_member((select ca from t_ids), :A2);
select t_as(:A2);
select assert_eq((select count(*) from public.platform_my_knowledge()), 0::bigint, 'al salir del cliente pierde su conocimiento');
select assert_eq((public.platform_whoami() -> 'memberships'), '[]'::jsonb, 'y el cliente');

-- ── 9. usuarios: nombre propio, activar/desactivar solo el superadmin ──
select t_as(:A1);
select public.platform_update_user(:A1, 'Admin A (nuevo)');
select expect_error('select public.platform_update_user(''00000000-0000-0000-0000-0000000000a2'', ''X'')', 'un admin no renombra a otros');
select expect_error('select public.platform_update_user(''00000000-0000-0000-0000-0000000000a1'', null, false)', 'un admin no se desactiva');
select t_as(:S);
select expect_error('select public.platform_update_user(''00000000-0000-0000-0000-00000000000a'', null, false)', 'el superadmin no se desactiva a sí mismo');
select public.platform_update_user(:B1, null, false);
select t_as(:B1);
select expect_error('select public.platform_whoami()', 'un usuario desactivado no entra');
select expect_error('select public.platform_list_members((select cb from t_ids))', 'ni administra');

-- ── 10. cliente desactivado ──
select t_as(:S);
select public.platform_update_client((select ca from t_ids), null, false);
select t_as(:A1);
select expect_error('select public.platform_list_members((select ca from t_ids))', 'cliente desactivado: su admin ya no administra');
select assert_eq((public.platform_whoami() -> 'memberships'), '[]'::jsonb, 'ni lo ve');
select t_as(:S);
select public.platform_update_client((select ca from t_ids), null, true);

-- ── 11. auditoría ──
select t_as(:A1);
select assert_eq((select count(*) > 0 from public.platform_list_audit((select ca from t_ids))), true, 'el admin ve la auditoría de su cliente');
select assert_eq((select count(*) from public.platform_list_audit((select ca from t_ids)) where details::text like '%tok-soporte-n1-secreto%'), 0::bigint, 'la auditoría no guarda tokens enteros');
select expect_error('select public.platform_list_audit(null)', 'solo el superadmin ve toda la auditoría');
select t_as(:S);
select assert_eq((select count(*) > 0 from public.platform_list_audit(null)), true, 'el superadmin la ve entera');
reset role;
select expect_error('update platform.audit_log set action = ''x''', 'la auditoría no se edita');
select expect_error('delete from platform.audit_log', 'ni se borra');

-- ── 12. privilegios: ninguna función de la API para anon ──
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'platform\_%' and has_function_privilege('anon', p.oid, 'execute')), 0::bigint, 'anon no ejecuta ninguna platform_*');
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'platform\_%' and not p.prosecdef), 0::bigint, 'todas son SECURITY DEFINER');
select assert_eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'platform') and (p.proname like 'platform\_%' or n.nspname = 'platform')
    and not coalesce('search_path=""' = any (p.proconfig), false)), 0::bigint, 'todas fijan search_path vacío');

\echo 'acceso: todo ok'
