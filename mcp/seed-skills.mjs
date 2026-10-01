// Sube a Supabase las skills de skills/common/ (carga inicial o re-publicación
// por CLI): node seed-skills.mjs [carpeta-skill ...]  (sin args = todas)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = path.join(ROOT, 'skills', 'common');
// La base destino va por entorno: el repo no lleva credenciales.
const SUPABASE_URL = process.env.SIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.SIA_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('✗ faltan SIA_SUPABASE_URL / SIA_SUPABASE_KEY en el entorno'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const parseFrontmatter = (src) => {
  const fm = {};
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return fm;
};

const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name), path.join(base, e.name))
    : [{ path: path.join(base, e.name), content: fs.readFileSync(path.join(dir, e.name), 'utf8') }]);

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const id of targets) {
  const dir = path.join(SKILLS_DIR, id);
  const files = walk(dir);
  const skillMd = files.find((f) => f.path === 'SKILL.md');
  if (!skillMd) { console.error(`✗ ${id}: sin SKILL.md, omitida`); continue; }
  const fm = parseFrontmatter(skillMd.content);

  const { error: e1 } = await supabase.from('skills').upsert({
    id,
    label: fm.commandLabel || fm.name || id,
    description: fm.commandDescription || fm.description || '',
    category: fm.category || '',
    version: fm.version || '1.0.0',
    enabled: fm.enabled !== 'false',
    updated_at: new Date().toISOString(),
  });
  if (e1) { console.error(`✗ ${id}: ${e1.message}`); continue; }

  // replace files: delete + insert leaves the skill exactly as the folder
  const { error: e2 } = await supabase.from('skill_files').delete().eq('skill_id', id);
  const { error: e3 } = e2 || await supabase.from('skill_files').insert(files.map((f) => ({ skill_id: id, ...f })));
  if (e2 || e3) { console.error(`✗ ${id}: ${(e2 || e3).message}`); continue; }
  console.log(`✓ ${id} publicada (${files.length} ficheros)`);
}
