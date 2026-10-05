// Dónde está la base de la instancia (supabase-platform.sql): sia-instance.json
// en la raíz, o SIA_PLATFORM_URL / SIA_PLATFORM_KEY, que mandan sobre el
// fichero. Una instancia = un cliente: otro cliente cambia este fichero.
// Solo URL https://<ref>.supabase.co y clave publishable; null si falta o no vale.
import fs from 'node:fs';
import path from 'node:path';

export const parsePlatformConfig = (file, env = {}) => {
  const url = String(env.SIA_PLATFORM_URL || file?.platform?.url || '').trim().replace(/\/+$/, '');
  const key = String(env.SIA_PLATFORM_KEY || file?.platform?.publishableKey || '').trim();
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null;
  return { url, key };
};

export const loadPlatformConfig = (root, env = process.env) => {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(path.join(root, 'sia-instance.json'), 'utf8')); } catch { /* sin fichero: solo env */ }
  return parsePlatformConfig(file, env);
};
