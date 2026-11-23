import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadOf, uploadsOf, rowSig, localItem, settleLocal, LOCAL_MAX_MS } from './thread.js';

const tool = (id, extra = {}) => ({ kind: 'tool', id, name: 'Read', summary: `Leyó ${id}`, detail: '{}', ...extra });

test('cada herramienta con su resultado, y las seguidas en un solo bloque', () => {
  const rows = threadOf([
    { kind: 'user', id: 'u1', text: 'mira esto' },
    tool('t1'), tool('t2'),
    { kind: 'result', id: 't1', text: 'contenido', error: false },
    { kind: 'text', id: 'a1', text: 'Listo' },
    tool('t3'),
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ['user', 'tools', 'text', 'tools']);
  assert.equal(rows[1].tools.length, 2);
  assert.deepEqual(rows[1].tools.map((t) => t.done), [true, false]);
  assert.equal(rows[1].tools[0].result, 'contenido');
});

test('un resultado con error se marca', () => {
  const [, row] = threadOf([{ kind: 'user', id: 'u', text: 'x' }, tool('t1'), { kind: 'result', id: 't1', text: 'falló', error: true }]);
  assert.equal(row.tools[0].error, true);
});

test('los adjuntos salen aparte, también con espacios en la ruta; sin dejar dos espacios', () => {
  const got = uploadsOf('/Users/g/Library/Application Support/SIA/workspace/uploads/1-Captura.png /Users/g/x/uploads/2-doc.pdf describe esto');
  assert.deepEqual(got, { text: 'describe esto', files: ['1-Captura.png', '2-doc.pdf'] });
  assert.deepEqual(uploadsOf('sin adjuntos'), { text: 'sin adjuntos', files: [] });
  assert.deepEqual(uploadsOf('mira /a/b/uploads/1-x.png y dime'), { text: 'mira y dime', files: ['1-x.png'] });
});

test('la firma cambia cuando llega el resultado de una herramienta', () => {
  const before = threadOf([tool('t1')])[0];
  const after = threadOf([tool('t1'), { kind: 'result', id: 't1', text: 'ok' }])[0];
  assert.notEqual(rowSig(before), rowSig(after));
  assert.equal(before.id, after.id);
});

test('lo que pregunta va en su propia tarjeta, no entre las herramientas', () => {
  const rows = threadOf([
    tool('t1'),
    { kind: 'tool', id: 'q1', name: 'AskUserQuestion', summary: 'Te pregunta', ask: [{ question: '¿?', options: [] }] },
    tool('t2'),
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ['tools', 'ask', 'tools']);
  assert.equal(rows[1].done, false);
});

test('lo recién enviado se pinta ya y se quita cuando el bridge lo devuelve', () => {
  const a = localItem('hola', 1000);
  const b = localItem('adiós', 1000);
  assert.deepEqual(threadOf([{ kind: 'text', id: 'x', text: 'Hi' }, a]).at(-1), { kind: 'user', id: a.id, text: 'hola', files: [], local: true });
  assert.notEqual(a.id, b.id);
  // llega el eco de «hola» (con espacios de más): solo se va ese
  assert.deepEqual(settleLocal([a, b], [{ kind: 'user', id: 'u1', text: ' hola ' }, { kind: 'text', id: 't', text: '…' }], 2000), [b]);
  // sin eco, siguen (la conversación entera al engancharse no los quita: el eco puede venir detrás); los viejos se dan por perdidos
  assert.deepEqual(settleLocal([a, b], [], 2000), [a, b]);
  assert.deepEqual(settleLocal([a, b], [], 1000 + LOCAL_MAX_MS), []);
});

test('sin sesión: su tarjeta, con lo que ha pasado después y viva solo si es lo último', () => {
  const auth = { kind: 'auth', id: 'a1', detail: 'Not logged in', retry: 'hola' };
  const row = (items) => threadOf(items).find((r) => r.kind === 'auth' && r.id === 'a1');
  assert.deepEqual(row([{ kind: 'user', id: 'u1', text: 'hola' }, auth]), { kind: 'auth', id: 'a1', detail: 'Not logged in', retry: 'hola', state: 'needed', live: true });
  assert.equal(row([auth, { kind: 'auth-state', id: 'a1', state: 'logged' }]).state, 'logged');
  assert.equal(row([auth, { kind: 'auth-state', id: 'a1', state: 'logged' }, { kind: 'auth-state', id: 'a1', state: 'ready' }]).state, 'ready');
  assert.equal(row([auth, { kind: 'auth-state', id: 'a1', state: 'ready' }]).live, true); // el aviso de que ya hay sesión no la deja atrás
  assert.equal(row([auth, { kind: 'user', id: 'u2', text: 'otra cosa' }]).live, false); // se ha escrito después
  assert.equal(row([auth, { kind: 'user', id: 'local:9', text: 'hola', local: true }]).live, true); // lo enviado que no llegó (sin eco) no cuenta
  assert.equal(row([auth, { kind: 'auth', id: 'a2', detail: '', retry: null }]).live, false); // hay una más nueva
  assert.equal(threadOf([{ kind: 'auth', id: 'a3' }])[0].retry, null);
});
