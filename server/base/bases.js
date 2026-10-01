// Una base de conocimiento tal como se guarda en ~/.sia/config.json
// (dominio, sin E/S): { id, name, url, key, tokens[], powerKey, enabled }.
import { isSecretKey } from '../access/credentials.js';

// La "URL" admite tres formas y siempre se guarda como https://<ref>.supabase.co:
// el ID del proyecto pelado (kqzvxpmrtbndlgwhcsfa), la URL del proyecto o la
// URL del dashboard (https://supabase.com/dashboard/project/<ref>/...).
export const supabaseUrlFrom = (raw) => {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  if (/^[a-z0-9]{15,}$/i.test(v)) return `https://${v.toLowerCase()}.supabase.co`;
  const dash = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  return v;
};
const validUrl = (url) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url);
// ref del proyecto (xxxx en https://xxxx.supabase.co), para nombrar una base sin nombre
export const baseRef = (url) => (String(url).match(/^https:\/\/([a-z0-9-]+)\./i) || [])[1] || 'base';

// Conexión que llega de la UI: URL https del proyecto y clave, sin espacios.
// null si falta algo. (No rechaza la secret: eso lo hace quien la recibe,
// con su mensaje; ver isSecretKey.)
export const cleanSupabase = (s) => {
  const url = supabaseUrlFrom(s?.url);
  const key = String(s?.key || '').trim();
  if (!url || !key || !validUrl(url)) return null;
  return { url, key };
};

// Una base saneada. Puede quedarse SIN clave (key vacía): es lo que pasa con
// las conectadas antes con la clave secret, que se descarta. La base sigue en
// la lista para que el usuario le ponga la publishable, pero no se usa hasta
// entonces (usable). null si ni siquiera tiene URL válida.
export const cleanBase = (b, i = 0) => {
  b = b && typeof b === 'object' ? b : {};
  const url = supabaseUrlFrom(b.url);
  if (!url || !validUrl(url)) return null;
  const key = String(b.key || '').trim();
  return {
    id: String(b.id || `b${Date.now().toString(36)}${i}`).slice(0, 40),
    name: String(b.name || '').trim().slice(0, 40) || baseRef(url),
    url, key: isSecretKey(key) ? '' : key,
    tokens: (Array.isArray(b.tokens) ? b.tokens : []).map((t) => String(t).trim()).filter(Boolean),
    powerKey: String(b.powerKey || '').trim(),
    enabled: b.enabled !== false, // desactivada temporalmente: sigue en la lista pero no se usa
  };
};
export const normalizeBases = (list) => (Array.isArray(list) ? list : []).map(cleanBase).filter(Boolean);
// en uso: activada y con clave (las desactivadas o sin clave no entran en chats, vistas ni sincronización)
export const usable = (b) => !!(b && b.enabled && b.key);
