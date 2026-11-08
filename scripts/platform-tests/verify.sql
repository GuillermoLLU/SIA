-- Verificación de la base de una instancia ya montada (supabase-platform.sql).
-- Pegar en el SQL Editor del proyecto y ejecutar: devuelve una fila por
-- comprobación con OK o FALLO. Solo lee; no cambia nada.
with
api as (
  select p.oid, p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'platform\_%'
),
expected (proname) as (values
  ('platform_whoami'), ('platform_password_changed'), ('platform_my_knowledge'),
  ('platform_list_users'), ('platform_can_manage_users'), ('platform_update_user'), ('platform_record_user_event'),
  ('platform_list_roles'), ('platform_save_role'), ('platform_delete_role'),
  ('platform_list_bases'), ('platform_base_access'),
  ('platform_set_knowledge'), ('platform_copy_knowledge'), ('platform_person_keys'), ('platform_set_person_key'),
  ('platform_list_audit'), ('platform_issue_claims'), ('platform_claim_next_issue'), ('platform_release_issue'), ('platform_my_issue_events'), ('platform_issue_teammates'),
  ('platform_transfer_issue'), ('platform_issue_events'), ('platform_issue_notes'), ('platform_add_issue_note'), ('platform_edit_issue_note'), ('platform_my_transfers'),
  ('platform_list_rules'), ('platform_save_rule'), ('platform_delete_rule'),
  ('platform_assign_issue')
),
tables as (
  select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'platform' and c.relkind = 'r'
),
checks (orden, comprobacion, ok, detalle) as (
  select 1, 'Las 10 tablas existen en el esquema privado platform',
    (select count(*) from tables where relname in ('roles', 'users', 'knowledge_bases', 'knowledge_grants', 'person_keys', 'audit_log', 'issue_claims', 'issue_events', 'issue_notes', 'priority_rules')) = 10,
    (select string_agg(relname, ', ' order by relname) from tables)
  union all
  select 2, 'No hay funciones platform_* fuera de la API',
    not exists (select 1 from api where proname not in (select proname from expected)),
    coalesce((select string_agg(proname, ', ') from api where proname not in (select proname from expected)), 'ninguna')
  union all
  select 3, 'RLS activado en todas las tablas',
    not exists (select 1 from tables where not relrowsecurity),
    coalesce((select string_agg(relname, ', ') from tables where not relrowsecurity), 'todas con RLS')
  union all
  select 4, 'Ninguna política abre las tablas (denegar todo)',
    not exists (select 1 from pg_policies where schemaname = 'platform'),
    (select count(*)::text || ' políticas' from pg_policies where schemaname = 'platform')
  union all
  select 5, 'anon y authenticated no pueden usar el esquema platform',
    not has_schema_privilege('anon', 'platform', 'usage') and not has_schema_privilege('authenticated', 'platform', 'usage'),
    'usage: anon=' || has_schema_privilege('anon', 'platform', 'usage') || ', authenticated=' || has_schema_privilege('authenticated', 'platform', 'usage')
  union all
  select 6, 'Las 32 funciones de la API existen',
    (select count(*) from api where proname in (select proname from expected)) = 32,
    coalesce((select 'faltan: ' || string_agg(e.proname, ', ') from expected e where e.proname not in (select proname from api)), '32 de 32')
  union all
  select 7, 'Todas son SECURITY DEFINER',
    not exists (select 1 from api where not prosecdef),
    coalesce((select string_agg(proname, ', ') from api where not prosecdef), 'todas')
  union all
  select 8, 'Todas fijan search_path vacío',
    not exists (select 1 from api where not coalesce('search_path=""' = any (proconfig), false)),
    coalesce((select string_agg(proname, ', ') from api where not coalesce('search_path=""' = any (proconfig), false)), 'todas')
  union all
  select 9, 'anon no puede ejecutar ninguna',
    not exists (select 1 from api where has_function_privilege('anon', oid, 'execute')),
    coalesce((select string_agg(proname, ', ') from api where has_function_privilege('anon', oid, 'execute')), 'ninguna')
  union all
  select 10, 'authenticated puede ejecutarlas todas',
    not exists (select 1 from api where not has_function_privilege('authenticated', oid, 'execute')),
    coalesce((select string_agg(proname, ', ') from api where not has_function_privilege('authenticated', oid, 'execute')), 'todas')
  union all
  select 11, 'Nadie desde la API puede hacerse admin ni cambiar la base',
    not has_function_privilege('authenticated', 'platform.grant_admin(text)', 'execute')
      and not has_function_privilege('anon', 'platform.grant_admin(text)', 'execute')
      and not has_function_privilege('authenticated', 'platform.set_knowledge_base(text, text, text, text)', 'execute'),
    'grant_admin y set_knowledge_base solo desde el SQL Editor'
  union all
  select 12, 'Disparadores de alta y cambio de email en auth.users',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname in ('sia_on_auth_user_created', 'sia_on_auth_user_email')) = 2,
    (select coalesce(string_agg(tgname, ', '), 'ninguno') from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'sia\_%')
  union all
  select 13, 'Auditoría inmutable',
    exists (select 1 from pg_trigger where tgrelid = 'platform.audit_log'::regclass and tgname = 'audit_log_immutable'),
    'disparador audit_log_immutable'
  union all
  select 14, 'Todas las personas de Auth tienen su fila en platform.users',
    not exists (select 1 from auth.users a where not exists (select 1 from platform.users u where u.id = a.id)),
    (select count(*)::text from auth.users) || ' en Auth, ' || (select count(*)::text from platform.users) || ' en platform.users'
  union all
  select 15, 'Hay al menos una persona activa que gestiona el Equipo',
    exists (select 1 from platform.users where 'people' = any (views) and active),
    coalesce((select string_agg(email, ', ') from platform.users where 'people' = any (views) and active), 'nadie: falta select platform.grant_admin(''tu-email'')')
  union all
  select 16, 'Roles y personas llevan su regla de priorización (rule_id) y la API la admite',
    (select count(*) from information_schema.columns where table_schema = 'platform' and column_name = 'rule_id' and table_name in ('roles', 'users')) = 2
      and exists (select 1 from api where proname = 'platform_update_user' and pg_get_function_arguments(oid) like '%p_rule%')
      and exists (select 1 from api where proname = 'platform_save_role' and pg_get_function_arguments(oid) like '%p_rule%')
      and (select count(*) from api where proname in ('platform_update_user', 'platform_save_role')) = 2,
    'columnas: ' || (select count(*) from information_schema.columns where table_schema = 'platform' and column_name = 'rule_id' and table_name in ('roles', 'users'))::text || ' de 2 · firmas con p_rule: '
      || (select count(*) from api where proname in ('platform_update_user', 'platform_save_role') and pg_get_function_arguments(oid) like '%p_rule%')::text || ' de 2 · versiones antiguas aún presentes: '
      || (select count(*) from api where proname in ('platform_update_user', 'platform_save_role') and pg_get_function_arguments(oid) not like '%p_rule%')::text
)
select orden as "#", case when ok then 'OK' else 'FALLO' end as estado, comprobacion, detalle
from checks order by orden;
