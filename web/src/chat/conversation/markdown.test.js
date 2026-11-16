import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.js';

test('Markdown de siempre: negritas, listas, código y tablas', () => {
  const html = renderMarkdown('**hola**\n\n- uno\n- dos\n\n```js\nx()\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /<strong>hola<\/strong>/);
  assert.match(html, /<li>uno<\/li>/);
  assert.match(html, /<pre><code class="language-js">x\(\)/);
  assert.match(html, /<table>/);
});

test('el HTML del texto se enseña, no se interpreta', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> y <script>bad()</script>');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.match(html, /&lt;script&gt;/);
});

test('enlaces: solo http(s) y mailto, y se abren fuera', () => {
  assert.match(renderMarkdown('[web](https://a.b)'), /<a href="https:\/\/a\.b" target="_blank" rel="noopener noreferrer">web<\/a>/);
  assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('href'));
});

test('un salto de línea es un salto', () => {
  assert.match(renderMarkdown('1\n2\n3'), /1<br>\s*2<br>\s*3/);
});
