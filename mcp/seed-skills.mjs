// Sube a Supabase las skills de skills/common/ (carga inicial o re-publicación
// por CLI): node seed-skills.mjs [carpeta-skill ...]  (sin args = todas)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, skillMeta } from '../server/skills/skills.js';
import { walkDir } from '../server/skills/catalog.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = path.join(ROOT, 'skills', 'common');
// La base destino va por entorno: el repo no lleva credenciales.
const SUPABASE_URL = process.env.SIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.SIA_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('✗ faltan SIA_SUPABASE_URL / SIA_SUPABASE_KEY en el entorno'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const id of targets) {
  const dir = path.join(SKILLS_DIR, id);
  const files = walkDir(dir);
  const skillMd = files.find((f) => f.path === 'SKILL.md');
  if (!skillMd) { console.error(`✗ ${id}: sin SKILL.md, omitida`); continue; }
  const { error: e1 } = await supabase.from('skills').upsert({ ...skillMeta(id, parseFrontmatter(skillMd.content)), updated_at: new Date().toISOString() });
  if (e1) { console.error(`✗ ${id}: ${e1.message}`); continue; }

  // los ficheros, de cero: la skill queda exactamente como la carpeta
  const { error: e2 } = await supabase.from('skill_files').delete().eq('skill_id', id);
  const { error: e3 } = e2 || await supabase.from('skill_files').insert(files.map((f) => ({ skill_id: id, ...f })));
  if (e2 || e3) { console.error(`✗ ${id}: ${(e2 || e3).message}`); continue; }
  console.log(`✓ ${id} publicada (${files.length} ficheros)`);
}
