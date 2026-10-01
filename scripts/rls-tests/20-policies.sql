-- Pruebas de las políticas: cada bloque fija las cabeceras como lo haría
-- PostgREST (request.headers) y actúa como anon. Cualquier fallo → exception.
\set ON_ERROR_STOP on

-- datos de prueba (como postgres, salta RLS)
insert into public.projects (name) values ('A'), ('B');
insert into public.contexts (project_id, name) select id, name || '-ctx' from public.projects;
insert into public.context_entries (context_id, content) select c.id, 'entry de ' || c.name from public.contexts c;
insert into public.context_chunks (entry_id, chunk_text, chunk_index, embedding)
  select e.id, e.content, 0, (select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)) from public.context_entries e;
insert into public.access_groups (token, name) values ('tokA', 'Grupo A'), ('tokB', 'Grupo B');
insert into public.access_grants (token, project_id) select 'tokA', id from public.projects where name = 'A';
insert into public.access_grants (token, project_id) select 'tokB', id from public.projects where name = 'B';
insert into public.skills (id, label, scope) values ('common', 'Común', null), ('skillA', 'De A', 'tokA'), ('skillB', 'De B', 'tokB');
insert into public.skill_files (skill_id, path, content) values ('common', 'SKILL.md', 'c'), ('skillA', 'SKILL.md', 'a'), ('skillB', 'SKILL.md', 'b');
insert into public.project_links (project_id, title, url) select id, 'link ' || name, 'https://x' from public.projects;
insert into public.power_keys (key, name, owner, perms) values
  ('pk-lab', 'Lab', false, '{"lab":true}'), ('pk-admin', 'Admin', false, '{"admin":true,"links":true}');

create or replace function assert_eq(got anyelement, want anyelement, msg text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALLO %: esperado %, obtenido %', msg, want, got; end if; end $$;
create or replace function expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'FALLO %: debía fallar y no falló', msg;
end $$;
grant execute on function assert_eq(anyelement, anyelement, text), expect_error(text, text) to anon;

-- ── 1. sin cabeceras: no se ve nada ──
select set_config('request.headers', '{}', false);
set role anon;
select assert_eq((select count(*) from public.projects), 0::bigint, 'anon sin tokens no ve proyectos');
select assert_eq((select count(*) from public.context_entries), 0::bigint, 'anon sin tokens no ve entries');
select assert_eq((select count(*) from public.context_chunks), 0::bigint, 'anon sin tokens no ve chunks');
select assert_eq((select count(*) from public.skills where scope is null), (select count(*) from public.skills where scope is null and id in ('common','github-repo','jira-access','knowledge-add','knowledge-audit','knowledge-extraction','knowledge-search','knowledge-web-research')), 'anon sin tokens solo ve las comunes (la de prueba + las de la app)');
select assert_eq((select count(*) from public.skills where scope is not null), 0::bigint, 'anon sin tokens no ve skills de grupo');
select assert_eq((select count(*) from public.skill_files where skill_id = 'knowledge-audit'), 4::bigint, 'skill común de la app con sus ficheros');
select assert_eq((select count(*) from public.access_groups), 0::bigint, 'anon sin tokens no ve grupos');
select assert_eq((select count(*) from public.access_grants), 0::bigint, 'anon sin tokens no ve grants');
select assert_eq((select count(*) from public.power_keys), 0::bigint, 'anon sin tokens no ve claves de poder');
select assert_eq((select count(*) from public.project_links), 0::bigint, 'anon sin tokens no ve enlaces');
select assert_eq((select count(*) from public.match_chunks((select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)), 0.0, 10, null)), 0::bigint, 'match_chunks sin tokens vacío');
select assert_eq((select (public.sia_status() ->> 'version')::int), 2, 'sia_status version 2');
select assert_eq((select public.sia_status() -> 'me'), 'null'::jsonb, 'sia_status me nulo sin clave');
select assert_eq((select (public.sia_status() ->> 'owner')::boolean), true, 'sia_status owner existe');
select expect_error($q$insert into public.projects (name) values ('X')$q$, 'anon no crea proyectos');
select expect_error($q$insert into public.power_keys (key, name) values ('hack', 'h')$q$, 'anon no crea claves');
select expect_error($q$insert into public.access_grants (token, project_id) values ('tokA', 1)$q$, 'anon no se concede accesos');
reset role;

-- ── 2. token A: solo lo de A ──
select set_config('request.headers', '{"x-sia-tokens":"tokA"}', false);
set role anon;
select assert_eq((select array_agg(name order by name) from public.projects), array['A'], 'tokA ve solo A');
select assert_eq((select count(*) from public.context_entries), 1::bigint, 'tokA ve 1 entry');
select assert_eq((select count(*) from public.context_chunks), 1::bigint, 'tokA ve 1 chunk');
select assert_eq((select array_agg(id order by id) from public.skills where scope is not null or id = 'common'), array['common','skillA'], 'tokA ve común + skillA');
select assert_eq((select count(*) from public.skill_files where skill_id in ('common','skillA','skillB')), 2::bigint, 'tokA ve ficheros de común + skillA');
select assert_eq((select array_agg(token) from public.access_groups), array['tokA'], 'tokA ve su grupo');
select assert_eq((select count(*) from public.project_links), 1::bigint, 'tokA ve 1 enlace');
select assert_eq((select count(*) from public.match_chunks((select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)), 0.0, 10, null)), 1::bigint, 'match_chunks tokA 1');
select assert_eq((select count(*) from public.match_chunks((select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)), 0.0, 10, 2)), 0::bigint, 'match_chunks tokA filtrando B: 0');
-- ingesta en A: sí; en B: no (contexto invisible → with check falla)
insert into public.context_entries (context_id, content) select id, 'nueva de A' from public.contexts where name = 'A-ctx';
select expect_error($q$insert into public.context_entries (context_id, content) values ((select max(id) from public.contexts) + 100, 'x')$q$, 'tokA no ingesta en contexto ajeno');
insert into public.context_chunks (entry_id, chunk_text, chunk_index) select id, 'c', 0 from public.context_entries where content = 'nueva de A';
delete from public.context_chunks where entry_id = (select id from public.context_entries where content = 'nueva de A');
delete from public.context_entries where content = 'nueva de A';
select assert_eq((select count(*) from public.context_entries), 1::bigint, 'tokA borró su entry');
-- sin permiso lab no publica skills ni enlaces
select expect_error($q$insert into public.skills (id, label, scope) values ('s2', 'x', 'tokA')$q$, 'tokA sin lab no publica');
select expect_error($q$insert into public.project_links (project_id, title, url) values ((select id from public.projects where name='A'), 't', 'u')$q$, 'tokA sin links no crea enlaces');
-- update/delete silenciosos sobre filas invisibles: 0 filas
update public.skills set label = 'pwned' where id = 'skillB';
reset role;
select assert_eq((select label from public.skills where id = 'skillB'), 'De B', 'tokA no edita skillB');

-- ── 3. token A + lab: skills de su grupo, no comunes ──
select set_config('request.headers', '{"x-sia-tokens":"tokA","x-sia-power":"pk-lab"}', false);
set role anon;
insert into public.skills (id, label, scope) values ('newA', 'Nueva A', 'tokA');
insert into public.skill_files (skill_id, path, content) values ('newA', 'SKILL.md', 'n');
select expect_error($q$insert into public.skills (id, label, scope) values ('newC', 'Común', null)$q$, 'lab no crea comunes');
select expect_error($q$insert into public.skills (id, label, scope) values ('newB', 'B', 'tokB')$q$, 'lab no publica en grupo sin token');
select expect_error($q$update public.skills set scope = null where id = 'newA'$q$, 'lab no convierte en común');
update public.skills set label = 'pwned' where id = 'common';
delete from public.skills where id = 'common';
delete from public.skills where id = 'newA';
reset role;
select assert_eq((select label from public.skills where id = 'common'), 'Común', 'lab no edita comunes');
select assert_eq((select count(*) from public.skills where id = 'newA'), 0::bigint, 'lab borró su skill');
select assert_eq((select count(*) from public.skill_files where skill_id = 'newA'), 0::bigint, 'skill_files en cascada');

-- ── 4. admin: ve y gestiona todo lo del conocimiento; no las claves ──
select set_config('request.headers', '{"x-sia-power":"pk-admin"}', false);
set role anon;
select assert_eq((select count(*) from public.projects), 2::bigint, 'admin ve todos los proyectos');
select assert_eq((select count(*) from public.access_groups), 2::bigint, 'admin ve todos los grupos');
insert into public.projects (name) values ('C');
insert into public.access_groups (token, name) values ('tokC', 'Grupo C');
insert into public.access_grants (token, project_id) select 'tokC', id from public.projects where name = 'C';
delete from public.projects where name = 'C';
select assert_eq((select count(*) from public.power_keys), 0::bigint, 'admin no ve claves de poder');
select expect_error($q$insert into public.power_keys (key, name) values ('hack', 'h')$q$, 'admin no crea claves');
select assert_eq((select count(*) from public.project_links), 0::bigint, 'admin sin tokens no ve enlaces');
select expect_error($q$insert into public.project_links (project_id, title, url) values (1, 't', 'u')$q$, 'links sin token no crea enlaces');
reset role;

-- ── 5. owner: claves de poder, y la suya intocable ──
select set_config('request.headers', '{"x-sia-power":"OWNER-KEY-TEST"}', false);
set role anon;
select assert_eq((select (public.sia_status() -> 'me' ->> 'owner')::boolean), true, 'owner reconocido');
select assert_eq((select count(*) from public.power_keys), 3::bigint, 'owner ve las claves');
insert into public.power_keys (key, name, perms) values ('pk-new', 'Nueva', '{"links":true}');
select expect_error($q$insert into public.power_keys (key, name, owner) values ('pk-own2', 'Otro dueño', true)$q$, 'owner no crea otro dueño');
update public.power_keys set name = 'x' where owner;
select expect_error($q$update public.power_keys set owner = true where key = 'pk-new'$q$, 'owner no asciende una clave a dueño');
delete from public.power_keys where owner;
delete from public.power_keys where key = 'pk-new';
select assert_eq((select count(*) from public.skills where scope is not null or id = 'common'), 3::bigint, 'owner ve todas las skills');
insert into public.skills (id, label, scope) values ('newC', 'Común nueva', null);
delete from public.skills where id = 'newC';
reset role;
select assert_eq((select count(*) from public.power_keys where owner), 1::bigint, 'la clave del dueño sigue');
select assert_eq((select name from public.power_keys where owner), 'Owner', 'la clave del dueño no se renombra');
select assert_eq((select count(*) from public.power_keys where key = 'pk-new'), 0::bigint, 'owner borró la clave nueva');

-- ── 6. clave inventada / token inventado: nada ──
select set_config('request.headers', '{"x-sia-tokens":"nope, tokZ","x-sia-power":"nope"}', false);
set role anon;
select assert_eq((select count(*) from public.projects), 0::bigint, 'token inventado no ve nada');
select assert_eq((select public.sia_status() -> 'me'), 'null'::jsonb, 'clave inventada no abre nada');
reset role;

-- ── 7. re-ejecutar el SQL con otra clave de dueño: la cambia, el resto queda ──
update public.skills set label = 'editada' where id = 'knowledge-search';
\i /sql/01-schema-rerun.sql
select assert_eq((select key from public.power_keys where owner), 'OWNER-KEY-TEST-2', 'nueva clave de dueño');
select assert_eq((select label from public.skills where id = 'knowledge-search'), 'Buscar en conocimiento', 'skill de la app vuelve a la de la app al re-ejecutar');
select assert_eq((select label from public.skills where id = 'skillA'), 'De A', 'skill de grupo intacta al re-ejecutar');
select assert_eq((select count(*) from public.power_keys), 3::bigint, 'las demás claves siguen');
select assert_eq((select count(*) from public.context_entries), 2::bigint, 'el conocimiento sigue');


select 'TODAS LAS PRUEBAS OK' as resultado;
