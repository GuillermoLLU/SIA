import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loaderHtml, phasesHtml } from './loader.js';

test('el proceso: título, giro y sus fases en orden; sin fases, la lista vacía', () => {
  const html = loaderHtml({ title: 'Abriendo <el> chat', phases: ['Arrancando', 'Leyendo'] });
  assert.match(html, /<h4 class="ld-title" data-loader-title>Abriendo &lt;el&gt; chat<\/h4>/);
  assert.match(html, /<i class="ld-spin"><\/i>/);
  assert.match(html, /<li data-phase="0"><i><\/i>Arrancando<\/li><li data-phase="1"><i><\/i>Leyendo<\/li>/);
  assert.match(loaderHtml({ title: 'X' }), /<ol class="ld-phases" data-phases><\/ol>/);
  assert.equal(phasesHtml([]), '');
});
