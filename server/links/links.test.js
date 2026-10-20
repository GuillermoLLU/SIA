import test from 'node:test';
import assert from 'node:assert/strict';
import { linkFields, mergeLink } from './links.js';

test('linkFields: título y URL obligatorios y acotados; imagen solo data URI de imagen y no enorme', () => {
  assert.deepEqual(linkFields({ title: ' Jira ', url: 'https://j', notes: '' }), { value: { title: 'Jira', url: 'https://j', image: null, notes: null } });
  assert.equal(linkFields({ title: '', url: 'https://j' }).error, 'el título no puede estar vacío');
  assert.match(linkFields({ title: 'x'.repeat(121), url: 'https://j' }).error, /120/);
  assert.match(linkFields({ title: 'a', url: 'ftp://j' }).error, /http/);
  assert.match(linkFields({ title: 'a', url: 'https://j', image: 'data:text/plain;base64,xx' }).error, /no es válida/);
  assert.match(linkFields({ title: 'a', url: 'https://j', image: `data:image/png;base64,${'x'.repeat(3_000_001)}` }).error, /demasiado/);
  assert.equal(linkFields({ title: 'a', url: 'https://j', image: 'data:image/webp;base64,xx', notes: 'n' }).value.notes, 'n');
});

test('mergeLink: lo que no viene se conserva; lo que viene, aunque sea null, pisa', () => {
  const cur = { title: 't', url: 'u', image: 'i', notes: 'n', project_id: 1 };
  assert.deepEqual(mergeLink(cur, { title: 't2' }), { title: 't2', url: 'u', image: 'i', notes: 'n' });
  assert.deepEqual(mergeLink(cur, { image: null, notes: undefined }), { title: 't', url: 'u', image: null, notes: 'n' });
});
