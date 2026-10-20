import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePlatformConfig, loadPlatformConfig } from './config.js';

const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_abc123';

test('config: URL de Supabase y clave publishable; el entorno manda; nada más vale', () => {
  const file = { platform: { url: `${URL}/`, publishableKey: KEY } };
  assert.deepEqual(parsePlatformConfig(file), { url: URL, key: KEY });
  assert.deepEqual(parsePlatformConfig(file, { SIA_PLATFORM_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }).url, 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co');
  assert.equal(parsePlatformConfig({ platform: { url: URL, publishableKey: 'sb_secret_x' } }), null, 'nunca la secret');
  assert.equal(parsePlatformConfig({ platform: { url: 'https://evil.com', publishableKey: KEY } }), null);
  assert.equal(parsePlatformConfig(null), null);
});

test('loadPlatformConfig: sia-instance.json en la raíz, o solo el entorno', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-inst-'));
  assert.equal(loadPlatformConfig(root, {}), null);
  assert.deepEqual(loadPlatformConfig(root, { SIA_PLATFORM_URL: URL, SIA_PLATFORM_KEY: KEY }), { url: URL, key: KEY });
  fs.writeFileSync(path.join(root, 'sia-instance.json'), JSON.stringify({ platform: { url: URL, publishableKey: KEY } }));
  assert.deepEqual(loadPlatformConfig(root, {}), { url: URL, key: KEY });
  fs.rmSync(root, { recursive: true, force: true });
});
