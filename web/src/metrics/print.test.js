import test from 'node:test';
import assert from 'node:assert/strict';
import { reportHtml, lightVars } from './print.js';

test('el documento del informe se ve: con la clase styled, que la app exige para enseñar el body (index.html)', () => {
  const html = reportHtml({ title: 'Informe básico', head: '<header>h</header>', body: '<div>b</div>', styles: '<style>html:not(.styled) body { visibility: hidden; }</style>' });
  assert.match(html, /<html lang="es" class="styled" data-mode="light"/);
  assert.match(html, /<title>Informe básico<\/title>/);
  assert.match(html, /<div class="mt-view mt-print" style=""><header>h<\/header><div>b<\/div><\/div>/);
});

test('siempre en el tema claro, aunque se use el oscuro', () => {
  assert.equal(lightVars('no-existe'), lightVars(undefined));
  assert.match(lightVars(undefined), /--text: /);
});
