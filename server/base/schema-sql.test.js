import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSchemaSql, commonSkillsSql, OWNER_KEY_PLACEHOLDER } from './schema-sql.js';

test('el SQL completo lleva la clave de dueño (dos veces) y ningún marcador', () => {
  const sql = buildSchemaSql('11111111-2222-3333-4444-555555555555');
  assert.equal(sql.includes(OWNER_KEY_PLACEHOLDER), false);
  assert.equal(sql.split('11111111-2222-3333-4444-555555555555').length - 1, 2); // la guarda y el insert
  assert.ok(sql.trimEnd().endsWith("notify pgrst, 'reload schema';"));
  assert.ok(sql.includes('insert into public.skills'), 'lleva las skills comunes de la app');
});

test('una clave con comillas o espacios se rechaza', () => {
  assert.throws(() => buildSchemaSql("x' or 1=1"));
  assert.throws(() => buildSchemaSql('con espacio'));
  assert.throws(() => buildSchemaSql(''));
});

test('commonSkillsSql: una skill de carpeta → upsert idempotente con sus ficheros', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-skills-'));
  fs.mkdirSync(path.join(dir, 'demo', 'phases'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'demo', 'SKILL.md'), '---\nname: demo\ncommandLabel: "Demo"\nversion: 1.2.3\n---\nTexto con \'comillas\' y $$ dólares');
  fs.writeFileSync(path.join(dir, 'demo', 'phases', '01.md'), 'fase 1');
  fs.mkdirSync(path.join(dir, 'sin-skill-md'));
  const sql = commonSkillsSql(dir);
  assert.ok(sql.includes('$sia_sql$demo$sia_sql$, $sia_sql$Demo$sia_sql$'));
  assert.ok(sql.includes('$sia_sql$1.2.3$sia_sql$'));
  assert.ok(sql.includes('on conflict (id) do update'));
  assert.ok(sql.includes('$sia_sql$phases/01.md$sia_sql$'));
  assert.equal(sql.includes('sin-skill-md'), false);
  assert.equal(commonSkillsSql(path.join(dir, 'no-existe')), '');
});

test('un fichero con la etiqueta de dólar no se incrusta a ciegas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-skills-'));
  fs.mkdirSync(path.join(dir, 'mala'));
  fs.writeFileSync(path.join(dir, 'mala', 'SKILL.md'), '---\nname: mala\n---\nrompe $sia_sql$ aquí');
  assert.throws(() => commonSkillsSql(dir), /sia_sql/);
});
