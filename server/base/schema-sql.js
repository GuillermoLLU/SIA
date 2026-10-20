// SQL de montaje de una base: supabase-schema.sql con la clave de dueño puesta
// y, al final, las skills comunes que vienen con la app (skills/common/), para
// que una base recién montada arranque con ellas. Para montar la base de la
// instancia y para las pruebas (scripts/rls-tests/run.sh).
//
//   node server/base/schema-sql.js <clave-de-dueño>   → imprime el SQL completo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, skillMeta } from '../skills/skills.js';
import { walkDir } from '../skills/catalog.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SCHEMA_SQL = path.join(ROOT, 'supabase-schema.sql');
const COMMON_SKILLS_DIR = path.join(ROOT, 'skills', 'common');
const OWNER_KEY_PLACEHOLDER = '__SIA_OWNER_KEY__';

// Literal SQL con comillas de dólar: el contenido va tal cual (markdown con
// comillas, barras, lo que sea). Si un fichero contuviera la etiqueta, se
// rompería el SQL: se comprueba y se avisa en vez de generar algo inválido.
const TAG = '$sia_sql$';
const lit = (s) => {
  if (String(s).includes(TAG)) throw new Error(`una skill común contiene «${TAG}» y no se puede incrustar en el SQL`);
  return `${TAG}${s}${TAG}`;
};

// Skills comunes de la app → SQL idempotente. Se dejan al día en cada
// ejecución: la versión de la app manda (una edición hecha en el Laboratorio
// sobre una de estas se vuelve a la de la app al re-ejecutar el SQL).
export const commonSkillsSql = (dir = COMMON_SKILLS_DIR) => {
  if (!fs.existsSync(dir)) return '';
  const out = ['', '-- ── Skills comunes de SIA ──────────────────────────────────────',
    '-- Vienen con la app (skills/common/). Comunes = scope nulo: las ve todo el',
    '-- mundo. Se actualizan en cada ejecución; las demás skills no se tocan.'];
  for (const id of fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const files = walkDir(path.join(dir, id));
    const skillMd = files.find((f) => f.path === 'SKILL.md');
    if (!skillMd) continue;
    const m = skillMeta(id, parseFrontmatter(skillMd.content));
    out.push('',
      `insert into public.skills (id, label, description, category, version, enabled, scope, updated_at)`,
      `values (${lit(id)}, ${lit(m.label)}, ${lit(m.description)}, ${lit(m.category)}, ${lit(m.version)}, ${m.enabled}, null, now())`,
      `on conflict (id) do update set label = excluded.label, description = excluded.description, category = excluded.category, version = excluded.version, enabled = excluded.enabled, scope = null, updated_at = now();`,
      `delete from public.skill_files where skill_id = ${lit(id)};`,
      `insert into public.skill_files (skill_id, path, content) values`,
      files.map((f) => `  (${lit(id)}, ${lit(f.path)}, ${lit(f.content)})`).join(',\n') + ';');
  }
  return out.join('\n') + '\n';
};

// El SQL completo para una base: esquema + clave de dueño + skills comunes.
export const buildSchemaSql = (ownerKey) => {
  if (!/^[\x21-\x7e]+$/.test(String(ownerKey || '')) || String(ownerKey).includes("'")) throw new Error('clave de dueño inválida');
  const schema = fs.readFileSync(SCHEMA_SQL, 'utf8').replaceAll(OWNER_KEY_PLACEHOLDER, ownerKey);
  // las skills van ANTES del aviso de recarga de PostgREST, que cierra el fichero
  const tail = "notify pgrst, 'reload schema';";
  const i = schema.lastIndexOf(tail);
  return i >= 0 ? schema.slice(0, i) + commonSkillsSql() + '\n' + schema.slice(i) : schema + commonSkillsSql();
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const key = process.argv[2];
  if (!key) { console.error('uso: node server/base/schema-sql.js <clave-de-dueño>'); process.exit(1); }
  process.stdout.write(buildSchemaSql(key));
}
