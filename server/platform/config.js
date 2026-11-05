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

const readInstance = (root) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'sia-instance.json'), 'utf8')); } catch { return null; } // sin fichero: solo env
};

export const loadPlatformConfig = (root, env = process.env) => parsePlatformConfig(readInstance(root), env);

// Los certificados del cliente (shared/certs.js): la guía oficial para
// instalarlos (solo https) y los nombres (CN) que deben estar en el sistema.
// Sin configurar: { helpUrl: '', required: [] }, y no se comprueba nada.
export const parseCertsConfig = (file) => {
  const c = file?.certificates || {};
  const helpUrl = /^https:\/\/\S+$/.test(String(c.helpUrl || '').trim()) ? String(c.helpUrl).trim() : '';
  const required = (Array.isArray(c.required) ? c.required : []).map((n) => String(n).trim()).filter(Boolean);
  return { helpUrl, required };
};

export const loadCertsConfig = (root) => parseCertsConfig(readInstance(root));

// La VPN del cliente (shared/vpn.js): un nombre interno que solo resuelve dentro
// de su red. Sin configurar: { probeHost: '' }, y no se comprueba.
export const parseVpnConfig = (file) => {
  const host = String(file?.vpn?.probeHost || '').trim().toLowerCase();
  return { probeHost: /^[a-z0-9.-]+$/.test(host) ? host : '' };
};

export const loadVpnConfig = (root) => parseVpnConfig(readInstance(root));
