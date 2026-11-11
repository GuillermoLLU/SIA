import test from 'node:test';
import assert from 'node:assert/strict';
import { projectName, miniMarkdown, linkPayload, shrinkTo, dataUriKb } from './links.js';

const P = [{ id: 1, name: 'SGA' }, { id: 2, name: 'SISU' }, { id: 3, name: 'Vacío' }];
const L = [{ id: 'a', project_id: 1 }, { id: 'b', project_id: 1 }, { id: 'c', project_id: 2 }];

test('projectName', () => {
  assert.equal(projectName(P, 2), 'SISU');
  assert.equal(projectName(P, 9), 'Sin conocimiento');
});


test('miniMarkdown: escapa antes de reconocer; títulos, código, negrita, listas y párrafos', () => {
  assert.equal(miniMarkdown('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(miniMarkdown('# T\n## S\n### U'), '<h3>T</h3><br><h3>S</h3><br><h4>U</h4>');
  assert.equal(miniMarkdown('usa `a<b` y **n**'), 'usa <code>a&lt;b</code> y <strong>n</strong>');
  assert.equal(miniMarkdown('- uno\n- dos'), '<ul><li>uno</li><br><li>dos</li></ul>');
  assert.equal(miniMarkdown('p1\n\np2'), 'p1</p><p>p2');
  assert.equal(miniMarkdown(null), '');
});

test('linkPayload: recortado, imagen y notas opcionales', () => {
  assert.deepEqual(linkPayload({ project: '2', title: ' Jira ', url: ' https://j ', image: null, notes: '  ' }), { project_id: 2, title: 'Jira', url: 'https://j', image: null, notes: null });
});

test('shrinkTo y dataUriKb', () => {
  assert.deepEqual(shrinkTo(1024, 512), { w: 256, h: 128 });
  assert.deepEqual(shrinkTo(100, 50), { w: 100, h: 50 });
  assert.deepEqual(shrinkTo(1, 2000), { w: 1, h: 256 });
  assert.equal(dataUriKb('x'.repeat(4096)), 3);
});
