import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledge } from './service.js';
import { groupId } from './groups.js';

const SOP = '00000000-0000-0000-0000-0000000000b1';
const LOG = '00000000-0000-0000-0000-0000000000b2';
const setup = ({ badKey = false } = {}) => {
  const calls = [];
  const platform = {
    async rpc(jwt, fn, args) {
      calls.push([fn, args]);
      if (fn === 'platform_list_bases') return [
        { id: SOP, name: 'Soporte', url: 'https://s.supabase.co', publishable_key: 'pk-s', has_power_key: true, people: '2' },
        { id: LOG, name: 'Logística', url: 'https://l.supabase.co', publishable_key: 'pk-l', has_power_key: false, people: '0' },
      ];
      if (fn === 'platform_base_access') return [{ id: SOP, url: 'https://s.supabase.co', publishable_key: 'pk-s', power_key: 'poder-s' }];
      return null;
    },
  };
  const readGroups = async ({ powerKey }) => {
    if (badKey || powerKey === 'mala') throw new Error('sin permiso');
    return [{ token: 'tok-n2', name: 'Nivel 2' }, { token: 'tok-n1', name: 'Nivel 1' }];
  };
  return { calls, knowledge: createKnowledge({ platform, readGroups }) };
};

test('bases: con sus grupos { id, name } y sin un solo token', async () => {
  const { knowledge } = setup();
  const bases = await knowledge.bases('jwt');
  assert.deepEqual(bases.map((b) => [b.name, b.people, b.groups && b.groups.map((g) => g.name)]), [['Soporte', 2, ['Nivel 1', 'Nivel 2']], ['Logística', 0, null]]);
  assert.ok(!JSON.stringify(bases).includes('tok-') && !JSON.stringify(bases).includes('poder-s'));
});

test('setGroups: de ids a nombre y token; a la base solo lo marcado', async () => {
  const { calls, knowledge } = setup();
  await knowledge.setGroups('jwt', 'u1', SOP, [groupId('tok-n1')]);
  assert.deepEqual(calls.at(-1), ['platform_set_knowledge', { p_user: 'u1', p_base: SOP, p_groups: [{ name: 'Nivel 1', token: 'tok-n1' }] }]);
  await assert.rejects(knowledge.setGroups('jwt', 'u1', SOP, ['otro']), { status: 409 });
  await assert.rejects(knowledge.setGroups('jwt', 'u1', LOG, []), { status: 400 }, 'sin clave de poder no se asigna');
});

test('syncFromConfig: da de alta, renombra y pone la clave; con clave mala, avisa y no guarda', async () => {
  const { calls, knowledge } = setup();
  const problems = await knowledge.syncFromConfig('jwt', [
    { name: 'Soporte España', url: 'https://s.supabase.co', key: 'pk-s', powerKey: 'poder-s' },  // ya está: renombrar
    { name: 'Logística', url: 'https://l.supabase.co', key: 'pk-l', powerKey: 'poder-l' },       // ya está sin clave: ponerla
    { name: 'Nueva', url: 'https://n.supabase.co', key: 'pk-n', powerKey: 'poder-n' },           // no está: alta
    { name: 'Mala', url: 'https://m.supabase.co', key: 'pk-m', powerKey: 'mala' },               // clave que no abre nada
    { name: 'Sin clave', url: 'https://x.supabase.co', key: 'pk-x', powerKey: '' },              // no se puede asignar: fuera
  ]);
  const fns = calls.map(([fn, args]) => `${fn}:${args?.p_name || args?.p_url || args?.p_base || ''}`);
  assert.ok(fns.includes(`platform_rename_base:Soporte España`));
  assert.ok(fns.includes(`platform_set_base_power:${LOG}`));
  assert.ok(fns.includes('platform_add_base:Nueva'));
  assert.ok(!fns.some((f) => f.includes('Mala') || f.includes('Sin clave')));
  assert.deepEqual(problems, ['«Mala»: Esa clave de poder no abre los grupos de la base (tiene que tener permiso de Administración).']);
});

test('removeByUrl: quita de la instancia la base de esa URL (si está)', async () => {
  const { calls, knowledge } = setup();
  await knowledge.removeByUrl('jwt', 'https://l.supabase.co');
  assert.deepEqual(calls.at(-1), ['platform_remove_base', { p_base: LOG }]);
  await knowledge.removeByUrl('jwt', 'https://otra.supabase.co');
  assert.equal(calls.at(-1)[0], 'platform_list_bases', 'si no está, no quita nada');
});
