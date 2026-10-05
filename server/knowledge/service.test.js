import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledge } from './service.js';
import { groupId } from './groups.js';

const SOP = '00000000-0000-0000-0000-0000000000b1';
const setup = ({ people = [], personKeys = [], withBase = true, power = true, inBase = [] } = {}) => {
  const calls = [];
  const platform = {
    async rpc(jwt, fn, args) {
      calls.push([fn, args]);
      if (fn === 'platform_list_bases') return withBase ? [{ id: SOP, name: 'Soporte' }] : [];
      if (fn === 'platform_base_access') return withBase && power ? [{ id: SOP, url: 'https://s.supabase.co', publishable_key: 'pk-s', power_key: 'poder-s' }] : [];
      if (fn === 'platform_list_users') return people;
      if (fn === 'platform_person_keys') return personKeys.filter((k) => !args?.p_base || k.base_id === args.p_base);
      if (fn === 'platform_set_person_key') {
        personKeys = personKeys.filter((k) => !(k.user_id === args.p_user && k.base_id === args.p_base));
        if (args.p_power_key) personKeys.push({ user_id: args.p_user, base_id: args.p_base, power_key: args.p_power_key });
      }
      return null;
    },
  };
  const baseKeys = {
    async list() { calls.push(['base.list']); return inBase; },
    async create(c, f) { calls.push(['base.create', c.powerKey, f]); return 'nueva-clave'; },
    async update(c, key, f) { calls.push(['base.update', key, f]); return key !== 'borrada-a-mano'; },
    async remove(c, key) { calls.push(['base.remove', key]); },
  };
  const readGroups = async () => {
    return [{ token: 'tok-n2', name: 'Nivel 2' }, { token: 'tok-n1', name: 'Nivel 1' }];
  };
  return { calls, knowledge: createKnowledge({ platform, readGroups, baseKeys }) };
};

test('base: con sus proyectos { id, name } y sin un solo token', async () => {
  const { knowledge } = setup();
  const base = await knowledge.base('jwt');
  assert.deepEqual([base.name, base.groups.map((g) => g.name)], ['Soporte', ['Nivel 1', 'Nivel 2']]);
  assert.ok(!JSON.stringify(base).includes('tok-') && !JSON.stringify(base).includes('poder-s'));
  assert.equal(await setup({ withBase: false }).knowledge.base('jwt'), null, 'sin base: null');
  assert.equal((await setup({ power: false }).knowledge.base('jwt')).groups, null, 'sin su clave: sin proyectos');
});

test('setProjects: de ids a nombre y token; a la base solo lo marcado', async () => {
  const { calls, knowledge } = setup();
  await knowledge.setProjects('jwt', 'u1', [groupId('tok-n1')]);
  assert.deepEqual(calls.at(-1), ['platform_set_knowledge', { p_user: 'u1', p_base: SOP, p_groups: [{ name: 'Nivel 1', token: 'tok-n1' }] }]);
  await assert.rejects(knowledge.setProjects('jwt', 'u1', ['otro']), { status: 409 });
  await assert.rejects(setup({ power: false }).knowledge.setProjects('jwt', 'u1', []), { status: 400 }, 'sin la clave del dueño no se asigna');
});

const paula = (views, extra = {}) => ({ id: 'u1', email: 'paula@x.com', active: true, views, knowledge: [{ base_id: SOP, groups: [{ id: 'g' }] }], ...extra });
const perms = (on) => ({ lab: on.includes('lab'), admin: on.includes('admin'), links: on.includes('links') });

test('syncPeople: crea en la base la clave de sus vistas y la guarda en la instancia', async () => {
  const { calls, knowledge } = setup({ people: [paula(['links', 'lab', 'people'])] });
  assert.deepEqual(await knowledge.syncPeople('jwt', ['u1']), []);
  assert.deepEqual(calls.filter((c) => c[0].startsWith('base.') || c[0] === 'platform_set_person_key'), [
    ['base.create', 'poder-s', { name: 'SIA · paula@x.com', perms: perms(['lab', 'links']) }],
    ['platform_set_person_key', { p_user: 'u1', p_base: SOP, p_power_key: 'nueva-clave' }],
  ]);
});

test('syncPeople: pone al día la que tiene; si la borraron de la base, otra nueva', async () => {
  let r = setup({ people: [paula(['lab'])], personKeys: [{ user_id: 'u1', base_id: SOP, power_key: 'k1' }] });
  await r.knowledge.syncPeople('jwt', ['u1']);
  assert.deepEqual(r.calls.filter((c) => c[0].startsWith('base.')), [['base.update', 'k1', { name: 'SIA · paula@x.com', perms: perms(['lab']) }]]);
  r = setup({ people: [paula(['lab'])], personKeys: [{ user_id: 'u1', base_id: SOP, power_key: 'borrada-a-mano' }] });
  await r.knowledge.syncPeople('jwt', ['u1']);
  assert.deepEqual(r.calls.filter((c) => c[0] === 'platform_set_person_key').map((c) => c[1].p_power_key), ['nueva-clave']);
});

test('syncPeople drop / sin vistas: la quita de la base y de la instancia', async () => {
  for (const [people, opts] of [[[paula(['links'])], { drop: true }], [[paula(['people'])], {}]]) {
    const { calls, knowledge } = setup({ people, personKeys: [{ user_id: 'u1', base_id: SOP, power_key: 'k1' }] });
    await knowledge.syncPeople('jwt', ['u1'], opts);
    assert.deepEqual(calls.filter((c) => c[0].startsWith('base.') || c[0] === 'platform_set_person_key'), [
      ['base.remove', 'k1'], ['platform_set_person_key', { p_user: 'u1', p_base: SOP, p_power_key: null }]]);
  }
});

test('syncPeople de todas: barre de la base las claves de SIA que la instancia no conoce', async () => {
  const { calls, knowledge } = setup({ personKeys: [{ user_id: 'u1', base_id: SOP, power_key: 'k1' }],
    inBase: [{ key: 'k1', name: 'SIA · paula@x.com' }, { key: 'huerfana', name: 'SIA · borrada@x.com' }, { key: 'k9', name: 'Editores' }] });
  await knowledge.syncPeople('jwt', null);
  assert.deepEqual(calls.filter((c) => c[0] === 'base.remove').map((c) => c[1]), ['huerfana']);
});

test('syncPeople: de una en una; si llegan a la vez, la segunda ve la clave de la primera', async () => {
  const { calls, knowledge } = setup({ people: [paula(['links'])] });
  await Promise.all([knowledge.syncPeople('jwt', ['u1']), knowledge.syncPeople('jwt', ['u1'])]);
  assert.deepEqual(calls.filter((c) => c[0].startsWith('base.')).map((c) => c[0]), ['base.create', 'base.update']);
});
