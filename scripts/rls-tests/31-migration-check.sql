\set ON_ERROR_STOP on
select assert_eq((select count(*) from public.context_entries), 1::bigint, 'conocimiento conservado');
select assert_eq((select count(*) from public.skills where scope is not null), 1::bigint, 'skills conservadas');
select assert_eq((select count(*) from public.skills where scope is null), 7::bigint, 'skills comunes de la app añadidas');
select assert_eq((select count(*) from public.access_grants), 1::bigint, 'accesos conservados');
select assert_eq((select key from public.power_keys where owner), 'OWNER-KEY-TEST', 'dueño renovado');
select assert_eq((select array_agg(key order by key) from public.power_keys where not owner), array['old-admin','pk-x'], 'claves no-dueño conservadas');
select assert_eq(to_regclass('public.instance') is null, true, 'instance eliminada');
select set_config('request.headers', '{"x-sia-tokens":"tokV"}', false);
set role anon;
select assert_eq((select count(*) from public.match_chunks((select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)), 0.0, 10, null)), 1::bigint, 'búsqueda con el token viejo funciona');
select assert_eq((select array_agg(id) from public.skills where scope is not null), array['sv'], 'skill vieja visible con su token');
reset role;
select assert_eq((select confdeltype from pg_constraint where conname = 'context_entries_context_id_fkey'), 'c'::"char", 'la clave ajena sin cascada queda reparada');
select 'MIGRACIÓN OK' as resultado;
