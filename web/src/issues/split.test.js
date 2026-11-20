import test from 'node:test';
import assert from 'node:assert/strict';
import { splitForm, readSplit, splitNotice } from './split.js';

const issue = (o = {}) => ({ id: 'INC1', center: '100533', text: 'Etiquetas <en blanco> y voz', priority: 'HIGH', status: 'ASSIGNED', sisu: false,
  group: 'AYS SOPORTE', category: 'ECOM › SGA', notes: 'Uno: la impresora.\n\nDos: el picking <por voz>.', ...o });

test('splitForm: a pantalla completa, la original a la izquierda con su texto y la nueva a la derecha, vacía', () => {
  const html = splitForm(issue());
  assert.match(html, /<form class="iss-act-form sp" data-act-form="split" novalidate>/);
  assert.match(html, /<header><button type="button" class="lab-btn" data-act-cancel>Cancelar<\/button><h3>Dividir INC1 en dos<\/h3><span>Mismos datos · descripción repartida<\/span><\/header>/);
  const [keep, fresh] = html.split('<section').slice(1);
  assert.match(keep, /<h4>Original <small>INC1<\/small><\/h4>/);
  assert.match(keep, /name="keepTitle" value="Etiquetas &lt;en blanco&gt; y voz"/);
  assert.match(keep, /<textarea class="sp-desc" id="sp-keep-desc" name="keepDesc" placeholder=" " spellcheck="false">Uno: la impresora.\n\nDos: el picking &lt;por voz&gt;.<\/textarea>/, 'lo que dice el centro, tal cual (escapado), para cortar de ahí');
  assert.doesNotMatch(keep, /sp-empty/);
  assert.match(fresh, /<h4>Nueva <small>INC por generar<\/small><\/h4>/);
  assert.match(fresh, /name="newTitle" value="Etiquetas &lt;en blanco&gt; y voz"/, 'el título, el mismo, para retocarlo');
  assert.match(fresh, /name="newDesc" placeholder=" " spellcheck="false"><\/textarea>\s*<p class="sp-empty" aria-hidden="true"><b>Pega aquí el segundo problema<\/b>/, 'lo que dice el centro, vacío');
  assert.match(html, /<button type="submit" class="lab-btn primary" disabled>Actualizar y generar<\/button>/, 'apagado hasta que la nueva tenga lo suyo');
});

test('splitForm: el centro y la criticidad de la original, iguales en las dos columnas (el resto también es igual, y no se enseña)', () => {
  const html = splitForm(issue({ priority: 'CRITICAL', sisu: true, status: 'IN_PROGRESS' }));
  const dls = html.match(/<dl class="sp-facts">[\s\S]*?<\/dl>/g);
  assert.equal(dls.length, 2);
  assert.equal(dls[0], dls[1]);
  assert.deepEqual([...dls[0].matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]), ['Centro', 'Criticidad']);
  assert.match(dls[0], /<div><dt>Centro<\/dt><dd><span class="iss-code">100533<\/span><\/dd><\/div>/);
  assert.match(dls[0], /<div class="k-sev CRITICAL"><dt>Criticidad<\/dt><dd>Crítica<\/dd><\/div>/);
  assert.doesNotMatch(html, /Origen|Estado|Grupo|Categoría|SISU|En curso|AYS SOPORTE|ECOM › SGA/);
  assert.match(splitForm(issue({ center: '', priority: '', notes: '' })), /<dt>Centro<\/dt><dd><span class="iss-code">—<\/span><\/dd>[\s\S]*<dt>Criticidad<\/dt><dd>—<\/dd>[\s\S]*id="sp-keep-desc" name="keepDesc" placeholder=" " spellcheck="false"><\/textarea>/, 'sin dato, la raya');
});

test('readSplit: las dos con título y con lo que dice el centro; si no, lo primero que falta', () => {
  const ok = { keepTitle: ' Etiquetas ', keepDesc: ' Uno ', newTitle: 'Voz', newDesc: '\nDos\n' };
  assert.deepEqual(readSplit(ok), { values: { newDesc: 'Dos', keepDesc: 'Uno', keepTitle: 'Etiquetas', newTitle: 'Voz' } });
  assert.deepEqual(readSplit({ ...ok, newDesc: '   ' }), { missing: 'lo que dice el centro en la nueva' });
  assert.deepEqual(readSplit({ ...ok, keepDesc: '' }), { missing: 'lo que dice el centro en la original' }, 'si se lo lleva todo a la nueva');
  assert.deepEqual(readSplit({ ...ok, keepTitle: '' }), { missing: 'el título de la original' });
  assert.deepEqual(readSplit({ ...ok, newTitle: undefined }), { missing: 'el título de la nueva' });
  assert.deepEqual(readSplit(null), { missing: 'lo que dice el centro en la nueva' });
});

test('splitNotice: de momento no sale hacia Remedy', () => {
  assert.equal(splitNotice('INC1'), 'División de INC1 preparada. De momento no sale hacia Remedy: cuando conectemos SIGLO, actualizará la original y creará la nueva.');
});
