import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, skillMeta, validId, safeRelPath, validFiles, touchesCommon, visibleIds, managed } from './skills.js';

test('parseFrontmatter: clave: valor, comillas fuera, también con CRLF; sin frontmatter, nada', () => {
  assert.deepEqual(parseFrontmatter('---\nname: "Jira"\ncategory: data\n---\n# x'), { name: 'Jira', category: 'data' });
  assert.deepEqual(parseFrontmatter('---\r\nname: Jira\r\nenabled: false\r\n---\r\n'), { name: 'Jira', enabled: 'false' });
  assert.deepEqual(parseFrontmatter('# sin cabecera'), {});
  assert.deepEqual(parseFrontmatter(null), {});
});

test('skillMeta: etiqueta, descripción, categoría, versión y si está activa', () => {
  assert.deepEqual(skillMeta('jira', { commandLabel: 'Jira', description: 'd' }), { id: 'jira', label: 'Jira', description: 'd', category: '', version: '1.0.0', enabled: true });
  assert.deepEqual(skillMeta('x', { enabled: 'false', version: '2.0' }), { id: 'x', label: 'x', description: '', category: '', version: '2.0', enabled: false });
});

test('validId: letras, números, guiones; de 2 a 64', () => {
  assert.equal(validId('knowledge-add'), true);
  for (const x of ['a', '-ab', 'a b', 'a'.repeat(65), 42, '']) assert.equal(validId(x), false, String(x));
});

test('safeRelPath: relativa y dentro de la skill; vacía, raíz o con .. no valen', () => {
  assert.equal(safeRelPath('phases/01.md'), 'phases/01.md');
  assert.equal(safeRelPath('./phases\\01.md'), 'phases/01.md');
  for (const x of ['', '.', '..', '../x', 'a/../../x', '/etc/passwd', 'C:\\x', null]) assert.equal(safeRelPath(x), null, String(x));
});

test('validFiles: lista no vacía de ficheros con ruta válida y contenido de texto', () => {
  assert.equal(validFiles([{ path: 'SKILL.md', content: '' }]), true);
  assert.equal(validFiles([]), false);
  assert.equal(validFiles([{ path: '', content: 'x' }]), false);
  assert.equal(validFiles([{ path: 'a', content: 1 }]), false);
  assert.equal(validFiles('x'), false);
});

test('touchesCommon: sin proyecto, o sobre una que ya era común', () => {
  assert.equal(touchesCommon(null, null), true);
  assert.equal(touchesCommon('prj-1', null), false);
  assert.equal(touchesCommon('prj-1', { scope: null }), true);
  assert.equal(touchesCommon('prj-1', { scope: 'prj-2' }), false);
});

test('visibleIds y managed: comunes + mis proyectos; el dueño gestiona todas, con el nombre del proyecto', () => {
  const skills = [{ id: 'c', scope: null }, { id: 'p1', scope: 'prj-1' }, { id: 'p2', scope: 'prj-2' }];
  assert.deepEqual([...visibleIds(skills, ['prj-1'])], ['c', 'p1']);
  const groups = [{ token: 'prj-1', name: 'Uno' }];
  assert.deepEqual(managed(skills, { owner: false }, ['prj-1'], groups), [{ id: 'p1', scope: 'prj-1', scopeName: 'Uno' }]);
  assert.deepEqual(managed(skills, { owner: true }, [], groups).map((s) => s.scopeName), [null, 'Uno', null]);
});
