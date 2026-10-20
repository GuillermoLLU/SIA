import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadName } from './uploads.js';

test('uploadName: secuencia, nombre saneado y extensión en minúsculas; sin nombre, imagen.png', () => {
  assert.equal(uploadName('Captura de pantalla.PNG', 3), '3-Captura_de_pantalla.png');
  assert.equal(uploadName('../../etc/passwd', 1), '1-passwd.png', 'solo el nombre, sin carpetas');
  assert.equal(uploadName('', 2), '2-imagen.png');
  assert.equal(uploadName('sin-extension', 4), '4-sin-extension.png');
  assert.equal(uploadName(`${'a'.repeat(60)}.jpg`, 5), `5-${'a'.repeat(40)}.jpg`);
});
