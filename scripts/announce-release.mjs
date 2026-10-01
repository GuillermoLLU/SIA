// Publica en Supabase la última versión disponible para que las apps instaladas
// muestren el aviso de actualización. Se ejecuta al final de cada release.
//   node scripts/announce-release.mjs ["notas de la versión"]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const notes = process.argv[2] || '';

// La base donde se anuncia es la del equipo que publica: va por entorno, nunca
// escrita aquí (el repo no lleva credenciales).
const SUPABASE_URL = process.env.SIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.SIA_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('✗ faltan SIA_SUPABASE_URL / SIA_SUPABASE_KEY en el entorno'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { error } = await supabase.from('app_version').upsert({
  id: 1, version, notes,
  url: 'https://github.com/glucia-minsait/SIA/releases/latest',
  updated_at: new Date().toISOString(),
});
if (error) { console.error('✗ no se pudo anunciar:', error.message); process.exit(1); }
console.log(`✓ anunciada v${version} como última versión disponible`);
