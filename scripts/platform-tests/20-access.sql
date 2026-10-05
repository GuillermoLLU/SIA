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
select assert_eq((select count(*) from platform.users u join platform.roles r on r.id = u.role_id where r.builtin = 'agent'), 3::bigint, 'toda alta entra como agente');
select assert_eq((select views from platform.users limit 1), array['links'], 'con las vistas de Agente');
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
select assert_eq((public.platform_whoami() ->> 'role'), 'Agente', 'el agente se ve como agente');
select expect_error('select count(*) from public.platform_list_users()', 'el agente no lista usuarios');
select expect_error('select count(*) from public.platform_list_bases()', 'el agente no lista bases');
select expect_error('select count(*) from public.platform_list_audit()', 'el agente no ve la auditoría');
select assert_eq(public.platform_can_manage_users(), false, 'el agente no da de alta');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, (select id from platform.roles where builtin = 'admin'))$$, 'el agente no se hace admin');
select expect_error('select count(*) from public.platform_list_roles()', 'el agente no ve los roles');
select expect_error($$select public.platform_save_role(null, 'Jefe', array['people'])$$, 'ni los crea');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a3', 'X')$$, 'el agente no renombra a otros');
select public.platform_update_user(:U1, 'Agente 1');
select assert_eq((public.platform_whoami() ->> 'name'), 'Agente 1', 'cada uno cambia su nombre');

-- ── 3. admin: usuarios ──
select t_as(:AD);
select assert_eq((select count(*) from public.platform_list_users()), 3::bigint, 'el admin ve a todos');
select assert_eq(public.platform_can_manage_users(), true, 'el admin da de alta');
\set RADMIN '(select id from public.platform_list_roles() where builtin = ''admin'')'
\set RAGENT '(select id from public.platform_list_roles() where builtin = ''agent'')'
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a1', null, (select id from public.platform_list_roles() where builtin = 'agent'))$$, 'nadie cambia su propio rol');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a1', null, null, false)$$, 'nadie se desactiva');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, gen_random_uuid())$$, 'rol desconocido');
select public.platform_update_user(:U2, null, :RADMIN);
select t_as(:U2);
select assert_eq((select count(*) from public.platform_list_users()), 3::bigint, 'el nuevo admin ve a todos');
select t_as(:AD);
select public.platform_update_user(:U2, null, :RAGENT);
select assert_eq((select views from public.platform_list_users() where id = :U2), array['links'], 'volver a agente: sus vistas');

-- roles: crear, asignar, editar (se aplica a quien lo tiene), personalizar y borrar
select public.platform_save_role(null, 'Supervisor', array['lab', 'links', 'lab']);
select assert_eq((select views from public.platform_list_roles() where name = 'Supervisor'), array['lab', 'links'], 'rol nuevo, sin repetir vistas');
select expect_error($$select public.platform_save_role(null, 'supervisor', array['links'])$$, 'nombre repetido');
select expect_error($$select public.platform_save_role(null, 'X', array['root'])$$, 'vista desconocida en un rol');
select expect_error($$select public.platform_save_role((select id from public.platform_list_roles() where builtin = 'admin'), 'Admin', array['links'])$$, 'Administrador no se cambia');
select expect_error($$select public.platform_save_role((select id from public.platform_list_roles() where builtin = 'admin'), 'Administrador', array['links', 'lab', 'admin', 'people'])$$, 'ni aunque sea igual: es el mío');
select expect_error($$select public.platform_delete_role((select id from public.platform_list_roles() where builtin = 'agent'))$$, 'los de serie no se borran');
select public.platform_update_user(:U1, null, (select id from public.platform_list_roles() where name = 'Supervisor'));
select public.platform_update_user(:U2, null, (select id from public.platform_list_roles() where name = 'Supervisor'));
select assert_eq((select role_name || ':' || array_to_string(views, ',') from public.platform_list_users() where id = :U1), 'Supervisor:lab,links', 'asignar un rol pone sus vistas');
select public.platform_update_user(:U2, null, null, null, array['links']);
select assert_eq((select coalesce(role_name, 'personalizado') from public.platform_list_users() where id = :U2), 'personalizado', 'tocar una vista: personalizado');
select public.platform_save_role((select id from public.platform_list_roles() where name = 'Supervisor'), 'Supervisión', array['links', 'people']);
select assert_eq((select role_name || ':' || array_to_string(views, ',') from public.platform_list_users() where id = :U1), 'Supervisión:links,people', 'editar el rol cambia a quien lo tiene');
select assert_eq((select views from public.platform_list_users() where id = :U2), array['links'], 'y no al personalizado');
select t_as(:U1);
select expect_error($$select public.platform_save_role((select id from public.platform_list_roles() where name = 'Supervisión'), 'Supervisión', array['links', 'people', 'lab'])$$, 'nadie edita el rol que tiene');
select t_as(:AD);
select public.platform_delete_role((select id from public.platform_list_roles() where name = 'Supervisión'));
select assert_eq((select coalesce(role_name, 'personalizado') || ':' || array_to_string(views, ',') from public.platform_list_users() where id = :U1), 'personalizado:links,people', 'borrar el rol: se queda con sus vistas');
select public.platform_update_user(:U1, null, :RAGENT);
select public.platform_update_user(:U2, null, :RAGENT);

-- vistas: el rol es el punto de partida; después, una a una
select assert_eq((select (public.platform_whoami() -> 'views') ?& array['issues', 'work', 'metrics', 'links', 'lab', 'admin', 'people']), true, 'el admin, todas');
select public.platform_update_user(:U1, null, null, null, array['people', 'links', 'people']);
select assert_eq((select views from public.platform_list_users() where id = :U1), array['links', 'people'], 'vistas a mano, sin repetir');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, null, null, array['root'])$$, 'vista desconocida');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, null, null, array['knowledge'])$$, 'la vista «knowledge» ya no existe');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a1', null, null, null, array['links'])$$, 'nadie cambia sus propias vistas');
select t_as(:U1);
select assert_eq((select count(*) from public.platform_list_users()), 3::bigint, 'con Personas ve a todos aunque sea agente');
select assert_eq(public.platform_can_manage_users(), true, 'y da de alta');
select assert_eq((select count(*) from public.platform_list_bases()), 0::bigint, 've las bases para asignarlas');
select expect_error($$select public.platform_update_user('00000000-0000-0000-0000-0000000000a2', null, null, null, array['links', 'people', 'lab'])$$, 'ni se da vistas a sí mismo');
select t_as(:AD);
select public.platform_update_user(:U1, null, null, null, array[]::text[]);
select t_as(:U1);
select assert_eq((public.platform_whoami() -> 'views'), '[]'::jsonb, 'sin vistas: solo el Chat');
select assert_eq(public.platform_can_manage_users(), false, 'y sin Personas');
select t_as(:AD);
select public.platform_update_user(:U1, null, :RAGENT);

-- contraseña puesta por un admin: hay que cambiarla al entrar; un cambio cierra sesiones
reset role;
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-0000000000a3');
insert into auth.refresh_tokens (user_id) values ('00000000-0000-0000-0000-0000000000a3');
set role authenticated;
select t_as(:AD);
select public.platform_record_user_event('user.create', :U2, 'Agente.Dos@empresa.com');
select assert_eq((select details ->> 'email' from public.platform_list_audit() where action = 'user.create'), 'agente.dos@empresa.com', 'el alta queda apuntada');
select assert_eq((select must_change_password from public.platform_list_users() where id = :U2), true, 'alta: debe cambiar la contraseña');
select public.platform_record_user_event('user.password', :U2, 'agente.dos@empresa.com');
reset role;
select assert_eq((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a3'), 0::bigint, 'contraseña nueva: sesiones cerradas');
select assert_eq((select count(*) from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000a3'), 0::bigint, 'y sus refresh tokens');
set role authenticated;
select t_as(:U2);
select assert_eq((public.platform_whoami() ->> 'must_change_password')::boolean, true, 'whoami lo dice');
select public.platform_password_changed();
select assert_eq((public.platform_whoami() ->> 'must_change_password')::boolean, false, 'cambiada: ya no');
select t_as(:AD);
select expect_error($$select public.platform_record_user_event('user.hack', '00000000-0000-0000-0000-0000000000a3', 'x@y.z')$$, 'evento desconocido');
select t_as(:U1);
select expect_error($$select public.platform_record_user_event('user.delete', '00000000-0000-0000-0000-0000000000a3', 'x@y.z')$$, 'un agente no apunta eventos');
select t_as(:AD);

-- ── 4. bases y su clave de poder (Vault) ──
-- la base de la instancia se fija desde el SQL Editor, no desde la API
select expect_error($$select platform.set_knowledge_base('Soporte', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'pk-admin-soporte-123')$$, 'desde la API no se fija la base');
reset role;
select expect_error($$select platform.set_knowledge_base('Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwxyz', 'pk-owner-123')$$, 'rechaza la clave secret');
select expect_error($$select platform.set_knowledge_base('Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc', 'pk-owner-123')$$, 'rechaza un JWT');
select expect_error($$select platform.set_knowledge_base('Mala', 'https://evil.com', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'pk-owner-123')$$, 'rechaza URLs que no son de Supabase');
select expect_error($$select platform.set_knowledge_base('Mala', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'con,coma')$$, 'clave de poder con coma');
select platform.set_knowledge_base('Soporte', 'https://ABCDEFGHIJKLMNOPQRST.supabase.co/', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'pk-admin-soporte-123');
select platform.set_knowledge_base('Soporte', 'https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'pk-admin-soporte-456');
select assert_eq((select count(*) from platform.knowledge_bases), 1::bigint, 'volver a fijarla no la duplica');
select assert_eq((select count(*) from vault.secrets where name like 'sia-base-%'), 1::bigint, 'ni su clave en Vault');
set role authenticated;
select t_as(:AD);
select assert_eq((select url from public.platform_list_bases()), 'https://abcdefghijklmnopqrst.supabase.co', 'URL normalizada');
select assert_eq((select has_power_key from public.platform_list_bases()), true, 'con su clave de poder');
select assert_eq((select power_key from public.platform_base_access()), 'pk-admin-soporte-456', 'quien gestiona Personas recibe la clave cambiada');

-- ── 5. conocimiento: fijar grupos de una base y copiar de otra persona ──
select public.platform_set_knowledge(:U1, (select id from public.platform_list_bases() where name = 'Soporte'),
  '[{"name":"Nivel 1","token":"tok-soporte-n1-secreto"},{"name":"Nivel 2","token":"tok-soporte-n2-secreto"}]');
select assert_eq((select jsonb_array_length(knowledge -> 0 -> 'groups') from public.platform_list_users() where id = :U1), 2, 'dos grupos');
select assert_eq((select knowledge -> 0 -> 'groups' -> 0 ->> 'id' from public.platform_list_users() where id = :U1),
  encode(sha256(convert_to('tok-soporte-n1-secreto', 'UTF8')), 'hex'), 'el admin ve la huella, no el token');
select assert_eq((select count(*) from public.platform_list_users() where knowledge::text like '%secreto%'), 0::bigint, 'ningún token en la lista');
select public.platform_set_knowledge(:U1, (select id from public.platform_list_bases() where name = 'Soporte'), '[{"name":"Nivel 1","token":"tok-soporte-n1-secreto"}]');
select assert_eq((select jsonb_array_length(knowledge -> 0 -> 'groups') from public.platform_list_users() where id = :U1), 1, 'quitar un grupo');
select expect_error($$select public.platform_set_knowledge('00000000-0000-0000-0000-0000000000a2', (select id from public.platform_list_bases() where name = 'Soporte'), '[{"name":"X","token":"con,coma1"}]')$$, 'token con coma');
select expect_error($$select public.platform_set_knowledge(gen_random_uuid(), (select id from public.platform_list_bases() where name = 'Soporte'), '[]')$$, 'usuario inexistente');
select expect_error($$select public.platform_set_knowledge('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), '[]')$$, 'base inexistente');
select public.platform_copy_knowledge(:U2, :U1);
select assert_eq((select knowledge from public.platform_list_users() where id = :U2), (select knowledge from public.platform_list_users() where id = :U1), 'igual que otra persona');
select expect_error($$select public.platform_copy_knowledge('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2')$$, 'copiarse a sí mismo');
select public.platform_set_knowledge(:U2, (select id from public.platform_list_bases() where name = 'Soporte'), '[]');
select assert_eq((select knowledge from public.platform_list_users() where id = :U2), '[]'::jsonb, 'lista vacía: deja de ver la base');

-- ── 5b. clave de poder de cada persona en cada base (Vault) ──
select public.platform_set_person_key(:U1, (select id from public.platform_list_bases() where name = 'Soporte'), 'pk-persona-uno-1');
select public.platform_set_person_key(:U1, (select id from public.platform_list_bases() where name = 'Soporte'), 'pk-persona-uno-2');
select assert_eq((select power_key from public.platform_person_keys(:U1)), 'pk-persona-uno-2', 'poner y cambiar la clave de alguien');
select expect_error($$select public.platform_set_person_key('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), 'pk-persona-x-1')$$, 'base inexistente');
select public.platform_set_person_key(:U2, (select id from public.platform_list_bases() where name = 'Soporte'), 'pk-persona-dos-1');
select public.platform_set_person_key(:U2, (select id from public.platform_list_bases() where name = 'Soporte'), null);
select assert_eq((select count(*) from public.platform_person_keys(:U2)), 0::bigint, 'olvidar una clave');
reset role;
select assert_eq((select count(*) from vault.secrets where name like 'sia-person-%'), 1::bigint, 'y sale de Vault');
set role authenticated;

-- ── 6. agente: solo su conocimiento ──
select t_as(:U1);
select assert_eq((select group_token from public.platform_my_knowledge()), 'tok-soporte-n1-secreto', 'el agente recibe su token entero');
select assert_eq((select publishable_key from public.platform_my_knowledge()), 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'y la clave publishable de la base');
select assert_eq((select power_key from public.platform_my_knowledge()), 'pk-persona-uno-2', 'y su clave de poder en esa base');
select expect_error('select count(*) from public.platform_person_keys()', 'el agente no ve las claves de otros');
select expect_error($$select public.platform_set_person_key('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), 'pk-persona-x-1')$$, 'ni se pone claves');
select expect_error('select count(*) from public.platform_base_access()', 'el agente no recibe claves de poder');
select expect_error($$select public.platform_set_knowledge('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), '[]')$$, 'el agente no asigna');
select expect_error($$select public.platform_copy_knowledge('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1')$$, 'el agente no copia');
select t_as(:U2);
select assert_eq((select count(*) from public.platform_my_knowledge()), 1::bigint, 'todos ven la base de la instancia');
select assert_eq((select count(*) from public.platform_my_knowledge() where group_token is not null), 0::bigint, 'pero ningún grupo ajeno');
select t_as(:AD);
select assert_eq((select power_key from public.platform_my_knowledge()), 'pk-admin-soporte-456', 'con Administración, la clave del dueño');

-- ── 6b. cambiar de base y desactivar ──
reset role;
select platform.set_knowledge_base('Logística', 'https://abcdefghijklmnopqrsu.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz', 'pk-admin-logistica-1');
select assert_eq((select string_agg(name, ',') from platform.knowledge_bases), 'Logística', 'otra URL: otra base');
select assert_eq((select count(*) from vault.secrets where name like 'sia-base-%'), 1::bigint, 'la clave de la anterior sale de Vault');
select assert_eq((select count(*) from vault.secrets where name like 'sia-person-%'), 0::bigint, 'y las de las personas en ella');
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select t_as(:U1);
select assert_eq((select count(*) from public.platform_my_knowledge() where group_token is not null), 0::bigint, 'lo asignado de la anterior se fue con ella');
select t_as(:AD);
select public.platform_update_user(:U1, null, null, false);
reset role;
select assert_eq((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a2'), 0::bigint, 'desactivar cierra sus sesiones');
set role authenticated;
select t_as(:U1);
select expect_error('select public.platform_whoami()', 'un usuario desactivado no entra');

-- ── 7. auditoría ──
select t_as(:AD);
select assert_eq((select count(*) > 0 from public.platform_list_audit()), true, 'el admin ve la auditoría');
select assert_eq((select count(*) from public.platform_list_audit(500) where details::text like '%secreto%' or details::text like '%pk-admin%'), 0::bigint, 'la auditoría no guarda tokens ni claves');
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
