\set ON_ERROR_STOP on
-- base del esquema 1 con datos y claves antiguas
insert into public.projects (name) values ('Viejo');
insert into public.contexts (project_id, name) values (1, 'ctx');
insert into public.context_entries (context_id, content) values (1, 'entrada antigua');
insert into public.context_chunks (entry_id, chunk_text, chunk_index, embedding) values (1, 'entrada antigua', 0, (select array_agg(0.1)::extensions.vector(384) from generate_series(1,384)));
insert into public.access_groups (token, name) values ('tokV', 'Viejos');
insert into public.access_grants (token, project_id) values ('tokV', 1);
insert into public.skills (id, label, scope) values ('sv', 'Skill vieja', 'tokV');
insert into public.instance (id, admin_key, superadmin_key) values (1, 'old-admin', 'old-owner');
insert into public.power_keys (key, name, owner, perms) values ('old-owner', 'Owner', true, '{}'), ('old-admin', 'Admin', false, '{"lab":true}'), ('pk-x', 'Editores', false, '{"links":true}');
